//! Comprobaciones contra la API real de GitHub, fuera de la app.
//!
//! Sirven para auditar la clasificación de assets sin abrir la interfaz.

use std::time::Duration;

use crate::releases::{classify_release, recommend_asset, GitHubRelease};

/// Descarga la release más reciente y devuelve qué asset se recomendaría.
pub fn recommend_for_host(host_os: &str, host_arch: &str) -> String {
    let client = reqwest::blocking::Client::builder()
        .user_agent("EzLLM")
        .timeout(Duration::from_secs(60))
        .build()
        .expect("cliente HTTP");

    let url = "https://api.github.com/repos/ggml-org/llama.cpp/releases?per_page=1";

    // La red con GitHub es intermitente: se reintenta unas veces.
    let mut last_err = String::new();
    let mut releases: Vec<GitHubRelease> = Vec::new();
    for attempt in 0..4 {
        match client
            .get(url)
            .header("Accept", "application/vnd.github+json")
            .send()
        {
            Ok(resp) if resp.status().is_success() => {
                releases = resp.json().expect("JSON ilegible");
                break;
            }
            Ok(resp) => {
                last_err = format!("HTTP {}", resp.status());
            }
            Err(e) => {
                last_err = e.to_string();
            }
        }
        std::thread::sleep(Duration::from_secs(2 * (attempt + 1)));
    }
    assert!(!releases.is_empty(), "no se pudo listar: {last_err}");

    let rel = &releases[0];
    println!("  assets crudos: {}", rel.assets.len());
    for a in rel.assets.iter().take(4) {
        println!("    crudo: {:?}", a.name);
    }
    let assets = classify_release(rel, host_os, host_arch);
    println!("  clasificados: {}", assets.len());
    let recommended = recommend_asset(&assets, None).map(|a| a.name.clone());

    let mut out = format!("release {}\n", rel.tag_name);
    out.push_str(&format!(
        "  RECOMENDADO: {}\n",
        recommended.as_deref().unwrap_or("(ninguno)")
    ));
    out.push_str("  compatibles:\n");
    for a in assets.iter().filter(|a| a.compatible && !a.is_cudart) {
        out.push_str(&format!(
            "    {:52} {:>8.1} MB  {}\n",
            a.name,
            a.size as f64 / 1048576.0,
            a.backend.label()
        ));
    }
    out
}

/// Imprime los flags que la app generaria con la configuracion guardada.
pub fn flags_from_saved_config() -> String {
    let cfg = crate::config::load();
    let flags = crate::config::config_to_flags(
        &cfg.server,
        cfg.last_model.as_deref(),
        cfg.last_mmproj.as_deref(),
        cfg.last_draft_model.as_deref(),
    );
    flags.join(" ")
}

/// Comprueba si la app encuentra el llama-server instalado.
pub fn find_server_report() -> String {
    let cfg = crate::config::load();
    let dir = cfg
        .llama_dir
        .clone()
        .map(std::path::PathBuf::from)
        .unwrap_or_else(crate::config::llama_dir);
    let mut out = format!("llama_dir = {}\n", dir.display());
    out.push_str(&format!("existe  = {}\n", dir.exists()));
    match crate::models::find_llama_server(&dir) {
        Some(p) => out.push_str(&format!("encontrado = {}\n", p.display())),
        None => {
            out.push_str("encontrado = NO\n");
            out.push_str("contenido:\n");
            if let Ok(entries) = std::fs::read_dir(&dir) {
                for e in entries.flatten() {
                    out.push_str(&format!("  {}\n", e.path().display()));
                }
            }
        }
    }
    out
}
