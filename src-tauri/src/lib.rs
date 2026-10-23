//! EzLLM — backend en Rust.
//!
//! Expone al frontend (React) todo lo que la app necesita:
//!   - releases oficiales de llama.cpp y descarga verificada
//!   - escaneo del catálogo de modelos (con roles MTP y mmproj)
//!   - hardware real (VRAM, CPU, RAM) y estimación de memoria
//!   - arranque/parada de `llama-server` con la configuración de la UI

mod arghelp;
mod config;
mod gguf;
mod hardware;
mod hf;
mod install;
pub mod install_probe;
pub mod live_check;
pub mod paths_probe;
pub mod server_probe;
mod memory;
mod models;
mod releases;
mod server;
mod telemetry;

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

#[tauri::command]
fn config_path() -> String {
    config::config_path().to_string_lossy().into_owned()
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
/// binarios.
///
/// Las releases estables son POCAS frente a las nightlies: entre dos
/// estables hay decenas de `b#####`. Por eso NO vale con pedir una sola
/// pagina de `per_page=30` y filtrar: el feed lo saturan las nightlies y no
/// sale ni una estable. Hay que paginar hasta reunir las pedidas.
#[tauri::command]
async fn list_stable_releases(
    state: State<'_, AppState>,
    per_page: Option<u32>,
) -> CmdResult<Vec<StableRelease>> {
    let token = state.config.lock().await.github_token.clone();
    let wanted = per_page.unwrap_or(8).clamp(1, 20) as usize;

    let mut out: Vec<StableRelease> = Vec::new();
    let mut page = 1u32;
    // 10 paginas x 100 = 1000 releases: de sobra para encontrar las
    // ultimas estables, y es el tope de la API sin paginacion.
    while out.len() < wanted && page <= 10 {
        let batch = releases::list_releases_page(
            &state.client,
            token.as_deref(),
            100,
            page,
        )
        .await?;
        if batch.is_empty() {
            break;
        }
        for r in batch {
            if r.prerelease || !r.tag_name.starts_with('v') {
                continue;
            }
            let nightly = releases::resolve_stable_to_nightly(
                &state.client,
                token.as_deref(),
                &r.tag_name,
            )
            .await
            .ok();
            // La nightly equivalente trae los binarios de verdad.
            let (assets, recommended, unavailable_reason) = match nightly.as_deref() {
                Some(ntag) => {
                    match releases::get_release(&state.client, token.as_deref(), ntag).await {
                        Ok(nrel) => {
                            let assets = releases::classify_release(&nrel, &host_os(), &host_arch());
                            let recommended = releases::recommend_asset(&assets, None)
                                .map(|a| a.name.clone());
                            let reason = if assets.is_empty() {
                                Some(format!(
                                    "{ntag} no publica paquetes para Windows en esta arquitectura"
                                ))
                            } else {
                                None
                            };
                            (assets, recommended, reason)
                        }
                        Err(e) => (Vec::new(), None, Some(e)),
                    }
                }
                None => (
                    Vec::new(),
                    None,
                    Some("Esta release no publica el puntero nightly-tag.txt".to_string()),
                ),
            };
            out.push(StableRelease {
                tag: r.tag_name.clone(),
                nightly_tag: nightly,
                published_at: r.published_at.clone(),
                html_url: r.html_url.clone(),
                assets,
                recommended,
                unavailable_reason,
            });
            if out.len() >= wanted {
                break;
            }
        }
        page += 1;
    }
    Ok(out)
}

/// Una release estable y el tag nightly que trae los binarios.
///
/// Las releases estables de llama.cpp NO publican binarios: publican un
/// asset `nightly-tag.txt` con el tag `b#####` equivalente. La app resuelve
/// ese puntero y trae los assets REALES de la nightly, para que el usuario
/// pueda instalar una version estable sin salir de la pestana.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct StableRelease {
    pub tag: String,
    pub nightly_tag: Option<String>,
    pub published_at: Option<String>,
    pub html_url: String,
    /// Assets de la nightly equivalente (los que se pueden instalar).
    pub assets: Vec<BinaryAsset>,
    /// Asset recomendado para este equipo.
    pub recommended: Option<String>,
    /// Por que no hay assets, si es que no los hay.
    pub unavailable_reason: Option<String>,
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

// --- Catálogo de argumentos -------------------------------------------------

/// Argumentos reales del `llama-server` instalado.
#[tauri::command]
async fn server_help(state: State<'_, AppState>) -> CmdResult<arghelp::HelpCatalog> {
    let cfg = state.config.lock().await.clone();
    tokio::task::spawn_blocking(move || arghelp::read(&cfg))
        .await
        .map_err(|e| format!("Error leyendo el catálogo: {e}"))?
}

// --- Hugging Face -----------------------------------------------------------

#[tauri::command]
async fn hf_search(
    state: State<'_, AppState>,
    query: String,
    sort: Option<String>,
    limit: Option<u32>,
) -> CmdResult<Vec<hf::HfModelSummary>> {
    hf::search(
        &state.client,
        &query,
        sort.as_deref().unwrap_or("downloads"),
        limit.unwrap_or(24),
    )
    .await
}

/// Modelos populares de texto para la portada del buscador.
#[tauri::command]
async fn hf_popular(
    state: State<'_, AppState>,
    sort: Option<String>,
    limit: Option<u32>,
) -> CmdResult<Vec<hf::HfModelSummary>> {
    hf::popular(
        &state.client,
        sort.as_deref().unwrap_or("downloads"),
        limit.unwrap_or(12),
    )
    .await
}

#[tauri::command]
async fn hf_model(state: State<'_, AppState>, repo: String) -> CmdResult<hf::HfModelDetail> {
    hf::detail(&state.client, &repo).await
}

/// Descarga una o varias partes de una cuantización a la carpeta de modelos.
///
/// El progreso se emite por `hf-download-progress`.
#[tauri::command]
async fn hf_download(
    app: tauri::AppHandle,
    state: State<'_, AppState>,
    repo: String,
    paths: Vec<String>,
) -> CmdResult<hf::HfDownloadResult> {
    let models_dir = {
        let cfg = state.config.lock().await;
        cfg.models_dir
            .clone()
            .map(PathBuf::from)
            .unwrap_or_else(config::default_models_dir)
    };
    let progress_app = app.clone();
    hf::download(&state.client, &repo, &paths, &models_dir, move |progress| {
        let _ = progress_app.emit("hf-download-progress", progress);
    })
    .await
}

// --- Memoria ----------------------------------------------------------------

/// Estimación de memoria para un modelo y una configuración.
#[tauri::command]
async fn estimate_memory(
    model_path: String,
    ctx: u32,
    n_parallel: u32,
    cache_type_k: String,
    cache_type_v: String,
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
            &cache_type_k,
            &cache_type_v,
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
        format!(
            "No se encuentra llama-server. Se busco en: {}. Instala una version de llama.cpp primero.",
            cfg.llama_dir.as_deref().unwrap_or("(sin ruta)")
        )
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

// --- Despliegues (modelo + configuración) ----------------------------------

/// Lista los despliegues guardados.
#[tauri::command]
async fn list_deployments(state: State<'_, AppState>) -> CmdResult<Vec<config::Deployment>> {
    Ok(state.config.lock().await.deployments.clone())
}

/// Guarda un despliegue (nuevo o actualizado por su id).
#[tauri::command]
async fn save_deployment(
    state: State<'_, AppState>,
    deployment: config::Deployment,
) -> CmdResult<config::Deployment> {
    let mut cfg = state.config.lock().await;
    let mut deployment = deployment;
    if deployment.id.is_empty() {
        deployment.id = format!("d{}", now_millis());
    }
    if deployment.created_at == 0 {
        deployment.created_at = now_millis();
    }
    match cfg.deployments.iter().position(|d| d.id == deployment.id) {
        Some(i) => cfg.deployments[i] = deployment.clone(),
        None => cfg.deployments.push(deployment.clone()),
    }
    config::save(&cfg)?;
    Ok(deployment)
}

/// Elimina un despliegue.
#[tauri::command]
async fn delete_deployment(state: State<'_, AppState>, id: String) -> CmdResult<String> {
    let mut cfg = state.config.lock().await;
    cfg.deployments.retain(|d| d.id != id);
    if cfg.active_deployment_id.as_deref() == Some(id.as_str()) {
        cfg.active_deployment_id = None;
    }
    config::save(&cfg)?;
    Ok("Despliegue eliminado".to_string())
}

/// Aplica un despliegue: su configuración pasa a ser la configuración activa y
/// sus modelos quedan seleccionados.
#[tauri::command]
async fn apply_deployment(
    state: State<'_, AppState>,
    id: String,
) -> CmdResult<(AppConfig, config::Deployment)> {
    let mut cfg = state.config.lock().await;
    let Some(deployment) = cfg.deployments.iter().find(|d| d.id == id).cloned() else {
        return Err(format!("No existe el despliegue {id}"));
    };
    // Solo se sustituye la configuracion del SERVIDOR y los modelos
    // seleccionados. Las rutas (models_dir, llama_dir) son globales de la
    // app: un despliegue no puede cambiarlas.
    cfg.server = deployment.server.clone();
    cfg.last_model = deployment.model_path.clone();
    cfg.last_mmproj = deployment.mmproj_path.clone();
    cfg.last_draft_model = deployment.draft_path.clone();
    cfg.active_deployment_id = Some(deployment.id.clone());
    config::save(&cfg)?;
    Ok((cfg.clone(), deployment))
}

fn deployment_from_json(text: &str, fallback_name: &str) -> Result<config::Deployment, String> {
    let mut deployment = if let Ok(deployment) = serde_json::from_str::<config::Deployment>(text) {
        deployment
    } else if let Ok(app) = serde_json::from_str::<config::AppConfig>(text) {
        config::Deployment {
            id: String::new(),
            name: fallback_name.to_string(),
            model_path: app.last_model,
            mmproj_path: app.last_mmproj,
            draft_path: app.last_draft_model,
            server: app.server,
            notes: String::new(),
            created_at: 0,
        }
    } else {
        return Err("El archivo no contiene una configuración de EzLLM válida.".to_string());
    };

    deployment.id.clear();
    deployment.created_at = 0;
    if deployment.name.trim().is_empty() {
        deployment.name = fallback_name.to_string();
    }
    config::migrate_to_raw(&mut deployment.server);
    Ok(deployment)
}

/// Lee una configuración exportada y la convierte en un despliegue portátil.
///
/// Acepta tanto un despliegue exportado por la app como una configuración
/// global completa. El id se descarta para no pisar un preset existente.
#[tauri::command]
async fn read_deployment_file(path: String) -> CmdResult<config::Deployment> {
    let text = std::fs::read_to_string(&path)
        .map_err(|e| format!("No se pudo leer la configuración: {e}"))?;
    let file_path = PathBuf::from(&path);
    let fallback_name = file_path
        .file_stem()
        .and_then(|name| name.to_str())
        .filter(|name| !name.trim().is_empty())
        .unwrap_or("Configuración importada");
    deployment_from_json(&text, fallback_name)
}

/// Guarda un despliegue en un archivo JSON para compartirlo o conservarlo.
#[tauri::command]
async fn write_deployment_file(path: String, deployment: config::Deployment) -> CmdResult<String> {
    let text = serde_json::to_string_pretty(&deployment)
        .map_err(|e| format!("No se pudo serializar la configuración: {e}"))?;
    std::fs::write(&path, text)
        .map_err(|e| format!("No se pudo escribir la configuración: {e}"))?;
    Ok(path)
}

/// Duplica un despliegue para poder variants sin perder el original.
#[tauri::command]
async fn duplicate_deployment(
    state: State<'_, AppState>,
    id: String,
    new_name: String,
) -> CmdResult<config::Deployment> {
    let mut cfg = state.config.lock().await;
    let Some(source) = cfg.deployments.iter().find(|d| d.id == id).cloned() else {
        return Err(format!("No existe el despliegue {id}"));
    };
    let mut copy = source;
    copy.id = format!("d{}", now_millis());
    copy.name = new_name;
    copy.created_at = now_millis();
    cfg.deployments.push(copy.clone());
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

/// Instantánea de la telemetría del equipo y del servidor.
#[tauri::command]
async fn telemetry_snapshot(state: State<'_, AppState>) -> CmdResult<telemetry::Telemetry> {
    let cfg = state.config.lock().await.clone();
    let llama_server = current_llama_server(&cfg);
    let pid = crate::server::current_pid();
    Ok(telemetry::snapshot(llama_server.as_deref(), pid))
}

/// Slots ocupados del servidor en marcha.
#[tauri::command]
async fn telemetry_slots(
    state: State<'_, AppState>,
) -> CmdResult<Option<telemetry::SlotsState>> {
    let cfg = state.config.lock().await.clone();
    let (host, port) = crate::server::current_endpoint();
    if host.is_empty() {
        return Ok(None);
    }
    Ok(telemetry::slots_state(&host, port))
}

/// Velocidad real medida contra el servidor en marcha.
#[tauri::command]
async fn telemetry_speed(state: State<'_, AppState>) -> CmdResult<telemetry::SpeedResult> {
    let cfg = state.config.lock().await.clone();
    let (host, port) = crate::server::current_endpoint();
    if host.is_empty() {
        return Err("No hay ningún servidor en marcha".to_string());
    }
    telemetry::probe_speed(&host, port)
}

pub fn run() {
    env_logger::init();

    let client = reqwest::Client::builder()
        .user_agent("EzLLM")
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
            config_path,
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
            server_help,
            hf_search,
            hf_popular,
            hf_model,
            hf_download,
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
            telemetry_snapshot,
            telemetry_slots,
            telemetry_speed,
            list_deployments,
            save_deployment,
            delete_deployment,
            apply_deployment,
            duplicate_deployment,
            read_deployment_file,
            write_deployment_file,
        ])
        .run(tauri::generate_context!())
        .expect("error al iniciar EzLLM");
}

#[cfg(test)]
mod tests {
    use super::{StableRelease, deployment_from_json};
    use crate::config;

    #[test]
    fn deployment_file_imports_and_clears_identity() {
        let deployment = config::Deployment {
            id: "d1".into(),
            name: "Qwen 32k".into(),
            model_path: Some(r"C:\models\qwen.gguf".into()),
            mmproj_path: None,
            draft_path: None,
            server: config::ServerConfig {
                extra_args: "--jinja -c 32768".into(),
                raw_mode: true,
                ..config::ServerConfig::default()
            },
            notes: "importado".into(),
            created_at: 42,
        };

        let parsed =
            deployment_from_json(&serde_json::to_string(&deployment).unwrap(), "respaldo").unwrap();

        assert_eq!(parsed.name, "Qwen 32k");
        assert_eq!(parsed.model_path.as_deref(), Some(r"C:\models\qwen.gguf"));
        assert_eq!(parsed.server.extra_args, "--jinja -c 32768");
        assert_eq!(parsed.id, "");
        assert_eq!(parsed.created_at, 0);
    }

    #[test]
    fn app_config_file_can_be_imported_as_a_deployment() {
        let mut app = config::AppConfig::default();
        app.last_model = Some(r"C:\models\gemma.gguf".into());
        app.server.extra_args = "--metrics".into();

        let parsed = deployment_from_json(&serde_json::to_string(&app).unwrap(), "Gemma").unwrap();

        assert_eq!(parsed.name, "Gemma");
        assert_eq!(parsed.model_path.as_deref(), Some(r"C:\models\gemma.gguf"));
        assert_eq!(parsed.server.extra_args, "--metrics");
    }

    #[test]
    fn stable_release_serializes_its_fields_in_camel_case() {
        let release = StableRelease {
            tag: "v0.7.0".into(),
            nightly_tag: Some("b11669".into()),
            published_at: Some("2026-10-15T17:13:19Z".into()),
            html_url: "https://github.com/ggml-org/llama.cpp/releases/tag/v0.7.0".into(),
            assets: Vec::new(),
            recommended: None,
            unavailable_reason: None,
        };

        let value = serde_json::to_value(release).expect("StableRelease must serialize");
        assert_eq!(value["nightlyTag"], "b11669");
        assert_eq!(value["publishedAt"], "2026-10-15T17:13:19Z");
        assert_eq!(
            value["htmlUrl"],
            "https://github.com/ggml-org/llama.cpp/releases/tag/v0.7.0"
        );
        assert!(value.get("nightly_tag").is_none());
        assert!(value.get("published_at").is_none());
    }
}
