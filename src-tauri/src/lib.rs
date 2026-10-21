//! EzLlamaCpp — backend en Rust.
//!
//! Expone al frontend (React) todo lo que la app necesita:
//!   - releases oficiales de llama.cpp y descarga verificada
//!   - escaneo del catálogo de modelos (con roles MTP y mmproj)
//!   - hardware real (VRAM, CPU, RAM) y estimación de memoria
//!   - arranque/parada de `llama-server` con la configuración de la UI

mod config;
mod gguf;
mod hardware;
mod install;
pub mod install_probe;
pub mod live_check;
pub mod paths_probe;
pub mod server_probe;
mod memory;
mod models;
mod releases;
mod server;

// Los módulos se exponen para que los tests de integración puedan
// comprobar la fórmula de memoria contra medidas reales.
pub use gguf::ModelInfo;
pub use memory::MemoryEstimate;

use serde::Serialize;
use std::path::PathBuf;
use std::sync::Arc;
use tauri::Emitter;
use tauri::State;

use config::{AppConfig, PreferredBackend};
use releases::BinaryAsset;
use server::ServerStatus;

type SharedConfig = Arc<tokio::sync::Mutex<AppConfig>>;

struct AppState {
    config: SharedConfig,
    client: reqwest::Client,
}

/// Error de comando: string legible para la UI.
type CmdResult<T> = Result<T, String>;

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ReleaseView {
    pub tag: String,
    pub title: String,
    pub prerelease: bool,
    pub published_at: Option<String>,
    pub html_url: String,
    pub assets: Vec<BinaryAsset>,
    pub total_size: u64,
    /// Asset recomendado para este equipo.
    pub recommended: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CatalogView {
    pub entries: Vec<models::CatalogEntry>,
    pub primary: Vec<models::CatalogEntry>,
    pub mmproj: Vec<models::CatalogEntry>,
    pub draft: Vec<models::CatalogEntry>,
    pub scanned: String,
}

// --- Configuración ----------------------------------------------------------

#[tauri::command]
async fn get_config(state: State<'_, AppState>) -> CmdResult<AppConfig> {
    Ok(state.config.lock().await.clone())
}

#[tauri::command]
async fn set_config(state: State<'_, AppState>, config: AppConfig) -> CmdResult<AppConfig> {
    let mut guard = state.config.lock().await;
    *guard = config.clone();
    config::save(&config)?;
    Ok(config)
}

/// Ruta por defecto de los modelos (la app la propone al abrir el explorador).
#[tauri::command]
fn default_models_dir() -> String {
    config::default_models_dir().to_string_lossy().into_owned()
}

/// Ruta por defecto de los binarios.
#[tauri::command]
fn default_llama_dir() -> String {
    config::llama_dir().to_string_lossy().into_owned()
}

// --- Releases ---------------------------------------------------------------

/// Lista las releases de llama.cpp con sus binarios clasificados.
#[tauri::command]
async fn list_releases(
    state: State<'_, AppState>,
    per_page: Option<u32>,
) -> CmdResult<Vec<ReleaseView>> {
    let token = state.config.lock().await.github_token.clone();
    let releases = releases::list_releases(
        &state.client,
        token.as_deref(),
        per_page.unwrap_or(10),
    )
    .await?;

    let host_os = host_os();
    let host_arch = host_arch();
    let preferred = state.config.lock().await.preferred_backend;

    Ok(releases
        .iter()
        .map(|r| {
            let assets = releases::classify_release(r, &host_os, &host_arch);
            let preferred_backend = match preferred {
                PreferredBackend::Auto => None,
                PreferredBackend::Vulkan => Some(releases::Backend::Vulkan),
                PreferredBackend::Cuda => Some(releases::Backend::Cuda),
                PreferredBackend::Rocm => Some(releases::Backend::Rocm),
                PreferredBackend::Cpu => Some(releases::Backend::Cpu),
            };
            let recommended = releases::recommend_asset(&assets, preferred_backend)
                .map(|a| a.name.clone());
            ReleaseView {
                tag: r.tag_name.clone(),
                title: r.name.clone().unwrap_or_else(|| r.tag_name.clone()),
                prerelease: r.prerelease,
                published_at: r.published_at.clone(),
                html_url: r.html_url.clone(),
                total_size: assets.iter().map(|a| a.size).sum(),
                assets,
                recommended,
            }
        })
        .collect())
}

/// Convierte una release estable `vX.Y.Z` en el tag `b#####` con binarios.
#[tauri::command]
async fn resolve_stable_tag(
    state: State<'_, AppState>,
    stable_tag: String,
) -> CmdResult<String> {
    let token = state.config.lock().await.github_token.clone();
    releases::resolve_stable_to_nightly(&state.client, token.as_deref(), &stable_tag).await
}

/// Lista las releases ESTABLES (`vX.Y.Z`) con el tag nightly que trae los
/// binarios. Sirve para instalar una version estable en vez de la ultima
/// nightly.
#[tauri::command]
async fn list_stable_releases(
    state: State<'_, AppState>,
    per_page: Option<u32>,
) -> CmdResult<Vec<StableRelease>> {
    let token = state.config.lock().await.github_token.clone();
    let mut all = releases::list_releases(&state.client, token.as_deref(), per_page.unwrap_or(30)).await?;
    all.retain(|r| !r.prerelease && r.tag_name.starts_with('v'));

    let mut out = Vec::new();
    for r in all {
        let nightly = releases::resolve_stable_to_nightly(
            &state.client,
            token.as_deref(),
            &r.tag_name,
        )
        .await
        .ok();
        out.push(StableRelease {
            tag: r.tag_name.clone(),
            nightly_tag: nightly,
            published_at: r.published_at.clone(),
            html_url: r.html_url.clone(),
        });
    }
    Ok(out)
}

/// Una release estable y el tag nightly que trae los binarios.
#[derive(Debug, Clone, Serialize)]
pub struct StableRelease {
    pub tag: String,
    pub nightly_tag: Option<String>,
    pub published_at: Option<String>,
    pub html_url: String,
}

/// Detalle de una release concreta.
#[tauri::command]
async fn get_release(state: State<'_, AppState>, tag: String) -> CmdResult<ReleaseView> {
    let token = state.config.lock().await.github_token.clone();
    let r = releases::get_release(&state.client, token.as_deref(), &tag).await?;
    let assets = releases::classify_release(&r, &host_os(), &host_arch());
    Ok(ReleaseView {
        tag: r.tag_name.clone(),
        title: r.name.clone().unwrap_or_else(|| r.tag_name.clone()),
        prerelease: r.prerelease,
        published_at: r.published_at.clone(),
        html_url: r.html_url.clone(),
        total_size: assets.iter().map(|a| a.size).sum(),
        recommended: releases::recommend_asset(&assets, None).map(|a| a.name.clone()),
        assets,
    })
}

// --- Instalación ------------------------------------------------------------

/// Descarga e instala un asset de llama.cpp.
///
/// El progreso se emite por el canal de eventos `install-progress`.
#[tauri::command]
async fn install_release(
    app: tauri::AppHandle,
    state: State<'_, AppState>,
    tag: String,
    asset_name: String,
) -> CmdResult<install::InstallResult> {
    let token = state.config.lock().await.github_token.clone();
    let release = releases::get_release(&state.client, token.as_deref(), &tag).await?;

    let Some(asset) = release.assets.iter().find(|a| a.name == asset_name).cloned() else {
        return Err(format!("El asset {asset_name} no existe en {tag}"));
    };

    let binary = releases::classify_asset(&asset, &host_os(), &host_arch())
        .ok_or_else(|| format!("{asset_name} no es un paquete de binarios"))?;

    let install_dir = config::llama_dir();
    let progress_app = app.clone();

    let result = install::install_asset(
        &state.client,
        &binary,
        &install_dir,
        &tag,
        move |p| {
            let _ = progress_app.emit("install-progress", p);
        },
    )
    .await?;

    // Guarda la ruta de la instalación en la configuración.
    {
        let mut cfg = state.config.lock().await;
        cfg.llama_dir = Some(install_dir.to_string_lossy().into_owned());
        config::save(&cfg)?;
    }

    Ok(result)
}

/// Versiones de llama.cpp ya instaladas.
#[tauri::command]
fn list_installed() -> Vec<install::InstalledBuild> {
    install::list_installed(&config::llama_dir())
}

/// Borra una versión instalada.
#[tauri::command]
fn remove_install(tag: String) -> CmdResult<String> {
    let dir = config::llama_dir().join(&tag);
    if !dir.exists() {
        return Err(format!("La versión {tag} no está instalada"));
    }
    std::fs::remove_dir_all(&dir)
        .map_err(|e| format!("No se pudo borrar {}: {e}", dir.display()))?;
    Ok(format!("Versión {tag} eliminada"))
}

// --- Modelos ----------------------------------------------------------------

/// Escanea una carpeta y devuelve el catálogo de modelos.
#[tauri::command]
async fn scan_models(dir: String) -> CmdResult<CatalogView> {
    let path = PathBuf::from(&dir);
    let entries = tokio::task::spawn_blocking(move || models::scan_directory(&path, 4))
        .await
        .map_err(|e| format!("Error escaneando: {e}"))?;

    Ok(CatalogView {
        primary: entries
            .iter()
            .filter(|e| e.role == models::ModelRole::Primary)
            .cloned()
            .collect(),
        mmproj: entries
            .iter()
            .filter(|e| e.role == models::ModelRole::Mmproj)
            .cloned()
            .collect(),
        draft: entries
            .iter()
            .filter(|e| e.role == models::ModelRole::Draft)
            .cloned()
            .collect(),
        scanned: dir,
        entries,
    })
}

/// Analiza un único GGUF (ficha completa del modelo).
#[tauri::command]
async fn inspect_model(path: String) -> CmdResult<gguf::ModelInfo> {
    tokio::task::spawn_blocking(move || gguf::analyze(&path))
        .await
        .map_err(|e| format!("Error leyendo el modelo: {e}"))?
        .map_err(|e| format!("No se pudo leer el GGUF: {e}"))
}

/// Empareja un modelo con su mmproj y su MTP (por prefijo de nombre).
#[tauri::command]
async fn find_companions(model_path: String, dir: String) -> CmdResult<(Option<String>, Option<String>)> {
    let path = PathBuf::from(&model_path);
    let dir_path = PathBuf::from(&dir);
    tokio::task::spawn_blocking(move || {
        let entries = models::scan_directory(&dir_path, 4);
        let primary = models::analyze_path(&path);
        Ok::<_, String>(models::companion_of(&primary, &entries))
    })
    .await
    .map_err(|e| format!("Error: {e}"))?
}

// --- Memoria ----------------------------------------------------------------

/// Estimación de memoria para un modelo y una configuración.
#[tauri::command]
async fn estimate_memory(
    model_path: String,
    ctx: u32,
    n_parallel: u32,
    cache_type: String,
    ubatch: u32,
    n_gpu_layers: Option<i64>,
) -> CmdResult<memory::MemoryEstimate> {
    tokio::task::spawn_blocking(move || {
        let info = gguf::analyze(&model_path).map_err(|e| e.to_string())?;
        let dims = memory::ModelDims::from_info(&info);
        Ok::<_, String>(memory::estimate(
            &dims,
            ctx as u64,
            n_parallel as u64,
            &cache_type,
            ubatch as u64,
            n_gpu_layers,
        ))
    })
    .await
    .map_err(|e| format!("Error: {e}"))?
}

// --- Hardware ---------------------------------------------------------------

/// Informe de hardware del equipo.
#[tauri::command]
async fn hardware_report(state: State<'_, AppState>) -> CmdResult<hardware::HardwareReport> {
    let llama_server = current_llama_server(&*state.config.lock().await);
    tokio::task::spawn_blocking(move || hardware::full_report(llama_server.as_deref()))
        .await
        .map_err(|e| format!("Error detectando el hardware: {e}"))
}

// --- Servidor ---------------------------------------------------------------

/// Arranca `llama-server`.
#[tauri::command]
async fn start_server(
    state: State<'_, AppState>,
    model_path: Option<String>,
    mmproj: Option<String>,
    draft_model: Option<String>,
) -> CmdResult<ServerStatus> {
    let cfg = state.config.lock().await.clone();
    let exe = current_llama_server(&cfg).ok_or_else(|| {
        "No se encuentra llama-server. Instala una versión de llama.cpp primero.".to_string()
    })?;

    tokio::task::spawn_blocking(move || {
        server::start(
            &exe,
            &cfg.server,
            model_path.as_deref(),
            mmproj.as_deref(),
            draft_model.as_deref(),
        )
    })
    .await
    .map_err(|e| format!("Error: {e}"))?
}

/// Para el servidor.
#[tauri::command]
async fn stop_server() -> CmdResult<ServerStatus> {
    tokio::task::spawn_blocking(server::stop)
        .await
        .map_err(|e| format!("Error: {e}"))?
}

/// Estado del servidor.
#[tauri::command]
async fn server_status() -> CmdResult<ServerStatus> {
    tokio::task::spawn_blocking(server::status)
        .await
        .map_err(|e| format!("Error: {e}"))
}

/// Últimas líneas del log del servidor.
#[tauri::command]
async fn server_log(lines: Option<usize>) -> String {
    tokio::task::spawn_blocking(move || server::current_log(lines.unwrap_or(120)))
        .await
        .unwrap_or_default()
}

/// Los flags exactos que se pasarían a llama-server con la config actual.
#[tauri::command]
async fn preview_flags(
    state: State<'_, AppState>,
    model_path: Option<String>,
    mmproj: Option<String>,
    draft_model: Option<String>,
) -> CmdResult<Vec<String>> {
    let cfg = state.config.lock().await.clone();
    Ok(config::config_to_flags(
        &cfg.server,
        model_path.as_deref(),
        mmproj.as_deref(),
        draft_model.as_deref(),
    ))
}

/// Contexto que se ofrece en el desplegable.
#[tauri::command]
fn context_steps(ctx_max: u32) -> Vec<u32> {
    config::suggest_context_steps(ctx_max as u64)
}

// --- Perfiles de modelo -----------------------------------------------------

/// Lista los perfiles guardados.
#[tauri::command]
async fn list_profiles(state: State<'_, AppState>) -> CmdResult<Vec<config::ModelProfile>> {
    Ok(state.config.lock().await.profiles.clone())
}

/// Guarda un perfil (nuevo o actualizado por su id).
#[tauri::command]
async fn save_profile(
    state: State<'_, AppState>,
    profile: config::ModelProfile,
) -> CmdResult<config::ModelProfile> {
    let mut cfg = state.config.lock().await;
    let mut profile = profile;
    if profile.id.is_empty() {
        profile.id = format!("p{}", now_millis());
    }
    if profile.created_at == 0 {
        profile.created_at = now_millis();
    }
    match cfg.profiles.iter().position(|p| p.id == profile.id) {
        Some(i) => cfg.profiles[i] = profile.clone(),
        None => cfg.profiles.push(profile.clone()),
    }
    config::save(&cfg)?;
    Ok(profile)
}

/// Elimina un perfil.
#[tauri::command]
async fn delete_profile(state: State<'_, AppState>, id: String) -> CmdResult<String> {
    let mut cfg = state.config.lock().await;
    cfg.profiles.retain(|p| p.id != id);
    if cfg.active_profile_id.as_deref() == Some(id.as_str()) {
        cfg.active_profile_id = None;
    }
    config::save(&cfg)?;
    Ok(format!("Perfil eliminado"))
}

/// Aplica un perfil: su configuración pasa a ser la configuración activa y
/// sus modelos quedan seleccionados.
#[tauri::command]
async fn apply_profile(
    state: State<'_, AppState>,
    id: String,
) -> CmdResult<(AppConfig, config::ModelProfile)> {
    let mut cfg = state.config.lock().await;
    let Some(profile) = cfg.profiles.iter().find(|p| p.id == id).cloned() else {
        return Err(format!("No existe el perfil {id}"));
    };
    cfg.server = profile.server.clone();
    cfg.last_model = profile.model_path.clone();
    cfg.last_mmproj = profile.mmproj_path.clone();
    cfg.last_draft_model = profile.draft_path.clone();
    cfg.active_profile_id = Some(profile.id.clone());
    config::save(&cfg)?;
    Ok((cfg.clone(), profile))
}

/// Duplica un perfil para poder variants sin perder el original.
#[tauri::command]
async fn duplicate_profile(
    state: State<'_, AppState>,
    id: String,
    new_name: String,
) -> CmdResult<config::ModelProfile> {
    let mut cfg = state.config.lock().await;
    let Some(source) = cfg.profiles.iter().find(|p| p.id == id).cloned() else {
        return Err(format!("No existe el perfil {id}"));
    };
    let mut copy = source;
    copy.id = format!("p{}", now_millis());
    copy.name = new_name;
    copy.created_at = now_millis();
    cfg.profiles.push(copy.clone());
    config::save(&cfg)?;
    Ok(copy)
}

// --- Utilidades -------------------------------------------------------------

/// Milisegundos desde epoch (para generar ids únicos).
fn now_millis() -> u64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_millis() as u64)
        .unwrap_or(0)
}

/// Ruta del `llama-server` que se usaría ahora mismo.
#[tauri::command]
async fn llama_server_path(state: State<'_, AppState>) -> CmdResult<Option<String>> {
    Ok(current_llama_server(&*state.config.lock().await))
}

/// Binarios de llama.cpp instalados en una carpeta.
#[tauri::command]
fn list_binaries(dir: String) -> Vec<String> {
    models::list_llama_binaries(&PathBuf::from(dir))
}

/// Abre una carpeta en el explorador del sistema.
#[tauri::command]
fn open_folder(path: String) -> CmdResult<()> {
    let p = PathBuf::from(&path);
    if !p.exists() {
        return Err(format!("La carpeta {path} no existe"));
    }
    #[cfg(target_os = "windows")]
    {
        use std::os::windows::process::CommandExt;
        const CREATE_NO_WINDOW: u32 = 0x0800_0000;
        std::process::Command::new("explorer")
            .arg(&p)
            .creation_flags(CREATE_NO_WINDOW)
            .spawn()
            .map_err(|e| format!("No se pudo abrir el explorador: {e}"))?;
    }
    #[cfg(target_os = "macos")]
    {
        std::process::Command::new("open")
            .arg(&p)
            .spawn()
            .map_err(|e| format!("No se pudo abrir el Finder: {e}"))?;
    }
    #[cfg(target_os = "linux")]
    {
        std::process::Command::new("xdg-open")
            .arg(&p)
            .spawn()
            .map_err(|e| format!("No se pudo abrir el explorador: {e}"))?;
    }
    Ok(())
}

/// Configuración inicial al arrancar la app.
#[tauri::command]
async fn bootstrap(state: State<'_, AppState>) -> CmdResult<serde_json::Value> {
    let cfg = state.config.lock().await.clone();
    let llama_dir = config::llama_dir();
    let installed = install::list_installed(&llama_dir);
    Ok(serde_json::json!({
        "config": cfg,
        "installed": installed,
        "defaults": {
            "modelsDir": config::default_models_dir().to_string_lossy(),
            "llamaDir": llama_dir.to_string_lossy(),
        },
    }))
}

/// Ruta del `llama-server` de la configuración activa, si lo hay.
fn current_llama_server(cfg: &AppConfig) -> Option<String> {
    let dir = cfg
        .llama_dir
        .clone()
        .map(PathBuf::from)
        .unwrap_or_else(config::llama_dir);
    models::find_llama_server(&dir).map(|p| p.to_string_lossy().into_owned())
}

/// SO del equipo en el formato que usan los nombres de los assets.
fn host_os() -> String {
    match std::env::consts::OS {
        "windows" => "windows".to_string(),
        "macos" => "macos".to_string(),
        "linux" => "linux".to_string(),
        other => other.to_string(),
    }
}

/// Arquitectura del equipo en el formato de los assets: `x64` o `arm64`.
fn host_arch() -> String {
    match std::env::consts::ARCH {
        "x86_64" | "x64" => "x64".to_string(),
        "aarch64" | "arm64" => "arm64".to_string(),
        other => other.to_string(),
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    env_logger::init();

    let client = reqwest::Client::builder()
        .user_agent("EzLlamaCpp")
        .connect_timeout(std::time::Duration::from_secs(15))
        .timeout(std::time::Duration::from_secs(60 * 30))
        .build()
        .expect("no se pudo crear el cliente HTTP");

    let config = config::load();

    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .manage(AppState {
            config: Arc::new(tokio::sync::Mutex::new(config)),
            client,
        })
        .invoke_handler(tauri::generate_handler![
            get_config,
            set_config,
            default_models_dir,
            default_llama_dir,
            list_releases,
            get_release,
            resolve_stable_tag,
            list_stable_releases,
            install_release,
            list_installed,
            remove_install,
            scan_models,
            inspect_model,
            find_companions,
            estimate_memory,
            hardware_report,
            start_server,
            stop_server,
            server_status,
            server_log,
            preview_flags,
            context_steps,
            llama_server_path,
            list_binaries,
            open_folder,
            bootstrap,
            list_profiles,
            save_profile,
            delete_profile,
            apply_profile,
            duplicate_profile,
        ])
        .run(tauri::generate_context!())
        .expect("error al iniciar EzLlamaCpp");
}
