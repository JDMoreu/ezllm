//! Prueba de instalación real contra GitHub, fuera de la app.

use std::path::Path;

use crate::install::install_asset;
use crate::releases::{classify_release, list_releases, recommend_asset};

/// Descarga e instala el paquete recomendado (Vulkan en Windows) de la
/// release más reciente, y devuelve un informe legible.
pub async fn install_latest_vulkan(install_dir: &Path) -> String {
    let client = reqwest::Client::builder()
        .user_agent("EzLlamaCpp")
        .timeout(std::time::Duration::from_secs(600))
        .build()
        .expect("cliente HTTP");

    let url = "https://api.github.com/repos/ggml-org/llama.cpp/releases?per_page=1";
    let mut releases = Vec::new();
    let mut err = String::new();
    for attempt in 0..4 {
        match client
            .get(url)
            .header("Accept", "application/vnd.github+json")
            .send()
            .await
        {
            Ok(r) if r.status().is_success() => {
                releases = r.json().await.expect("JSON ilegible");
                break;
            }
            Ok(r) => err = format!("HTTP {}", r.status()),
            Err(e) => err = e.to_string(),
        }
        tokio::time::sleep(std::time::Duration::from_secs(3)).await;
    }
    assert!(!releases.is_empty(), "no se pudo listar: {err}");

    let rel = &releases[0];
    let assets = classify_release(rel, "windows", "x64");
    let asset = recommend_asset(&assets, None).expect("no hay asset recomendado").clone();

    let mut out = String::new();
    out.push_str(&format!("release {}\n", rel.tag_name));
    out.push_str(&format!(
        "  asset: {}  ({:.1} MB)\n",
        asset.name,
        asset.size as f64 / 1048576.0
    ));
    out.push_str(&format!(
        "  sha256 esperado: {}\n",
        asset.sha256.as_deref().unwrap_or("(sin hash)")
    ));

    let result = install_asset(&client, &asset, install_dir, &rel.tag_name, |p| {
        if p.phase == "descargando" && p.percent as u64 % 25 == 0 {
            eprintln!("  {} {:.0}%", p.phase, p.percent);
        }
    })
    .await;

    match result {
        Ok(r) => {
            out.push_str(&format!("  instalado en: {}\n", r.installed_dir));
            out.push_str(&format!(
                "  llama-server: {}\n",
                r.llama_server.as_deref().unwrap_or("(no encontrado)")
            ));
            out.push_str(&format!("  binarios ({}):\n", r.binaries.len()));
            for b in r.binaries.iter().take(12) {
                out.push_str(&format!("    {b}\n"));
            }
            // Verifica que el ejecutable arranca.
            if let Some(exe) = &r.llama_server {
                let outp = std::process::Command::new(exe)
                    .arg("--version")
                    .output()
                    .expect("no se pudo ejecutar llama-server");
                // llama-server escribe la version por stderr.
                let mut v = String::from_utf8_lossy(&outp.stdout).to_string();
                v.push_str(&String::from_utf8_lossy(&outp.stderr));
                out.push_str(&format!("  version: {}", v.trim()));
                out.push_str(if v.contains("version") {
                    "\n  OK: instalado y ejecutable\n"
                } else {
                    "\n  AVISO: se ejecuta pero no imprime version\n"
                });
            }
            out
        }
        Err(e) => {
            out.push_str(&format!("  ERROR: {e}\n"));
            out
        }
    }
}
