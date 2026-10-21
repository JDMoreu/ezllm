//! Prueba del ciclo de vida del servidor: arrancar, comprobar /health,
//! listar modelos y parar.

use std::path::Path;

use crate::config::ServerConfig;
use crate::server;

/// Arranca el servidor CON un modelo y pide una generación real.
pub fn lifecycle_with_model(exe: &Path, model: &Path) -> String {
    let mut out = String::new();
    let exe_s = exe.to_string_lossy().to_string();
    let model_s = model.to_string_lossy().to_string();

    let cfg = ServerConfig {
        host: "127.0.0.1".to_string(),
        port: 9932,
        ctx_size: 2048,
        batch_size: 256,
        ubatch_size: 256,
        n_gpu_layers: Some(0), // CPU: este modelo diminuto no necesita la GPU
        ..Default::default()
    };

    out.push_str(&format!("arrancando con modelo {model_s}\n"));
    match server::start(&exe_s, &cfg, Some(&model_s), None, None) {
        Ok(st) => out.push_str(&format!(
            "  arrancado pid={:?} health={} aviso={:?}\n",
            st.pid, st.health, st.error
        )),
        Err(e) => {
            out.push_str(&format!("  ERROR al arrancar: {e}\n"));
            return out;
        }
    }

    let client = reqwest::blocking::Client::builder()
        .timeout(std::time::Duration::from_secs(120))
        .build()
        .unwrap();

    match client.get("http://127.0.0.1:9932/v1/models").send() {
        Ok(r) => {
            let body = r.text().unwrap_or_default();
            out.push_str(&format!("  /v1/models -> {}", &body[..body.len().min(300)]));
            out.push('\n');
        }
        Err(e) => out.push_str(&format!("  /v1/models fallo: {e}\n")),
    }

    let payload = serde_json::json!({
        "model": "stories260K",
        "messages": [{"role": "user", "content": "Hello"}],
        "max_tokens": 24,
        "temperature": 0.0,
        "stream": false
    });
    match client
        .post("http://127.0.0.1:9932/v1/chat/completions")
        .json(&payload)
        .send()
    {
        Ok(r) => {
            let status = r.status().as_u16();
            let body = r.text().unwrap_or_default();
            out.push_str(&format!("  /v1/chat/completions -> HTTP {status}\n"));
            out.push_str(&format!("  respuesta: {}\n", &body[..body.len().min(400)]));
            if body.contains("choices") && body.contains("content") {
                out.push_str("  OK: el modelo genero texto\n");
            } else {
                out.push_str("  AVISO: la respuesta no trae contenido\n");
            }
        }
        Err(e) => out.push_str(&format!("  /v1/chat/completions fallo: {e}\n")),
    }

    let log = server::current_log(8);
    out.push_str("  log:\n");
    let lines: Vec<&str> = log.lines().collect();
    let start = lines.len().saturating_sub(8);
    for line in &lines[start..] {
        out.push_str(&format!("    {line}\n"));
    }

    let _ = server::stop();
    let after = server::status();
    out.push_str(&format!("  estado final: running={}\n", after.running));
    out.push_str(if after.running { "  FALLO: sigue vivo\n" } else { "  OK: detenido\n" });
    out
}

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
            let status = r.status().as_u16();
            let body = r.text().unwrap_or_default();
            out.push_str(&format!("  GET /v1/models -> HTTP {status}\n"));
            out.push_str(&format!("  cuerpo: {}\n", &body[..body.len().min(300)]));
        }
        Err(e) => out.push_str(&format!("  GET /v1/models falló: {e}\n")),
    }

    // Endpoint de salud
    let health_url = format!("http://127.0.0.1:{}/health", st.port);
    match client.get(&health_url).send() {
        Ok(r) => {
            let status = r.status().as_u16();
            let body = r.text().unwrap_or_default();
            out.push_str(&format!("  GET /health -> HTTP {status} {body}\n"));
        }
        Err(e) => out.push_str(&format!("  GET /health falló: {e}\n")),
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
