//! Comprobación de las rutas de datos y de la configuración real.
//! Ejecutar con `cargo test --test paths -- --nocapture`.

use ezllm_lib::paths_probe;

#[test]
fn prints_data_paths() {
    println!("{}", paths_probe::report());
}

#[test]
fn prints_flags_from_saved_config() {
    println!("{}", ezllm_lib::live_check::flags_from_saved_config());
}

#[test]
fn prints_server_lookup() {
    println!("{}", ezllm_lib::live_check::find_server_report());
}
