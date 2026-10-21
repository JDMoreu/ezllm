//! Telemetría viva del equipo y del servidor.
//!
//! Todo lo que se muestra aquí está MEDIDO, nunca estimado:
//!   - CPU: `GetSystemTimes` (diferencia entre dos muestras).
//!   - RAM: `GlobalMemoryStatusEx`.
//!   - VRAM: `llama-server --list-devices`, que es la misma API que usa
//!     llama.cpp para decidir dónde meter las capas.
//!   - Proceso: `GetProcessMemoryInfo` + `GetProcessTimes` del `llama-server`
//!     que la app tiene en marcha.
//!   - Rendimiento: una completion real contra `/v1/chat/completions` de la que
//!     se leen los `timings` que devuelve el propio servidor.
//!
//! La cadencia de sondeo la decide el frontend; aquí no hay ningun hilo
//! que se quede mirando el reloj.

use serde::Serialize;
use std::time::Duration;

/// Uso de CPU del sistema en porcentaje.
#[derive(Debug, Clone, Copy, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CpuUsage {
    /// Porcentaje de uso de TODOS los procesadores lógicos (0-100).
    pub percent: f64,
}

/// Memoria del sistema.
#[derive(Debug, Clone, Copy, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RamUsage {
    pub total_bytes: u64,
    pub available_bytes: u64,
    pub used_bytes: u64,
}

/// Memoria y tiempo de CPU del proceso `llama-server`.
#[derive(Debug, Clone, Copy, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ProcessUsage {
    pub pid: u32,
    /// Memoria privada (no compartida) del proceso, en bytes.
    pub working_set_bytes: u64,
    /// Tiempo de CPU acumulado del proceso, en segundos.
    pub cpu_seconds: f64,
}

/// Instantánea completa de la telemetría.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Telemetry {
    pub cpu: CpuUsage,
    pub ram: RamUsage,
    /// VRAM por dispositivo. Vacía si no hay llama.cpp instalado.
    pub gpus: Vec<crate::hardware::GpuDevice>,
    /// Proceso del servidor, si está en marcha.
    pub process: Option<ProcessUsage>,
    /// Escenario: `gpu` si el modelo cabe en VRAM, `hybrid` si se reparte.
    pub timestamp_ms: u64,
}

fn now_ms() -> u64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_millis() as u64)
        .unwrap_or(0)
}

// --- CPU ---------------------------------------------------------------------

/// Estado interno de la última muestra de CPU, para poder calcular el delta.
static CPU_PREV: std::sync::Mutex<Option<(u64, u64, u64)>> = std::sync::Mutex::new(None);

/// Porcentaje de uso de CPU desde la última llamada.
///
/// `GetSystemTimes` devuelve tiempos acumulados (idle, kernel, user). El
/// porcentaje es el delta de "tiempo en uso" sobre el delta de "tiempo total".
#[cfg(windows)]
fn cpu_percent() -> f64 {
    use windows_sys::Win32::Foundation::FILETIME;
    use windows_sys::Win32::System::Threading::GetSystemTimes;

    let mut idle = FILETIME { dwLowDateTime: 0, dwHighDateTime: 0 };
    let mut kernel = FILETIME { dwLowDateTime: 0, dwHighDateTime: 0 };
    let mut user = FILETIME { dwLowDateTime: 0, dwHighDateTime: 0 };

    unsafe {
        if GetSystemTimes(&mut idle, &mut kernel, &mut user) == 0 {
            return 0.0;
        }
    }

    let to_u64 = |f: FILETIME| ((f.dwHighDateTime as u64) << 32) | f.dwLowDateTime as u64;
    let idle = to_u64(idle);
    let kernel = to_u64(kernel);
    let user = to_u64(user);

    let mut guard = CPU_PREV.lock().unwrap();
    let prev = *guard;
    *guard = Some((idle, kernel, user));

    let Some((p_idle, p_kernel, p_user)) = prev else {
        // Primera muestra: no hay delta con el que comparar.
        return 0.0;
    };

    let idle_delta = idle.saturating_sub(p_idle);
    let kernel_delta = kernel.saturating_sub(p_kernel);
    let user_delta = user.saturating_sub(p_user);

    // `kernel` INCLUYE el tiempo idle. El tiempo "en uso" es el kernel sin
    // idle, mas el tiempo de usuario. El total es "en uso" + idle.
    //
    //   busy  = (kernel - idle) + user
    //   total = busy + idle
    let busy = (kernel_delta.saturating_sub(idle_delta)) + user_delta;
    let total = busy + idle_delta;
    if total == 0 {
        return 0.0;
    }
    ((busy as f64 / total as f64) * 100.0).clamp(0.0, 100.0)
}

#[cfg(not(windows))]
fn cpu_percent() -> f64 {
    0.0
}

// --- RAM ---------------------------------------------------------------------

/// Memoria del sistema: total, disponible y usada.
fn ram_usage() -> RamUsage {
    let r = crate::hardware::detect_ram();
    let used = r.total_bytes.saturating_sub(r.available_bytes);
    RamUsage {
        total_bytes: r.total_bytes,
        available_bytes: r.available_bytes,
        used_bytes: used,
    }
}

// --- Proceso -----------------------------------------------------------------

/// Memoria y CPU del proceso del servidor.
#[cfg(windows)]
fn process_usage(pid: u32) -> Option<ProcessUsage> {
    use windows_sys::Win32::Foundation::CloseHandle;
    use windows_sys::Win32::System::Threading::{
        GetProcessTimes, OpenProcess, PROCESS_QUERY_LIMITED_INFORMATION,
    };

    unsafe {
        let handle = OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION, 0, pid);
        if handle.is_null() {
            return None;
        }

        let mut creation = windows_sys::Win32::Foundation::FILETIME {
            dwLowDateTime: 0,
            dwHighDateTime: 0,
        };
        let mut exit = windows_sys::Win32::Foundation::FILETIME {
            dwLowDateTime: 0,
            dwHighDateTime: 0,
        };
        let mut kernel = windows_sys::Win32::Foundation::FILETIME {
            dwLowDateTime: 0,
            dwHighDateTime: 0,
        };
        let mut user = windows_sys::Win32::Foundation::FILETIME {
            dwLowDateTime: 0,
            dwHighDateTime: 0,
        };

        let times_ok = GetProcessTimes(
            handle,
            &mut creation,
            &mut exit,
            &mut kernel,
            &mut user,
        ) != 0;

        let to_f64 = |f: windows_sys::Win32::Foundation::FILETIME| {
            (((f.dwHighDateTime as u64) << 32) | f.dwLowDateTime as u64) as f64
            / 10_000_000.0
        };
        let cpu_seconds = if times_ok {
            to_f64(kernel) + to_f64(user)
        } else {
            0.0
        };

        let working_set = working_set_bytes(handle);
        let _ = CloseHandle(handle);

        Some(ProcessUsage {
            pid,
            working_set_bytes: working_set,
            cpu_seconds,
        })
    }
}

/// Bytes de memoria privada del proceso.
#[cfg(windows)]
fn working_set_bytes(handle: windows_sys::Win32::Foundation::HANDLE) -> u64 {
    use windows_sys::Win32::System::ProcessStatus::{
        GetProcessMemoryInfo, PROCESS_MEMORY_COUNTERS,
    };

    let mut counters = PROCESS_MEMORY_COUNTERS {
        cb: std::mem::size_of::<PROCESS_MEMORY_COUNTERS>() as u32,
        PageFaultCount: 0,
        PeakWorkingSetSize: 0,
        WorkingSetSize: 0,
        QuotaPeakPagedPoolUsage: 0,
        QuotaPagedPoolUsage: 0,
        QuotaPeakNonPagedPoolUsage: 0,
        QuotaNonPagedPoolUsage: 0,
        PagefileUsage: 0,
        PeakPagefileUsage: 0,
    };
    unsafe {
        if GetProcessMemoryInfo(handle, &mut counters, counters.cb) == 0 {
            return 0;
        }
    }
    counters.WorkingSetSize as u64
}

#[cfg(not(windows))]
fn process_usage(_pid: u32) -> Option<ProcessUsage> {
    None
}

// --- VRAM --------------------------------------------------------------------

/// VRAM por dispositivo, medida con la misma API que usa llama.cpp.
///
/// El tipo (dedicada / integrada) se resuelve con `vulkaninfo`, que es caro.
/// Se cachea: solo cambia cuando cambia el hardware, no en cada muestra.
fn gpu_usage(llama_server: Option<&str>) -> Vec<crate::hardware::GpuDevice> {
    let Some(exe) = llama_server else {
        return Vec::new();
    };
    let mut devices = crate::hardware::list_devices_via_llama(exe);
    for d in devices.iter_mut() {
        d.source = "llama-server --list-devices".to_string();
        // El driver devuelve marcas de fabrica como texto ("AMD
        // Radeon(TM) Graphics"). Se limpian igual que en el reporte de
        // hardware: es el mismo dato por dos caminos.
        d.name = crate::hardware::clean_gpu_name(&d.name);
    }
    // Se conserva el tipo resuelto antes: `list_devices_via_llama` lo deja
    // siempre en "discrete", y sin esto la GPU integrada se etiqueta mal.
    let kinds = device_kinds();
    for d in devices.iter_mut() {
        if let Some((_, kind)) = kinds
            .iter()
            .find(|(n, _)| n.trim().eq_ignore_ascii_case(d.name.trim()))
        {
            d.kind = kind.clone();
        }
    }
    devices
}

/// Tipos de GPU cacheados (nombre -> discrete/integrated).
fn device_kinds() -> Vec<(String, String)> {
    static KINDS: std::sync::OnceLock<Vec<(String, String)>> = std::sync::OnceLock::new();
    KINDS
        .get_or_init(|| {
            crate::hardware::detect_device_kinds()
                .into_iter()
                .map(|(n, k)| (crate::hardware::clean_gpu_name(&n), k))
                .collect()
        })
        .clone()
}

// --- Instantánea -------------------------------------------------------------

/// Toma una instantánea de la telemetría.
pub fn snapshot(llama_server: Option<&str>, server_pid: Option<u32>) -> Telemetry {
    Telemetry {
        cpu: CpuUsage {
            percent: cpu_percent(),
        },
        ram: ram_usage(),
        gpus: gpu_usage(llama_server),
        process: server_pid.and_then(process_usage),
        timestamp_ms: now_ms(),
    }
}

// --- Rendimiento medido ------------------------------------------------------

/// Resultado de una medición real de velocidad contra el servidor.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SpeedResult {
    /// Tokens de contexto por segundo en el prompt.
    pub prompt_per_second: f64,
    /// Tokens generados por segundo.
    pub predicted_per_second: f64,
    /// Milisegundos hasta el primer token.
    pub first_token_ms: f64,
    pub prompt_tokens: u32,
    pub predicted_tokens: u32,
    pub total_ms: f64,
}

/// Mide la velocidad REAL del servidor con una completion mínima.
///
/// Los `timings` los devuelve el propio `llama-server`; no se estima nada.
pub fn probe_speed(host: &str, port: u16) -> Result<SpeedResult, String> {
    let url = format!("http://{host}:{port}/v1/chat/completions");
    let body = serde_json::json!({
        "messages": [{"role": "user", "content": "a"}],
        "max_tokens": 16,
        "stream": false,
    });

    let client = reqwest::blocking::Client::builder()
        .timeout(Duration::from_secs(60))
        .build()
        .map_err(|e| format!("No se pudo crear el cliente HTTP: {e}"))?;

    let started = std::time::Instant::now();
    let resp = client
        .post(&url)
        .json(&body)
        .send()
        .map_err(|e| format!("No se pudo contactar con el servidor: {e}"))?;
    let total_ms = started.elapsed().as_secs_f64() * 1000.0;

    let json: serde_json::Value = resp
        .json()
        .map_err(|e| format!("El servidor devolvió una respuesta ilegible: {e}"))?;

    let timings = json.get("timings").ok_or("El servidor no devolvió tiempos de generación")?;
    let num = |key: &str| timings.get(key).and_then(|v| v.as_f64()).unwrap_or(0.0);

    Ok(SpeedResult {
        prompt_per_second: num("prompt_per_second"),
        predicted_per_second: num("predicted_per_second"),
        first_token_ms: num("predicted_ms"),
        prompt_tokens: timings.get("prompt_n").and_then(|v| v.as_u64()).unwrap_or(0) as u32,
        predicted_tokens: timings.get("predicted_n").and_then(|v| v.as_u64()).unwrap_or(0) as u32,
        total_ms,
    })
}

// --- Estado de los slots -----------------------------------------------------

/// Estado de los slots del servidor: cuántos están ocupados.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SlotsState {
    pub total: u32,
    pub busy: u32,
    pub n_ctx: u32,
}

/// Lee `/slots` del servidor: los slots ocupados son los que están generando.
pub fn slots_state(host: &str, port: u16) -> Option<SlotsState> {
    let url = format!("http://{host}:{port}/slots");
    let client = reqwest::blocking::Client::builder()
        .timeout(Duration::from_secs(3))
        .build()
        .ok()?;
    let json: serde_json::Value = client.get(&url).send().ok()?.json().ok()?;
    let arr = json.as_array()?;
    let total = arr.len() as u32;
    let busy = arr
        .iter()
        .filter(|s| s.get("is_processing").and_then(|v| v.as_bool()).unwrap_or(false))
        .count() as u32;
    let n_ctx = arr
        .first()
        .and_then(|s| s.get("n_ctx"))
        .and_then(|v| v.as_u64())
        .unwrap_or(0) as u32;
    Some(SlotsState {
        total,
        busy,
        n_ctx,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn cpu_percent_is_in_range() {
        let a = cpu_percent();
        assert!((0.0..=100.0).contains(&a), "cpu fuera de rango: {a}");
    }

    #[test]
    fn ram_usage_is_consistent() {
        let r = ram_usage();
        assert!(r.used_bytes <= r.total_bytes);
    }

    #[test]
    fn snapshot_has_a_timestamp() {
        let s = snapshot(None, None);
        assert!(s.timestamp_ms > 0);
        assert!(s.gpus.is_empty());
        assert!(s.process.is_none());
    }
}
