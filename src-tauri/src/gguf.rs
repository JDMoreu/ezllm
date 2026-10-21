//! Lector de metadatos GGUF sin dependencias externas.
//!
//! Puerto exacto de `llama-admin/app/gguf_probe.py`. Lee cabecera, metadatos
//! KV e índice de tensores de un GGUF v2/v3 y calcula:
//!   - arquitectura, cuantización (`general.file_type`), tamaño
//!   - contexto nativo, embedding length, capas, cabezas, GQA
//!   - detección REAL de MTP (multi-token prediction) y de mmproj
//!   - reparto de bytes por grupo funcional de tensores
//!
//! Dos trampas que este módulo no repite:
//!   1. `general.file_type` usa el enum `LlamaFileType` (include/llama.h),
//!      con numeración DISTINTA de `ggml_type` (ggml/include/ggml.h).
//!      Mezclarlos etiqueta mal: file_type=15 es Q4_K_M, no Q8_K.
//!   2. El nombre del fichero NO prueba MTP: la señal real es el metadato
//!      `<arch>.nextn_predict_layers` y los tensores `blk.<N>.nextn.*`.

use serde::Serialize;
use std::collections::HashMap;
use std::fs::File;
use std::io::{BufReader, Read, Seek, SeekFrom};
use std::path::Path;

/// "GGUF" en little-endian.
const GGUF_MAGIC: u32 = 0x4655_4747;
const GGUF_MAX_STRING_LENGTH: u64 = 16 * 1024 * 1024;
const GGUF_MAX_ARRAY_ELEMENTS: u64 = 100_000_000;

/// `general.file_type` -> (nombre, bits por peso).
/// Enum `LlamaFileType` (include/llama.h) — NO confundir con `ggml_type`.
const FILE_TYPES: &[(u32, &str, f64)] = &[
    (0, "F32", 32.0),
    (1, "F16", 16.0),
    (2, "Q4_0", 4.5),
    (3, "Q4_1", 4.5),
    (7, "Q8_0", 8.5),
    (8, "Q5_0", 5.5),
    (9, "Q5_1", 5.5),
    (10, "Q2_K", 2.625),
    (11, "Q3_K_S", 3.4375),
    (12, "Q3_K_M", 3.912),
    (13, "Q3_K_L", 4.275),
    (14, "Q4_K_S", 4.5),
    (15, "Q4_K_M", 4.85),
    (16, "Q5_K_S", 5.5),
    (17, "Q5_K_M", 5.69),
    (18, "Q6_K", 6.5625),
    (19, "IQ2_XXS", 2.0625),
    (20, "IQ2_XS", 2.3125),
    (21, "Q2_K_S", 2.625),
    (22, "IQ3_XS", 3.0625),
    (23, "IQ3_XXS", 2.5625),
    (24, "IQ1_S", 1.5625),
    (25, "IQ4_NL", 4.0625),
    (26, "IQ3_S", 3.0625),
    (27, "IQ3_M", 3.28),
    (28, "IQ2_S", 2.5),
    (29, "IQ2_M", 2.7),
    (30, "IQ4_XS", 4.0625),
    (31, "IQ1_M", 1.75),
    (32, "BF16", 16.0),
    (36, "TQ1_0", 1.6875),
    (37, "TQ2_0", 2.0625),
    (38, "MXFP4_MOE", 4.0),
    (39, "NVFP4", 4.0),
    (40, "Q1_0", 1.0625),
    (41, "Q2_0", 2.0625),
    (1024, "SIN ESPECIFICAR", 0.0),
];

/// `ggml_type` (ggml/include/ggml.h) -> (nombre, bits por elemento).
/// Tabla de TIPOS DE TENSOR, distinta de la de `general.file_type`.
/// Los tensores 1D se guardan en F32: por eso el peso real del fichero es
/// mayor que `params * bits / 8`.
const GGML_TYPES: &[(u32, &str, f64)] = &[
    (0, "F32", 32.0),
    (1, "F16", 16.0),
    (2, "Q4_0", 4.5),
    (3, "Q4_1", 4.5),
    (6, "Q5_0", 5.5),
    (7, "Q5_1", 5.5),
    (8, "Q8_0", 8.5),
    (9, "Q8_1", 8.5),
    (10, "Q2_K", 2.625),
    (11, "Q3_K", 3.4375),
    (12, "Q4_K", 4.5),
    (13, "Q5_K", 5.5),
    (14, "Q6_K", 6.5625),
    (15, "Q8_K", 8.5),
    (16, "IQ2_XXS", 2.0625),
    (17, "IQ2_XS", 2.3125),
    (18, "IQ3_XXS", 2.5625),
    (19, "IQ1_S", 1.5625),
    (20, "IQ4_NL", 4.0625),
    (21, "IQ3_S", 3.0625),
    (22, "IQ2_S", 2.5),
    (23, "IQ4_XS", 4.0625),
    (24, "I8", 8.0),
    (25, "I16", 16.0),
    (26, "I32", 32.0),
    (27, "I64", 64.0),
    (28, "F64", 64.0),
    (29, "IQ1_M", 1.75),
    (30, "BF16", 16.0),
    (34, "TQ1_0", 1.6875),
    (35, "TQ2_0", 2.0625),
    (36, "MXFP4", 4.0),
    (37, "NVFP4", 4.0),
];

#[derive(Debug, thiserror::Error)]
pub enum GgufError {
    #[error("no se pudo abrir el fichero: {0}")]
    Io(#[from] std::io::Error),
    #[error("no es un fichero GGUF (magic incorrecto)")]
    BadMagic,
    #[error("versión GGUF no soportada: {0}")]
    BadVersion(u32),
    #[error("metadato GGUF corrupto: {0}")]
    Corrupt(String),
}

/// Valor de metadatos GGUF. Los arrays numéricos se guardan como vector.
#[derive(Debug, Clone, Serialize)]
#[serde(untagged)]
pub enum GgufValue {
    UInt(u64),
    Int(i64),
    Float(f64),
    Bool(bool),
    Str(String),
    Array(Vec<GgufValue>),
}

impl GgufValue {
    pub fn as_u64(&self) -> Option<u64> {
        match self {
            GgufValue::UInt(v) => Some(*v),
            GgufValue::Int(v) => Some(*v as u64),
            GgufValue::Float(v) => Some(*v as u64),
            GgufValue::Bool(v) => Some(*v as u64),
            _ => None,
        }
    }

    pub fn as_f64(&self) -> Option<f64> {
        match self {
            GgufValue::UInt(v) => Some(*v as f64),
            GgufValue::Int(v) => Some(*v as f64),
            GgufValue::Float(v) => Some(*v),
            _ => None,
        }
    }

    pub fn as_bool(&self) -> Option<bool> {
        match self {
            GgufValue::Bool(v) => Some(*v),
            GgufValue::UInt(v) => Some(*v != 0),
            GgufValue::Int(v) => Some(*v != 0),
            _ => None,
        }
    }

    pub fn as_str(&self) -> Option<&str> {
        match self {
            GgufValue::Str(s) => Some(s),
            _ => None,
        }
    }

    pub fn as_array(&self) -> Option<&Vec<GgufValue>> {
        match self {
            GgufValue::Array(v) => Some(v),
            _ => None,
        }
    }
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TensorInfo {
    pub name: String,
    pub dims: Vec<u64>,
    pub n_elements: u64,
    #[serde(rename = "type")]
    pub ggml_type: u32,
    pub type_name: String,
    pub offset: u64,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TensorGroup {
    pub group: String,
    pub bytes: f64,
    pub mib: f64,
    pub tensors: usize,
}

pub struct GgufReader {
    pub path: std::path::PathBuf,
    pub size: u64,
    pub version: u32,
    pub metadata: HashMap<String, GgufValue>,
    pub tensor_infos: Vec<TensorInfo>,
}

struct Cursor<R: Read> {
    inner: R,
}

impl<R: Read> Cursor<R> {
    fn read_exact_vec(&mut self, n: usize) -> Result<Vec<u8>, GgufError> {
        let mut buf = vec![0u8; n];
        self.inner
            .read_exact(&mut buf)
            .map_err(|e| GgufError::Corrupt(e.to_string()))?;
        Ok(buf)
    }

    fn read_u8(&mut self) -> Result<u8, GgufError> {
        Ok(self.read_exact_vec(1)?[0])
    }
    fn read_u16(&mut self) -> Result<u16, GgufError> {
        let b = self.read_exact_vec(2)?;
        Ok(u16::from_le_bytes([b[0], b[1]]))
    }
    fn read_u32(&mut self) -> Result<u32, GgufError> {
        let b = self.read_exact_vec(4)?;
        Ok(u32::from_le_bytes([b[0], b[1], b[2], b[3]]))
    }
    fn read_u64(&mut self) -> Result<u64, GgufError> {
        let b = self.read_exact_vec(8)?;
        Ok(u64::from_le_bytes([
            b[0], b[1], b[2], b[3], b[4], b[5], b[6], b[7],
        ]))
    }
    fn read_i8(&mut self) -> Result<i8, GgufError> {
        Ok(self.read_u8()? as i8)
    }
    fn read_i16(&mut self) -> Result<i16, GgufError> {
        Ok(self.read_u16()? as i16)
    }
    fn read_i32(&mut self) -> Result<i32, GgufError> {
        Ok(self.read_u32()? as i32)
    }
    fn read_i64(&mut self) -> Result<i64, GgufError> {
        Ok(self.read_u64()? as i64)
    }
    fn read_f32(&mut self) -> Result<f32, GgufError> {
        Ok(f32::from_bits(self.read_u32()?))
    }
    fn read_f64(&mut self) -> Result<f64, GgufError> {
        Ok(f64::from_bits(self.read_u64()?))
    }
    fn read_bool(&mut self) -> Result<bool, GgufError> {
        Ok(self.read_u8()? != 0)
    }

    fn read_string(&mut self) -> Result<String, GgufError> {
        let length = self.read_u64()?;
        if length > GGUF_MAX_STRING_LENGTH {
            return Err(GgufError::Corrupt(format!(
                "longitud de cadena inválida: {length}"
            )));
        }
        let raw = self.read_exact_vec(length as usize)?;
        Ok(String::from_utf8_lossy(&raw).into_owned())
    }

    fn read_value(&mut self, vtype: u32) -> Result<GgufValue, GgufError> {
        match vtype {
            0 => Ok(GgufValue::UInt(self.read_u8()? as u64)),
            1 => Ok(GgufValue::Int(self.read_i8()? as i64)),
            2 => Ok(GgufValue::UInt(self.read_u16()? as u64)),
            3 => Ok(GgufValue::Int(self.read_i16()? as i64)),
            4 => Ok(GgufValue::UInt(self.read_u32()? as u64)),
            5 => Ok(GgufValue::Int(self.read_i32()? as i64)),
            6 => Ok(GgufValue::Float(self.read_f32()? as f64)),
            7 => Ok(GgufValue::Bool(self.read_bool()?)),
            8 => Ok(GgufValue::Str(self.read_string()?)),
            9 => {
                let elem_type = self.read_u32()?;
                let count = self.read_u64()?;
                if count > GGUF_MAX_ARRAY_ELEMENTS {
                    return Err(GgufError::Corrupt(format!(
                        "array demasiado grande: {count}"
                    )));
                }
                let mut out = Vec::with_capacity(count.min(4096) as usize);
                for _ in 0..count {
                    out.push(self.read_value(elem_type)?);
                }
                Ok(GgufValue::Array(out))
            }
            10 => Ok(GgufValue::UInt(self.read_u64()?)),
            11 => Ok(GgufValue::Int(self.read_i64()?)),
            12 => Ok(GgufValue::Float(self.read_f64()?)),
            other => Err(GgufError::Corrupt(format!("tipo de valor desconocido: {other}"))),
        }
    }
}

impl GgufReader {
    pub fn open(path: impl AsRef<Path>) -> Result<Self, GgufError> {
        let path = path.as_ref().to_path_buf();
        let size = std::fs::metadata(&path)?.len();
        let file = File::open(&path)?;
        let mut cur = Cursor {
            inner: BufReader::new(file),
        };

        let magic = cur.read_u32()?;
        if magic != GGUF_MAGIC {
            return Err(GgufError::BadMagic);
        }
        let version = cur.read_u32()?;
        if version != 2 && version != 3 {
            return Err(GgufError::BadVersion(version));
        }
        let n_tensors = cur.read_u64()?;
        let n_kv = cur.read_u64()?;

        let mut metadata = HashMap::with_capacity(n_kv as usize);
        for _ in 0..n_kv {
            let key = cur.read_string()?;
            let vtype = cur.read_u32()?;
            let value = cur.read_value(vtype)?;
            metadata.insert(key, value);
        }

        let mut tensor_infos = Vec::with_capacity(n_tensors.min(8192) as usize);
        for _ in 0..n_tensors {
            let name = cur.read_string()?;
            let n_dims = cur.read_u32()?;
            let mut dims = Vec::with_capacity(n_dims as usize);
            let mut n_el: u64 = 1;
            for _ in 0..n_dims {
                let d = cur.read_u64()?;
                n_el = n_el.saturating_mul(d);
                dims.push(d);
            }
            let ttype = cur.read_u32()?;
            let offset = cur.read_u64()?;
            let type_name = ggml_type_name(ttype).to_string();
            tensor_infos.push(TensorInfo {
                name,
                dims,
                n_elements: n_el,
                ggml_type: ttype,
                type_name,
                offset,
            });
        }

        Ok(GgufReader {
            path,
            size,
            version,
            metadata,
            tensor_infos,
        })
    }

    pub fn get(&self, key: &str) -> Option<&GgufValue> {
        self.metadata.get(key)
    }

    /// Metadato con prefijo de arquitectura: `general.architecture` + `.` + key.
    pub fn arch(&self, key: &str) -> Option<&GgufValue> {
        let arch = self
            .get("general.architecture")
            .and_then(|v| v.as_str())
            .unwrap_or("");
        self.get(&format!("{arch}.{key}"))
    }

    pub fn arch_u64(&self, key: &str) -> Option<u64> {
        self.arch(key).and_then(|v| v.as_u64())
    }

    pub fn arch_f64(&self, key: &str) -> Option<f64> {
        self.arch(key).and_then(|v| v.as_f64())
    }
}

pub fn file_type_name(file_type: u32) -> &'static str {
    FILE_TYPES
        .iter()
        .find(|(id, _, _)| *id == file_type)
        .map(|(_, n, _)| *n)
        .unwrap_or("DESCONOCIDO")
}

pub fn file_type_bpw(file_type: u32) -> f64 {
    FILE_TYPES
        .iter()
        .find(|(id, _, _)| *id == file_type)
        .map(|(_, _, b)| *b)
        .unwrap_or(0.0)
}

pub fn ggml_type_name(t: u32) -> &'static str {
    GGML_TYPES
        .iter()
        .find(|(id, _, _)| *id == t)
        .map(|(_, n, _)| *n)
        .unwrap_or("DESCONOCIDO")
}

pub fn ggml_type_bpw(t: u32) -> f64 {
    GGML_TYPES
        .iter()
        .find(|(id, _, _)| *id == t)
        .map(|(_, _, b)| *b)
        .unwrap_or(0.0)
}

/// Agrupa un tensor por su función, para saber qué va a la GPU.
///
/// MEDIDO (gemma-4-E4B-it-Q4_0, llama.cpp b11574, -ngl 42):
///   Vulkan0 model buffer = 2748 MiB
///   CPU_Mapped model buffer = 2294 MiB
/// El fichero son 4378 MiB. La diferencia (1630 MiB) es el tensor
/// `per_layer_token_embd` (1585 MiB), que llama.cpp carga con TENSOR_READ_LAZY
/// y por tanto NO se sube a la GPU.
pub fn tensor_group(name: &str) -> &'static str {
    let n = name.to_ascii_lowercase();
    if n.starts_with("blk.") {
        return "layers";
    }
    if n.contains("per_layer_token_embd") {
        return "lazy_per_layer_embd";
    }
    if n.starts_with("token_embd") {
        return "token_embd";
    }
    if n.starts_with("output") {
        return "output";
    }
    if n.contains("norm") {
        return "norms";
    }
    "other"
}

/// Bytes por grupo funcional de tensores.
pub fn tensor_bytes_by_group(tensors: &[TensorInfo]) -> Vec<TensorGroup> {
    let mut map: HashMap<&'static str, (f64, usize)> = HashMap::new();
    for t in tensors {
        let g = tensor_group(&t.name);
        let bpb = ggml_type_bpw(t.ggml_type);
        let size = t.n_elements as f64 * bpb / 8.0;
        let e = map.entry(g).or_insert((0.0, 0));
        e.0 += size;
        e.1 += 1;
    }
    let mut out: Vec<TensorGroup> = map
        .into_iter()
        .map(|(group, (bytes, tensors))| TensorGroup {
            group: group.to_string(),
            bytes,
            mib: bytes / 1024.0 / 1024.0,
            tensors,
        })
        .collect();
    out.sort_by(|a, b| b.bytes.total_cmp(&a.bytes));
    out
}

// --- MTP / multi-token prediction ------------------------------------------
// Las señales REALES de llama.cpp (src/llama-arch.cpp):
//   - metadato `<arch>.nextn_predict_layers` (LLM_KV_NEXTN_PREDICT_LAYERS)
//   - tensores `blk.<N>.nextn.*` (eh_proj, embed_tokens, enorm, hnorm,
//     shared_head_head, shared_head_norm)
//   - tensores `nextn.pre_projection` / `nextn.post_projection` (Gemma-4)
//
// NO basta con buscar 'mtp' en el nombre: hay dos convenciones distintas y
// el nombre del fichero ('-mtp.gguf') NO es una prueba.

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MtpInfo {
    pub has_mtp: bool,
    pub is_mtp_file: bool,
    pub n_predict_layers: Option<u64>,
    pub tensors: Vec<String>,
    pub n_tensors_mtp: usize,
    pub convention: Option<String>,
}

fn detect_mtp(reader: &GgufReader, arch: &str) -> MtpInfo {
    let block_re = regex::Regex::new(r"^blk\.\d+\.nextn\.").unwrap();
    let stem_re = regex::Regex::new(r"(^|[-_.])(mtp|nextn|draft|medusa|eagle)([-_.]|$)").unwrap();

    let mut block_tensors: Vec<String> = Vec::new();
    let mut head_tensors: Vec<String> = Vec::new();
    for t in &reader.tensor_infos {
        if block_re.is_match(&t.name) {
            block_tensors.push(t.name.clone());
        } else if t.name.starts_with("nextn.") {
            head_tensors.push(t.name.clone());
        }
    }

    let n_predict_layers = reader
        .get(&format!("{arch}.nextn_predict_layers"))
        .and_then(|v| v.as_u64());

    let mut mtp_tensors: Vec<String> = block_tensors
        .iter()
        .chain(head_tensors.iter())
        .cloned()
        .collect();
    mtp_tensors.sort();
    mtp_tensors.dedup();
    let n_mtp_tensors = mtp_tensors.len();

    let stem = reader
        .path
        .file_stem()
        .map(|s| s.to_string_lossy().to_ascii_lowercase())
        .unwrap_or_default();
    let is_mtp_file = stem_re.is_match(&stem);

    let has_mtp = n_mtp_tensors > 0 || n_predict_layers.is_some();

    let convention = if !block_tensors.is_empty() {
        Some("bloques (blk.N.nextn.*)".to_string())
    } else if !head_tensors.is_empty() {
        Some("cabeza suelta (nextn.*)".to_string())
    } else {
        None
    };

    MtpInfo {
        has_mtp,
        is_mtp_file,
        n_predict_layers,
        tensors: mtp_tensors.into_iter().take(8).collect(),
        n_tensors_mtp: n_mtp_tensors,
        convention,
    }
}

// --- Análisis ---------------------------------------------------------------

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ModelInfo {
    pub file: String,
    pub file_name: String,
    pub size_bytes: u64,
    pub size_gb: f64,
    pub arch: String,
    pub name: String,
    pub quant: String,
    pub quant_bpw: f64,
    pub file_type: u32,
    pub is_mmproj: bool,
    pub n_layers: u64,
    pub n_head: u64,
    pub n_head_kv: u64,
    pub n_embd_head: u64,
    pub n_embd_head_v: u64,
    pub n_embd_head_swa: u64,
    pub n_embd_head_v_swa: u64,
    pub embedding_length: u64,
    pub context_length: u64,
    pub sliding_window: u64,
    pub shared_kv_layers: u64,
    pub sliding_window_pattern: Vec<bool>,
    pub rope_dim: u64,
    pub ffn_length: u64,
    pub vocab_size: u64,
    pub n_expert: u64,
    pub n_expert_used: u64,
    pub is_moe: bool,
    pub n_params_est: u64,
    pub lazy_tensor_mib: f64,
    pub mtp: MtpInfo,
    pub tensor_groups: Vec<TensorGroup>,
    pub n_tensors: usize,
}

/// Analiza un `.gguf` y devuelve toda su metadata útil.
pub fn analyze(path: impl AsRef<Path>) -> Result<ModelInfo, GgufError> {
    let reader = GgufReader::open(path)?;
    let md = &reader.metadata;

    let arch = md
        .get("general.architecture")
        .and_then(|v| v.as_str())
        .unwrap_or("")
        .to_string();
    let file_type = md
        .get("general.file_type")
        .and_then(|v| v.as_u64())
        .unwrap_or(0) as u32;
    let quant_name = file_type_name(file_type);
    let bpw = file_type_bpw(file_type);

    let name = md
        .get("general.name")
        .and_then(|v| v.as_str())
        .unwrap_or("")
        .to_string();
    let is_mmproj = md
        .get("general.type")
        .and_then(|v| v.as_str())
        .map(|s| s == "mmproj")
        .unwrap_or(false);

    let ctx = reader.arch_u64("context_length").unwrap_or(0);
    let embd = reader.arch_u64("embedding_length").unwrap_or(0);
    let n_layer = reader.arch_u64("block_count").unwrap_or(0);
    let n_head = reader.arch_u64("attention.head_count").unwrap_or(0);
    let n_head_kv = reader
        .arch_u64("attention.head_count_kv")
        .unwrap_or(n_head);

    // key_length / value_length son POR CABEZA (pueden diferir de embd/n_head)
    let n_embd_head = reader.arch_u64("attention.key_length").unwrap_or({
        if embd > 0 && n_head > 0 {
            embd / n_head
        } else {
            0
        }
    });
    let n_embd_head_v = reader
        .arch_u64("attention.value_length")
        .unwrap_or(n_embd_head);
    let n_embd_head_swa = reader
        .arch_u64("attention.key_length_swa")
        .unwrap_or(n_embd_head);
    let n_embd_head_v_swa = reader
        .arch_u64("attention.value_length_swa")
        .unwrap_or(n_embd_head_v);

    let rope_dim = reader.arch_u64("rope.dimension_count").unwrap_or(0);
    let ffn = reader.arch_u64("feed_forward_length").unwrap_or(0);
    let swa = reader.arch_u64("attention.sliding_window").unwrap_or(0);
    let shared_kv = reader.arch_u64("attention.shared_kv_layers").unwrap_or(0);
    let n_expert = reader.arch_u64("expert_count").unwrap_or(0);
    let n_expert_used = reader.arch_u64("expert_used_count").unwrap_or(0);

    // El patrón SWA lo define llama.cpp con `il % n_pattern`, pero el GGUF
    // guarda `sliding_window_pattern` como máscara. Se lee tal cual.
    let sliding_window_pattern: Vec<bool> = reader
        .arch("attention.sliding_window_pattern")
        .and_then(|v| v.as_array())
        .map(|a| a.iter().map(|x| x.as_bool().unwrap_or(false)).collect())
        .unwrap_or_default();

    // `tokenizer.ggml.tokens` es un ARRAY: su longitud es el tamaño del vocabulario
    let vocab = reader
        .get("tokenizer.ggml.tokens")
        .and_then(|v| v.as_array())
        .map(|a| a.len() as u64)
        .or_else(|| reader.arch_u64("vocab_size"))
        .unwrap_or(0);

    let mtp = detect_mtp(&reader, &arch);

    let groups = tensor_bytes_by_group(&reader.tensor_infos);
    let lazy_tensor_mib = groups
        .iter()
        .find(|g| g.group == "lazy_per_layer_embd")
        .map(|g| g.mib)
        .unwrap_or(0.0);

    // Estimación de parámetros a partir del tamaño del fichero y la cuantización
    let n_params_est = if bpw > 0.0 {
        ((reader.size as f64 * 8.0) / bpw) as u64
    } else {
        0
    };

    Ok(ModelInfo {
        file: reader.path.to_string_lossy().into_owned(),
        file_name: reader
            .path
            .file_name()
            .map(|s| s.to_string_lossy().into_owned())
            .unwrap_or_default(),
        size_bytes: reader.size,
        size_gb: reader.size as f64 / 1024.0 / 1024.0 / 1024.0,
        arch: arch.clone(),
        name,
        quant: quant_name.to_string(),
        quant_bpw: bpw,
        file_type,
        is_mmproj,
        n_layers: n_layer,
        n_head,
        n_head_kv,
        n_embd_head,
        n_embd_head_v,
        n_embd_head_swa,
        n_embd_head_v_swa,
        embedding_length: embd,
        context_length: ctx,
        sliding_window: swa,
        shared_kv_layers: shared_kv,
        sliding_window_pattern,
        rope_dim,
        ffn_length: ffn,
        vocab_size: vocab,
        n_expert,
        n_expert_used,
        is_moe: n_expert > 0,
        n_params_est,
        lazy_tensor_mib,
        mtp,
        tensor_groups: groups,
        n_tensors: reader.tensor_infos.len(),
    })
}

/// Calcula el hash SHA-256 de un fichero (para verificar descargas).
pub fn sha256_file(path: impl AsRef<Path>) -> std::io::Result<String> {
    use sha2::{Digest, Sha256};
    let mut file = File::open(path)?;
    let mut hasher = Sha256::new();
    let mut buf = vec![0u8; 1024 * 1024];
    loop {
        let n = file.read(&mut buf)?;
        if n == 0 {
            break;
        }
        hasher.update(&buf[..n]);
    }
    Ok(format!("{:x}", hasher.finalize()))
}

/// Calcula el hash SHA-256 de un vector en memoria.
pub fn sha256_bytes(data: &[u8]) -> String {
    use sha2::{Digest, Sha256};
    let mut hasher = Sha256::new();
    hasher.update(data);
    format!("{:x}", hasher.finalize())
}

/// Busca el byte de inicio de un GGUF sin cargarlo entero.
pub fn peek_magic(path: impl AsRef<Path>) -> bool {
    let mut f = match File::open(path) {
        Ok(f) => f,
        Err(_) => return false,
    };
    let mut buf = [0u8; 4];
    if f.seek(SeekFrom::Start(0)).is_err() {
        return false;
    }
    match f.read_exact(&mut buf) {
        Ok(()) => u32::from_le_bytes(buf) == GGUF_MAGIC,
        Err(_) => false,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn file_type_enum_is_not_ggml_type() {
        // La trampa: file_type=15 es Q4_K_M (LlamaFileType), no Q8_K (ggml_type).
        assert_eq!(file_type_name(15), "Q4_K_M");
        assert_eq!(ggml_type_name(15), "Q8_K");
    }

    #[test]
    fn tensor_group_detects_lazy_embedding() {
        assert_eq!(tensor_group("per_layer_token_embd.weight"), "lazy_per_layer_embd");
        assert_eq!(tensor_group("blk.0.attn_q.weight"), "layers");
        assert_eq!(tensor_group("token_embd.weight"), "token_embd");
    }
}
