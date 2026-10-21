/** Envoltura sobre los comandos Tauri. Cada función es un comando real del backend. */
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import type {
  AppConfig,
  Bootstrap,
  CatalogView,
  DownloadProgress,
  HardwareReport,
  InstalledBuild,
  InstallResult,
  MemoryEstimate,
  Deployment,
  ModelInfo,
  ReleaseView,
  ServerStatus,
  StableRelease,
  Telemetry,
  SpeedResult,
  SlotsState,
} from "../types";

export const api = {
  // --- Configuración -----------------------------------------------------
  getConfig: () => invoke<AppConfig>("get_config"),
  setConfig: (config: AppConfig) => invoke<AppConfig>("set_config", { config }),
  defaultModelsDir: () => invoke<string>("default_models_dir"),
  defaultLlamaDir: () => invoke<string>("default_llama_dir"),
  bootstrap: () => invoke<Bootstrap>("bootstrap"),

  // --- Releases ----------------------------------------------------------
  listReleases: (perPage = 12) => invoke<ReleaseView[]>("list_releases", { perPage }),
  getRelease: (tag: string) => invoke<ReleaseView>("get_release", { tag }),
  resolveStableTag: (stableTag: string) =>
    invoke<string>("resolve_stable_tag", { stableTag }),
  listStableReleases: (perPage = 20) =>
    invoke<StableRelease[]>("list_stable_releases", { perPage }),

  // --- Instalación -------------------------------------------------------
  installRelease: (tag: string, assetName: string) =>
    invoke<InstallResult>("install_release", { tag, assetName }),
  listInstalled: () => invoke<InstalledBuild[]>("list_installed"),
  removeInstall: (tag: string) => invoke<string>("remove_install", { tag }),

  // --- Modelos -----------------------------------------------------------
  scanModels: (dir: string) => invoke<CatalogView>("scan_models", { dir }),
  inspectModel: (path: string) => invoke<ModelInfo>("inspect_model", { path }),
  findCompanions: (modelPath: string, dir: string) =>
    invoke<[string | null, string | null]>("find_companions", { modelPath, dir }),

  // --- Memoria -----------------------------------------------------------
  estimateMemory: (
    modelPath: string,
    ctx: number,
    nParallel: number,
    cacheType: string,
    ubatch: number,
    nGpuLayers: number | null,
  ) =>
    invoke<MemoryEstimate>("estimate_memory", {
      modelPath,
      ctx,
      nParallel,
      cacheType,
      ubatch,
      nGpuLayers,
    }),

  // --- Hardware ----------------------------------------------------------
  hardwareReport: () => invoke<HardwareReport>("hardware_report"),

  // --- Servidor ----------------------------------------------------------
  startServer: (modelPath: string | null, mmproj: string | null, draftModel: string | null) =>
    invoke<ServerStatus>("start_server", { modelPath, mmproj, draftModel }),
  stopServer: () => invoke<ServerStatus>("stop_server"),
  serverStatus: () => invoke<ServerStatus>("server_status"),
  serverLog: (lines = 120) => invoke<string>("server_log", { lines }),
  previewFlags: (
    modelPath: string | null,
    mmproj: string | null,
    draftModel: string | null,
  ) => invoke<string[]>("preview_flags", { modelPath, mmproj, draftModel }),
  contextSteps: (ctxMax: number) => invoke<number[]>("context_steps", { ctxMax }),

  // --- Despliegues --------------------------------------------------------
  listDeployments: () => invoke<Deployment[]>("list_deployments"),
  saveDeployment: (deployment: Deployment) =>
    invoke<Deployment>("save_deployment", { deployment }),
  deleteDeployment: (id: string) => invoke<string>("delete_deployment", { id }),
  applyDeployment: (id: string) =>
    invoke<[AppConfig, Deployment]>("apply_deployment", { id }),
  duplicateDeployment: (id: string, newName: string) =>
    invoke<Deployment>("duplicate_deployment", { id, newName }),

  // --- Telemetría ----------------------------------------------------------
  telemetrySnapshot: () => invoke<Telemetry>("telemetry_snapshot"),
  telemetrySlots: () => invoke<SlotsState | null>("telemetry_slots"),
  telemetrySpeed: () => invoke<SpeedResult>("telemetry_speed"),

  // --- Utilidades --------------------------------------------------------
  llamaServerPath: () => invoke<string | null>("llama_server_path"),
  listBinaries: (dir: string) => invoke<string[]>("list_binaries", { dir }),
  openFolder: (path: string) => invoke<void>("open_folder", { path }),
};

/** Evento de progreso de la descarga de llama.cpp. */
export function onInstallProgress(
  handler: (p: DownloadProgress) => void,
): () => void {
  const unlisten = listen<DownloadProgress>("install-progress", (e) => handler(e.payload));
  return () => {
    unlisten.then((fn) => fn()).catch(() => {});
  };
}
