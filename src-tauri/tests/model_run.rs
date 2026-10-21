//! Servidor con un modelo REAL: arranca, carga el GGUF y genera texto.
//!
//! Ejecutar con:
//!   cargo test --test model_run -- --ignored --nocapture

use std::path::PathBuf;

use ezllamacpp_lib::server_probe;

#[test]
#[ignore = "arranca un llama-server real con modelo"]
fn server_loads_model_and_generates() {
    let exe = std::fs::read_dir(PathBuf::from(std::env::temp_dir()).join("ezllama-install-test"))
        .expect("ejecuta primero el test install_real")
        .filter_map(|e| e.ok())
        .map(|d| d.path().join("llama-server.exe"))
        .find(|p| p.exists())
        .expect("no se encontró llama-server");

    let model = PathBuf::from(std::env::temp_dir()).join("ezllama-model").join("tiny.gguf");
    assert!(model.exists(), "no se encontró el modelo de prueba");

    let report = server_probe::lifecycle_with_model(&exe, &model);
    println!("{report}");

    assert!(
        report.contains("OK: el modelo genero texto"),
        "el modelo no genero:\n{report}"
    );
    assert!(report.contains("OK: detenido"), "el servidor no paró:\n{report}");
}
