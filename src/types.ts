/** Tipos que reflejan EXACTAMENTE las estructuras que devuelve el backend Rust. */

export type Backend = "cpu" | "vulkan" | "cuda" | "rocm" | "sycl" | "openvino" | "opencl";

export type PreferredBackend = "auto" | "vulkan" | "cuda" | "rocm" | "cpu";

export type ModelRole = "primary" | "mmproj" | "draft";

export interface ServerConfig {
  host: string;
  port: number;
  ctxSize: number;
  batchSize: number;
  ubatchSize: number;
  nParallel: number;
  nGpuLayers: number | null;
  threads: number | null;
  threadsBatch: number | null;
  flashAttn: string;
  cacheTypeK: string;
  cacheTypeV: string;
  device: string | null;
  splitMode: string;
  tensorSplit: string | null;
  multiGpu: boolean;
  loadMode: string;
  fit: string | null;
  alias: string | null;
  extraArgs: string;
}

/**
 * Un despliegue guardado: un modelo con su configuracion, sus modulos
 * opcionales y sus banderas. Se aplica de un clic.
 */
export interface Deployment {
  id: string;
  name: string;
  modelPath: string | null;
  mmprojPath: string | null;
  draftPath: string | null;
  server: ServerConfig;
  notes: string;
  createdAt: number;
}

export interface AppConfig {
  modelsDir: string | null;
  llamaDir: string | null;
  githubToken: string | null;
  preferredBackend: PreferredBackend;
  lastModel: string | null;
  lastMmproj: string | null;
  lastDraftModel: string | null;
  server: ServerConfig;
  deployments: Deployment[];
  activeDeploymentId: string | null;
  language: string;
}

export interface BinaryAsset {
  name: string;
  size: number;
  url: string;
  sha256: string | null;
  os: string;
  backend: Backend;
  arch: string;
  cudaVersion: string | null;
  isCudart: boolean;
  compatible: boolean;
  incompatibilityReason: string | null;
}

export interface ReleaseView {
  tag: string;
  title: string;
  prerelease: boolean;
  publishedAt: string | null;
  htmlUrl: string;
  assets: BinaryAsset[];
  totalSize: number;
  recommended: string | null;
}

export interface CatalogEntry {
  path: string;
  fileName: string;
  role: ModelRole;
  sizeBytes: number;
  sizeGb: number;
  arch: string;
  name: string;
  quant: string;
  quantBpw: number;
  nLayers: number;
  contextLength: number;
  nHeadKv: number;
  embeddingLength: number;
  slidingWindow: number;
  isMoe: boolean;
  nExpert: number;
  nExpertUsed: number;
  vocabSize: number;
  hasMtp: boolean;
  isMmproj: boolean;
  nParamsEst: number;
  error: string | null;
}

export interface CatalogView {
  entries: CatalogEntry[];
  primary: CatalogEntry[];
  mmproj: CatalogEntry[];
  draft: CatalogEntry[];
  scanned: string;
}

export interface GpuDevice {
  name: string;
  api: string;
  index: number;
  kind: string;
  vramTotalMib: number;
  vramFreeMib: number;
  source: string;
}

export interface CpuInfo {
  physicalCores: number | null;
  logicalThreads: number;
  model: string | null;
}

export interface RamInfo {
  totalBytes: number;
  availableBytes: number;
  totalGb: number;
  availableGb: number;
}

export interface AcceleratorInfo {
  hasVulkan: boolean;
  hasCuda: boolean;
  hasRocm: boolean;
  vulkaninfo: boolean;
}

export interface HardwareReport {
  gpu: GpuDevice[];
  cpu: CpuInfo;
  ram: RamInfo;
  accelerators: AcceleratorInfo;
  os: string;
  arch: string;
  llamaServer: string | null;
}

export interface MemoryEstimate {
  weightsGb: number;
  weightsGpuGb: number;
  weightsCpuGb: number;
  kvCacheGb: number;
  kvDenseGb: number;
  kvSwaGb: number;
  kvCacheMib: number;
  computeBufferGb: number;
  computeGpuMib: number;
  computeHostMib: number;
  vramRequestedGb: number;
  totalGb: number;
  ctxPadded: number;
  ctxPerSlot: number;
  nDenseLayers: number;
  nSwaLayers: number;
  bytesPerElement: number;
}

export interface ServerStatus {
  running: boolean;
  pid: number | null;
  port: number;
  host: string;
  logFile: string | null;
  startedAt: number | null;
  command: string[] | null;
  health: boolean;
  models: string[];
  error: string | null;
}

export interface InstalledBuild {
  tag: string;
  dir: string;
  llamaServer: string | null;
  installedAt: string | null;
}

export interface InstallResult {
  ok: boolean;
  installedDir: string;
  llamaServer: string | null;
  binaries: string[];
  error: string | null;
}

export interface DownloadProgress {
  downloaded: number;
  total: number;
  percent: number;
  bytesPerSec: number;
  phase: string;
}

export interface ModelInfo {
  file: string;
  fileName: string;
  sizeBytes: number;
  sizeGb: number;
  arch: string;
  name: string;
  quant: string;
  quantBpw: number;
  fileType: number;
  isMmproj: boolean;
  nLayers: number;
  nHead: number;
  nHeadKv: number;
  nEmbdHead: number;
  nEmbdHeadV: number;
  nEmbdHeadSwa: number;
  nEmbdHeadVSwa: number;
  embeddingLength: number;
  contextLength: number;
  slidingWindow: number;
  sharedKvLayers: number;
  slidingWindowPattern: boolean[];
  ropeDim: number;
  ffnLength: number;
  vocabSize: number;
  nExpert: number;
  nExpertUsed: number;
  isMoe: boolean;
  nParamsEst: number;
  lazyTensorMib: number;
  mtp: {
    hasMtp: boolean;
    isMtpFile: boolean;
    nPredictLayers: number | null;
    tensors: string[];
    nTensorsMtp: number;
    convention: string | null;
  };
  tensorGroups: { group: string; bytes: number; mib: number; tensors: number }[];
  nTensors: number;
}

export interface Bootstrap {
  config: AppConfig;
  installed: InstalledBuild[];
  defaults: { modelsDir: string; llamaDir: string };
}

/**
 * Una release estable y el tag nightly que trae los binarios.
 *
 * Las releases estables de llama.cpp no publican binarios: publican un asset
 * `nightly-tag.txt` con el tag `b#####` equivalente. El backend resuelve ese
 * puntero y trae los assets reales de esa nightly, para que se pueda
 * instalar una versión estable sin salir de la sección.
 */
export interface StableRelease {
  tag: string;
  nightlyTag: string | null;
  publishedAt: string | null;
  htmlUrl: string;
  assets: BinaryAsset[];
  recommended: string | null;
  unavailableReason: string | null;
}


/** Instantánea medida de la telemetría del equipo. */
export interface Telemetry {
  cpu: { percent: number };
  ram: { totalBytes: number; availableBytes: number; usedBytes: number };
  gpus: GpuDevice[];
  process: { pid: number; workingSetBytes: number; cpuSeconds: number } | null;
  timestampMs: number;
}

/** Velocidad real medida contra el servidor en marcha. */
export interface SpeedResult {
  promptPerSecond: number;
  predictedPerSecond: number;
  firstTokenMs: number;
  promptTokens: number;
  predictedTokens: number;
  totalMs: number;
}

/** Slots del servidor: cuántos están ocupados ahora mismo. */
export interface SlotsState {
  total: number;
  busy: number;
  nCtx: number;
}
