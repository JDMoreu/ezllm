//! Prueba de instalación real: descarga el paquete oficial, verifica el
//! hash SHA-256 de GitHub y extrae los binarios.
//!
//! Ejecutar con:
//!   cargo test --test install_real -- --ignored --nocapture

use std::path::PathBuf;

use ezllamacpp_lib::install_probe;

#[tokio::test]
#[ignore = "descarga ~35 MB de la red"]
async fn installs_vulkan_package_from_github() {
    let install_dir: PathBuf = std::env::temp_dir().join("ezllama-install-test");
    let _ = std::fs::remove_dir_all(&install_dir);

    let report = install_probe::install_latest_vulkan(&install_dir).await;
    println!("{report}");

    assert!(
        report.contains("OK"),
        "la instalación falló:\n{report}"
    );
}
