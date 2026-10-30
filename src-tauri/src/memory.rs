//! Modelo de memoria de llama.cpp, derivado de MEDIDAS REALES.
//!
//! Puerto exacto de `llama-admin/app/memory_model.py`. Calibrado contra
//! medidas reales del RX 9070 (error 0,0% en la KV cache).
//!
//! Cómo calcula llama.cpp la KV cache (verificado contra llama.cpp b11574 y
//! su código fuente en src/llama-hparams.cpp y src/llama-kv-cache.cpp):
//!
//!  1. Cada CAPA tiene su propia dimensión de K y de V:
//!        n_embd_k_gqa(il) = n_embd_head_k(il) * n_head_kv(il)
//!     y la dimensión depende de si la capa es SWA (ventana deslizante):
//!        n_embd_head_k(il) = is_swa(il) ? n_embd_head_k_swa : n_embd_head_k_full
//!  2. NO todas las capas tienen KV cache:
//!        n_layer_kv_from_start = n_layer_all − shared_kv_layers
//!     (src/models/gemma4.cpp) — solo las primeras n_layer_kv_from_start
//!     capas tienen KV propia; el resto comparte.
//!  3. La KV se parte en DOS cachés: la de las capas SWA (tamaño FIJO
//!     `2 × n_swa` celdas) y la de las capas densas (contexto completo).
//!  4. El contexto se alinea a 256: cparams.n_ctx = GGML_PAD(n_ctx, 256).
//!  5. La SWA reserva celdas POR RANURA: con varias sesiones en paralelo el
//!     total de KV SUBE, aunque la parte densa se quede constante.
//!
//! MEDIDAS (AMD Radeon RX 9070, llama.cpp b11574, gemma-4-E4B-it-Q4_0.gguf):
//!     ctx=2048   ->  KV  32 MiB (densa) +  38 MiB (SWA) + 2 MiB (CPU) =  72 MiB
//!     ctx=8192   ->  KV 128 MiB (densa) +  38 MiB (SWA) + 2 MiB (CPU) = 168 MiB
//!     ctx=32768  ->  KV 512 MiB (densa) +  38 MiB (SWA) + 2 MiB (CPU) = 552 MiB

use serde::Serialize;

/// Bytes por elemento de cada tipo de caché KV.
fn cache_bytes(cache_type: &str) -> f64 {
    match cache_type {
        "f32" => 4.0,
        "f16" => 2.0,
        "bf16" => 2.0,
        "q8_0" => 1.0625,
        "q5_1" => 0.6875,
        "q5_0" => 0.5625,
        "q4_1" => 0.5625,
        "q4_0" => 0.5,
        "iq4_nl" => 0.5,
        "iq4_xs" => 0.4375,
        "iq3_m" => 0.3125,
        "iq3_s" => 0.3125,
        "iq3_xxs" => 0.25,
        "iq2_xxs" => 0.1875,
        "iq2_xs" => 0.1875,
        "iq2_s" => 0.1875,
        "iq1_s" => 0.125,
        "iq1_m" => 0.125,
        "q4_0_4_4" => 0.5,
        "q4_0_4_8" => 0.5,
        "q4_0_8_8" => 0.5,
        "tq1_0" => 1.6875,
        "tq2_0" => 2.0625,
        "mxfp4" => 4.0,
        _ => 2.0,
    }
}

/// Reserva del compute buffer. MEDIDO en Vulkan con este modelo:
///   ctx=2048  -> 103 MiB GPU + 44 MiB host
///   ctx=8192  -> 122 MiB GPU + 50 MiB host
///   ctx=32768 -> 134 MiB GPU + 74 MiB host
/// El compute buffer crece MUCHO menos que la KV: es el grafo de cómputo y
/// el bloque de activaciones (ubatch), no el contexto.
const COMPUTE_BUFFER_BASE_MIB: f64 = 100.0;
const COMPUTE_BUFFER_PER_CTX_MIB: f64 = 0.0015; // ~1.5 MiB por cada 1024 tokens
const COMPUTE_BUFFER_HOST_MIB: f64 = 44.0;

/// GGML_PAD: alinea a un múltiplo.
fn pad(n: u64, mult: u64) -> u64 {
    ((n + mult - 1) / mult) * mult
}

/// Dimensiones de K y V por capa, y si la capa tiene KV propia.
#[derive(Debug, Clone, Copy)]
pub struct LayerDims {
    pub is_swa: bool,
    pub has_kv: bool,
    pub n_embd_k_gqa: u64,
    pub n_embd_v_gqa: u64,
}

/// Datos del modelo que necesita el cálculo de memoria.
pub struct ModelDims {
    pub n_layers: u64,
    pub n_head_kv: u64,
    pub n_embd_head: u64,
    pub n_embd_head_v: u64,
    pub n_embd_head_swa: u64,
    pub n_embd_head_v_swa: u64,
    pub sliding_window: u64,
    pub shared_kv_layers: u64,
    pub sliding_window_pattern: Vec<bool>,
    pub size_bytes: u64,
    pub lazy_tensor_mib: f64,
    pub vocab_size: u64,
    pub embedding_length: u64,
    pub n_params_est: u64,
    pub ctx_train: u64,
}

impl ModelDims {
    pub fn from_info(info: &crate::gguf::ModelInfo) -> Self {
        ModelDims {
            n_layers: info.n_layers,
            n_head_kv: info.n_head_kv,
            n_embd_head: info.n_embd_head,
            n_embd_head_v: info.n_embd_head_v,
            n_embd_head_swa: info.n_embd_head_swa,
            n_embd_head_v_swa: info.n_embd_head_v_swa,
            sliding_window: info.sliding_window,
            shared_kv_layers: info.shared_kv_layers,
            sliding_window_pattern: info.sliding_window_pattern.clone(),
            size_bytes: info.size_bytes,
            lazy_tensor_mib: info.lazy_tensor_mib,
            vocab_size: info.vocab_size,
            embedding_length: info.embedding_length,
            n_params_est: info.n_params_est,
            ctx_train: info.context_length,
        }
    }
}

/// Replica la lógica de llama.cpp (src/llama-hparams.cpp, src/models/gemma4.cpp).
pub fn model_layer_dims(model: &ModelDims) -> Vec<LayerDims> {
    let n_layer = model.n_layers;
    let n_head_kv = model.n_head_kv;

    let is_swa: Vec<bool> = if !model.sliding_window_pattern.is_empty() {
        model.sliding_window_pattern.clone()
    } else {
        vec![false; n_layer as usize]
    };

    // Cuántas capas tienen KV cache propia
    let n_kv_shared = model.shared_kv_layers;
    let mut n_layer_kv = if n_kv_shared > 0 {
        n_layer.saturating_sub(n_kv_shared)
    } else {
        n_layer
    };
    n_layer_kv = n_layer_kv.min(n_layer);

    (0..n_layer)
        .map(|il| {
            let swa = is_swa.get(il as usize).copied().unwrap_or(false);
            let k_head = if swa {
                model.n_embd_head_swa
            } else {
                model.n_embd_head
            };
            let v_head = if swa {
                model.n_embd_head_v_swa
            } else {
                model.n_embd_head_v
            };
            LayerDims {
                is_swa: swa,
                has_kv: il < n_layer_kv,
                n_embd_k_gqa: k_head.saturating_mul(n_head_kv),
                n_embd_v_gqa: v_head.saturating_mul(n_head_kv),
            }
        })
        .collect()
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct KvCache {
    pub dense_bytes: f64,
    pub swa_bytes: f64,
    pub total_bytes: f64,
    pub total_mib: f64,
    pub total_gb: f64,
    pub ctx_padded: u64,
    pub ctx_per_slot: u64,
    pub swa_cells: u64,
    pub n_dense_layers: usize,
    pub n_swa_layers: usize,
    pub bytes_per_element: f64,
}

/// Bytes de KV cache para un contexto dado.
///
/// Se reparte en dos bloques, como hace llama.cpp:
///   - capas densas: contexto completo
///   - capas SWA:     contexto limitado a min(ctx, n_swa)
pub fn kv_cache_bytes(
    model: &ModelDims,
    ctx: u64,
    n_parallel: u64,
    cache_type_k: &str,
    cache_type_v: &str,
) -> KvCache {
    // K y V se cuantizan por separado: la app deja elegirlos por
    // independiente, y la estimacion debe reflejarlo.
    let bpe_k = cache_bytes(cache_type_k);
    let bpe_v = cache_bytes(cache_type_v);
    let bpe = (bpe_k + bpe_v) / 2.0;
    let ctx_padded = pad(ctx, 256);
    // llama.cpp reparte el contexto entre las ranuras
    let ctx_per_slot = pad(ctx_padded / n_parallel.max(1), 256);

    let layers = model_layer_dims(model);
    let n_swa = model.sliding_window;

    let mut dense_bytes = 0.0f64;
    let mut swa_bytes = 0.0f64;
    let mut n_dense = 0usize;
    let mut n_swa_layers = 0usize;

    // La caché SWA tiene un número de celdas FIJO (independiente del
    // contexto pedido): 2*n_swa celdas. La caché no-SWA usa el contexto
    // completo.
    let swa_cells = if n_swa > 0 { 2 * n_swa } else { 0 };
    let n_slots = n_parallel.max(1);

    for l in &layers {
        if !l.has_kv {
            continue; // capa sin KV cache propia
        }
        let per_token = l.n_embd_k_gqa as f64 * bpe_k + l.n_embd_v_gqa as f64 * bpe_v;
        if l.is_swa && swa_cells > 0 {
            // La SWA reserva swa_cells POR RANURA.
            swa_bytes += per_token * swa_cells as f64 * n_slots as f64;
            n_swa_layers += 1;
        } else {
            // La densa reparte el contexto entre las ranuras: el total se
            // queda constante.
            dense_bytes += per_token * ctx_per_slot as f64 * n_slots as f64;
            n_dense += 1;
        }
    }

    let total = dense_bytes + swa_bytes;
    KvCache {
        dense_bytes,
        swa_bytes,
        total_bytes: total,
        total_mib: total / 1024.0 / 1024.0,
        total_gb: total / 1024.0 / 1024.0 / 1024.0,
        ctx_padded,
        ctx_per_slot,
        swa_cells,
        n_dense_layers: n_dense,
        n_swa_layers,
        bytes_per_element: bpe,
    }
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ComputeBuffer {
    pub gpu_mib: f64,
    pub host_mib: f64,
    pub total_gb: f64,
}

/// Compute buffer: crece poco con el contexto (medido).
pub fn compute_buffer_bytes(ctx: u64, ubatch: u64) -> ComputeBuffer {
    let mut gpu = COMPUTE_BUFFER_BASE_MIB + COMPUTE_BUFFER_PER_CTX_MIB * (ctx as f64 / 1024.0);
    // El ubatch grande infla algo el buffer del grafo
    gpu *= 1.0 + (ubatch.max(256).saturating_sub(256)) as f64 / 2048.0;
    let host = COMPUTE_BUFFER_HOST_MIB + COMPUTE_BUFFER_PER_CTX_MIB * (ctx as f64 / 1024.0);
    ComputeBuffer {
        gpu_mib: (gpu * 10.0).round() / 10.0,
        host_mib: (host * 10.0).round() / 10.0,
        total_gb: (gpu + host) / 1024.0,
    }
}

/// Peso del modelo en GB.
pub fn model_weights_gb(model: &ModelDims) -> f64 {
    model.size_bytes as f64 / 1024.0 / 1024.0 / 1024.0
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WeightsSplit {
    pub total_gb: f64,
    pub gpu_gb: f64,
    pub cpu_gb: f64,
    pub lazy_mib: f64,
    pub embd_share: f64,
    pub note: String,
}

/// Reparto de los pesos entre GPU y CPU.
///
/// La regla se deriva de MEDIDAS (gemma-4-E4B-it-Q4_0, llama.cpp b11574):
///   Vulkan0 model buffer     = 2748 MiB
///   CPU_Mapped model buffer  = 2294 MiB
///   fichero                  = 4378 MiB
/// La diferencia es el tensor `per_layer_token_embd`, que llama.cpp carga con
/// TENSOR_READ_LAZY y NO sube a la GPU. El reparto es EXACTO cuando se
/// conoce ese tensor, y una estimación por fracción de capas si no.
pub fn weights_split(model: &ModelDims, n_gpu_layers: Option<i64>) -> WeightsSplit {
    let total = model_weights_gb(model);
    let n_layer = model.n_layers;

    let lazy_mib = model.lazy_tensor_mib;
    if lazy_mib > 0.0 {
        // lo que se queda en CPU es el tensor lazy + lo que no se sube
        let frac = match n_gpu_layers {
            None => 1.0,
            // -ngl 0 es CPU: ningún peso en la GPU.
            Some(0) => 0.0,
            // -1 (auto) y -2 (all) suben todas las capas; no son fracciones.
            Some(n) if n < 0 => 1.0,
            Some(_) if n_layer == 0 => 1.0,
            Some(n) => (n as f64 / n_layer as f64).clamp(0.0, 1.0),
        };
        let rest = total - lazy_mib / 1024.0;
        let cpu = rest * (1.0 - frac) + lazy_mib / 1024.0;
        return WeightsSplit {
            total_gb: round2(total),
            gpu_gb: round2(total - cpu),
            cpu_gb: round2(cpu),
            lazy_mib,
            embd_share: 0.0,
            note: "reparto medido: el tensor lazy se queda en CPU".to_string(),
        };
    }

    // Sin dato de tensor lazy: se estima por fracción de capas.
    let vocab = model.vocab_size;
    let embd = model.embedding_length;
    let mut embd_share = 0.0;
    if vocab > 0 && embd > 0 && model.n_params_est > 0 {
        embd_share = ((vocab * embd) as f64 / model.n_params_est as f64).min(0.6);
    }

    match n_gpu_layers {
        None => WeightsSplit {
            total_gb: round2(total),
            gpu_gb: round2(total),
            cpu_gb: 0.0,
            lazy_mib: 0.0,
            embd_share,
            note: "sin reparto: se asume todo en GPU".to_string(),
        },
        // -ngl 0 es CPU: todos los pesos en RAM.
        Some(0) => WeightsSplit {
            total_gb: round2(total),
            gpu_gb: 0.0,
            cpu_gb: round2(total),
            lazy_mib: 0.0,
            embd_share,
            note: "CPU: todos los pesos en RAM".to_string(),
        },
        // -1 (auto) y -2 (all) se miden como cota superior: todo en GPU.
        Some(n) if n < 0 || n_layer == 0 => WeightsSplit {
            total_gb: round2(total),
            gpu_gb: round2(total),
            cpu_gb: 0.0,
            lazy_mib: 0.0,
            embd_share,
            note: "auto o todas las capas: se asume todo en GPU".to_string(),
        },
        Some(n) => {
            let frac = (n as f64 / n_layer as f64).clamp(0.0, 1.0);
            let cpu = total.min(total * (1.0 - frac) + total * embd_share * frac);
            WeightsSplit {
                total_gb: round2(total),
                gpu_gb: round2(total - cpu),
                cpu_gb: round2(cpu),
                lazy_mib: 0.0,
                embd_share: round3(embd_share),
                note: "estimación: el embedding de tokens queda en CPU".to_string(),
            }
        }
    }
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MemoryEstimate {
    pub weights_gb: f64,
    pub weights_gpu_gb: f64,
    pub weights_cpu_gb: f64,
    pub kv_cache_gb: f64,
    pub kv_dense_gb: f64,
    pub kv_swa_gb: f64,
    pub kv_cache_mib: f64,
    pub compute_buffer_gb: f64,
    pub compute_gpu_mib: f64,
    pub compute_host_mib: f64,
    /// lo que se pide a la VRAM: pesos que van a GPU + KV + compute
    pub vram_requested_gb: f64,
    pub total_gb: f64,
    pub ctx_padded: u64,
    pub ctx_per_slot: u64,
    pub n_dense_layers: usize,
    pub n_swa_layers: usize,
    pub bytes_per_element: f64,
    pub n_layers: u64,
    /// Contexto con el que se entrenó el modelo: el que llama.cpp usa sin `-c`.
    pub ctx_train: u64,
}

/// Desglose completo de memoria.
///
/// `n_gpu_layers` decide el reparto de los pesos entre GPU y CPU. Si es None,
/// se asume que TODO va a la GPU (la cota superior).
pub fn estimate(
    model: &ModelDims,
    ctx: u64,
    n_parallel: u64,
    cache_type_k: &str,
    cache_type_v: &str,
    ubatch: u64,
    n_gpu_layers: Option<i64>,
) -> MemoryEstimate {
    // K y V pueden tener cuantizaciones distintas: la estimacion debe usar
    // las dos, o el numero mostrado no corresponde a lo que se reservara.
    let kv = kv_cache_bytes(model, ctx, n_parallel, cache_type_k, cache_type_v);
    let cb = compute_buffer_bytes(ctx, ubatch);
    let weights = model_weights_gb(model);
    let split = weights_split(model, n_gpu_layers);
    // Con -ngl 0 todo corre en CPU: la GPU no reserva pesos, KV ni compute.
    let cpu_only = n_gpu_layers == Some(0);

    MemoryEstimate {
        weights_gb: round2(weights),
        weights_gpu_gb: split.gpu_gb,
        weights_cpu_gb: split.cpu_gb,
        kv_cache_gb: round3(kv.total_gb),
        kv_dense_gb: round3(kv.dense_bytes / 1024.0 / 1024.0 / 1024.0),
        kv_swa_gb: round3(kv.swa_bytes / 1024.0 / 1024.0 / 1024.0),
        kv_cache_mib: round1(kv.total_mib),
        compute_buffer_gb: round3(cb.total_gb),
        compute_gpu_mib: if cpu_only { 0.0 } else { cb.gpu_mib },
        compute_host_mib: cb.host_mib,
        vram_requested_gb: if cpu_only {
            0.0
        } else {
            round2(split.gpu_gb + kv.total_gb + cb.total_gb / 2.0)
        },
        total_gb: round2(weights + kv.total_gb + cb.total_gb),
        ctx_padded: kv.ctx_padded,
        ctx_per_slot: kv.ctx_per_slot,
        n_dense_layers: kv.n_dense_layers,
        n_swa_layers: kv.n_swa_layers,
        bytes_per_element: kv.bytes_per_element,
        n_layers: model.n_layers,
        ctx_train: model.ctx_train,
    }
}

fn round1(v: f64) -> f64 {
    (v * 10.0).round() / 10.0
}
fn round2(v: f64) -> f64 {
    (v * 100.0).round() / 100.0
}
fn round3(v: f64) -> f64 {
    (v * 1000.0).round() / 1000.0
}

#[cfg(test)]
mod tests {
    use super::*;

    /// Reproduce gemma-4-E4B-it-Q4_0: 42 capas, 18 compartidas, SWA en 20 capas.
    /// `n_head_kv = 2` (GQA): 4 capas densas (512 dim) + 20 SWA (256 dim).
    fn gemma4_dims() -> ModelDims {
        ModelDims {
            n_layers: 42,
            n_head_kv: 2,
            n_embd_head: 512,
            n_embd_head_v: 512,
            n_embd_head_swa: 256,
            n_embd_head_v_swa: 256,
            sliding_window: 512,
            shared_kv_layers: 18,
            sliding_window_pattern: {
                // 4 capas densas + 20 SWA + resto compartido
                let mut p = vec![false; 42];
                for i in 4..24 {
                    p[i] = true;
                }
                p
            },
            size_bytes: 4378 * 1024 * 1024,
            lazy_tensor_mib: 1585.0,
            vocab_size: 262144,
            embedding_length: 2048,
            n_params_est: 4_000_000_000,
            ctx_train: 131072,
        }
    }

    #[test]
    fn kv_cache_matches_measured_values() {
        let m = gemma4_dims();
        // MEDIDO en RX 9070 con llama.cpp b11574.
        for (ctx, real) in [(2048u64, 72.0f64), (8192, 168.0), (32768, 552.0)] {
            let kv = kv_cache_bytes(&m, ctx, 1, "f16", "f16");
            let err = (kv.total_mib - real) / real * 100.0;
            assert!(
                err.abs() < 1.0,
                "ctx={ctx}: predicho {:.1} MiB vs real {real} MiB (error {err:+.1}%)",
                kv.total_mib
            );
        }
    }

    #[test]
    fn kv_cache_grows_with_parallel_slots() {
        let m = gemma4_dims();
        // MEDIDO: np=1->168, 2->208, 4->288, 8->448 MiB
        for (np, real) in [(1u64, 168.0f64), (2, 208.0), (4, 288.0), (8, 448.0)] {
            let kv = kv_cache_bytes(&m, 8192, np, "f16", "f16");
            let err = (kv.total_mib - real) / real * 100.0;
            assert!(
                err.abs() < 1.0,
                "np={np}: predicho {:.1} MiB vs real {real} MiB (error {err:+.1}%)",
                kv.total_mib
            );
        }
    }

    #[test]
    fn dense_cache_stays_constant_with_slots() {
        let m = gemma4_dims();
        let dense: Vec<f64> = [1u64, 2, 4, 8]
            .iter()
            .map(|np| kv_cache_bytes(&m, 8192, *np, "f16", "f16").dense_bytes)
            .collect();
        // La densa reparte el contexto entre ranuras: no cambia.
        assert!((dense[0] - dense[3]).abs() < 1.0);
    }

    #[test]
    fn negative_gpu_layers_means_all_on_gpu() {
        let m = gemma4_dims();
        let auto = weights_split(&m, Some(-1));
        let all = weights_split(&m, Some(-2));
        let unspecified = weights_split(&m, None);
        // `-1` (auto) y `-2` (all) no son fracciones negativas: suben todas
        // las capas. Antes producían una GPU negativa en la estimación.
        assert_eq!(auto.gpu_gb, unspecified.gpu_gb);
        assert_eq!(all.gpu_gb, unspecified.gpu_gb);
    }

    #[test]
    fn cpu_request_asks_no_vram() {
        let m = gemma4_dims();
        // -ngl 0: pesos, KV y compute viven en RAM; la GPU no reserva nada.
        let cpu = estimate(&m, 8192, 1, "f16", "f16", 512, Some(0));
        assert_eq!(cpu.weights_gpu_gb, 0.0);
        assert_eq!(cpu.compute_gpu_mib, 0.0);
        assert_eq!(cpu.vram_requested_gb, 0.0);
        assert_eq!(cpu.n_layers, 42);
        assert_eq!(cpu.ctx_train, 131072);
    }
}
