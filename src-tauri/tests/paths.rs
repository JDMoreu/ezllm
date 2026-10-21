//! Comprobación de las rutas de datos y de la configuración real.
//! Ejecutar con `cargo test --test paths -- --nocapture`.

use ezllamacpp_lib::paths_probe;

#[test]
fn prints_data_paths() {
    println!("{}", paths_probe::report());
}
