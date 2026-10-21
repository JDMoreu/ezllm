//! Catálogo de modelos: escaneo de disco y clasificación de roles.
//!
//! Un GGUF puede ser:
//!   - un MODELO principal (pesos de un LLM)
//!   - un MTP (multi-token prediction / drafter) — archivos SEPARADOS
//!   - un mmproj (projector multimodal) — archivos SEPARADOS
//!
//! Las señales son REALES, no el nombre del fichero:
//!   - MTP: metadato `<arch>.nextn_predict_layers` y tensores
//!     `blk.<N>.nextn.*` / `nextn.*`
//!   - mmproj: metadato `general.type == "mmproj"`
//!
//! Un mmproj hace que `/v1/models` reporte
//! `modalities: text+vision+audio+video`; sin él, solo `text`.

use serde::Serialize;
use std::path::{Path, PathBuf};

/// Papel de un fichero GGUF dentro de la app.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum ModelRole {
    /// Pesos de un LLM: el modelo que se carga con `-m`.
    Primary,
    /// Proyector multimodal: se pasa con `--mmproj`.
    Mmproj,
    /// Bloque de predicción multi-token: se pasa con `--spec-draft-model`.
    Draft,
}

impl ModelRole {
    pub fn label(&self) -> &'static str {
        match self {
            ModelRole::Primary => "Modelo",
            ModelRole::Mmproj => "Proyector multimodal",
            ModelRole::Draft => "MTP / draft",
        }
    }
}

/// Un modelo del catálogo.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CatalogEntry {
    pub path: String,
    pub file_name: String,
    pub role: ModelRole,
    pub size_bytes: u64,
    pub size_gb: f64,
    pub arch: String,
    pub name: String,
    pub quant: String,
    pub quant_bpw: f64,
    pub n_layers: u64,
    pub context_length: u64,
    pub n_head_kv: u64,
    pub embedding_length: u64,
    pub sliding_window: u64,
    pub is_moe: bool,
    pub n_expert: u64,
    pub n_expert_used: u64,
    pub vocab_size: u64,
    pub has_mtp: bool,
    pub is_mmproj: bool,
    pub n_params_est: u64,
    pub error: Option<String>,
}

/// Escanea un directorio (recursivo) y devuelve el catálogo.
pub fn scan_directory(dir: &Path, max_depth: usize) -> Vec<CatalogEntry> {
    let mut entries = Vec::new();
    if !dir.exists() {
        return entries;
    }
    for item in walkdir::WalkDir::new(dir)
        .max_depth(max_depth)
        .into_iter()
        .filter_map(|e| e.ok())
    {
        let path = item.path();
        if !path.is_file() {
            continue;
        }
        if path.extension().map(|e| e.eq_ignore_ascii_case("gguf")) != Some(true) {
            continue;
        }
        entries.push(analyze_path(path));
    }
    entries.sort_by(|a, b| a.file_name.cmp(&b.file_name));
    entries
}

/// Analiza un único GGUF y determina su papel.
pub fn analyze_path(path: &Path) -> CatalogEntry {
    let size_bytes = std::fs::metadata(path).map(|m| m.len()).unwrap_or(0);
    let base = CatalogEntry {
        path: path.to_string_lossy().into_owned(),
        file_name: path
            .file_name()
            .map(|s| s.to_string_lossy().into_owned())
            .unwrap_or_default(),
        role: ModelRole::Primary,
        size_bytes,
        size_gb: size_bytes as f64 / 1024.0 / 1024.0 / 1024.0,
        arch: String::new(),
        name: String::new(),
        quant: String::new(),
        quant_bpw: 0.0,
        n_layers: 0,
        context_length: 0,
        n_head_kv: 0,
        embedding_length: 0,
        sliding_window: 0,
        is_moe: false,
        n_expert: 0,
        n_expert_used: 0,
        vocab_size: 0,
        has_mtp: false,
        is_mmproj: false,
        n_params_est: 0,
        error: None,
    };

    match crate::gguf::analyze(path) {
        Ok(info) => {
            let role = if info.is_mmproj {
                ModelRole::Mmproj
            } else if info.mtp.has_mtp && info.n_layers == 0 {
                // Un fichero que solo trae tensores de predicción es un draft.
                ModelRole::Draft
            } else {
                ModelRole::Primary
            };
            CatalogEntry {
                role,
                path: info.file.clone(),
                file_name: info.file_name.clone(),
                size_bytes: info.size_bytes,
                size_gb: info.size_gb,
                arch: info.arch.clone(),
                name: info.name.clone(),
                quant: info.quant.clone(),
                quant_bpw: info.quant_bpw,
                n_layers: info.n_layers,
                context_length: info.context_length,
                n_head_kv: info.n_head_kv,
                embedding_length: info.embedding_length,
                sliding_window: info.sliding_window,
                is_moe: info.is_moe,
                n_expert: info.n_expert,
                n_expert_used: info.n_expert_used,
                vocab_size: info.vocab_size,
                has_mtp: info.mtp.has_mtp,
                is_mmproj: info.is_mmproj,
                n_params_est: info.n_params_est,
                error: None,
            }
        }
        Err(e) => CatalogEntry {
            error: Some(e.to_string()),
            ..base
        },
    }
}

/// Empareja un modelo con sus compañeros: el mmproj y el MTP que le
/// corresponden por nombre de fichero.
///
/// Regla: comparten el prefijo antes de la primera pieza que los
/// diferencia. `gemma-4-E4B-it-Q4_0.gguf` + `gemma-4-E4B-it-mmproj-Q4_0.gguf`
/// comparten `gemma-4-E4B-it`.
pub fn companion_of(
    primary: &CatalogEntry,
    candidates: &[CatalogEntry],
) -> (Option<String>, Option<String>) {
    let prefix = stem_prefix(&primary.file_name);
    let mut mmproj = None;
    let mut draft = None;
    for c in candidates {
        if c.path == primary.path {
            continue;
        }
        if !stem_prefix(&c.file_name).starts_with(&prefix)
            && !prefix.starts_with(&stem_prefix(&c.file_name))
        {
            continue;
        }
        match c.role {
            ModelRole::Mmproj if mmproj.is_none() => mmproj = Some(c.path.clone()),
            ModelRole::Draft if draft.is_none() => draft = Some(c.path.clone()),
            _ => {}
        }
    }
    (mmproj, draft)
}

/// Prefijo común del nombre del fichero, quitando el sufijo de cuantización
/// y los marcadores de rol.
pub fn stem_prefix(file_name: &str) -> String {
    let stem = file_name
        .strip_suffix(".gguf")
        .or_else(|| file_name.strip_suffix(".GGUF"))
        .unwrap_or(file_name);
    let mut s = stem.to_ascii_lowercase();
    for marker in [
        "-mmproj", "-mmproj-model", "_mmproj", "mmproj-", "-projector",
        "-mtp", "_mtp", "mtp-", "-nextn", "_nextn", "nextn-", "-draft", "_draft",
        "-drafter", "-speculative",
    ] {
        if let Some(pos) = s.find(marker) {
            s.truncate(pos);
        }
    }
    // Quita el sufijo de cuantización: -Q4_K_M, -q8_0, -F16, -IQ3_XS...
    // El patrón debe cubrir también el separador (guion o guion bajo) para
    // que "llama-3.2-3b-instruct-q8_0" quede como "llama-3.2-3b-instruct".
    let quant_re = regex::Regex::new(
        r"[-_.]?(q[2-9]_k_[sml]|q[2-9]_k|q[2-9]_[01]|iq[1-4]_[a-z]{1,3}|tq[12]_0|mxfp4|nvfp4|bf16|f16|f32|q1_0|q2_0)$",
    )
    .unwrap();
    let trimmed = quant_re.replace(&s, "");
    let trimmed = trimmed.trim_end_matches(['-', '_', '.']);
    if trimmed.is_empty() { s } else { trimmed.to_string() }
}

/// Busca el `llama-server.exe` (o su equivalente) en una carpeta instalada.
pub fn find_llama_server(dir: &Path) -> Option<PathBuf> {
    if !dir.exists() {
        return None;
    }
    let exe_name = if cfg!(target_os = "windows") {
        "llama-server.exe"
    } else {
        "llama-server"
    };
    // Búsqueda shallow primero: los zips de llama.cpp traen los binarios en la
    // raíz o en `build/bin/`.
    for depth in [1usize, 2, 3] {
        for item in walkdir::WalkDir::new(dir)
            .max_depth(depth)
            .into_iter()
            .filter_map(|e| e.ok())
        {
            let p = item.path();
            if p.is_file() && p.file_name().map(|n| n == exe_name).unwrap_or(false) {
                return Some(p.to_path_buf());
            }
        }
    }
    None
}

/// Binarios de llama.cpp presentes en una carpeta.
pub fn list_llama_binaries(dir: &Path) -> Vec<String> {
    let mut out = Vec::new();
    if !dir.exists() {
        return out;
    }
    for item in walkdir::WalkDir::new(dir)
        .max_depth(3)
        .into_iter()
        .filter_map(|e| e.ok())
    {
        let p = item.path();
        if !p.is_file() {
            continue;
        }
        let name = p.file_name().map(|n| n.to_string_lossy().into_owned()).unwrap_or_default();
        if name.starts_with("llama-") || name.starts_with("llama.") {
            out.push(p.to_string_lossy().into_owned());
        }
    }
    out.sort();
    out
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn prefix_drops_role_and_quant_markers() {
        assert_eq!(stem_prefix("gemma-4-E4B-it-mmproj-Q4_0.gguf"), "gemma-4-e4b-it");
        assert_eq!(stem_prefix("gemma-4-E4B-it-Q4_0.gguf"), "gemma-4-e4b-it");
        assert_eq!(stem_prefix("Llama-3.2-3B-Instruct-Q8_0.gguf"), "llama-3.2-3b-instruct");
    }

    #[test]
    fn companion_pairing_uses_prefix() {
        let primary = CatalogEntry {
            path: "/m/model.gguf".into(),
            file_name: "model-Q4_K_M.gguf".into(),
            role: ModelRole::Primary,
            size_bytes: 0,
            size_gb: 0.0,
            arch: String::new(),
            name: String::new(),
            quant: String::new(),
            quant_bpw: 0.0,
            n_layers: 0,
            context_length: 0,
            n_head_kv: 0,
            embedding_length: 0,
            sliding_window: 0,
            is_moe: false,
            n_expert: 0,
            n_expert_used: 0,
            vocab_size: 0,
            has_mtp: false,
            is_mmproj: false,
            n_params_est: 0,
            error: None,
        };
        let mmproj = CatalogEntry {
            path: "/m/mmproj.gguf".into(),
            file_name: "model-mmproj-Q4_K_M.gguf".into(),
            role: ModelRole::Mmproj,
            ..primary.clone()
        };
        let (m, d) = companion_of(&primary, &[primary.clone(), mmproj.clone()]);
        assert_eq!(m, Some("/m/mmproj.gguf".to_string()));
        assert_eq!(d, None);
    }
}
