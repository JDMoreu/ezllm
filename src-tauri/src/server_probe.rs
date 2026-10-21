//! Prueba del ciclo de vida del servidor: arrancar, comprobar /health,
//! listar modelos y parar.

use std::path::Path;

use crate::config::ServerConfig;
use crate::server;

pub fn lifecycle(exe: &Path) -> String {
    let mut out = String::new();
    let exe_s = exe.to_string_lossy().to_string();

    let cfg = ServerConfig {
        host: "127.0.0.1".to_string(),
        port: 9931,
        ctx_size: 2048,
        batch_size: 512,
        ubatch_size: 512,
        ..Default::default()
    };

    out.push_str(&format!("arrancando {exe_s} en modo router (sin modelo)\n"));
    match server::start(&exe_s, &cfg, None, None, None) {
        Ok(st) => {
            out.push_str(&format!(
                "  arrancado pid={:?} puerto={} health={}\n",
                st.pid, st.port, st.health
            ));
            if let Some(cmd) = &st.command {
                out.push_str(&format!("  comando: {}\n", cmd.join(" ")));
            }
            if let Some(err) = &st.error {
                out.push_str(&format!("  aviso: {err}\n"));
            }
        }
        Err(e) => {
            out.push_str(&format!("  ERROR al arrancar: {e}\n"));
            return out;
        }
    }

    // Estado y salud
    let st = server::status();
    out.push_str(&format!(
        "  estado: running={} health={}\n",
        st.running, st.health
    ));

    // Petición real a la API OpenAI
    let url = format!("http://127.0.0.1:{}/v1/models", st.port);
    let client = reqwest::blocking::Client::builder()
        .timeout(std::time::Duration::from_secs(10))
        .build()
        .unwrap();
    match client.get(&url).send() {
        Ok(r) => {
            let body = r.text().unwrap_or_default();
            out.push_str(&format!("  GET /v1/models -> {}\n", &body[..body.len().min(300)]));
        }
        Err(e) => out.push_str(&format!("  GET /v1/models falló: {e}\n")),
    }

    // Log del servidor
    let log = server::current_log(12);
    out.push_str("  últimas líneas del log:\n");
    for line in log.lines().take(12) {
        out.push_str(&format!("    {line}\n"));
    }

    // Parar
    match server::stop() {
        Ok(s) => out.push_str(&format!("  parado: running={}\n", s.running)),
        Err(e) => out.push_str(&format!("  ERROR al parar: {e}\n")),
    }
    let after = server::status();
    out.push_str(&format!("  estado final: running={}\n", after.running));
    out.push_str(if after.running { "  FALLO: sigue vivo\n" } else { "  OK: detenido\n" });
    out
}
