//! Verificación en vivo contra la API real de GitHub.
//! Se ejecuta con `cargo test --test live_api -- --ignored --nocapture`.

use ezllamacpp_lib::live_check;

#[test]
#[ignore = "accede a la red"]
fn live_release_recommends_vulkan_on_windows() {
    let report = live_check::recommend_for_host("windows", "x64");
    println!("{}", report);
    assert!(
        report.contains("vulkan"),
        "se esperaba vulkan como recomendado, llegó:\n{report}"
    );
}
