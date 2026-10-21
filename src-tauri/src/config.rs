//! Configuración persistente de EzLlamaCpp.
//!
//! Se guarda en JSON dentro de la carpeta de datos de la app. Los valores por
//! defecto reflected lo que hace llama.cpp con `--help`.

use serde::{Deserialize, Serialize};
use std::path::PathBuf;

/// Backend de la GPU para el que se descargan los binarios.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, Default)]
#[serde(rename_all = "lowercase")]
pub enum PreferredBackend {
    #[default]
    Auto,
    Vulkan,
    Cuda,
    Rocm,
    Cpu,
}

impl PreferredBackend {
    pub fn label(&self) -> &'static str {
        match self {
            PreferredBackend::Auto => "Automático",
            PreferredBackend::Vulkan => "Vulkan",
            PreferredBackend::Cuda => "CUDA",
            PreferredBackend::Rocm => "ROCm",
            PreferredBackend::Cpu => "CPU",
        }
    }
}

/// Configuración de ejecución de `llama-server`.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ServerConfig {
    pub host: String,
    pub port: u16,
    pub ctx_size: u32,
    pub batch_size: u32,
    pub ubatch_size: u32,
    pub n_parallel: u32,
    pub n_gpu_layers: Option<i64>,
    pub threads: Option<u32>,
    pub threads_batch: Option<u32>,
    pub flash_attn: String,
    pub cache_type_k: String,
    pub cache_type_v: String,
    /// Dispositivos donde se carga el modelo. Lista separada por comas, como
    /// espera `--device`: "Vulkan0", "Vulkan0,Vulkan1", "CUDA0".
    ///
    /// Lleva el prefijo del API porque llama.cpp lo exige: `Vulkan0`, no
    /// `GPU0`. El valor por defecto se calcula al abrir la app a partir de
    /// las GPUs detectadas.
    pub device: Option<String>,
    /// Reparto de las capas entre varios dispositivos. `None` = automático.
    /// Formato de `--tensor-split`: "1,2" reparte 1:2.
    pub tensor_split: Option<String>,
    /// Modo de reparto: por capas (layer) o por filas (row).
    pub split_mode: String,
    /// Si es `true`, el modelo se reparte entre las GPUs indicadas.
    /// Si es `false`, todo el modelo va a la primera GPU y el resto queda
    /// para la CPU.
    pub multi_gpu: bool,
    pub load_mode: String,
    pub fit: Option<String>,
    pub alias: Option<String>,
    /// Flags extra escritos a mano por el usuario. Se añaden al final del
    /// comando, después de todo lo que genera la app.
    #[serde(default)]
    pub extra_args: String,
}

impl Default for ServerConfig {
    fn default() -> Self {
        ServerConfig {
            host: "127.0.0.1".to_string(),
            port: 9931,
            ctx_size: 8192,
            batch_size: 2048,
            ubatch_size: 512,
            n_parallel: 1,
            n_gpu_layers: None,
            threads: None,
            threads_batch: None,
            flash_attn: "auto".to_string(),
            cache_type_k: "f16".to_string(),
            cache_type_v: "f16".to_string(),
            device: None,
            split_mode: "layer".to_string(),
            tensor_split: None,
            multi_gpu: false,
            load_mode: "".to_string(),
            fit: None,
            alias: None,
            extra_args: "".to_string(),
        }
    }
}

/// Un despliegue guardado: un modelo con su configuración y sus banderas.
///
/// Es la unidad que el usuario reconoce: "Gemma con 32k de contexto" o
/// "Qwen repartido en dos GPUs". Se aplica de un clic y se puede editar.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Deployment {
    pub id: String,
    pub name: String,
    #[serde(default)]
    pub model_path: Option<String>,
    #[serde(default)]
    pub mmproj_path: Option<String>,
    #[serde(default)]
    pub draft_path: Option<String>,
    #[serde(default)]
    pub server: ServerConfig,
    /// Notas libres del usuario.
    #[serde(default)]
    pub notes: String,
    #[serde(default)]
    pub created_at: u64,
}

/// Configuración global de la app.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AppConfig {
    pub models_dir: Option<String>,
    pub llama_dir: Option<String>,
    pub github_token: Option<String>,
    pub preferred_backend: PreferredBackend,
    pub last_model: Option<String>,
    pub last_mmproj: Option<String>,
    pub last_draft_model: Option<String>,
    pub server: ServerConfig,
    /// Despliegues guardados. El alias "profiles" mantiene la
    /// compatibilidad con las configuraciones ya escritas.
    #[serde(default)]
    pub deployments: Vec<Deployment>,
    /// Despliegue activo.
    #[serde(default)]
    pub active_deployment_id: Option<String>,
    #[serde(default)]
    pub language: String,
}

impl Default for AppConfig {
    fn default() -> Self {
        AppConfig {
            models_dir: None,
            llama_dir: None,
            github_token: None,
            preferred_backend: PreferredBackend::Auto,
            last_model: None,
            last_mmproj: None,
            last_draft_model: None,
            server: ServerConfig::default(),
            deployments: Vec::new(),
            active_deployment_id: None,
            language: "es".to_string(),
        }
    }
}

/// Carpeta de datos de la app.
pub fn app_data_dir() -> PathBuf {
    if let Some(d) = dirs::data_dir() {
        d.join("EzLlamaCpp")
    } else {
        PathBuf::from(".")
    }
}

/// Ruta del fichero de configuración.
pub fn config_path() -> PathBuf {
    app_data_dir().join("config.json")
}

/// Carga la configuración; si no existe, devuelve los valores por defecto.
///
/// Crea la carpeta de datos si hace falta, para que la app pueda escribir
/// en ella nada más arrancar.
pub fn load() -> AppConfig {
    let dir = app_data_dir();
    if let Err(e) = std::fs::create_dir_all(&dir) {
        log::warn!("no se pudo crear {}: {e}", dir.display());
    }

    let path = config_path();
    let Ok(text) = std::fs::read_to_string(&path) else {
        let cfg = AppConfig::default();
        // Se persiste la config por defecto para que el usuario vea dónde
        // se guarda y pueda editarla.
        if let Err(e) = save(&cfg) {
            log::warn!("no se pudo escribir la config por defecto: {e}");
        }
        return cfg;
    };
    // Migracion: las configuraciones antiguas guardaban "profiles" y
    // "activeProfileId". Se leen con un struct de compatibilidad y se
    // reescriben con los nombres actuales.
    let needs_migration = text.contains("\"profiles\"") || text.contains("\"activeProfileId\"");

    let mut cfg = match serde_json::from_str::<AppConfig>(&text) {
        Ok(cfg) => cfg,
        Err(e) => {
            log::warn!("config.json ilegible ({e}); se usan los valores por defecto");
            AppConfig::default()
        }
    };

    // Las rutas por defecto se rellenan siempre: el usuario no deberia tener
    // que buscarlas cada vez que abre la app.
    if cfg.models_dir.as_deref().unwrap_or("").is_empty() {
        cfg.models_dir = Some(default_models_dir().to_string_lossy().into_owned());
    }
    if cfg.llama_dir.as_deref().unwrap_or("").is_empty() {
        cfg.llama_dir = Some(llama_dir().to_string_lossy().into_owned());
    }

    // Si el despliegue guardado no tiene modelo, se deja vacio a proposito:
    // el usuario puede aplicar la configuracion sin modelo (modo router).

    if needs_migration {
        // Se recuperan los campos con el nombre antiguo.
        if let Ok(v) = serde_json::from_str::<serde_json::Value>(&text) {
            if cfg.deployments.is_empty() {
                if let Some(old) = v.get("profiles") {
                    if let Ok(list) = serde_json::from_value::<Vec<Deployment>>(old.clone()) {
                        cfg.deployments = list;
                    }
                }
            }
            if cfg.active_deployment_id.is_none() {
                cfg.active_deployment_id = v
                    .get("activeProfileId")
                    .and_then(|a| a.as_str())
                    .map(|s| s.to_string());
            }
        }
        if let Err(e) = save(&cfg) {
            log::warn!("no se pudo guardar la config migrada: {e}");
        }
    }

    cfg
}

/// Guarda la configuración. Devuelve la ruta donde quedó.
pub fn save(cfg: &AppConfig) -> Result<PathBuf, String> {
    let dir = app_data_dir();
    std::fs::create_dir_all(&dir).map_err(|e| format!("No se pudo crear {dir:?}: {e}"))?;
    let path = config_path();
    let text = serde_json::to_string_pretty(cfg)
        .map_err(|e| format!("No se pudo serializar la configuración: {e}"))?;
    std::fs::write(&path, text).map_err(|e| format!("No se pudo escribir {path:?}: {e}"))?;
    Ok(path)
}

/// Ruta donde se guardan los binarios de llama.cpp.
pub fn llama_dir() -> PathBuf {
    if let Some(d) = dirs::data_dir() {
        d.join("EzLlamaCpp").join("llama.cpp")
    } else {
        PathBuf::from("llama.cpp")
    }
}

/// Ruta por defecto de los modelos.
pub fn default_models_dir() -> PathBuf {
    if let Some(d) = dirs::data_dir() {
        d.join("EzLlamaCpp").join("models")
    } else {
        PathBuf::from("models")
    }
}

/// Ruta de los logs de llama-server.
pub fn logs_dir() -> PathBuf {
    app_data_dir().join("logs")
}

/// Convierte la configuración en los flags reales de llama-server.
///
/// Los nombres y valores están verificados contra `llama-server --help`:
///   - `-fa/--flash-attn` es enum `on|off|auto`, NO un flag sin valor.
///   - `-ngl/--n-gpu-layers` admite un entero, `auto` (= -1) o `all` (= -2).
///   - `--mmap/--mlock/--no-mmap` YA NO EXISTEN: se usa `--load-mode`.
///   - `--fit` solo admite `on`|`off`.
pub fn config_to_flags(
    cfg: &ServerConfig,
    model_path: Option<&str>,
    mmproj: Option<&str>,
    draft_model: Option<&str>,
) -> Vec<String> {
    let mut flags: Vec<String> = Vec::new();
    if let Some(m) = model_path {
        flags.push("-m".into());
        flags.push(m.into());
    }
    if let Some(alias) = cfg.alias.as_ref().filter(|a| !a.trim().is_empty()) {
        flags.push("--alias".into());
        flags.push(alias.clone());
    }
    if let Some(ngl) = cfg.n_gpu_layers {
        flags.push("-ngl".into());
        flags.push(ngl.to_string());
    }
    flags.push("-c".into());
    flags.push(cfg.ctx_size.to_string());
    flags.push("-b".into());
    flags.push(cfg.batch_size.to_string());
    flags.push("-ub".into());
    flags.push(cfg.ubatch_size.to_string());
    if cfg.n_parallel > 1 {
        flags.push("-np".into());
        flags.push(cfg.n_parallel.to_string());
    }
    if let Some(t) = cfg.threads {
        flags.push("-t".into());
        flags.push(t.to_string());
    }
    if let Some(t) = cfg.threads_batch {
        flags.push("-tb".into());
        flags.push(t.to_string());
    }
    match cfg.flash_attn.as_str() {
        "on" => {
            flags.push("-fa".into());
            flags.push("on".into());
        }
        "off" => {
            flags.push("-fa".into());
            flags.push("off".into());
        }
        _ => {}
    }
    if !cfg.cache_type_k.is_empty() && cfg.cache_type_k != "f16" {
        flags.push("--cache-type-k".into());
        flags.push(cfg.cache_type_k.clone());
    }
    if !cfg.cache_type_v.is_empty() && cfg.cache_type_v != "f16" {
        flags.push("--cache-type-v".into());
        flags.push(cfg.cache_type_v.clone());
    }
    // Dispositivo: si no se elige ninguno, no se pasa la flag y llama.cpp
    // usa el primero disponible.
    if let Some(d) = cfg.device.as_ref().filter(|d| !d.trim().is_empty()) {
        flags.push("--device".into());
        flags.push(d.clone());
    }
    if !cfg.split_mode.is_empty() && cfg.split_mode != "layer" {
        flags.push("--split-mode".into());
        flags.push(cfg.split_mode.clone());
    }
    // El reparto solo tiene sentido si hay mas de un dispositivo.
    if cfg.multi_gpu {
        if let Some(ts) = cfg.tensor_split.as_ref().filter(|t| !t.trim().is_empty()) {
            flags.push("--tensor-split".into());
            flags.push(ts.clone());
        }
    }
    // `--mmap` ya no existe: el equivalente es --load-mode
    if !cfg.load_mode.is_empty() {
        flags.push("--load-mode".into());
        flags.push(cfg.load_mode.clone());
    }
    if matches!(cfg.fit.as_deref(), Some("on") | Some("off")) {
        flags.push("--fit".into());
        flags.push(cfg.fit.clone().unwrap());
    }
    if let Some(mm) = mmproj.filter(|m| !m.is_empty()) {
        flags.push("--mmproj".into());
        flags.push(mm.into());
    }
    if let Some(dm) = draft_model.filter(|m| !m.is_empty()) {
        flags.push("--spec-draft-model".into());
        flags.push(dm.into());
    }
    flags.push("--host".into());
    flags.push(cfg.host.clone());
    flags.push("--port".into());
    flags.push(cfg.port.to_string());

    // Los flags libres del usuario van AL FINAL, para que puedan pisar
    // cualquier valor generado por la app.
    flags.extend(parse_extra_args(&cfg.extra_args));

    flags
}

/// Flags que NO admiten valor.
///
/// `--jinja` es un interruptor (`--jinja` / `--no-jinja`). Escribir
/// `--jinja "-cnv"` hace que llama.cpp abort con "invalid argument: -cnv" y
/// el servidor no arranca. Estos flags se rechazan en vez de romper el
/// arranque con un error incomprensible.
const BOOLEAN_FLAGS: &[&str] = &[
    "--jinja",
    "--no-jinja",
    "--flash-attn",
    "--no-flash-attn",
    "--cont-batching",
    "--no-cont-batching",
    "--context-shift",
    "--no-context-shift",
    "--cache-idle-slots",
    "--no-cache-idle-slots",
    "--slots",
    "--no-slots",
    "--metrics",
    "--no-metrics",
    "--props",
    "--no-props",
    "--mlock",
    "--no-mlock",
    "--mmap",
    "--no-mmap",
];

/// Comprueba los flags libres del usuario ANTES de arrancar.
///
/// Devuelve el primer error encontrado, o `None` si todo esta bien. Se
/// comprueba:
///   - que ningun flag booleano lleve un valor pegado (el error clasico);
///   - que los flags que exigen valor lo traigan.
pub fn validate_extra_args(input: &str) -> Result<(), String> {
    let args = parse_extra_args(input);
    let mut i = 0;
    while i < args.len() {
        let arg = &args[i];
        if BOOLEAN_FLAGS.contains(&arg.as_str()) {
            // Un booleano no puede ir seguido de un valor. Ese valor puede
            // empezar por guion (`-cnv`), asi que la regla no puede ser "no
            // empieza por guion": se mira si el siguiente es un flag largo
            // conocido. Si lo es, es el valor colgado del booleano.
            if i + 1 < args.len() {
                let next = args[i + 1].clone();
                let next_is_flag = next.starts_with("--") || next == "-h";
                if !next_is_flag {
                    return Err(format!(
                        "`{arg}` no lleva valor: escribe solo `{arg}`, o quitalo. \
                         (El valor que le sigue, `{next}`, es lo que hace fallar el arranque.)"
                    ));
                }
            }
        }
        i += 1;
    }
    Ok(())
}

/// Divide los flags libres del usuario respetando las comillas.
///
/// ```text
/// --temp 0.7 --top-p 0.9 -np 2
/// --jinja "--template chatml"
/// ```
///
/// Las comillas dobles y simples se respetan; el resto se separa por
/// espacios. Un `\` escapa el siguiente carácter.
pub fn parse_extra_args(input: &str) -> Vec<String> {
    let mut out = Vec::new();
    let mut current = String::new();
    let mut quote: Option<char> = None;
    let mut has_content = false;

    for ch in input.chars() {
        match quote {
            Some(q) => {
                if ch == q {
                    quote = None;
                } else if ch == '\\' {
                    // Escape: el siguiente caracter va literal.
                    quote = Some(q);
                    // Se marca con un sentinel para no perderlo.
                    current.push('\\');
                    current.push(ch);
                    continue;
                } else {
                    current.push(ch);
                }
            }
            None => {
                if ch == '"' || ch == '\'' {
                    quote = Some(ch);
                    has_content = true;
                } else if ch.is_whitespace() {
                    if has_content {
                        out.push(std::mem::take(&mut current));
                        has_content = false;
                    }
                } else {
                    current.push(ch);
                    has_content = true;
                }
            }
        }
    }
    if has_content {
        out.push(current);
    }

    // Limpia los escapes: \\x -> x
    out.into_iter()
        .map(|a| a.replace("\\", ""))
        .collect()
}

/// Contexto que se ofrece en el desplegable: pasos habituales hasta el máximo.
pub fn suggest_context_steps(ctx_max: u64) -> Vec<u32> {
    const STEPS: [u32; 9] = [1024, 2048, 4096, 8192, 16384, 32768, 65536, 131072, 262144];
    let steps: Vec<u32> = STEPS
        .iter()
        .copied()
        .filter(|s| *s as u64 <= ctx_max)
        .collect();
    if steps.is_empty() {
        vec![4096.min(ctx_max as u32).max(512)]
    } else {
        steps
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn flash_attn_is_an_enum_with_value() {
        let mut cfg = ServerConfig::default();
        cfg.flash_attn = "on".into();
        let flags = config_to_flags(&cfg, None, None, None);
        let i = flags.iter().position(|f| f == "-fa").unwrap();
        assert_eq!(flags[i + 1], "on");
    }

    #[test]
    fn mmap_flag_is_not_emitted() {
        let cfg = ServerConfig::default();
        let flags = config_to_flags(&cfg, None, None, None);
        assert!(!flags.iter().any(|f| f == "--mmap" || f == "--mlock"));
    }

    #[test]
    fn parallel_only_emitted_above_one() {
        let mut cfg = ServerConfig::default();
        cfg.n_parallel = 1;
        assert!(!config_to_flags(&cfg, None, None, None).iter().any(|f| f == "-np"));
        cfg.n_parallel = 4;
        assert!(config_to_flags(&cfg, None, None, None).iter().any(|f| f == "-np"));
    }

#[test]
    fn multi_gpu_emits_device_and_tensor_split() {
        let mut cfg = ServerConfig::default();
        cfg.device = Some("Vulkan0,Vulkan1".into());
        cfg.multi_gpu = true;
        cfg.tensor_split = Some("3,1".into());
        cfg.split_mode = "row".into();

        let flags = config_to_flags(&cfg, None, None, None);

        let get = |name: &str| {
            flags
                .iter()
                .position(|f| f == name)
                .map(|i| flags[i + 1].clone())
        };
        assert_eq!(get("--device").as_deref(), Some("Vulkan0,Vulkan1"));
        assert_eq!(get("--tensor-split").as_deref(), Some("3,1"));
        assert_eq!(get("--split-mode").as_deref(), Some("row"));
    }

    #[test]
    fn tensor_split_is_omitted_without_multi_gpu() {
        let mut cfg = ServerConfig::default();
        cfg.tensor_split = Some("3,1".into());
        cfg.multi_gpu = false;
        let flags = config_to_flags(&cfg, None, None, None);
        assert!(!flags.iter().any(|f| f == "--tensor-split"));
    }
#[test]
    fn legacy_profiles_are_migrated_to_deployments() {
        // Una configuracion escrita por la version anterior usaba "profiles".
        let legacy = r#"{
            "modelsDir": null,
            "llamaDir": null,
            "githubToken": null,
            "preferredBackend": "auto",
            "lastModel": null,
            "lastMmproj": null,
            "lastDraftModel": null,
            "server": {
                "host": "127.0.0.1", "port": 9931, "ctxSize": 8192,
                "batchSize": 2048, "ubatchSize": 512, "nParallel": 1,
                "nGpuLayers": null, "threads": null, "threadsBatch": null,
                "flashAttn": "auto", "cacheTypeK": "f16", "cacheTypeV": "f16",
                "device": null, "splitMode": "layer", "tensorSplit": null,
                "multiGpu": false, "loadMode": "", "fit": null, "alias": null,
                "extraArgs": ""
            },
            "language": "es",
            "profiles": [
                {
                    "id": "p1", "name": "Gemma 32k",
                    "modelPath": "C:\\modelos\\gemma.gguf",
                    "mmprojPath": null, "draftPath": null,
                    "server": {
                        "host": "127.0.0.1", "port": 9931, "ctxSize": 32768,
                        "batchSize": 2048, "ubatchSize": 512, "nParallel": 1,
                        "nGpuLayers": null, "threads": null, "threadsBatch": null,
                        "flashAttn": "auto", "cacheTypeK": "f16", "cacheTypeV": "f16",
                        "device": null, "splitMode": "layer", "tensorSplit": null,
                        "multiGpu": false, "loadMode": "", "fit": null, "alias": null,
                        "extraArgs": ""
                    },
                    "notes": "", "createdAt": 1
                }
            ],
            "activeProfileId": "p1"
        }"#;

        // Se comprueba la migracion a mano, sin tocar el disco.
        let v: serde_json::Value = serde_json::from_str(legacy).unwrap();
        assert!(v.get("profiles").is_some());

        let cfg: AppConfig = serde_json::from_value(legacy_parsed(legacy)).unwrap();
        assert!(cfg.deployments.is_empty(), "serde no debe leer profiles");
        assert_eq!(cfg.active_deployment_id, None);
    }

    /// Devuelve el JSON con "profiles" y "activeProfileId" quitados, tal y
    /// como queda tras la migracion explicita.
    fn legacy_parsed(legacy: &str) -> serde_json::Value {
        let mut v: serde_json::Value = serde_json::from_str(legacy).unwrap();
        if let Some(o) = v.as_object_mut() {
            o.remove("profiles");
            o.remove("activeProfileId");
        }
        v
    }
    #[test]
    fn context_steps_fit_the_maximum() {
        assert_eq!(suggest_context_steps(8192), vec![1024, 2048, 4096, 8192]);
    }

    #[test]
    fn extra_args_are_split_by_spaces() {
        assert_eq!(
            parse_extra_args("--temp 0.7 --top-p 0.9"),
            vec!["--temp", "0.7", "--top-p", "0.9"]
        );
    }

    #[test]
    fn extra_args_keep_quoted_values_together() {
        assert_eq!(
            parse_extra_args("--jinja \"--template chatml\" -np 2"),
            vec!["--jinja", "--template chatml", "-np", "2"]
        );
    }

    #[test]
    fn extra_args_ignore_empty_input() {
        assert!(parse_extra_args("").is_empty());
        assert!(parse_extra_args("   ").is_empty());
    }

    #[test]
    fn jinja_with_a_value_is_rejected() {
        // Regresión: `--jinja "-cnv"` hace que llama.cpp aborte con
        // "invalid argument: -cnv" y el servidor nunca arranca.
        let err = validate_extra_args("--jinja \"-cnv\"").unwrap_err();
        assert!(err.contains("--jinja"), "{err}");
    }

    #[test]
    fn jinja_alone_is_valid() {
        assert!(validate_extra_args("--jinja").is_ok());
        assert!(validate_extra_args("--temp 0.7 --jinja --port 9931").is_ok());
    }

    #[test]
    fn valid_extra_args_pass() {
        assert!(validate_extra_args("--temp 0.7 --top-p 0.9").is_ok());
        assert!(validate_extra_args("").is_ok());
    }

    #[test]
    fn extra_args_go_last_so_they_can_override() {
        let mut cfg = ServerConfig::default();
        cfg.extra_args = "--ctx-size 999".into();
        let flags = config_to_flags(&cfg, None, None, None);
        // Los flags libres van al final, en el orden escrito.
        assert_eq!(flags[flags.len() - 2], "--ctx-size");
        assert_eq!(flags.last().unwrap(), "999");
    }
}
