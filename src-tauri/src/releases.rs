//! Releases oficiales de llama.cpp desde la API de GitHub.
//!
//! Puntos clave del repo oficial (`ggml-org/llama.cpp`):
//!   - Los BINARIOS están en las tags `b#####` (nightly, `prerelease: true`),
//!     36 assets cada una.
//!   - `/releases/latest` devuelve `vX.Y.Z` (estable) y esas releases NO
//!     traen binarios: solo `nightly-tag.txt` con el tag `b#####` equivalente.
//!     Ese puntero es el puente estable -> binario.
//!   - Los assets llevan `digest: "sha256:<hash>"`, así que se puede verificar
//!     la descarga sin descargar a ciegas.
//!   - Sin token: 60 peticiones/hora por IP. Con token: 5000/hora.

use serde::{Deserialize, Serialize};

pub const REPO: &str = "ggml-org/llama.cpp";
const API_BASE: &str = "https://api.github.com/repos/ggml-org/llama.cpp";

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GitHubAsset {
    pub name: String,
    pub size: u64,
    pub browser_download_url: String,
    #[serde(default)]
    pub digest: Option<String>,
    #[serde(default)]
    pub content_type: Option<String>,
}

impl GitHubAsset {
    /// Hash SHA-256 declarado por GitHub, si lo hay.
    pub fn sha256(&self) -> Option<&str> {
        self.digest
            .as_deref()
            .and_then(|d| d.strip_prefix("sha256:"))
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GitHubRelease {
    pub tag_name: String,
    pub name: Option<String>,
    pub prerelease: bool,
    pub draft: bool,
    pub published_at: Option<String>,
    pub body: Option<String>,
    pub html_url: String,
    pub assets: Vec<GitHubAsset>,
}

/// Cabecera de Authorization para la API de GitHub.
pub fn github_headers(token: Option<&str>) -> Vec<(&'static str, String)> {
    let mut h = vec![
        ("Accept", "application/vnd.github+json".to_string()),
        ("User-Agent", "EzLlamaCpp".to_string()),
        ("X-GitHub-Api-Version", "2022-11-28".to_string()),
    ];
    if let Some(t) = token {
        if !t.trim().is_empty() {
            h.push(("Authorization", format!("Bearer {}", t.trim())));
        }
    }
    h
}

/// Descarga el JSON de una URL de la API con las cabeceras de GitHub.
pub async fn fetch_json<T: serde::de::DeserializeOwned>(
    client: &reqwest::Client,
    url: &str,
    token: Option<&str>,
) -> Result<T, String> {
    let mut req = client.get(url);
    for (k, v) in github_headers(token) {
        req = req.header(k, v);
    }
    let res = req
        .send()
        .await
        .map_err(|e| format!("No se pudo contactar con GitHub: {e}"))?;

    let status = res.status();
    if !status.is_success() {
        let remaining = res
            .headers()
            .get("x-ratelimit-remaining")
            .and_then(|v| v.to_str().ok())
            .unwrap_or("?")
            .to_string();
        let body = res.text().await.unwrap_or_default();
        let hint = if status.as_u16() == 403 || status.as_u16() == 429 {
            format!(
                " Límite de la API alcanzado (quedan {remaining} peticiones). Añade un token de GitHub en Ajustes para subirlo a 5000/hora."
            )
        } else {
            String::new()
        };
        return Err(format!("GitHub devolvió {status}.{hint} {body}").trim().to_string());
    }
    res.json()
        .await
        .map_err(|e| format!("Respuesta ilegible de GitHub: {e}"))
}

/// Lista las últimas releases (nightly `b#####` primero, por fecha).
pub async fn list_releases(
    client: &reqwest::Client,
    token: Option<&str>,
    per_page: u32,
) -> Result<Vec<GitHubRelease>, String> {
    let url = format!("{API_BASE}/releases?per_page={}", per_page.clamp(1, 100));
    fetch_json::<Vec<GitHubRelease>>(client, &url, token).await
}

/// Una release concreta por tag.
pub async fn get_release(
    client: &reqwest::Client,
    token: Option<&str>,
    tag: &str,
) -> Result<GitHubRelease, String> {
    let url = format!("{API_BASE}/releases/tags/{tag}");
    fetch_json::<GitHubRelease>(client, &url, token).await
}

/// Resuelve el tag `b#####` de una release estable `vX.Y.Z`.
///
/// Las releases estables no publican binarios: publican `nightly-tag.txt` con
/// el tag de la nightly equivalente. Ese es el puente estable -> binario.
pub async fn resolve_stable_to_nightly(
    client: &reqwest::Client,
    token: Option<&str>,
    stable_tag: &str,
) -> Result<String, String> {
    let url = format!(
        "https://github.com/{REPO}/releases/download/{stable_tag}/nightly-tag.txt"
    );
    let res = client
        .get(&url)
        .send()
        .await
        .map_err(|e| format!("No se pudo descargar nightly-tag.txt: {e}"))?;
    if !res.status().is_success() {
        return Err(format!(
            "La release estable {stable_tag} no publica nightly-tag.txt (HTTP {})",
            res.status()
        ));
    }
    let text = res.text().await.unwrap_or_default();
    let tag = text.trim().to_string();
    if tag.is_empty() {
        return Err(format!("nightly-tag.txt de {stable_tag} está vacío"));
    }
    Ok(tag)
}

// --- Clasificación de assets ------------------------------------------------

/// Backend de aceleración de un asset.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum Backend {
    Cpu,
    Vulkan,
    Cuda,
    Rocm,
    Sycl,
    OpenVino,
    OpenCl,
}

impl Backend {
    pub fn label(&self) -> &'static str {
        match self {
            Backend::Cpu => "CPU",
            Backend::Vulkan => "Vulkan",
            Backend::Cuda => "CUDA",
            Backend::Rocm => "ROCm",
            Backend::Sycl => "SYCL",
            Backend::OpenVino => "OpenVINO",
            Backend::OpenCl => "OpenCL",
        }
    }

    /// ¿Necesita drivers extra en el equipo del usuario?
    pub fn needs_driver(&self) -> bool {
        matches!(
            self,
            Backend::Cuda | Backend::Rocm | Backend::Sycl | Backend::OpenVino
        )
    }
}

/// Un asset de binarios, ya clasificado.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BinaryAsset {
    pub name: String,
    pub size: u64,
    pub url: String,
    pub sha256: Option<String>,
    pub os: String,
    pub backend: Backend,
    pub arch: String,
    pub cuda_version: Option<String>,
    pub is_cudart: bool,
    /// ¿El nombre encaja con la plataforma y arquitectura del equipo?
    pub compatible: bool,
    pub incompatibility_reason: Option<String>,
}

fn contains(hay: &str, needle: &str) -> bool {
    hay.to_ascii_lowercase().contains(needle)
}

/// Clasifica un asset por nombre. Los nombres tienen esta forma:
///
/// ```text
/// llama-b11748-bin-win-vulkan-x64.zip
/// llama-b11748-bin-ubuntu-cuda-13.4-x64.tar.gz
/// llama-b11748-bin-ubuntu-vulkan-arm64.tar.gz
/// llama-b11748-bin-macos-arm64.tar.gz
/// llama-b11748-bin-linux-arm64-snapdragon.tar.gz
/// cudart-llama-bin-win-cuda-13.4-x64.zip
/// ```
pub fn classify_asset(asset: &GitHubAsset, host_os: &str, host_arch: &str) -> Option<BinaryAsset> {
    let name = &asset.name;

    // Los assets que no son binarios de llama.cpp (UI, xcframework, snapdragon).
    if contains(name, "-ui.") || contains(name, "xcframework") || contains(name, "snapdragon") {
        return None;
    }

    let is_cudart = name.starts_with("cudart-");

    // El SO va justo despues de "bin-": "bin-win", "bin-ubuntu", "bin-macos",
    // "bin-linux". Los assets de cudart llevan "cudart-llama-bin-win-...".
    let os = if contains(name, "bin-win") {
        "windows"
    } else if contains(name, "bin-ubuntu") {
        "linux"
    } else if contains(name, "bin-macos") {
        "macos"
    } else if contains(name, "bin-linux") {
        "linux"
    } else {
        return None;
    };

    let backend = if contains(name, "vulkan") {
        Backend::Vulkan
    } else if contains(name, "cuda") {
        Backend::Cuda
    } else if contains(name, "rocm") {
        Backend::Rocm
    } else if contains(name, "sycl") {
        Backend::Sycl
    } else if contains(name, "openvino") {
        Backend::OpenVino
    } else if contains(name, "opencl") {
        Backend::OpenCl
    } else if contains(name, "bin-cpu") || contains(name, "bin-win-cpu") {
        Backend::Cpu
    } else {
        // "bin-ubuntu-x64" sin backend: es la build CPU de Linux.
        Backend::Cpu
    };

    let arch = if contains(name, "arm64") {
        "arm64"
    } else if contains(name, "x64") {
        "x64"
    } else {
        return None;
    };

    // Versión de CUDA: "cuda-13.4", "cuda-12.8", "cuda-12.4"
    let cuda_version = {
        let lower = name.to_ascii_lowercase();
        let mut v = None;
        if let Some(pos) = lower.find("cuda-") {
            let rest = &lower[pos + 5..];
            let end = rest
                .find(|c: char| !c.is_ascii_digit() && c != '.')
                .unwrap_or(rest.len());
            if end > 0 {
                v = Some(rest[..end].to_string());
            }
        }
        v
    };

    let (compatible, reason) = check_compatibility(os, arch, host_os, host_arch);

    Some(BinaryAsset {
        name: name.clone(),
        size: asset.size,
        url: asset.browser_download_url.clone(),
        sha256: asset.sha256().map(|s| s.to_string()),
        os: os.to_string(),
        backend,
        arch: arch.to_string(),
        cuda_version,
        is_cudart,
        compatible,
        incompatibility_reason: reason,
    })
}

fn check_compatibility(
    asset_os: &str,
    asset_arch: &str,
    host_os: &str,
    host_arch: &str,
) -> (bool, Option<String>) {
    if asset_os != host_os {
        return (
            false,
            Some(format!(
                "Es para {} y este equipo usa {}",
                asset_os, host_os
            )),
        );
    }
    if asset_arch != host_arch {
        return (
            false,
            Some(format!(
                "Es para {} y este equipo usa {}",
                asset_arch, host_arch
            )),
        );
    }
    (true, None)
}

/// Lista y clasifica todos los binarios de una release.
pub fn classify_release(release: &GitHubRelease, host_os: &str, host_arch: &str) -> Vec<BinaryAsset> {
    release
        .assets
        .iter()
        .filter_map(|a| classify_asset(a, host_os, host_arch))
        .collect()
}

/// Elige el asset recomendado para este equipo.
///
/// Prioridad: Vulkan (funciona con la mayoría de GPU de escritorio sin
/// drivers extra) -> CUDA -> ROCm -> CPU.
///
/// Los assets `cudart-*` NO son binarios de llama.cpp: son las bibliotecas
/// de runtime de CUDA que se descargan aparte y solo hacen falta con una
/// build CUDA. Nunca deben ganar la recomendación.
pub fn recommend_asset(assets: &[BinaryAsset], preferred: Option<Backend>) -> Option<&BinaryAsset> {
    let compatible: Vec<&BinaryAsset> = assets
        .iter()
        .filter(|a| a.compatible && !a.is_cudart)
        .collect();
    if compatible.is_empty() {
        return None;
    }
    let order: Vec<Backend> = match preferred {
        Some(b) => vec![b, Backend::Vulkan, Backend::Cuda, Backend::Rocm, Backend::Cpu],
        None => vec![
            Backend::Vulkan,
            Backend::Cuda,
            Backend::Rocm,
            Backend::Sycl,
            Backend::OpenVino,
            Backend::Cpu,
        ],
    };
    for b in order {
        if let Some(found) = compatible.iter().find(|a| a.backend == b) {
            return Some(found);
        }
    }
    compatible.first().copied()
}

#[cfg(test)]
mod tests {
    use super::*;

    fn asset(name: &str) -> GitHubAsset {
        GitHubAsset {
            name: name.to_string(),
            size: 1,
            browser_download_url: format!("https://example.com/{name}"),
            digest: Some("sha256:abc".to_string()),
            content_type: None,
        }
    }

    #[test]
    fn classifies_windows_vulkan() {
        let a = asset("llama-b11748-bin-win-vulkan-x64.zip");
        let c = classify_asset(&a, "windows", "x64").unwrap();
        assert_eq!(c.backend, Backend::Vulkan);
        assert_eq!(c.arch, "x64");
        assert!(c.compatible);
    }

    #[test]
    fn extracts_cuda_version() {
        let a = asset("llama-b11748-bin-ubuntu-cuda-13.4-x64.tar.gz");
        let c = classify_asset(&a, "linux", "x64").unwrap();
        assert_eq!(c.backend, Backend::Cuda);
        assert_eq!(c.cuda_version.as_deref(), Some("13.4"));
    }

    #[test]
    fn marks_incompatible_arch() {
        let a = asset("llama-b11748-bin-win-vulkan-arm64.zip");
        let c = classify_asset(&a, "windows", "x64").unwrap();
        assert!(!c.compatible);
        assert!(c.incompatibility_reason.is_some());
    }

#[test]
    fn classifies_real_windows_assets() {
        // Nombres EXACTOS de la release b11767.
        for name in [
            "llama-b11767-bin-win-cpu-x64.zip",
            "llama-b11767-bin-win-vulkan-x64.zip",
            "llama-b11767-bin-win-cuda-12.4-x64.zip",
            "cudart-llama-bin-win-cuda-12.4-x64.zip",
        ] {
            let a = asset(name);
            let c = classify_asset(&a, "windows", "x64")
                .unwrap_or_else(|| panic!("{name} no se clasificó"));
            println!(
                "{name} -> os={} backend={} arch={} compatible={} cudart={}",
                c.os, c.backend.label(), c.arch, c.compatible, c.is_cudart
            );
            assert_eq!(c.os, "windows", "{name}");
            assert_eq!(c.arch, "x64", "{name}");
            assert!(c.compatible, "{name} debería ser compatible");
        }
    }
#[test]
    fn cudart_never_wins_the_recommendation() {
        // Regresión: los assets cudart-* son el runtime de CUDA, no los
        // binarios de llama.cpp. Deben quedar fuera de la recomendación.
        let names = [
            "cudart-llama-bin-win-cuda-12.4-x64.zip",
            "llama-b11767-bin-win-cuda-12.4-x64.zip",
            "llama-b11767-bin-win-vulkan-x64.zip",
            "llama-b11767-bin-win-cpu-x64.zip",
        ];
        let assets: Vec<BinaryAsset> = names
            .iter()
            .map(|n| {
                classify_asset(&asset(n), "windows", "x64").expect("clasificar")
            })
            .collect();

        let rec = recommend_asset(&assets, None).expect("debe recomendar algo");
        assert_eq!(rec.name, "llama-b11767-bin-win-vulkan-x64.zip");
        assert!(!rec.is_cudart);
    }

    #[test]
    fn preferred_backend_wins_over_vulkan() {
        let names = [
            "llama-b11767-bin-win-vulkan-x64.zip",
            "llama-b11767-bin-win-cuda-12.4-x64.zip",
        ];
        let assets: Vec<BinaryAsset> = names
            .iter()
            .map(|n| {
                classify_asset(&asset(n), "windows", "x64").expect("clasificar")
            })
            .collect();
        let rec = recommend_asset(&assets, Some(Backend::Cuda)).expect("debe recomendar");
        assert_eq!(rec.backend, Backend::Cuda);
    }
    #[test]
    fn ignores_ui_and_xcframework() {
        assert!(classify_asset(&asset("llama-b11748-ui.tar.gz"), "windows", "x64").is_none());
        assert!(
            classify_asset(&asset("llama-b11748-xcframework.zip"), "windows", "x64").is_none()
        );
    }
}
