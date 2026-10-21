//! Instalación de llama.cpp: descarga, verificación y extracción.
//!
//! Descarga desde las releases oficiales de `ggml-org/llama.cpp`. Cada asset
//! lleva `digest: "sha256:<hash>"` en la API de GitHub, así que se verifica
//! la descarga sin tener que fiarse del tamaño.
//!
//! La descarga va a un fichero temporal y solo se mueve a su sitio si el
//! hash coincide: un fichero a medias nunca se instala.

use serde::Serialize;
use std::path::Path;
use tokio::io::AsyncWriteExt;

use crate::releases::BinaryAsset;

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DownloadProgress {
    pub downloaded: u64,
    pub total: u64,
    pub percent: f64,
    pub bytes_per_sec: f64,
    pub phase: String,
}

/// Resultado de una instalación.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct InstallResult {
    pub ok: bool,
    pub installed_dir: String,
    pub llama_server: Option<String>,
    pub binaries: Vec<String>,
    pub error: Option<String>,
}

/// Descarga un asset a `dest`, mostrando progreso.
///
/// `on_progress` se llama con el estado cada ~120 ms.
pub async fn download_asset(
    client: &reqwest::Client,
    asset: &BinaryAsset,
    dest: &Path,
    on_progress: impl Fn(DownloadProgress) + Send + Sync + 'static,
) -> Result<(), String> {
    if let Some(parent) = dest.parent() {
        std::fs::create_dir_all(parent).map_err(|e| format!("No se pudo crear {parent:?}: {e}"))?;
    }

    let res = client
        .get(&asset.url)
        .send()
        .await
        .map_err(|e| format!("No se pudo descargar {}: {e}", asset.name))?;
    if !res.status().is_success() {
        return Err(format!(
            "La descarga de {} falló con HTTP {}",
            asset.name,
            res.status()
        ));
    }
    let total = res.content_length().unwrap_or(asset.size);

    let tmp = dest.with_extension("download");
    let mut file = tokio::fs::File::create(&tmp)
        .await
        .map_err(|e| format!("No se pudo crear {tmp:?}: {e}"))?;

    let mut stream = res.bytes_stream();
    let mut downloaded: u64 = 0;
    let started = std::time::Instant::now();
    let mut last_report = std::time::Instant::now();

    use futures_util::StreamExt;
    while let Some(chunk) = stream.next().await {
        let chunk = chunk.map_err(|e| format!("Se cortó la descarga: {e}"))?;
        file.write_all(&chunk)
            .await
            .map_err(|e| format!("Error escribiendo en disco: {e}"))?;
        downloaded += chunk.len() as u64;

        if last_report.elapsed().as_millis() >= 120 {
            let secs = started.elapsed().as_secs_f64().max(0.001);
            on_progress(DownloadProgress {
                downloaded,
                total,
                percent: if total > 0 {
                    (downloaded as f64 / total as f64) * 100.0
                } else {
                    0.0
                },
                bytes_per_sec: downloaded as f64 / secs,
                phase: "descargando".to_string(),
            });
            last_report = std::time::Instant::now();
        }
    }

    file.flush()
        .await
        .map_err(|e| format!("No se pudo cerrar el fichero: {e}"))?;
    drop(file);

    on_progress(DownloadProgress {
        downloaded,
        total,
        percent: 100.0,
        bytes_per_sec: downloaded as f64 / started.elapsed().as_secs_f64().max(0.001),
        phase: "verificando".to_string(),
    });

    // Verifica el hash contra el digest oficial de GitHub.
    if let Some(expected) = asset.sha256.as_deref() {
        let actual = tokio::task::spawn_blocking({
            let path = tmp.clone();
            move || crate::gguf::sha256_file(&path)
        })
        .await
        .map_err(|e| format!("Error verificando la descarga: {e}"))?
        .map_err(|e| format!("Error verificando la descarga: {e}"))?;

        if !actual.eq_ignore_ascii_case(expected) {
            let _ = tokio::fs::remove_file(&tmp).await;
            return Err(format!(
                "La descarga no coincide con el hash oficial.\n  esperado: {expected}\n  obtenido: {actual}\nEl fichero se ha descartado."
            ));
        }
    }

    tokio::fs::rename(&tmp, dest)
        .await
        .map_err(|e| format!("No se pudo guardar {dest:?}: {e}"))?;

    on_progress(DownloadProgress {
        downloaded,
        total,
        percent: 100.0,
        bytes_per_sec: 0.0,
        phase: "descarga completa".to_string(),
    });
    Ok(())
}

/// Extrae un ZIP en `dest_dir`.
pub async fn extract_zip(archive: &Path, dest_dir: &Path) -> Result<usize, String> {
    let archive = archive.to_path_buf();
    let dest_dir = dest_dir.to_path_buf();
    tokio::task::spawn_blocking(move || {
        let file = std::fs::File::open(&archive)
            .map_err(|e| format!("No se pudo abrir {}: {e}", archive.display()))?;
        let mut zip = zip::ZipArchive::new(file)
            .map_err(|e| format!("No se pudo leer el ZIP: {e}"))?;
        std::fs::create_dir_all(&dest_dir)
            .map_err(|e| format!("No se pudo crear {}: {e}", dest_dir.display()))?;

        let mut count = 0usize;
        for i in 0..zip.len() {
            let mut entry = zip
                .by_index(i)
                .map_err(|e| format!("ZIP corrupto: {e}"))?;
            let Some(rel) = entry.enclosed_name() else {
                continue;
            };
            let out_path = dest_dir.join(rel);
            if entry.is_dir() {
                std::fs::create_dir_all(&out_path).ok();
                continue;
            }
            if let Some(p) = out_path.parent() {
                std::fs::create_dir_all(p).ok();
            }
            let mut out = std::fs::File::create(&out_path)
                .map_err(|e| format!("No se pudo escribir {}: {e}", out_path.display()))?;
            std::io::copy(&mut entry, &mut out)
                .map_err(|e| format!("Error al extraer {}: {e}", out_path.display()))?;
            count += 1;
        }
        Ok(count)
    })
    .await
    .map_err(|e| format!("Error al extraer: {e}"))?
}

/// Extrae un TAR.GZ en `dest_dir`.
pub async fn extract_tar_gz(archive: &Path, dest_dir: &Path) -> Result<usize, String> {
    let archive = archive.to_path_buf();
    let dest_dir = dest_dir.to_path_buf();
    tokio::task::spawn_blocking(move || {
        let file = std::fs::File::open(&archive)
            .map_err(|e| format!("No se pudo abrir {}: {e}", archive.display()))?;
        let gz = flate2::read::GzDecoder::new(file);
        let mut tar = tar::Archive::new(gz);
        std::fs::create_dir_all(&dest_dir)
            .map_err(|e| format!("No se pudo crear {}: {e}", dest_dir.display()))?;

        let mut count = 0usize;
        for entry in tar.entries().map_err(|e| format!("TAR corrupto: {e}"))? {
            let mut entry = entry.map_err(|e| format!("TAR corrupto: {e}"))?;
            let path = entry
                .path()
                .map_err(|e| format!("Entrada inválida: {e}"))?
                .into_owned();
            // Nunca se escribe fuera del destino.
            let out_path = dest_dir.join(&path);
            if !out_path.starts_with(&dest_dir) {
                continue;
            }
            if entry.header().entry_type().is_dir() {
                std::fs::create_dir_all(&out_path).ok();
                continue;
            }
            if let Some(p) = out_path.parent() {
                std::fs::create_dir_all(p).ok();
            }
            let mut out = std::fs::File::create(&out_path)
                .map_err(|e| format!("No se pudo escribir {}: {e}", out_path.display()))?;
            std::io::copy(&mut entry, &mut out)
                .map_err(|e| format!("Error al extraer {}: {e}", out_path.display()))?;
            count += 1;
        }
        Ok(count)
    })
    .await
    .map_err(|e| format!("Error al extraer: {e}"))?
}

/// Descomprime según la extensión del fichero.
pub async fn extract(archive: &Path, dest_dir: &Path) -> Result<usize, String> {
    let name = archive.file_name().map(|n| n.to_string_lossy().to_lowercase()).unwrap_or_default();
    if name.ends_with(".zip") {
        extract_zip(archive, dest_dir).await
    } else if name.ends_with(".tar.gz") || name.ends_with(".tgz") {
        extract_tar_gz(archive, dest_dir).await
    } else {
        Err(format!(
            "Formato de archivo no soportado: {}",
            archive.display()
        ))
    }
}

/// Instala un asset de llama.cpp en `install_dir`.
///
/// Estructura final: `install_dir/<tag>/` con los binarios dentro.
pub async fn install_asset(
    client: &reqwest::Client,
    asset: &BinaryAsset,
    install_dir: &Path,
    tag: &str,
    on_progress: impl Fn(DownloadProgress) + Send + Sync + 'static,
) -> Result<InstallResult, String> {
    let target_dir = install_dir.join(tag);
    std::fs::create_dir_all(&target_dir)
        .map_err(|e| format!("No se pudo crear {}: {e}", target_dir.display()))?;

    let archive = install_dir.join(&asset.name);
    // El callback se comparte entre la descarga y el resto de la instalación.
    let progress = std::sync::Arc::new(on_progress);
    let for_download = std::sync::Arc::clone(&progress);
    download_asset(client, asset, &archive, move |p| for_download(p)).await?;

    progress(DownloadProgress {
        downloaded: asset.size,
        total: asset.size,
        percent: 100.0,
        bytes_per_sec: 0.0,
        phase: "extrayendo".to_string(),
    });

    let _extracted = extract(&archive, &target_dir).await?;
    // El ZIP no hace falta después de extraerlo.
    let _ = std::fs::remove_file(&archive);

    let llama_server = crate::models::find_llama_server(&target_dir);
    let binaries = crate::models::list_llama_binaries(&target_dir);

    Ok(InstallResult {
        ok: true,
        installed_dir: target_dir.to_string_lossy().into_owned(),
        llama_server: llama_server.map(|p| p.to_string_lossy().into_owned()),
        binaries,
        error: None,
    })
}
/// Instancia instalada: qué versiones hay y cuál está activa.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct InstalledBuild {
    pub tag: String,
    pub dir: String,
    pub llama_server: Option<String>,
    pub installed_at: Option<String>,
}

/// Lista las versiones de llama.cpp instaladas.
pub fn list_installed(install_dir: &Path) -> Vec<InstalledBuild> {
    let mut out = Vec::new();
    let Ok(entries) = std::fs::read_dir(install_dir) else {
        return out;
    };
    for e in entries.flatten() {
        let path = e.path();
        if !path.is_dir() {
            continue;
        }
        let tag = path
            .file_name()
            .map(|n| n.to_string_lossy().into_owned())
            .unwrap_or_default();
        if !tag.starts_with('b') && !tag.starts_with('v') {
            continue;
        }
        let llama_server = crate::models::find_llama_server(&path);
        let installed_at = std::fs::metadata(&path)
            .and_then(|m| m.modified())
            .ok()
            .map(|t| {
                let d: chrono_like::DateTime = t.into();
                d.to_iso()
            });
        out.push(InstalledBuild {
            tag,
            dir: path.to_string_lossy().into_owned(),
            llama_server: llama_server.map(|p| p.to_string_lossy().into_owned()),
            installed_at,
        });
    }
    out.sort_by(|a, b| b.tag.cmp(&a.tag));
    out
}

/// Formateo de fecha sin depender de chrono.
mod chrono_like {
    use std::time::{SystemTime, UNIX_EPOCH};

    pub struct DateTime(SystemTime);

    impl From<SystemTime> for DateTime {
        fn from(t: SystemTime) -> Self {
            DateTime(t)
        }
    }

    impl DateTime {
        /// ISO-8601 en UTC (formato `YYYY-MM-DDTHH:MM:SSZ`).
        pub fn to_iso(&self) -> String {
            let secs = self.0.duration_since(UNIX_EPOCH).map(|d| d.as_secs()).unwrap_or(0);
            let days = secs / 86_400;
            let rem = secs % 86_400;
            let (h, m, s) = (rem / 3600, (rem % 3600) / 60, rem % 60);
            let (y, mo, d) = civil_from_days(days as i64);
            format!("{y:04}-{mo:02}-{d:02}T{h:02}:{m:02}:{s:02}Z")
        }
    }

    /// Días desde 1970 -> fecha civil (algoritmo de Howard Hinnant).
    pub fn civil_from_days(z: i64) -> (i64, u32, u32) {
        let z = z + 719_468;
        let era = if z >= 0 { z } else { z - 146_096 } / 146_097;
        let doe = (z - era * 146_097) as u64;
        let yoe = (doe - doe / 1460 + doe / 36_524 - doe / 146_096) / 365;
        let y = yoe as i64 + era * 400;
        let doy = doe - (365 * yoe + yoe / 4 - yoe / 100);
        let mp = (5 * doy + 2) / 153;
        let d = (doy - (153 * mp + 2) / 5 + 1) as u32;
        let m = if mp < 10 { mp + 3 } else { mp - 9 } as u32;
        (if m <= 2 { y + 1 } else { y }, m, d)
    }
}

#[cfg(test)]
mod tests {
    use super::chrono_like::civil_from_days;

    #[test]
    fn civil_dates_are_correct() {
        assert_eq!(civil_from_days(0), (1970, 1, 1));
        assert_eq!(civil_from_days(19_723), (2024, 1, 1));
        assert_eq!(civil_from_days(20_745), (2026, 10, 19));
        assert_eq!(civil_from_days(20_713), (2026, 9, 17));
    }
}
