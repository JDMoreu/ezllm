import { useCallback, useEffect, useMemo, useState } from "react";
import clsx from "clsx";
import {
  Copy,
  FolderOpen,
  Layers,
  Save,
  Search,
  Trash2,
  Video,
  Zap,
} from "lucide-react";
import { open } from "@tauri-apps/plugin-dialog";

import { api } from "../lib/api";
import {
  Button,
  ConfirmDialog,
  Field,
  KeyValue,
  NumberField,
  PromptDialog,
  Section,
  SelectField,
  useToast,
} from "../components/ui";
import { LiveMeter } from "../components/Telemetry";
import { basename, formatBytes, formatGb, formatNumber } from "../lib/format";
import type {
  AppConfig,
  CatalogView,
  Deployment,
  HardwareReport,
  MemoryEstimate,
  ModelInfo,
  ServerConfig,
  ServerStatus,
} from "../types";

const CTX_STEPS = [1024, 2048, 4096, 8192, 16384, 32768, 65536, 131072, 262144];
const CACHE_TYPES = [
  { value: "f16", label: "F16 (por defecto)" },
  { value: "q8_0", label: "Q8_0 (más rápido, menos memoria)" },
  { value: "q5_1", label: "Q5_1" },
  { value: "q5_0", label: "Q5_0" },
  { value: "q4_1", label: "Q4_1" },
  { value: "q4_0", label: "Q4_0" },
  { value: "iq4_nl", label: "IQ4_NL" },
  { value: "f32", label: "F32 (máxima calidad)" },
];

export default function DeployView({
  config,
  server,
  hardware,
  modelsDir,
  onModelsDirChange,
  selectedModel,
  selectedMmproj,
  selectedDraft,
  onSelect,
  onConfigChange,
}: {
  config: AppConfig | null;
  server: ServerStatus | null;
  hardware: HardwareReport | null;
  modelsDir: string;
  onModelsDirChange: (d: string) => void;
  selectedModel: string | null;
  selectedMmproj: string | null;
  selectedDraft: string | null;
  onSelect: (m: string | null, mm: string | null, d: string | null) => void;
  onConfigChange: (c: AppConfig) => void;
}) {
  const toast = useToast();
  const [catalog, setCatalog] = useState<CatalogView | null>(null);
  const [, setScanning] = useState(false);
  const [query, setQuery] = useState("");
  const [estimate, setEstimate] = useState<MemoryEstimate | null>(null);
  const [flags, setFlags] = useState<string[]>([]);
  const [log, setLog] = useState("");
  const [deployments, setDeployments] = useState<Deployment[]>([]);
  const [activeId, setActiveId] = useState<string | null>(config?.activeDeploymentId ?? null);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<string | null>(null);
  const [naming, setNaming] = useState(false);

  const sc = config?.server;

  const loadDeployments = useCallback(async () => {
    try {
      setDeployments(await api.listDeployments());
    } catch (e) {
      toast.push(`No se pudieron cargar los presets: ${String(e)}`, "danger");
    }
  }, [toast]);

  useEffect(() => {
    void loadDeployments();
  }, [loadDeployments]);

  const scan = useCallback(async (dir: string) => {
    if (!dir) return;
    setScanning(true);
    try {
      setCatalog(await api.scanModels(dir));
    } catch (e) {
      toast.push(`No se pudo escanear: ${String(e)}`, "danger");
      setCatalog(null);
    } finally {
      setScanning(false);
    }
  }, [toast]);

  useEffect(() => {
    if (modelsDir) void scan(modelsDir);
  }, [modelsDir, scan]);

  const pickFolder = useCallback(async () => {
    try {
      const picked = await open({
        directory: true,
        multiple: false,
        defaultPath: modelsDir || undefined,
        title: "Elige la carpeta donde tienes los modelos",
      });
      if (typeof picked === "string" && picked) onModelsDirChange(picked);
    } catch (e) {
      toast.push(`No se pudo abrir el explorador: ${String(e)}`, "danger");
    }
  }, [modelsDir, onModelsDirChange, toast]);

  const pickFile = useCallback(
    async (slot: "primary" | "mmproj" | "draft") => {
      try {
        const picked = await open({
          multiple: false,
          filters: [{ name: "GGUF", extensions: ["gguf"] }],
          defaultPath: modelsDir || undefined,
          title:
            slot === "primary"
              ? "Elige el modelo principal"
              : slot === "mmproj"
                ? "Elige el proyector multimodal"
                : "Elige el bloque MTP / draft",
        });
        if (typeof picked !== "string" || !picked) return;
        const next = { model: selectedModel, mmproj: selectedMmproj, draft: selectedDraft };
        if (slot === "primary") next.model = picked;
        if (slot === "mmproj") next.mmproj = picked;
        if (slot === "draft") next.draft = picked;
        onSelect(next.model, next.mmproj, next.draft);
        toast.push("Modelo asignado", "success");
      } catch (e) {
        toast.push(`No se pudo abrir el explorador: ${String(e)}`, "danger");
      }
    },
    [modelsDir, selectedModel, selectedMmproj, selectedDraft, onSelect, toast],
  );

  useEffect(() => {
    if (!selectedModel || !sc) {
      setEstimate(null);
      return;
    }
    let alive = true;
    const id = setTimeout(async () => {
      try {
        const est = await api.estimateMemory(
          selectedModel,
          sc.ctxSize,
          sc.nParallel,
          sc.cacheTypeK,
          sc.ubatchSize,
          sc.nGpuLayers,
        );
        if (alive) setEstimate(est);
      } catch {
        if (alive) setEstimate(null);
      }
    }, 220);
    return () => {
      alive = false;
      clearTimeout(id);
    };
  }, [selectedModel, sc]);

  useEffect(() => {
    let alive = true;
    api
      .previewFlags(selectedModel, selectedMmproj, selectedDraft)
      .then((f) => alive && setFlags(f))
      .catch(() => alive && setFlags([]));
    return () => {
      alive = false;
    };
  }, [selectedModel, selectedMmproj, selectedDraft, config?.server]);

  useEffect(() => {
    let alive = true;
    const load = () =>
      api
        .serverLog(60)
        .then((t) => alive && setLog(t))
        .catch(() => {});
    void load();
    const id = setInterval(load, 4000);
    return () => {
      alive = false;
      clearInterval(id);
    };
  }, [server?.running, server?.startedAt]);

  const update = useCallback(
    (patch: Partial<ServerConfig>) => {
      if (!config) return;
      onConfigChange({ ...config, server: { ...config.server, ...patch } });
    },
    [config, onConfigChange],
  );

  const gpus = hardware?.gpu ?? [];

  const saveAsDeployment = useCallback(
    async (name: string) => {
    if (!config) return;
    if (!name.trim()) return;
    const dep: Deployment = {
      id: "",
      name,
      modelPath: selectedModel,
      mmprojPath: selectedMmproj,
      draftPath: selectedDraft,
      server: { ...config.server },
      notes: "",
      createdAt: 0,
    };
    try {
      const saved = await api.saveDeployment(dep);
      toast.push(`Preset «${saved.name}» guardado`, "success");
      setActiveId(saved.id);
      onConfigChange({ ...config, activeDeploymentId: saved.id });
      await loadDeployments();
    } catch (e) {
      toast.push(`No se pudo guardar: ${String(e)}`, "danger");
    }
  }, [config, selectedModel, selectedMmproj, selectedDraft, onConfigChange, toast, loadDeployments]);

  const applyDeployment = useCallback(
    async (d: Deployment) => {
      try {
        const [cfg] = await api.applyDeployment(d.id);
        onConfigChange(cfg);
        onSelect(cfg.lastModel, cfg.lastMmproj, cfg.lastDraftModel);
        setActiveId(d.id);
        toast.push(`Preset «${d.name}» aplicado`, "success");
      } catch (e) {
        toast.push(`No se pudo aplicar: ${String(e)}`, "danger");
      }
    },
    [onConfigChange, onSelect, toast],
  );

  const deleteDeployment = useCallback(
    async (id: string) => {
      try {
        await api.deleteDeployment(id);
        toast.push("Preset eliminado", "info");
        if (activeId === id) setActiveId(null);
        await loadDeployments();
      } catch (e) {
        toast.push(`No se pudo eliminar: ${String(e)}`, "danger");
      } finally {
        setPendingDelete(null);
      }
    },
    [activeId, loadDeployments, toast],
  );

  const [detail, setDetail] = useState<ModelInfo | null>(null);
  useEffect(() => {
    if (!selectedModel) {
      setDetail(null);
      return;
    }
    let alive = true;
    api
      .inspectModel(selectedModel)
      .then((d) => alive && setDetail(d))
      .catch(() => alive && setDetail(null));
    return () => {
      alive = false;
    };
  }, [selectedModel]);

  const visibleCatalog = useMemo(() => {
    if (!catalog) return [];
    const q = query.trim().toLowerCase();
    return catalog.entries.filter((e) => {
      if (!q) return true;
      return (
        e.fileName.toLowerCase().includes(q) ||
        e.name.toLowerCase().includes(q) ||
        e.quant.toLowerCase().includes(q) ||
        e.arch.toLowerCase().includes(q)
      );
    });
  }, [catalog, query]);

  if (!config || !sc) {
    return (
      <Section title="Cargando">
        <p className="py-6 text-center text-xs text-ink-400">Cargando…</p>
      </Section>
    );
  }

  return (
    <div className="space-y-4 animate-fade-up">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-lg font-semibold tracking-tight text-ink-100">Despliegue</h1>
          <p className="mt-1 max-w-2xl text-xs leading-relaxed text-ink-400">
            Un modelo, sus compañeros y la configuración del servidor. Guárdalo
            como despliegue para cargarlo de un clic la próxima vez.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {deployments.length > 0 && (
            <select
              className="field w-auto py-1 text-xs"
              value={activeId ?? ""}
              onChange={(e) => {
                const d = deployments.find((x) => x.id === e.target.value);
                if (d) void applyDeployment(d);
              }}
              aria-label="Despliegue activo"
            >
              <option value="">Sin despliegue</option>
              {deployments.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name}
                </option>
              ))}
            </select>
          )}
          <Button
            variant="primary"
            size="sm"
            icon={<Save size={13} />}
            onClick={() => setNaming(true)}
          >
            Guardar despliegue
          </Button>
        </div>
      </header>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_19rem]">
        {/* ==================== COLUMNA PRINCIPAL ==================== */}
        <div className="space-y-4">
          {/* ---------- MODELO ---------- */}
          <Section
            title="Modelo"
            description="El GGUF con los pesos. Los compañeros son opcionales y sedetectan por nombre."
            actions={
              <Button
                size="sm"
                variant="quiet"
                icon={<FolderOpen size={12} />}
                onClick={pickFolder}
              >
                Carpeta
              </Button>
            }
          >
            <div className="space-y-2.5">
              <ModelSlot
                label="Principal"
                value={selectedModel}
                role="primary"
                onPick={() => pickFile("primary")}
                onClear={() => onSelect(null, selectedMmproj, selectedDraft)}
                hint="El modelo que se carga en memoria."
              />
              <ModelSlot
                label="Proyector multimodal"
                value={selectedMmproj}
                role="mmproj"
                onPick={() => pickFile("mmproj")}
                onClear={() => onSelect(selectedModel, null, selectedDraft)}
                hint="Añade visión, audio y vídeo."
              />
              <ModelSlot
                label="MTP / draft"
                value={selectedDraft}
                role="draft"
                onPick={() => pickFile("draft")}
                onClear={() => onSelect(selectedModel, selectedMmproj, null)}
                hint="Genera tokens por adelantado para ir más rápido."
              />
            </div>

            {/* Catálogo: solo si hay algo que mostrar */}
            {catalog && catalog.entries.length > 0 && (
              <div className="mt-4 border-t border-base-800 pt-3">
                <div className="mb-2 flex flex-wrap items-center gap-2">
                  <div className="relative min-w-[14rem] flex-1">
                    <Search
                      size={13}
                      className="pointer-events-none absolute top-1/2 left-2.5 -translate-y-1/2 text-ink-500"
                    />
                    <input
                      className="field pl-8 text-xs"
                      placeholder="Filtrar por nombre, arquitectura o cuantización"
                      value={query}
                      onChange={(e) => setQuery(e.target.value)}
                    />
                  </div>
                  <span className="text-[0.75rem] text-ink-400">
                    {visibleCatalog.length} de {catalog.entries.length}
                  </span>
                </div>
                <ul className="-mx-1 max-h-56 overflow-y-auto">
                  {visibleCatalog.slice(0, 50).map((e) => {
                    const assigned =
                      (e.role === "primary" && e.path === selectedModel) ||
                      (e.role === "mmproj" && e.path === selectedMmproj) ||
                      (e.role === "draft" && e.path === selectedDraft);
                    return (
                      <li key={e.path}>
                        <button
                          onClick={() => {
                            if (e.role === "primary")
                              onSelect(e.path, selectedMmproj, selectedDraft);
                            else if (e.role === "mmproj")
                              onSelect(selectedModel, e.path, selectedDraft);
                            else onSelect(selectedModel, selectedMmproj, e.path);
                          }}
                          className="flex w-full cursor-pointer items-center gap-2.5 rounded-md px-2 py-1.5 text-left transition-colors duration-150 hover:bg-base-850"
                        >
                          <span
                            className={clsx(
                              "flex h-5 w-5 shrink-0 items-center justify-center rounded",
                              e.role === "primary"
                                ? "bg-accent-500/14 text-accent-400"
                                : e.role === "mmproj"
                                  ? "bg-violet-500/14 text-violet-400"
                                  : "bg-info-500/14 text-info-400",
                            )}
                          >
                            {e.role === "primary" ? (
                              <Layers size={11} />
                            ) : e.role === "mmproj" ? (
                              <Video size={11} />
                            ) : (
                              <Zap size={11} />
                            )}
                          </span>
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-xs text-ink-200">
                              {e.fileName}
                            </span>
                            <span className="block truncate text-[0.75rem] text-ink-500">
                              {e.quant} · {e.arch} · {formatBytes(e.sizeBytes)}
                            </span>
                          </span>
                          {assigned && (
                            <span className="chip chip-accent shrink-0">Asignado</span>
                          )}
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </div>
            )}

            {detail && (
              <div className="mt-3 border-t border-base-800 pt-3 text-[0.75rem] text-ink-400">
                <span className="font-medium text-ink-300">
                  {detail.fileName} · {detail.arch} · {detail.quant}
                </span>
                <span className="ml-2">
                  {detail.nLayers} capas · ctx{" "}
                  {detail.contextLength.toLocaleString("es-ES")} ·{" "}
                  {formatNumber(detail.nParamsEst)} parámetros
                  {detail.mtp?.hasMtp && " · con MTP"}
                  {detail.isMmproj && " · proyector multimodal"}
                </span>
              </div>
            )}
          </Section>

          {/* ---------- CAPACIDAD ---------- */}
          <Section
            title="Memoria y capacidad"
            description="Cuánto recuerda el modelo y cuánto ocupa la caché."
          >
            <div className="grid gap-4 sm:grid-cols-2">
              <SelectField
                label="Contexto"
                value={String(sc.ctxSize)}
                onChange={(v) => update({ ctxSize: Number(v) })}
                options={CTX_STEPS.map((s) => ({
                  value: String(s),
                  label: `${s.toLocaleString("es-ES")} tokens`,
                }))}
                hint="Se alinea a múltiplos de 256."
              />
              <NumberField
                label="Sesiones en paralelo"
                value={sc.nParallel}
                onChange={(v) => update({ nParallel: v })}
                min={1}
                max={64}
                hint={
                  sc.nParallel > 1
                    ? "La caché reserva memoria por sesión: el consumo sube."
                    : "Peticiones simultáneas."
                }
              />
              <NumberField
                label="Tamaño de lote"
                value={sc.batchSize}
                onChange={(v) => update({ batchSize: v })}
                min={32}
                max={65536}
                step={32}
                suffix="tokens"
                hint="Tokens por tanda."
              />
              <NumberField
                label="Micro-lote"
                value={sc.ubatchSize}
                onChange={(v) => update({ ubatchSize: v })}
                min={32}
                max={8192}
                step={32}
                suffix="tokens"
                hint="Sub-bloque de cómputo."
              />
            </div>
          </Section>

          {/* ---------- GPU ---------- */}
          <Section
            title="Tarjeta gráfica"
            description="Dónde se carga el modelo y cómo se reparte entre las tarjetas."
          >
            <div className="space-y-4">
              {gpus.length === 0 ? (
                <p className="py-2 text-xs text-ink-400">
                  No se ha detectado ninguna GPU. Se usará el dispositivo por
                  defecto de llama.cpp.
                </p>
              ) : (
                <div className="space-y-1.5">
                  {gpus.map((g) => {
                    const id = `${g.api}${g.index}`;
                    const on = (sc.device ?? "").split(",").includes(id);
                    return (
                      <button
                        key={id}
                        onClick={() => {
                          const cur = (sc.device ?? "").split(",").filter(Boolean);
                          const next = on ? cur.filter((s) => s !== id) : [...cur, id];
                          const ordered = gpus
                            .map((x) => `${x.api}${x.index}`)
                            .filter((i) => next.includes(i));
                          update({
                            device: ordered.length === 0 ? null : ordered.join(","),
                          });
                        }}
                        className={clsx(
                          "flex w-full cursor-pointer items-center gap-2.5 rounded-lg border px-2.5 py-2 text-left transition-colors duration-150",
                          on
                            ? "border-accent-500/45 bg-accent-500/10"
                            : "border-base-800 bg-base-950 hover:border-base-700",
                        )}
                        aria-pressed={on}
                      >
                        <span
                          className={clsx(
                            "flex h-4 w-4 shrink-0 items-center justify-center rounded border",
                            on ? "border-accent-500 bg-accent-500" : "border-base-700",
                          )}
                        >
                          {on && (
                            <svg width="10" height="10" viewBox="0 0 24 24" fill="none">
                              <path
                                d="m5 13 4 4L19 7"
                                stroke="#08091c"
                                strokeWidth="3.5"
                                strokeLinecap="round"
                                strokeLinejoin="round"
                              />
                            </svg>
                          )}
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-xs text-ink-100">
                            {g.name}
                          </span>
                          <span className="mt-0.5 flex flex-wrap items-center gap-1.5">
                            <span className="mono text-[0.75rem] text-ink-500">
                              {id}
                            </span>
                            <span className="chip">
                              {g.kind === "discrete"
                                ? "Dedicada"
                                : g.kind === "integrated"
                                  ? "Integrada"
                                  : g.kind}
                            </span>
                            {g.vramTotalMib > 0 && (
                              <span className="mono text-[0.75rem] text-ink-500">
                                {(g.vramTotalMib / 1024).toFixed(1)} GB
                              </span>
                            )}
                          </span>
                        </span>
                      </button>
                    );
                  })}
                </div>
              )}

              <div className="grid gap-4 sm:grid-cols-2">
                <SelectField
                  label="Capas en la GPU"
                  value={sc.nGpuLayers === null ? "auto" : String(sc.nGpuLayers)}
                  onChange={(v) =>
                    update({ nGpuLayers: v === "auto" ? null : Number(v) })
                  }
                  options={[
                    { value: "auto", label: "Automático" },
                    ...Array.from({ length: 65 }, (_, i) => ({
                      value: String(i),
                      label: i === 0 ? "0 (solo CPU)" : `${i} capas`,
                    })),
                  ]}
                  hint="Todas las capas es lo más rápido, si la VRAM alcanza."
                />
                <SelectField
                  label="Flash Attention"
                  value={sc.flashAttn}
                  onChange={(v) => update({ flashAttn: v })}
                  options={[
                    { value: "auto", label: "Automático" },
                    { value: "on", label: "Activado" },
                    { value: "off", label: "Desactivado" },
                  ]}
                  hint="Acelera la atención y ahorra memoria en contextos largos."
                />
                <SelectField
                  label="Tipo de caché K"
                  value={sc.cacheTypeK}
                  onChange={(v) => update({ cacheTypeK: v })}
                  options={CACHE_TYPES}
                  hint="Cuantizar la caché reduce la VRAM a costa de calidad."
                />
                <SelectField
                  label="Tipo de caché V"
                  value={sc.cacheTypeV}
                  onChange={(v) => update({ cacheTypeV: v })}
                  options={CACHE_TYPES}
                />
              </div>

              {gpus.length > 1 && (
                <label className="flex cursor-pointer items-start gap-2.5">
                  <input
                    type="checkbox"
                    className="mt-0.5 h-4 w-4 shrink-0 cursor-pointer accent-accent-500"
                    checked={sc.multiGpu}
                    onChange={(e) => update({ multiGpu: e.target.checked })}
                  />
                  <span className="min-w-0">
                    <span className="block text-xs font-medium text-ink-100">
                      Repartir el modelo entre las tarjetas
                    </span>
                    <span className="mt-0.5 block text-[0.75rem] leading-relaxed text-ink-400">
                      Las capas se reparten entre las GPUs seleccionadas. Con dos
                      tarjetas de 16 GB puedes cargar un modelo que no cabe en
                      una sola.
                    </span>
                  </span>
                </label>
              )}

              {sc.multiGpu && (
                <div className="grid gap-4 sm:grid-cols-2">
                  <Field
                    label="Reparto (tensor-split)"
                    hint="Proporción de capas por dispositivo, separada por comas. Con 2 GPUs: 1,1 (mitad y mitad), 3,1 (75% en la primera)."
                  >
                    <input
                      className="field mono"
                      value={sc.tensorSplit ?? ""}
                      placeholder="1,1"
                      onChange={(e) =>
                        update({ tensorSplit: e.target.value || null })
                      }
                    />
                  </Field>
                  <SelectField
                    label="Unidad de reparto"
                    value={sc.splitMode}
                    onChange={(v) => update({ splitMode: v })}
                    options={[
                      { value: "layer", label: "Por capas" },
                      { value: "row", label: "Por filas" },
                    ]}
                    hint="Por capas reparte de forma más equilibrada."
                  />
                </div>
              )}
            </div>
          </Section>

          {/* ---------- AVANZADO ---------- */}
          <Section
            title="Avanzado"
            description="Lo que casi nunca se toca: hilos, red y argumentos libres."
            actions={
              <button
                onClick={() => setShowAdvanced((v) => !v)}
                className="btn-quiet cursor-pointer rounded px-2 py-1 text-xs text-ink-300 hover:text-ink-100"
              >
                {showAdvanced ? "Ocultar" : "Mostrar"}
              </button>
            }
          >
            {showAdvanced ? (
              <div className="space-y-4">
                <div className="grid gap-4 sm:grid-cols-2">
                  <NumberField
                    label="Hilos (generación)"
                    value={sc.threads ?? 0}
                    onChange={(v) => update({ threads: v > 0 ? v : null })}
                    min={0}
                    suffix={sc.threads ? "hilos" : "auto"}
                    hint="0 usa todos los núcleos físicos."
                  />
                  <NumberField
                    label="Hilos (lote)"
                    value={sc.threadsBatch ?? 0}
                    onChange={(v) => update({ threadsBatch: v > 0 ? v : null })}
                    min={0}
                    suffix={sc.threadsBatch ? "hilos" : "auto"}
                  />
                  <SelectField
                    label="Dirección"
                    value={sc.host}
                    onChange={(v) => update({ host: v })}
                    options={[
                      { value: "127.0.0.1", label: "127.0.0.1 (solo este equipo)" },
                      { value: "0.0.0.0", label: "0.0.0.0 (accesible en la red)" },
                    ]}
                    hint="Escuchar en la red expone el modelo a otros equipos."
                  />
                  <NumberField
                    label="Puerto"
                    value={sc.port}
                    onChange={(v) => update({ port: v })}
                    min={1024}
                    max={65535}
                  />
                </div>
                <Field label="Alias del modelo">
                  <input
                    className="field"
                    placeholder="mi-modelo"
                    value={sc.alias ?? ""}
                    onChange={(e) => update({ alias: e.target.value || null })}
                  />
                </Field>
                <Field
                  label="Argumentos adicionales"
                  hint='Se añaden al final del comando, así que pisan lo que genere la app. Admite comillas. Ejemplo: --temp 0.7 --top-p 0.9 --jinja "-cnv"'
                >
                  <input
                    className="field mono text-xs"
                    value={sc.extraArgs}
                    placeholder="--temp 0.7 --top-p 0.9"
                    onChange={(e) => update({ extraArgs: e.target.value })}
                  />
                </Field>
              </div>
            ) : (
              <p className="text-xs text-ink-400">
                Hilos, dirección, puerto, alias y argumentos libres.
              </p>
            )}
          </Section>
        </div>

        {/* ==================== COLUMNA LATERAL ==================== */}
        <div className="space-y-4">
          {/* ---------- MEMORIA ESTIMADA ---------- */}
          <Section
            title="Memoria estimada"
            description={selectedModel ? basename(selectedModel) : "Selecciona un modelo"}
          >
            {!estimate ? (
              <p className="py-6 text-center text-xs text-ink-400">
                Selecciona un modelo para ver cuánto ocupará.
              </p>
            ) : (
              <div className="space-y-3">
                <div>
                  <p className="text-[0.75rem] tracking-wide text-ink-400 uppercase">
                    Total
                  </p>
                  <p className="mono mt-1 text-2xl leading-none font-semibold text-ink-100">
                    {formatGb(estimate.totalGb)}
                  </p>
                </div>
                <LiveMeter
                  value={estimate.weightsGpuGb}
                  max={
                    estimate.weightsGpuGb +
                    estimate.kvCacheGb +
                    estimate.computeBufferGb
                  }
                  label="En la GPU"
                  valueLabel={formatGb(
                    estimate.weightsGpuGb +
                      estimate.kvCacheGb +
                      estimate.computeBufferGb,
                  )}
                />
                <dl className="space-y-0.5 border-t border-base-800 pt-2">
                  <KeyValue label="Pesos en GPU" value={formatGb(estimate.weightsGpuGb)} mono />
                  <KeyValue label="Pesos en CPU" value={formatGb(estimate.weightsCpuGb)} mono />
                  <KeyValue
                    label="Caché KV"
                    value={`${estimate.kvCacheMib.toFixed(0)} MiB`}
                    mono
                  />
                  <KeyValue label="— densas" value={formatGb(estimate.kvDenseGb)} mono />
                  <KeyValue label="— deslizante" value={formatGb(estimate.kvSwaGb)} mono />
                  <KeyValue
                    label="Compute buffer"
                    value={formatGb(estimate.computeBufferGb)}
                    mono
                  />
                </dl>
                <p className="border-t border-base-800 pt-2 text-[0.75rem] leading-relaxed text-ink-400">
                  Contexto efectivo{" "}
                  {estimate.ctxPadded.toLocaleString("es-ES")} tokens
                  {estimate.nSwaLayers > 0 && (
                    <>
                      , {estimate.nDenseLayers} capas densas y{" "}
                      {estimate.nSwaLayers} con ventana deslizante
                    </>
                  )}
                  .
                </p>
              </div>
            )}
          </Section>

          {/* ---------- COMANDO ---------- */}
          <Section
            title="Comando"
            description="Lo que se pasa exactamente a llama-server."
            actions={
              flags.length > 0 && (
                <button
                  onClick={() => {
                    navigator.clipboard
                      .writeText(flags.join(" "))
                      .then(() => toast.push("Comando copiado", "success"))
                      .catch(() => toast.push("No se pudo copiar", "danger"));
                  }}
                  className="btn-quiet cursor-pointer rounded p-1.5 text-ink-400 hover:text-ink-100"
                  title="Copiar el comando"
                  aria-label="Copiar el comando"
                >
                  <Copy size={13} />
                </button>
              )
            }
          >
            {flags.length === 0 ? (
              <p className="py-3 text-center text-xs text-ink-400">Sin flags.</p>
            ) : (
              <div className="mono max-h-52 overflow-y-auto rounded-md bg-base-950 p-2.5 text-[0.75rem] leading-relaxed break-all text-ink-300">
                {flags.map((f, i) => (
                  <span key={i}>
                    <span className="text-accent-400">{f}</span>
                    {i < flags.length - 1 && " "}
                  </span>
                ))}
              </div>
            )}
          </Section>

          {/* ---------- DESPLIEGUES GUARDADOS ---------- */}
          {deployments.length > 0 && (
            <Section
              title="Guardados"
              description="Aplica uno y arranca."
            >
              <ul className="-mx-1">
                {deployments.map((d) => (
                  <li key={d.id} className="row flex items-center gap-2 px-1 py-2">
                    <button
                      onClick={() => applyDeployment(d)}
                      className="min-w-0 flex-1 cursor-pointer text-left"
                    >
                      <span className="block truncate text-xs text-ink-100">
                        {d.name}
                      </span>
                      <span className="block truncate text-[0.75rem] text-ink-500">
                        {d.modelPath ? basename(d.modelPath) : "Sin modelo"} ·{" "}
                        {(d.server.ctxSize / 1024).toFixed(0)}k
                      </span>
                    </button>
                    <button
                      onClick={() => setPendingDelete(d.id)}
                      className="btn-quiet cursor-pointer rounded p-1.5 text-ink-500 hover:text-danger-400"
                      aria-label={`Eliminar ${d.name}`}
                      title="Eliminar"
                    >
                      <Trash2 size={13} />
                    </button>
                  </li>
                ))}
              </ul>
            </Section>
          )}

          {/* ---------- REGISTRO ---------- */}
          {server?.running && (
            <Section title="Registro" description={server.logFile ?? undefined}>
              <pre className="mono max-h-48 overflow-auto rounded-md bg-base-950 p-2.5 text-[0.75rem] leading-relaxed text-ink-400">
                {log || "Sin líneas todavía."}
              </pre>
            </Section>
          )}
        </div>
      </div>

      <PromptDialog
        open={naming}
        title="Guardar despliegue"
        label="Nombre"
        defaultValue={selectedModel ? basename(selectedModel).replace(/\.gguf$/i, "") : ""}
        placeholder="Gemma 32k en la RX 9070"
        confirmLabel="Guardar"
        onConfirm={(name) => {
          setNaming(false);
          void saveAsDeployment(name);
        }}
        onCancel={() => setNaming(false)}
      />

      <ConfirmDialog
        open={pendingDelete !== null}
        title="Eliminar despliegue"
        message="Se borra el despliegue guardado. Los modelos y la configuración actual no se tocan."
        confirmLabel="Eliminar"
        danger
        onConfirm={() => pendingDelete && void deleteDeployment(pendingDelete)}
        onCancel={() => setPendingDelete(null)}
      />
    </div>
  );
}

function ModelSlot({
  label,
  value,
  role,
  onPick,
  onClear,
  hint,
}: {
  label: string;
  value: string | null;
  role: "primary" | "mmproj" | "draft";
  onPick: () => void;
  onClear: () => void;
  hint: string;
}) {
  const Icon = role === "primary" ? Layers : role === "mmproj" ? Video : Zap;
  const tone =
    role === "primary"
      ? "text-accent-400 bg-accent-500/12"
      : role === "mmproj"
        ? "text-violet-400 bg-violet-500/12"
        : "text-info-400 bg-info-500/12";

  return (
    <div className="flex items-start gap-2.5">
      <span
        className={clsx(
          "mt-6 flex h-7 w-7 shrink-0 items-center justify-center rounded-md",
          tone,
        )}
      >
        <Icon size={13} />
      </span>
      <div className="min-w-0 flex-1">
        <label className="label">{label}</label>
        <div className="flex gap-1.5">
          <input
            className="field mono text-xs"
            value={value ? basename(value) : ""}
            placeholder="Sin asignar"
            readOnly
            title={value ?? undefined}
          />
          <button
            onClick={onPick}
            className="btn-quiet flex shrink-0 cursor-pointer items-center gap-1.5 rounded-md border border-base-700 px-2 text-ink-300 transition-colors duration-150 hover:border-accent-500/50 hover:text-ink-100"
            title="Buscar en el explorador"
            aria-label={`Buscar ${label}`}
          >
            <FolderOpen size={14} />
          </button>
          {value && (
            <button
              onClick={onClear}
              className="btn-quiet flex shrink-0 cursor-pointer items-center rounded-md border border-base-700 px-2 text-ink-400 transition-colors duration-150 hover:border-danger-500/50 hover:text-danger-400"
              aria-label={`Quitar ${label}`}
              title="Quitar"
            >
              <Trash2 size={14} />
            </button>
          )}
        </div>
        <p className="mt-1 text-[0.75rem] text-ink-500">{hint}</p>
      </div>
    </div>
  );
}
