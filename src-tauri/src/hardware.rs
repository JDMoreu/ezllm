//! Detección de hardware: GPU (VRAM real), CPU, RAM y aceleradores.
//!
//! Reglas que No se improvisan (medidas en este equipo):
//!   - La VRAM TOTAL y LIBRE sale de `llama-server --list-devices`: es la
//!     misma API que usa llama.cpp. `vulkaninfo` NO da la VRAM.
//!   - El TIPO de GPU (dedicada/integrada) sale de `vulkaninfo --summary`
//!     (DISCRETE_GPU / INTEGRATED_GPU). La integrada reporta "18 GB" de
//!     memoria compartida y engaña si solo se mira el número.
//!   - La RAM sale de `GlobalMemoryStatusEx` (0,01 s). PowerShell tarda 1,4 s:
//!     no vale para un camino crítico.
//!   - `Win32_VideoController.AdapterRAM` está saturado a 4 GB: no sirve.

use serde::Serialize;
use std::process::Command;
use std::time::Duration;

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GpuDevice {
    pub name: String,
    pub api: String,
    pub index: u32,
    /// "discrete" | "integrated"
    pub kind: String,
    pub vram_total_mib: u64,
    pub vram_free_mib: u64,
    pub source: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CpuInfo {
    pub physical_cores: Option<u32>,
    pub logical_threads: u32,
    pub model: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RamInfo {
    pub total_bytes: u64,
    pub available_bytes: u64,
    pub total_gb: f64,
    pub available_gb: f64,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AcceleratorInfo {
    pub has_vulkan: bool,
    pub has_cuda: bool,
    pub has_rocm: bool,
    pub vulkaninfo: bool,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct HardwareReport {
    pub gpu: Vec<GpuDevice>,
    pub cpu: CpuInfo,
    pub ram: RamInfo,
    pub accelerators: AcceleratorInfo,
    pub os: String,
    pub arch: String,
    pub llama_server: Option<String>,
}

/// Ejecuta un comando y devuelve su stdout (vacío si falla).
fn run(cmd: &str, args: &[&str], _timeout: Duration) -> String {
    let mut c = Command::new(cmd);
    c.args(args);
    // Sin consola: evita que salte una ventana negra en Windows.
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        const CREATE_NO_WINDOW: u32 = 0x0800_0000;
        c.creation_flags(CREATE_NO_WINDOW);
    }
    match c.output() {
        Ok(out) => String::from_utf8_lossy(&out.stdout).into_owned(),
        Err(_) => String::new(),
    }
}

/// Parsea la salida de `llama-server --list-devices`.
///
/// Formato:  Vulkan0: AMD Radeon RX 9070 (16304 MiB, 15419 MiB free)
///           CUDA0: NVIDIA GeForce RTX 4090 (24564 MiB, 24000 MiB free)
pub fn list_devices_via_llama(llama_server: &str) -> Vec<GpuDevice> {
    let out = run(llama_server, &["--list-devices"], Duration::from_secs(30));
    parse_list_devices(&out)
}

pub fn parse_list_devices(out: &str) -> Vec<GpuDevice> {
    let re = regex::Regex::new(
        r"(?m)^\s*(\w+?)(\d+):\s*(.+?)\s*\((\d+)\s*MiB,\s*(\d+)\s*MiB free\)",
    )
    .unwrap();
    let mut devices = Vec::new();
    for caps in re.captures_iter(out) {
        devices.push(GpuDevice {
            name: caps[3].trim().to_string(),
            api: caps[1].to_ascii_lowercase(),
            index: caps[2].parse().unwrap_or(0),
            kind: "discrete".to_string(),
            vram_total_mib: caps[4].parse().unwrap_or(0),
            vram_free_mib: caps[5].parse().unwrap_or(0),
            source: "llama-server --list-devices".to_string(),
        });
    }
    devices
}

/// Mapa nombre de GPU -> discrete/integrated, leído de `vulkaninfo --summary`.
fn device_types_vulkan() -> Vec<(String, String)> {
    let out = run("vulkaninfo", &["--summary"], Duration::from_secs(20));
    if out.is_empty() {
        return Vec::new();
    }
    device_types_from(&out)
}

/// Extrae (nombre, tipo) de cada GPU del resumen de vulkaninfo.
fn device_types_from(out: &str) -> Vec<(String, String)> {
    let mut types = Vec::new();
    // Cada bloque empieza con "GPU<n>:". El separador NO es una linea en
    // blanco: el summary de vulkaninfo pone los encabezados de seccion
    // ("Instance Extensions:", "GPU0:") seguidos de entradas tabuladas.
    let block_re = regex::Regex::new(r"(?m)^GPU\d+:\s*$").unwrap();
    let starts: Vec<usize> = block_re
        .find_iter(&out)
        .map(|m| m.start())
        .collect();

    for (i, start) in starts.iter().enumerate() {
        let end = starts.get(i + 1).copied().unwrap_or(out.len());
        let block = &out[*start..end];

        let name = regex::Regex::new(r"(?m)^\s*deviceName\s*=\s*(.+)$")
            .unwrap()
            .captures(block)
            .map(|c| c[1].trim().to_string());
        let Some(name) = name else { continue };

        // deviceType = PHYSICAL_DEVICE_TYPE_DISCRETE_GPU | _INTEGRATED_GPU
        let kind = if regex::Regex::new(r"(?m)^\s*deviceType\s*=\s*.*INTEGRATED")
            .unwrap()
            .is_match(block)
        {
            "integrated"
        } else if regex::Regex::new(r"(?m)^\s*deviceType\s*=\s*.*DISCRETE")
            .unwrap()
            .is_match(block)
        {
            "discrete"
        } else {
            "unknown"
        };
        types.push((name.to_ascii_lowercase(), kind.to_string()));
    }
    types
}

/// GPUs detectadas: combina `llama-server --list-devices` (VRAM real) con
/// `vulkaninfo --summary` (tipo de GPU).
pub fn detect_gpus(llama_server: Option<&str>) -> Vec<GpuDevice> {
    let mut devices = match llama_server {
        Some(exe) => list_devices_via_llama(exe),
        None => Vec::new(),
    };

    let types = device_types_vulkan();
    for d in devices.iter_mut() {
        let key = d.name.trim().to_ascii_lowercase();
        if let Some((_, kind)) = types.iter().find(|(n, _)| *n == key) {
            d.kind = kind.clone();
        } else if key.contains("graphics") && !key.contains("radeon rx") {
            d.kind = "integrated".to_string();
        }
    }

    if !devices.is_empty() {
        return devices;
    }
    detect_gpus_fallback()
}

/// Sondeo sin llama.cpp: `vulkaninfo` + Windows.
fn detect_gpus_fallback() -> Vec<GpuDevice> {
    let out = run("vulkaninfo", &["--summary"], Duration::from_secs(20));
    if out.is_empty() {
        return Vec::new();
    }
    let types = device_types_vulkan();
    let mut devices = Vec::new();
    for (name, kind) in types {
        devices.push(GpuDevice {
            name,
            api: "vulkan".to_string(),
            index: 0,
            kind,
            // La VRAM no aparece de forma fiable en vulkaninfo --summary.
            vram_total_mib: 0,
            vram_free_mib: 0,
            source: "vulkaninfo".to_string(),
        });
    }
    devices
}

/// CPU: núcleos físicos y hilos lógicos.
pub fn detect_cpu() -> CpuInfo {
    let logical = std::thread::available_parallelism()
        .map(|n| n.get() as u32)
        .unwrap_or(0);

    #[cfg(windows)]
    let physical = {
        use windows_sys::Win32::System::SystemInformation::{
            GetLogicalProcessorInformation, RelationProcessorCore,
            SYSTEM_LOGICAL_PROCESSOR_INFORMATION,
        };

        unsafe {
            let mut len: u32 = 0;
            GetLogicalProcessorInformation(std::ptr::null_mut(), &mut len);
            if len == 0 {
                None
            } else {
                let mut buf = vec![0u8; len as usize];
                let ok = GetLogicalProcessorInformation(
                    buf.as_mut_ptr() as *mut SYSTEM_LOGICAL_PROCESSOR_INFORMATION,
                    &mut len,
                );
                if ok == 0 {
                    None
                } else {
                    // Cada bloque empieza con la relación y el tamaño; se
                    // cuentan los que son RelationProcessorCore.
                    let mut count = 0u32;
                    let mut offset = 0usize;
                    while offset + 8 <= len as usize {
                        let ptr = buf.as_ptr().add(offset);
                        let relationship = *ptr.cast::<u32>();
                        let size = *ptr.add(4).cast::<u32>();
                        if relationship == RelationProcessorCore as u32 {
                            count += 1;
                        }
                        if size == 0 {
                            break;
                        }
                        offset += size as usize;
                    }
                    if count > 0 { Some(count) } else { None }
                }
            }
        }
    };

    #[cfg(not(windows))]
    let physical = None;

    CpuInfo {
        physical_cores: physical,
        logical_threads: logical,
        model: cpu_model(),
    }
}

#[cfg(windows)]
fn cpu_model() -> Option<String> {
    use windows_sys::Win32::System::Registry::{
        RegCloseKey, RegOpenKeyExA, RegQueryValueExA, HKEY_LOCAL_MACHINE, KEY_READ,
    };
    unsafe {
        let mut hkey = std::ptr::null_mut();
        let sub = b"HARDWARE\\DESCRIPTION\\System\\CentralProcessor\\0\0";
        let status = RegOpenKeyExA(
            HKEY_LOCAL_MACHINE,
            sub.as_ptr(),
            0,
            KEY_READ,
            &mut hkey,
        );
        if status != 0 {
            return None;
        }
        let mut size: u32 = 512;
        let mut buf = vec![0u8; size as usize];
        let name = b"ProcessorNameString\0";
        let mut reg_type: u32 = 0;
        let status = RegQueryValueExA(
            hkey,
            name.as_ptr(),
            std::ptr::null_mut(),
            &mut reg_type,
            buf.as_mut_ptr(),
            &mut size,
        );
        RegCloseKey(hkey);
        if status != 0 {
            return None;
        }
        let text = String::from_utf8_lossy(&buf);
        let text = text.trim_end_matches('\0').trim();
        if text.is_empty() {
            None
        } else {
            Some(text.to_string())
        }
    }
}

#[cfg(not(windows))]
fn cpu_model() -> Option<String> {
    None
}

/// RAM: `GlobalMemoryStatusEx` en Windows, `/proc/meminfo` en Linux.
pub fn detect_ram() -> RamInfo {
    #[cfg(windows)]
    {
        use windows_sys::Win32::System::SystemInformation::{
            GlobalMemoryStatusEx, MEMORYSTATUSEX,
        };
        unsafe {
            let mut status = MEMORYSTATUSEX {
                dwLength: std::mem::size_of::<MEMORYSTATUSEX>() as u32,
                ..std::mem::zeroed()
            };
            if GlobalMemoryStatusEx(&mut status) != 0 {
                return RamInfo {
                    total_bytes: status.ullTotalPhys,
                    available_bytes: status.ullAvailPhys,
                    total_gb: status.ullTotalPhys as f64 / 1024.0 / 1024.0 / 1024.0,
                    available_gb: status.ullAvailPhys as f64 / 1024.0 / 1024.0 / 1024.0,
                };
            }
        }
    }

    #[cfg(target_os = "linux")]
    {
        if let Ok(text) = std::fs::read_to_string("/proc/meminfo") {
            let total = regex::Regex::new(r"MemTotal:\s+(\d+) kB")
                .unwrap()
                .captures(&text)
                .and_then(|c| c[1].parse::<u64>().ok());
            let avail = regex::Regex::new(r"MemAvailable:\s+(\d+) kB")
                .unwrap()
                .captures(&text)
                .and_then(|c| c[1].parse::<u64>().ok());
            if let Some(total) = total {
                let total_bytes = total * 1024;
                let available_bytes = avail.unwrap_or(0) * 1024;
                return RamInfo {
                    total_bytes,
                    available_bytes,
                    total_gb: total_bytes as f64 / 1024.0 / 1024.0 / 1024.0,
                    available_gb: available_bytes as f64 / 1024.0 / 1024.0 / 1024.0,
                };
            }
        }
    }

    RamInfo {
        total_bytes: 0,
        available_bytes: 0,
        total_gb: 0.0,
        available_gb: 0.0,
    }
}

/// Qué aceleradores están disponibles en el equipo.
pub fn detect_accelerators() -> AcceleratorInfo {
    let vulkaninfo = !run("vulkaninfo", &["--summary"], Duration::from_secs(10)).is_empty();
    AcceleratorInfo {
        has_vulkan: vulkaninfo
            || cfg!(target_os = "windows")
                && std::path::Path::new("C:/Windows/System32/vulkan-1.dll").exists(),
        has_cuda: PathCmd("nvidia-smi").exists(),
        has_rocm: PathCmd("rocm-smi").exists(),
        vulkaninfo,
    }
}

struct PathCmd(&'static str);
impl PathCmd {
    fn exists(&self) -> bool {
        if let Ok(path) = std::env::var("PATH") {
            for dir in path.split(';') {
                let p = std::path::Path::new(dir).join(self.0);
                if p.exists() {
                    return true;
                }
            }
        }
        false
    }
}

/// Informe completo de hardware.
pub fn full_report(llama_server: Option<&str>) -> HardwareReport {
    HardwareReport {
        gpu: detect_gpus(llama_server),
        cpu: detect_cpu(),
        ram: detect_ram(),
        accelerators: detect_accelerators(),
        os: std::env::consts::OS.to_string(),
        arch: std::env::consts::ARCH.to_string(),
        llama_server: llama_server.map(|s| s.to_string()),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_device_list() {
        let out = "  Vulkan0: AMD Radeon RX 9070 (16304 MiB, 15419 MiB free)\n  CUDA0: NVIDIA GeForce RTX 4090 (24564 MiB, 24000 MiB free)\n";
        let devices = parse_list_devices(out);
        assert_eq!(devices.len(), 2);
        assert_eq!(devices[0].name, "AMD Radeon RX 9070");
        assert_eq!(devices[0].vram_total_mib, 16304);
        assert_eq!(devices[0].api, "vulkan");
        assert_eq!(devices[1].api, "cuda");
    }

#[test]
    fn parses_vulkaninfo_summary_blocks() {
        // Salida REAL de `vulkaninfo --summary` en este equipo.
        let out = "\
==========
VULKANINFO
==========
Vulkan Instance Version: 1.4.350

Instance Extensions: count = 14
-------------------------------
VK_EXT_debug_report                    : extension revision 10

Devices:
=========
GPU0:
\tapiVersion         = 1.4.355
\tdriverVersion      = 2.0.406
\tvendorID           = 0x1002
\tdeviceID           = 0x7550
\tdeviceType         = PHYSICAL_DEVICE_TYPE_DISCRETE_GPU
\tdeviceName         = AMD Radeon RX 9070
\tdriverID           = DRIVER_ID_AMD_PROPRIETARY
GPU1:
\tapiVersion         = 1.3.217
\tdeviceType         = PHYSICAL_DEVICE_TYPE_INTEGRATED_GPU
\tdeviceName         = AMD Radeon(TM) Graphics
\tdriverID           = DRIVER_ID_AMD_PROPRIETARY
";
        let types = device_types_from(out);
        assert_eq!(types.len(), 2, "esperaba 2 GPUs: {types:?}");
        assert_eq!(types[0].0, "amd radeon rx 9070");
        assert_eq!(types[0].1, "discrete");
        assert_eq!(types[1].0, "amd radeon(tm) graphics");
        assert_eq!(types[1].1, "integrated");
    }
    #[test]
    fn ram_is_detected() {
        let ram = detect_ram();
        assert!(ram.total_bytes > 0, "no se pudo leer la RAM");
    }
}
