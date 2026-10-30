//! Búsqueda y descarga de modelos GGUF desde Hugging Face.
//!
//! La API pública permite buscar repositorios con `filter=gguf` y leer sus
//! archivos con `?blobs=true`. Una descarga se hace archivo a archivo, se
//! escribe primero en `.download` y solo se publica cuando el hash de LFS
//! coincide.

use std::collections::BTreeMap;
use std::path::{Component, Path, PathBuf};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::LazyLock;
use std::time::Instant;

use futures_util::StreamExt;
use regex::Regex;
use serde::{Deserialize, Serialize};
use tokio::io::AsyncWriteExt;

pub const API: &str = "https://huggingface.co/api/models";

/// Una descarga a la vez: la UI encola, el backend solo necesita saber si la
/// descarga en curso debe detenerse y borrar el fichero parcial.
static CANCEL: AtomicBool = AtomicBool::new(false);

/// Pide a la descarga en curso que se detenga en el próximo fragmento.
pub fn cancel_download() {
    CANCEL.store(true, Ordering::SeqCst);
}

fn reset_cancel() {
    CANCEL.store(false, Ordering::SeqCst);
}

fn cancelled() -> bool {
    CANCEL.load(Ordering::SeqCst)
}

static SPLIT_RE: LazyLock<Regex> = LazyLock::new(|| {
    Regex::new(r"(?i)^(.*)-(\d{5})-of-(\d{5})\.gguf$").expect("regex de shards")
});
static QUANT_RE: LazyLock<Regex> = LazyLock::new(|| {
    Regex::new(
        r"(?i)(IQ\d+_[A-Z0-9_]+|Q\d+_K_[A-Z0-9_]+|Q\d+_K|Q\d+_\d+|BF16|F16|F32|Q8_0|Q4_0|Q5_0)",
    )
    .expect("regex de cuantización")
});

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct HfModelSummary {
    pub id: String,
    pub author: String,
    pub downloads: u64,
    pub likes: u64,
    pub pipeline_tag: Option<String>,
    pub tags: Vec<String>,
    pub last_modified: Option<String>,
    pub gated: bool,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct HfFile {
    pub path: String,
    pub size: u64,
    pub sha256: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct HfQuant {
    pub id: String,
    pub label: String,
    pub role: String,
    pub quant: String,
    pub size: u64,
    pub sharded: bool,
    pub incomplete: bool,
    pub files: Vec<HfFile>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct HfGguf {
    pub architecture: Option<String>,
    pub context_length: Option<u64>,
    pub total_size: Option<u64>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct HfModelDetail {
    pub id: String,
    pub author: String,
    pub downloads: u64,
    pub likes: u64,
    pub pipeline_tag: Option<String>,
    pub tags: Vec<String>,
    pub last_modified: Option<String>,
    pub gated: bool,
    pub gguf: HfGguf,
    pub quants: Vec<HfQuant>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct HfDownloadProgress {
    pub repo: String,
    pub file: String,
    pub file_index: usize,
    pub file_count: usize,
    pub downloaded: u64,
    pub total: u64,
    pub percent: f64,
    pub bytes_per_sec: f64,
    pub phase: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct HfDownloadResult {
    pub files: Vec<String>,
    pub model_path: Option<String>,
}

#[derive(Debug, Deserialize)]
struct RawModel {
    id: String,
    #[serde(default)]
    downloads: u64,
    #[serde(default)]
    likes: u64,
    #[serde(default)]
    pipeline_tag: Option<String>,
    #[serde(default)]
    tags: Vec<String>,
    #[serde(rename = "lastModified", default)]
    last_modified: Option<String>,
    #[serde(default)]
    gated: serde_json::Value,
    #[serde(default)]
    author: Option<String>,
}

#[derive(Debug, Deserialize)]
struct RawDetail {
    id: String,
    #[serde(default)]
    downloads: u64,
    #[serde(default)]
    likes: u64,
    #[serde(default)]
    pipeline_tag: Option<String>,
    #[serde(default)]
    tags: Vec<String>,
    #[serde(rename = "lastModified", default)]
    last_modified: Option<String>,
    #[serde(default)]
    gated: serde_json::Value,
    #[serde(default)]
    author: Option<String>,
    #[serde(default)]
    gguf: Option<RawGguf>,
    #[serde(default)]
    siblings: Vec<RawSibling>,
}

#[derive(Debug, Deserialize)]
struct RawGguf {
    #[serde(default)]
    architecture: Option<String>,
    #[serde(default)]
    context_length: Option<u64>,
    #[serde(rename = "totalFileSize", default)]
    total_file_size: Option<u64>,
}

#[derive(Debug, Deserialize)]
struct RawSibling {
    rfilename: String,
    #[serde(default)]
    size: Option<u64>,
    #[serde(default)]
    lfs: Option<RawLfs>,
}

#[derive(Debug, Deserialize)]
struct RawLfs {
    #[serde(default)]
    sha256: Option<String>,
    #[serde(default)]
    size: Option<u64>,
}

pub async fn search(
    client: &reqwest::Client,
    query: &str,
    sort: &str,
    limit: u32,
) -> Result<Vec<HfModelSummary>, String> {
    let mut url = reqwest::Url::parse(API).map_err(|e| format!("URL de Hugging Face inválida: {e}"))?;
    {
        let mut pairs = url.query_pairs_mut();
        if !query.trim().is_empty() {
            pairs.append_pair("search", query.trim());
        }
        pairs.append_pair("filter", "gguf");
        let sort = match sort {
            "likes" => "likes",
            "lastModified" => "lastModified",
            _ => "downloads",
        };
        pairs.append_pair("sort", sort);
        pairs.append_pair("direction", "-1");
        pairs.append_pair("limit", &limit.clamp(1, 50).to_string());
    }

    let models: Vec<RawModel> = get_json(client, url).await?;
    Ok(models.into_iter().map(summary).collect())
}

/// Modelos de texto con GGUF ordenados por el criterio elegido. Se usa para
/// llenar la portada de Hugging Face antes de que el usuario busque.
pub async fn popular(
    client: &reqwest::Client,
    sort: &str,
    limit: u32,
) -> Result<Vec<HfModelSummary>, String> {
    let mut url =
        reqwest::Url::parse(API).map_err(|e| format!("URL de Hugging Face inválida: {e}"))?;
    {
        let mut pairs = url.query_pairs_mut();
        pairs.append_pair("filter", "gguf");
        pairs.append_pair("pipeline_tag", "text-generation");
        let sort = match sort {
            "likes" => "likes",
            "lastModified" => "lastModified",
            _ => "downloads",
        };
        pairs.append_pair("sort", sort);
        pairs.append_pair("direction", "-1");
        pairs.append_pair("limit", &limit.clamp(1, 30).to_string());
    }

    let models: Vec<RawModel> = get_json(client, url).await?;
    Ok(models.into_iter().map(summary).collect())
}

pub async fn detail(client: &reqwest::Client, repo: &str) -> Result<HfModelDetail, String> {
    validate_repo(repo)?;
    let mut url = reqwest::Url::parse(&format!("{API}/{repo}"))
        .map_err(|e| format!("Repositorio inválido: {e}"))?;
    url.query_pairs_mut().append_pair("blobs", "true");
    let raw: RawDetail = get_json(client, url).await?;

    let quants = group_files(&raw.siblings);
    Ok(HfModelDetail {
        id: raw.id,
        author: raw.author.unwrap_or_default(),
        downloads: raw.downloads,
        likes: raw.likes,
        pipeline_tag: raw.pipeline_tag,
        tags: raw.tags,
        last_modified: raw.last_modified,
        gated: gated(&raw.gated),
        gguf: HfGguf {
            architecture: raw.gguf.as_ref().and_then(|g| g.architecture.clone()),
            context_length: raw.gguf.as_ref().and_then(|g| g.context_length),
            total_size: raw.gguf.as_ref().and_then(|g| g.total_file_size),
        },
        quants,
    })
}

pub async fn download(
    client: &reqwest::Client,
    repo: &str,
    paths: &[String],
    models_dir: &Path,
    on_progress: impl Fn(HfDownloadProgress) + Send + Sync + 'static,
) -> Result<HfDownloadResult, String> {
    validate_repo(repo)?;
    if paths.is_empty() {
        return Err("No se ha seleccionado ningún archivo".to_string());
    }
    reset_cancel();

    let detail = detail(client, repo).await?;
    let mut selected = Vec::new();
    for path in paths {
        let found = detail
            .quants
            .iter()
            .flat_map(|q| q.files.iter())
            .find(|f| &f.path == path)
            .cloned()
            .ok_or_else(|| format!("{path} no existe en {repo}"))?;
        selected.push(found);
    }

    let total: u64 = selected.iter().map(|f| f.size).sum();
    let destination = models_dir.join(repo_folder(repo));
    tokio::fs::create_dir_all(&destination)
        .await
        .map_err(|e| format!("No se pudo crear {}: {e}", destination.display()))?;

    let progress = std::sync::Arc::new(on_progress);
    let mut downloaded_total = 0u64;
    let mut saved = Vec::new();
    let started = Instant::now();

    for (index, file) in selected.iter().enumerate() {
        if cancelled() {
            return Err("Descarga cancelada por el usuario.".to_string());
        }
        let relative = safe_relative(&file.path)
            .ok_or_else(|| format!("Ruta de archivo no válida: {}", file.path))?;
        let dest = destination.join(&relative);
        if let Some(parent) = dest.parent() {
            tokio::fs::create_dir_all(parent)
                .await
                .map_err(|e| format!("No se pudo crear {}: {e}", parent.display()))?;
        }

        if let Ok(meta) = tokio::fs::metadata(&dest).await {
            if file.size == 0 || meta.len() == file.size {
                downloaded_total += meta.len();
                progress(HfDownloadProgress {
                    repo: repo.to_string(),
                    file: file.path.clone(),
                    file_index: index + 1,
                    file_count: selected.len(),
                    downloaded: downloaded_total,
                    total,
                    percent: 100.0,
                    bytes_per_sec: 0.0,
                    phase: "ya descargado".to_string(),
                });
                saved.push(dest.to_string_lossy().into_owned());
                continue;
            }
        }

        let mut url = reqwest::Url::parse("https://huggingface.co")
            .map_err(|e| format!("URL de Hugging Face inválida: {e}"))?;
        {
            let (user, model) = repo
                .split_once('/')
                .ok_or_else(|| "El repositorio debe tener formato usuario/modelo".to_string())?;
            let mut segments = url
                .path_segments_mut()
                .map_err(|_| "URL de Hugging Face inválida".to_string())?;
            segments.push(user);
            segments.push(model);
            segments.push("resolve");
            segments.push("main");
            for part in file.path.split('/') {
                segments.push(part);
            }
        }
        url.query_pairs_mut().append_pair("download", "true");

        let response = client
            .get(url)
            .send()
            .await
            .map_err(|e| format!("No se pudo descargar {}: {e}", file.path))?;
        if !response.status().is_success() {
            let status = response.status();
            let hint = match status.as_u16() {
                401 | 403 => {
                    " El repositorio es privado o requiere aceptar su licencia en Hugging Face."
                }
                404 => " El archivo ya no existe en el repositorio.",
                _ => "",
            };
            return Err(format!(
                "Hugging Face devolvió {status} al descargar {}.{}",
                file.path, hint
            ));
        }

        let tmp = dest.with_extension("download");
        let mut out = tokio::fs::File::create(&tmp)
            .await
            .map_err(|e| format!("No se pudo crear {}: {e}", tmp.display()))?;
        let mut stream = response.bytes_stream();
        let mut last_report = Instant::now();

        while let Some(chunk) = stream.next().await {
            if cancelled() {
                drop(out);
                let _ = tokio::fs::remove_file(&tmp).await;
                return Err("Descarga cancelada por el usuario.".to_string());
            }
            let chunk = chunk.map_err(|e| format!("Se cortó la descarga de {}: {e}", file.path))?;
            out.write_all(&chunk)
                .await
                .map_err(|e| format!("Error escribiendo {}: {e}", dest.display()))?;
            downloaded_total += chunk.len() as u64;

            if last_report.elapsed().as_millis() >= 150 {
                progress(HfDownloadProgress {
                    repo: repo.to_string(),
                    file: file.path.clone(),
                    file_index: index + 1,
                    file_count: selected.len(),
                    downloaded: downloaded_total,
                    total,
                    percent: if total > 0 {
                        downloaded_total as f64 / total as f64 * 100.0
                    } else {
                        0.0
                    },
                    bytes_per_sec: downloaded_total as f64
                        / started.elapsed().as_secs_f64().max(0.001),
                    phase: "descargando".to_string(),
                });
                last_report = Instant::now();
            }
        }

        out.flush()
            .await
            .map_err(|e| format!("No se pudo cerrar {}: {e}", dest.display()))?;
        drop(out);

        if let Some(expected) = file.sha256.as_deref() {
            progress(HfDownloadProgress {
                repo: repo.to_string(),
                file: file.path.clone(),
                file_index: index + 1,
                file_count: selected.len(),
                downloaded: downloaded_total,
                total,
                percent: if total > 0 {
                    downloaded_total as f64 / total as f64 * 100.0
                } else {
                    0.0
                },
                bytes_per_sec: 0.0,
                phase: "verificando".to_string(),
            });
            let actual = tokio::task::spawn_blocking({
                let path = tmp.clone();
                move || crate::gguf::sha256_file(&path)
            })
            .await
            .map_err(|e| format!("Error verificando {}: {e}", file.path))?
            .map_err(|e| format!("Error verificando {}: {e}", file.path))?;
            if !actual.eq_ignore_ascii_case(expected) {
                let _ = tokio::fs::remove_file(&tmp).await;
                return Err(format!(
                    "El archivo {} no coincide con el hash publicado. Se ha descartado.",
                    file.path
                ));
            }
        }

        // En Windows `rename` no reemplaza un destino existente.
        let _ = tokio::fs::remove_file(&dest).await;
        tokio::fs::rename(&tmp, &dest)
            .await
            .map_err(|e| format!("No se pudo guardar {}: {e}", dest.display()))?;
        saved.push(dest.to_string_lossy().into_owned());
    }

    progress(HfDownloadProgress {
        repo: repo.to_string(),
        file: String::new(),
        file_index: selected.len(),
        file_count: selected.len(),
        downloaded: total,
        total,
        percent: 100.0,
        bytes_per_sec: 0.0,
        phase: "completado".to_string(),
    });

    let model_path = saved
        .iter()
        .find(|path| {
            let lower = path.to_ascii_lowercase();
            !lower.contains("mmproj") && !lower.contains("mtp")
        })
        .cloned()
        .or_else(|| saved.first().cloned());

    Ok(HfDownloadResult {
        files: saved,
        model_path,
    })
}

fn summary(raw: RawModel) -> HfModelSummary {
    let author = raw
        .author
        .filter(|a| !a.trim().is_empty())
        .or_else(|| raw.id.split_once('/').map(|(author, _)| author.to_string()))
        .unwrap_or_else(|| "huggingface".to_string());
    HfModelSummary {
        id: raw.id,
        author,
        downloads: raw.downloads,
        likes: raw.likes,
        pipeline_tag: raw.pipeline_tag,
        tags: raw.tags,
        last_modified: raw.last_modified,
        gated: gated(&raw.gated),
    }
}

fn gated(value: &serde_json::Value) -> bool {
    match value {
        serde_json::Value::Bool(value) => *value,
        serde_json::Value::String(value) => !value.is_empty() && value != "false",
        _ => false,
    }
}

fn group_files(siblings: &[RawSibling]) -> Vec<HfQuant> {
    let mut groups: BTreeMap<String, Vec<HfFile>> = BTreeMap::new();
    let mut expected: BTreeMap<String, usize> = BTreeMap::new();

    for sibling in siblings {
        if !sibling.rfilename.to_ascii_lowercase().ends_with(".gguf") {
            continue;
        }
        let (key, total) = if let Some(caps) = SPLIT_RE.captures(&sibling.rfilename) {
            let base = format!("{}.gguf", &caps[1]);
            let total = caps[3].parse::<usize>().unwrap_or(1);
            (base, total)
        } else {
            (sibling.rfilename.clone(), 1)
        };
        expected.insert(key.clone(), total);
        let size = sibling
            .lfs
            .as_ref()
            .and_then(|lfs| lfs.size)
            .or(sibling.size)
            .unwrap_or(0);
        groups.entry(key).or_default().push(HfFile {
            path: sibling.rfilename.clone(),
            size,
            sha256: sibling.lfs.as_ref().and_then(|lfs| lfs.sha256.clone()),
        });
    }

    let mut quants = Vec::new();
    for (key, mut files) in groups {
        files.sort_by(|a, b| a.path.cmp(&b.path));
        let total = expected.get(&key).copied().unwrap_or(1);
        let label = file_label(&key);
        let role = role_for(&key);
        let quant = quant_for(&key);
        quants.push(HfQuant {
            id: key.clone(),
            label,
            role,
            quant,
            size: files.iter().map(|f| f.size).sum(),
            sharded: total > 1,
            incomplete: files.len() < total,
            files,
        });
    }

    quants.sort_by(|a, b| {
        role_order(&a.role)
            .cmp(&role_order(&b.role))
            .then(a.size.cmp(&b.size))
    });
    quants
}

fn file_label(path: &str) -> String {
    path.rsplit('/')
        .next()
        .unwrap_or(path)
        .trim_end_matches(".gguf")
        .trim_end_matches(".GGUF")
        .to_string()
}

fn role_for(path: &str) -> String {
    let lower = path.to_ascii_lowercase();
    if lower.contains("mmproj") {
        "mmproj".to_string()
    } else if lower.contains("mtp") {
        "draft".to_string()
    } else {
        "primary".to_string()
    }
}

fn role_order(role: &str) -> usize {
    match role {
        "primary" => 0,
        "mmproj" => 1,
        _ => 2,
    }
}

fn quant_for(path: &str) -> String {
    QUANT_RE
        .captures(path)
        .map(|caps| caps[1].to_ascii_uppercase())
        .unwrap_or_else(|| "GGUF".to_string())
}

fn validate_repo(repo: &str) -> Result<(), String> {
    let Some((user, model)) = repo.split_once('/') else {
        return Err("El repositorio debe tener formato usuario/modelo".to_string());
    };
    if user.is_empty()
        || model.is_empty()
        || repo.contains("..")
        || user.contains('\\')
        || user.contains(':')
        || model.contains('\\')
        || model.contains(':')
    {
        return Err("Repositorio no válido".to_string());
    }
    Ok(())
}

fn safe_relative(path: &str) -> Option<PathBuf> {
    let path = Path::new(path);
    if path.is_absolute() {
        return None;
    }
    let mut out = PathBuf::new();
    for component in path.components() {
        match component {
            Component::Normal(value) => out.push(value),
            _ => return None,
        }
    }
    if out.extension().map(|e| e.eq_ignore_ascii_case("gguf")) != Some(true) {
        return None;
    }
    Some(out)
}

fn repo_folder(repo: &str) -> String {
    let folder: String = repo
        .chars()
        .map(|c| match c {
            '/' | '\\' | ':' | '*' | '?' | '"' | '<' | '>' | '|' => '_',
            c => c,
        })
        .collect();
    folder.trim_matches('_').to_string()
}

async fn get_json<T: serde::de::DeserializeOwned>(
    client: &reqwest::Client,
    url: reqwest::Url,
) -> Result<T, String> {
    let response = client
        .get(url)
        .send()
        .await
        .map_err(|e| format!("No se pudo contactar con Hugging Face: {e}"))?;
    let status = response.status();
    if !status.is_success() {
        let body = response.text().await.unwrap_or_default();
        return Err(format!("Hugging Face devolvió {status}. {body}").trim().to_string());
    }
    response
        .json()
        .await
        .map_err(|e| format!("Respuesta ilegible de Hugging Face: {e}"))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn groups_split_gguf_files() {
        let siblings = vec![
            RawSibling {
                rfilename: "model-Q4_K_M-00001-of-00002.gguf".to_string(),
                size: Some(10),
                lfs: None,
            },
            RawSibling {
                rfilename: "model-Q4_K_M-00002-of-00002.gguf".to_string(),
                size: Some(20),
                lfs: None,
            },
            RawSibling {
                rfilename: "mmproj-F16.gguf".to_string(),
                size: Some(5),
                lfs: None,
            },
        ];
        let quants = group_files(&siblings);
        assert_eq!(quants.len(), 2);
        assert_eq!(quants[0].role, "primary");
        assert!(quants[0].sharded);
        assert!(!quants[0].incomplete);
        assert_eq!(quants[0].size, 30);
        assert_eq!(quants[1].role, "mmproj");
    }

    #[test]
    fn extracts_quant_and_rejects_traversal() {
        assert_eq!(quant_for("foo-Q8_0.gguf"), "Q8_0");
        assert_eq!(quant_for("foo-IQ4_XS.gguf"), "IQ4_XS");
        assert!(safe_relative("../foo.gguf").is_none());
        assert!(safe_relative("Q4/foo.gguf").is_some());
    }
}
