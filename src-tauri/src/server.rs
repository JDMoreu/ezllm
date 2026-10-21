//! Gestión del proceso `llama-server`: arranque, estado, parada y logs.
//!
//! Puntos importantes que no se improvisan:
//!   - El volcado de metadatos de llama_model_loader son ~666 líneas. Con
//!     `stdout=PIPE` sin leerlo, el PIPE se llena y el proceso se BLOQUEA
//!     escribiendo: nunca llega a "listening on". La salida se redirige a un
//!     fichero de log.
//!   - El proceso se lanza con `--log-file`, así que el log va al disco y el
//!     hilo no compite por el pipe.
//!   - Para parar hay que matar al PROCESO ENTERO (y sus hijos), no solo al
//!     proceso directo.

use serde::Serialize;
use std::path::PathBuf;
use std::process::{Child, Command, Stdio};
use std::sync::Mutex;

use crate::config::ServerConfig;

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ServerStatus {
    pub running: bool,
    pub pid: Option<u32>,
    pub port: u16,
    pub host: String,
    pub log_file: Option<String>,
    pub started_at: Option<u64>,
    pub command: Option<Vec<String>>,
    pub health: bool,
    pub models: Vec<String>,
    pub error: Option<String>,
}

struct Running {
    child: Child,
    pid: u32,
    port: u16,
    host: String,
    log_file: PathBuf,
    started_at: u64,
    command: Vec<String>,
}

/// Estado global del servidor.
static SERVER: Mutex<Option<Running>> = Mutex::new(None);

/// Instantes desde epoch (para `started_at`).
fn now_secs() -> u64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_secs())
        .unwrap_or(0)
}

/// Arranca `llama-server` con la configuración dada.
///
/// Espera activa a que `/health` responda 200.
pub fn start(
    exe: &str,
    cfg: &ServerConfig,
    model_path: Option<&str>,
    mmproj: Option<&str>,
    draft_model: Option<&str>,
) -> Result<ServerStatus, String> {
    {
        let mut guard = SERVER.lock().unwrap();
        if let Some(r) = guard.as_mut() {
            if r.child.try_wait().ok().flatten().is_none() {
                return Err("Ya hay un servidor en marcha.".to_string());
            }
        }
    }

    let flags = crate::config::config_to_flags(cfg, model_path, mmproj, draft_model);

    let logs_dir = crate::config::logs_dir();
    std::fs::create_dir_all(&logs_dir)
        .map_err(|e| format!("No se pudo crear {}: {e}", logs_dir.display()))?;
    let stamp = timestamp();
    let log_file = logs_dir.join(format!("llama-server-{stamp}.log"));

    let mut command = Command::new(exe);
    command
        .args(&flags)
        .arg("--log-file")
        .arg(&log_file)
        .stdin(Stdio::null())
        .stdout(Stdio::null())
        .stderr(Stdio::null());
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        const CREATE_NO_WINDOW: u32 = 0x0800_0000;
        command.creation_flags(CREATE_NO_WINDOW);
    }

    let child = command
        .spawn()
        .map_err(|e| format!("No se pudo arrancar {exe}: {e}"))?;
    let pid = child.id();

    let mut full_cmd = vec![exe.to_string()];
    full_cmd.extend(flags);

    {
        let mut guard = SERVER.lock().unwrap();
        *guard = Some(Running {
            child,
            pid,
            port: cfg.port,
            host: cfg.host.clone(),
            log_file: log_file.clone(),
            started_at: now_secs(),
            command: full_cmd.clone(),
        });
    }

    // Espera activa a que el servidor responda.
    let deadline = std::time::Instant::now() + std::time::Duration::from_secs(180);
    while std::time::Instant::now() < deadline {
        {
            let mut guard = SERVER.lock().unwrap();
            if let Some(r) = guard.as_mut() {
                if let Ok(Some(_)) = r.child.try_wait() {
                    let tail = tail_log(&log_file, 15);
                    *guard = None;
                    return Err(format!(
                        "El servidor se detuvo al arrancar.\n{tail}"
                    ));
                }
            }
        }
        if health_check(&cfg.host, cfg.port) {
            return Ok(ServerStatus {
                running: true,
                pid: Some(pid),
                port: cfg.port,
                host: cfg.host.clone(),
                log_file: Some(log_file.to_string_lossy().into_owned()),
                started_at: Some(now_secs()),
                command: Some(full_cmd),
                health: true,
                models: Vec::new(),
                error: None,
            });
        }
        std::thread::sleep(std::time::Duration::from_millis(1500));
    }

    Ok(ServerStatus {
        running: true,
        pid: Some(pid),
        port: cfg.port,
        host: cfg.host.clone(),
        log_file: Some(log_file.to_string_lossy().into_owned()),
        started_at: Some(now_secs()),
        command: Some(full_cmd),
        health: false,
        models: Vec::new(),
        error: Some(
            "El servidor aún no responde; puede estar cargando el modelo.".to_string(),
        ),
    })
}

/// Para el servidor en marcha.
pub fn stop() -> Result<ServerStatus, String> {
    let running = {
        let mut guard = SERVER.lock().unwrap();
        guard.take()
    };

    let Some(r) = running else {
        return Ok(ServerStatus {
            running: false,
            pid: None,
            port: 0,
            host: String::new(),
            log_file: None,
            started_at: None,
            command: None,
            health: false,
            models: Vec::new(),
            error: Some("No había ningún servidor en marcha.".to_string()),
        });
    };

    #[cfg(windows)]
    {
        // taskkill /T mata el árbol de procesos: llama-server puede tener
        // hijos y matar solo al padre deja zombis con la VRAM ocupada.
        let _ = Command::new("taskkill")
            .args(["/PID", &r.pid.to_string(), "/T", "/F"])
            .stdout(Stdio::null())
            .stderr(Stdio::null())
            .status();
    }
    #[cfg(not(windows))]
    {
        let _ = r.child.kill();
        let _ = r.child.wait();
    }

    Ok(ServerStatus {
        running: false,
        pid: None,
        port: r.port,
        host: r.host,
        log_file: Some(r.log_file.to_string_lossy().into_owned()),
        started_at: Some(r.started_at),
        command: Some(r.command),
        health: false,
        models: Vec::new(),
        error: None,
    })
}

/// Estado actual.
pub fn status() -> ServerStatus {
    let mut guard = SERVER.lock().unwrap();
    let Some(r) = guard.as_mut() else {
        return ServerStatus {
            running: false,
            pid: None,
            port: 0,
            host: String::new(),
            log_file: None,
            started_at: None,
            command: None,
            health: false,
            models: Vec::new(),
            error: None,
        };
    };
    let alive = r.child.try_wait().ok().flatten().is_none();
    ServerStatus {
        running: alive,
        pid: Some(r.pid),
        port: r.port,
        host: r.host.clone(),
        log_file: Some(r.log_file.to_string_lossy().into_owned()),
        started_at: Some(r.started_at),
        command: Some(r.command.clone()),
        health: alive && health_check(&r.host, r.port),
        models: if alive { list_models(&r.host, r.port) } else { Vec::new() },
        error: None,
    }
}

/// Comprueba `/health` del servidor.
pub fn health_check(host: &str, port: u16) -> bool {
    let url = format!("http://{host}:{port}/health");
    let client = reqwest::blocking::Client::builder()
        .timeout(std::time::Duration::from_secs(3))
        .build();
    match client {
        Ok(c) => c.get(&url).send().map(|r| r.status().is_success()).unwrap_or(false),
        Err(_) => false,
    }
}

/// Modelos que el servidor tiene cargados (`GET /v1/models`).
pub fn list_models(host: &str, port: u16) -> Vec<String> {
    let url = format!("http://{host}:{port}/v1/models");
    let Ok(client) = reqwest::blocking::Client::builder()
        .timeout(std::time::Duration::from_secs(5))
        .build()
    else {
        return Vec::new();
    };
    let Ok(resp) = client.get(&url).send() else {
        return Vec::new();
    };
    let Ok(json) = resp.json::<serde_json::Value>() else {
        return Vec::new();
    };
    json.get("data")
        .and_then(|d| d.as_array())
        .map(|arr| {
            arr.iter()
                .filter_map(|m| m.get("id").and_then(|i| i.as_str()))
                .map(|s| s.to_string())
                .collect()
        })
        .unwrap_or_default()
}

/// Últimas líneas del log del servidor.
pub fn tail_log(path: &std::path::Path, n: usize) -> String {
    let Ok(text) = std::fs::read_to_string(path) else {
        return String::new();
    };
    let lines: Vec<&str> = text.lines().collect();
    let start = lines.len().saturating_sub(n);
    lines[start..].join("\n")
}

/// Log del servidor en marcha.
pub fn current_log(n: usize) -> String {
    let guard = SERVER.lock().unwrap();
    match guard.as_ref() {
        Some(r) => tail_log(&r.log_file, n),
        None => {
            // Sin servidor: se muestra el último log del disco.
            let dir = crate::config::logs_dir();
            let mut newest: Option<(std::time::SystemTime, PathBuf)> = None;
            if let Ok(entries) = std::fs::read_dir(&dir) {
                for e in entries.flatten() {
                    let p = e.path();
                    if let Ok(m) = p.metadata() {
                        if let Ok(modified) = m.modified() {
                            if newest.as_ref().map(|(t, _)| modified > *t).unwrap_or(true) {
                                newest = Some((modified, p));
                            }
                        }
                    }
                }
            }
            newest.map(|(_, p)| tail_log(&p, n)).unwrap_or_default()
        }
    }
}

/// Marca de tiempo para el nombre del log.
fn timestamp() -> String {
    let secs = now_secs();
    let days = secs / 86_400;
    let rem = secs % 86_400;
    let (h, m, s) = (rem / 3600, (rem % 3600) / 60, rem % 60);
    let (y, mo, d) = civil_from_days(days as i64);
    format!("{y:04}{mo:02}{d:02}-{h:02}{m:02}{s:02}")
}

/// Días desde 1970 -> fecha civil (algoritmo de Howard Hinnant).
fn civil_from_days(z: i64) -> (i64, u32, u32) {
    let z = z + 719_468;
    let era = if z >= 0 { z } else { z - 146_096 } / 146_097;
    let doe = (z - era * 146_097) as u64;
    let yoe = (doe - doe / 1460 + doe / 36_524 - doe / 146_096) / 365;
    let y = yoe as i64 + era * 400;
    let doy = doe - (365 * yoe + yoe / 4 - yoe / 100);
    let mp = (5 * doy + 2) / 153;
    let d = (doy - (153 * mp + 2) / 5 + 1) as u32;
    let m = if mp < 10 { mp + 3 } else { mp - 9 } as u32;
    (if m <= 2 { y + 1 } else { y }, m, d)
}
