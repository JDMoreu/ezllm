//! Ciclo de vida real del servidor: arrancar, responder y parar.
//!
//! Ejecutar con:
//!   cargo test --test server_lifecycle -- --ignored --nocapture

use std::path::PathBuf;

use ezllamacpp_lib::server_probe;

#[test]
#[ignore = "arranca un llama-server real"]
fn server_starts_answers_and_stops() {
    let dir = PathBuf::from(std::env::temp_dir()).join("ezllama-install-test");
    // Busca el llama-server instalado por el test de instalación.
    let exe = std::fs::read_dir(&dir)
        .expect("ejecuta primero el test install_real")
        .filter_map(|e| e.ok())
        .map(|d| d.path().join("llama-server.exe"))
        .find(|p| p.exists())
        .expect("no se encontró llama-server");

    let report = server_probe::lifecycle(&exe);
    println!("{report}");

    assert!(report.contains("OK: detenido"), "el servidor no paró:\n{report}");
    assert!(report.contains("200"), "la API no respondió:\n{report}");
}
