//! Sonda de rutas: comprueba dónde acaba guardando la app.

pub fn report() -> String {
    let mut out = String::new();
    out.push_str(&format!(
        "dirs::data_dir() = {:?}\n",
        dirs::data_dir()
    ));
    out.push_str(&format!(
        "dirs::config_dir() = {:?}\n",
        dirs::config_dir()
    ));
    out.push_str(&format!(
        "dirs::home_dir() = {:?}\n",
        dirs::home_dir()
    ));
    out
}
