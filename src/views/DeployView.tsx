import { useCallback, useEffect, useMemo, useState } from "react";
import clsx from "clsx";
import {
  Copy,
  FolderOpen,
  Layers,
  Play,
  Save,
  Search,
  Square,
  Trash2,
  Video,
  MemoryStick,
  Zap,
} from "lucide-react";
import { open } from "@tauri-apps/plugin-dialog";

import { api } from "../lib/api";
import {
  Button,
  Card,
  ConfirmDialog,
  Field,
  Meter,
  NumberField,
  SelectField,
  useToast,
} from "../components/ui";
import { basename, formatBytes, formatGb, formatNumber } from "../lib/format";
import type {
  AppConfig,
  CatalogView,
  HardwareReport,
  MemoryEstimate,
  Deployment,
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
  onStart,
  onStop,
  busy,
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
  onStart: () => void;
  onStop: () => void;
  busy: boolean;
}) {
  const toast = useToast();
  const [catalog, setCatalog] = useState<CatalogView | null>(null);
  const [scanning, setScanning] = useState(false);
  const [query, setQuery] = useState("");
  const [estimate, setEstimate] = useState<MemoryEstimate | null>(null);
  const [flags, setFlags] = useState<string[]>([]);
  const [log, setLog] = useState("");
  const [profiles, setProfiles] = useState<Deployment[]>([]);
  const [activeProfile, setActiveProfile] = useState<string | null>((config as any)?.activeProfileId ?? null);
  const [pendingDelete, setPendingDelete] = useState<string | null>(null);

  const sc = config?.server;

  // --- Carga de perfiles ---
  const loadProfiles = useCallback(async () => {
    try {
      setProfiles(await api.listProfiles());
    } catch (e) {
      toast.push(`No se pudieron cargar los perfiles: ${String(e)}`, "danger");
    }
  }, [toast]);

  useEffect(() => {
    void loadProfiles();
  }, [loadProfiles]);

  // --- Escaneo de modelos ---
  const scan = useCallback(
    async (dir: string) => {
      if (!dir) return;
      setScanning(true);

      try {
        setCatalog(await api.scanModels(dir));
      } catch (e) {
          setCatalog(null);
      } finally {
        setScanning(false);
      }
    },
    [],
  );

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
      if (typeof picked === "string" && picked) {
        onModelsDirChange(picked);
      }
    } catch (e) {
      toast.push(`No se pudo abrir el explorador: ${String(e)}`, "danger");
    }
  }, [modelsDir, onModelsDirChange, toast]);

  // --- Estimación de memoria en vivo ---
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

  // --- Flags en vivo ---
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

  // --- Log del servidor ---
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

  // --- Guardar perfil ---
  const saveAsProfile = useCallback(async () => {
    if (!config) return;
    const name = window.prompt("Nombre del perfil:", "Mi despliegue")?.trim();
    if (!name) return;
    const profile: Deployment = {
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
      const saved = await api.saveProfile(profile);
      toast.push(`Perfil «${saved.name}» guardado`, "success");
      setActiveProfile(saved.id);
      onConfigChange({ ...config, activeProfileId: saved.id } as any);
      await loadProfiles();
    } catch (e) {
      toast.push(`No se pudo guardar: ${String(e)}`, "danger");
    }
  }, [config, selectedModel, selectedMmproj, selectedDraft, onConfigChange, toast, loadProfiles]);

  const applyProfile = useCallback(
    async (p: Deployment) => {
      try {
        const [cfg] = await api.applyProfile(p.id);
        onConfigChange(cfg);
        onSelect(p.modelPath, p.mmprojPath, p.draftPath);
        setActiveProfile(p.id);
        toast.push(`Perfil «${p.name}» aplicado`, "success");
      } catch (e) {
        toast.push(`No se pudo aplicar: ${String(e)}`, "danger");
      }
    },
    [onConfigChange, onSelect, toast],
  );

  const deleteProfile = useCallback(
    async (id: string) => {
      try {
        await api.deleteProfile(id);
        toast.push("Perfil eliminado", "info");
        if (activeProfile === id) setActiveProfile(null);
        await loadProfiles();
      } catch (e) {
        toast.push(`No se pudo eliminar: ${String(e)}`, "danger");
      } finally {
        setPendingDelete(null);
      }
    },
    [activeProfile, loadProfiles, toast],
  );

  // --- Detalle del modelo seleccionado ---
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

  if (!config || !sc) {
    return (
      <Card>
        <p className="py-6 text-center text-xs text-ink-400">Cargando…</p>
      </Card>
    );
  }

  return (
    <div className="space-y-5">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-lg font-semibold tracking-tight text-ink-100">Despliegue</h1>
          <p className="mt-1 max-w-2xl text-xs leading-relaxed text-ink-400">
            Todo lo que necesita un despliegue: el modelo, sus compañeros y la
            configuración. Guárdalo como perfil y cárgalo de un clic cuando
            quieras.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {profiles.length > 0 && (
            <select
              className="field w-auto py-1 text-xs"
              value={activeProfile ?? ""}
              onChange={(e) => {
                const p = profiles.find((x) => x.id === e.target.value);
                if (p) void applyProfile(p);
              }}
            >
              <option value="">Sin perfil</option>
              {profiles.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          )}
          <Button
            variant="primary"
            size="sm"
            icon={<Save size={13} />}
            onClick={saveAsProfile}
          >
            Guardar como perfil
          </Button>
        </div>
      </header>

      {/* ===================== 1. MODELOS ===================== */}
      <Card
        title="1. Modelos"
        subtitle="El modelo base y, si los tienes, el proyector multimodal y el bloque MTP."
      >
        <div className="space-y-3">
          <ModelSlot
            label="Modelo principal"
            value={selectedModel}
            onPick={() => pickFile("primary")}
            onClear={() => onSelect(null, selectedMmproj, selectedDraft)}
            hint="El GGUF con los pesos del modelo."
          />
          <ModelSlot
            label="Proyector multimodal (mmproj)"
            value={selectedMmproj}
            onPick={() => pickFile("mmproj")}
            onClear={() => onSelect(selectedModel, null, selectedDraft)}
            hint="Añade visión, audio y vídeo. Opcional."
          />
          <ModelSlot
            label="MTP / draft"
            value={selectedDraft}
            onPick={() => pickFile("draft")}
            onClear={() => onSelect(selectedModel, selectedMmproj, null)}
            hint="Acelera la generación especulando tokens. Opcional."
          />
        </div>

        {/* Carpeta de escaneo */}
        <div className="mt-4 flex flex-wrap items-end gap-3 border-t border-base-800 pt-4">
          <div className="min-w-[16rem] flex-1">
            <label className="label" htmlFor="models-dir">
              Carpeta de modelos
            </label>
            <div className="relative">
              <input
                id="models-dir"
                className="field mono pr-10 text-xs"
                value={modelsDir}
                onChange={(e) => onModelsDirChange(e.target.value)}
                placeholder="C:\\Users\\...\\modelos"
              />
              <button
                onClick={pickFolder}
                className="btn-quiet absolute top-1/2 right-1 -translate-y-1/2 cursor-pointer rounded p-1.5 text-ink-400 hover:text-ink-100"
                title="Buscar carpeta"
                aria-label="Buscar carpeta"
              >
                <FolderOpen size={15} />
              </button>
            </div>
          </div>
          <Button
            variant="quiet"
            size="sm"
            icon={<FolderOpen size={13} />}
            onClick={() => api.openFolder(modelsDir)}
            disabled={!modelsDir}
          >
            Abrir
          </Button>
          <Button
            size="sm"
            icon={<Search size={13} />}
            onClick={() => scan(modelsDir)}
            loading={scanning}
          >
            Escanear
          </Button>
        </div>

        {/* Catálogo */}
        {catalog && catalog.entries.length > 0 && (
          <div className="mt-4 space-y-2 border-t border-base-800 pt-4">
            <div className="flex flex-wrap items-center gap-2">
              <input
                className="field flex-1 text-xs"
                placeholder="Filtrar por nombre, arquitectura o cuantización…"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
              <span className="text-[0.6875rem] text-ink-500">
                {visibleCatalog.length} de {catalog.entries.length}
              </span>
            </div>
            <ul className="max-h-44 divide-y divide-base-800 overflow-y-auto rounded-lg border border-base-800">
              {visibleCatalog.slice(0, 40).map((e) => (
                <li key={e.path}>
                  <button
                    onClick={() => {
                      if (e.role === "primary") onSelect(e.path, selectedMmproj, selectedDraft);
                      else if (e.role === "mmproj") onSelect(selectedModel, e.path, selectedDraft);
                      else onSelect(selectedModel, selectedMmproj, e.path);
                    }}
                    className="flex w-full cursor-pointer items-center gap-2.5 px-3 py-2 text-left text-xs transition-colors duration-200 hover:bg-base-850"
                  >
                    <span
                      className={clsx(
                        "flex h-6 w-6 shrink-0 items-center justify-center rounded-md",
                        e.role === "primary"
                          ? "bg-accent-600/15 text-accent-400"
                          : e.role === "mmproj"
                            ? "bg-violet-500/15 text-violet-400"
                            : "bg-info-500/15 text-info-400",
                      )}
                    >
                      {e.role === "primary" ? (
                        <Layers size={12} />
                      ) : e.role === "mmproj" ? (
                        <Video size={12} />
                      ) : (
                        <Zap size={12} />
                      )}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-ink-100">{e.fileName}</span>
                      <span className="block truncate text-[0.6875rem] text-ink-500">
                        {e.quant} · {e.arch} · {formatBytes(e.sizeBytes)}
                      </span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}

        {detail && (
          <div className="mt-4 rounded-lg border border-base-800 bg-base-900/50 p-3 text-[0.6875rem]">
            <p className="mb-1.5 font-medium text-ink-300">
              {detail.fileName} · {detail.arch} · {detail.quant}
            </p>
            <p className="text-ink-500">
              {detail.nLayers} capas · ctx {detail.contextLength.toLocaleString("es-ES")} ·{" "}
              {formatNumber(detail.nParamsEst)} parámetros
              {detail.mtp?.hasMtp && " · con MTP"}
              {detail.isMmproj && " · proyector multimodal"}
            </p>
          </div>
        )}
      </Card>

      {/* ===================== 2. CONFIGURACIÓN ===================== */}
      <div className="grid gap-4 xl:grid-cols-[1fr_20rem]">
        <div className="space-y-4">
          <Card title="2. Contexto y lotes" subtitle="Cuánto recuerda el modelo por sesión.">
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
              <NumberField
                label="Sesiones en paralelo"
                value={sc.nParallel}
                onChange={(v) => update({ nParallel: v })}
                min={1}
                max={64}
                hint={
                  sc.nParallel > 1
                    ? "La caché SWA reserva memoria por sesión: el consumo sube."
                    : "Peticiones simultáneas."
                }
              />
            </div>
          </Card>

          <Card
            title="3. GPU y reparto"
            subtitle="En qué tarjeta se carga el modelo y cómo se reparte."
          >
            <div className="space-y-3">
              {gpus.length === 0 ? (
                <p className="py-2 text-xs text-ink-500">
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
                          const next = on
                            ? cur.filter((s) => s !== id)
                            : [...cur, id];
                          const ordered = gpus
                            .map((x) => `${x.api}${x.index}`)
                            .filter((i) => next.includes(i));
                          update({ device: ordered.length === 0 ? null : ordered.join(",") });
                        }}
                        className={clsx(
                          "flex w-full cursor-pointer items-center gap-2.5 rounded-lg border px-2.5 py-2 text-left transition-colors duration-200",
                          on
                            ? "border-accent-500/50 bg-accent-600/12"
                            : "border-base-750 bg-base-950 hover:border-base-700",
                        )}
                        aria-pressed={on}
                      >
                        <span
                          className={clsx(
                            "flex h-4 w-4 shrink-0 items-center justify-center rounded border",
                            on ? "border-accent-500 bg-accent-500" : "border-base-600",
                          )}
                        >
                          {on && (
                            <svg width="10" height="10" viewBox="0 0 24 24" fill="none">
                              <path
                                d="m5 13 4 4L19 7"
                                stroke="#04150e"
                                strokeWidth="3.5"
                                strokeLinecap="round"
                                strokeLinejoin="round"
                              />
                            </svg>
                          )}
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-xs text-ink-100">{g.name}</span>
                          <span className="mt-0.5 flex flex-wrap items-center gap-1.5">
                            <span className="mono text-[0.6875rem] text-ink-500">{id}</span>
                            <span className="chip">
                              {g.kind === "discrete"
                                ? "Dedicada"
                                : g.kind === "integrated"
                                  ? "Integrada"
                                  : g.kind}
                            </span>
                            {g.vramTotalMib > 0 && (
                              <span className="mono text-[0.6875rem] text-ink-500">
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
                <label className="mt-3 flex cursor-pointer items-start gap-2.5">
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
                    <span className="mt-0.5 block text-[0.6875rem] leading-relaxed text-ink-500">
                      Las capas se reparten entre las GPUs seleccionadas. Con dos
                      tarjetas con 16 GB cada una puedes cargar un modelo que no
                      cabe en una sola.
                    </span>
                  </span>
                </label>
              )}

              {sc.multiGpu && (
                <div className="mt-3 grid gap-4 sm:grid-cols-2">
                  <Field
                    label="Reparto (tensor-split)"
                    hint="Proporción de capas por dispositivo, separada por comas. Con 2 GPUs: 1,1 (mitad y mitad), 3,1 (75% en la primera)."
                  >
                    <input
                      className="field mono"
                      value={sc.tensorSplit ?? ""}
                      placeholder="1,1"
                      onChange={(e) => update({ tensorSplit: e.target.value || null })}
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

              <div className="mt-3">
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
            </div>
          </Card>

          <Card title="4. Procesador y red">
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
              <div className="sm:col-span-2">
                <Field label="Alias del modelo">
                  <input
                    id="alias"
                    className="field"
                    placeholder="mi-modelo"
                    value={sc.alias ?? ""}
                    onChange={(e) => update({ alias: e.target.value || null })}
                  />
                  <p className="mt-1.5 text-[0.6875rem] text-ink-500">
                    Nombre con el que el modelo aparece en la API.
                  </p>
                </Field>
              </div>
            </div>
          </Card>
        </div>

        {/* --- Columna lateral --- */}
        <div className="space-y-4">
          <Card
            title="Memoria estimada"
            subtitle={selectedModel ? basename(selectedModel) : undefined}
          >
            {!estimate ? (
              <p className="py-4 text-center text-xs text-ink-500">
                Selecciona un modelo para ver la estimación.
              </p>
            ) : (
              <div className="space-y-3.5">
                <div>
                  <p className="text-[0.6875rem] text-ink-400">Peso total en memoria</p>
                  <p className="mono mt-0.5 text-xl font-semibold text-ink-100">
                    {formatGb(estimate.totalGb)}
                  </p>
                </div>
                <Meter
                  value={estimate.weightsGpuGb}
                  max={estimate.weightsGpuGb + estimate.kvCacheGb + estimate.computeBufferGb}
                  label="En la GPU"
                  valueLabel={formatGb(
                    estimate.weightsGpuGb + estimate.kvCacheGb + estimate.computeBufferGb,
                  )}
                />
                <dl className="space-y-1.5 border-t border-base-800 pt-3 text-[0.6875rem]">
                  {(
                    [
                      ["Pesos (GPU)", formatGb(estimate.weightsGpuGb)],
                      ["Pesos (CPU)", formatGb(estimate.weightsCpuGb)],
                      ["Caché KV", `${estimate.kvCacheMib.toFixed(0)} MiB`],
                      ["— densas", formatGb(estimate.kvDenseGb)],
                      ["— deslizante", formatGb(estimate.kvSwaGb)],
                      ["Compute buffer", formatGb(estimate.computeBufferGb)],
                    ] as const
                  ).map(([k, v]) => (
                    <div key={k} className="flex justify-between gap-3">
                      <dt className="text-ink-500">{k}</dt>
                      <dd className="mono tabular-nums text-ink-200">{v}</dd>
                    </div>
                  ))}
                </dl>
                <div className="flex items-start gap-2 border-t border-base-800 pt-3 text-[0.6875rem] leading-relaxed text-ink-500">
                  <MemoryStick size={12} className="mt-0.5 shrink-0" />
                  <span>
                    Contexto efectivo {estimate.ctxPadded.toLocaleString("es-ES")} tokens
                    {estimate.nSwaLayers > 0 && (
                      <>
                        , {estimate.nDenseLayers} capas densas y {estimate.nSwaLayers} con
                        ventana deslizante
                      </>
                    )}
                    .
                  </span>
                </div>
              </div>
            )}
          </Card>

          <Card
            title="Comando que se ejecutará"
            subtitle="Lo que se pasa exactamente a llama-server."
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
              <p className="py-3 text-center text-xs text-ink-500">Sin flags.</p>
            ) : (
              <div className="mono max-h-56 overflow-y-auto rounded-lg bg-base-950 p-3 text-[0.6875rem] leading-relaxed break-all text-ink-300">
                {flags.map((f, i) => (
                  <span key={i}>
                    <span className="text-accent-400">{f}</span>
                    {i < flags.length - 1 && " "}
                  </span>
                ))}
              </div>
            )}
          </Card>

          {server?.running && (
            <Card title="Registro del servidor" subtitle={server.logFile ?? undefined}>
              <pre className="mono max-h-48 overflow-auto rounded-lg bg-base-950 p-3 text-[0.6875rem] leading-relaxed text-ink-400">
                {log || "Sin líneas todavía."}
              </pre>
            </Card>
          )}
        </div>
      </div>

      {/* ===================== 3. ACCIONES ===================== */}
      <Card title="4. Acciones">
        <div className="flex flex-wrap gap-2">
          {server?.running ? (
            <Button variant="danger" icon={<Square size={13} />} onClick={onStop} loading={busy}>
              Detener servidor
            </Button>
          ) : (
            <Button variant="primary" icon={<Play size={13} />} onClick={onStart} loading={busy}>
              Arrancar servidor
            </Button>
          )}
          <Button
            variant="quiet"
            icon={<Save size={13} />}
            onClick={saveAsProfile}
            disabled={!config}
          >
            Guardar como perfil
          </Button>
          {profiles.length > 0 && (
            <select
              className="field w-auto py-1 text-xs"
              value={activeProfile ?? ""}
              onChange={(e) => {
                const p = profiles.find((x) => x.id === e.target.value);
                if (p) void applyProfile(p);
              }}
            >
              <option value="">Cargar perfil…</option>
              {profiles.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          )}
        </div>
        {server?.running && (
          <p className="mt-2 text-[0.6875rem] text-ink-500">
            Servidor en marcha en{" "}
            <span className="mono text-ink-300">
              http://{server.host}:{server.port}
            </span>
            . Los cambios de configuración requieren reiniciar.
          </p>
        )}
      </Card>

      <ConfirmDialog
        open={pendingDelete !== null}
        title="Eliminar perfil"
        message="Se borra el perfil guardado. Los modelos y la configuración actual no se tocan."
        confirmLabel="Eliminar"
        danger
        onConfirm={() => pendingDelete && void deleteProfile(pendingDelete)}
        onCancel={() => setPendingDelete(null)}
      />
    </div>
  );
}

function ModelSlot({
  label,
  value,
  onPick,
  onClear,
  hint,
}: {
  label: string;
  value: string | null;
  onPick: () => void;
  onClear: () => void;
  hint: string;
}) {
  return (
    <div className="flex items-start gap-3">
      <div className="min-w-0 flex-1">
        <label className="label">{label}</label>
        <div className="relative">
          <input
            className="field mono pr-10 text-xs"
            value={value ?? ""}
            placeholder="Sin asignar"
            readOnly
          />
          <button
            onClick={onPick}
            className="btn-quiet absolute top-1/2 right-1 -translate-y-1/2 cursor-pointer rounded p-1.5 text-ink-400 hover:text-ink-100"
            title="Buscar en el explorador"
            aria-label={`Buscar ${label}`}
          >
            <FolderOpen size={15} />
          </button>
        </div>
        {hint && <p className="mt-1.5 text-[0.6875rem] text-ink-500">{hint}</p>}
      </div>
      {value && (
        <button
          onClick={onClear}
          className="mt-7 btn-quiet cursor-pointer rounded-lg px-2 text-ink-500 hover:text-danger-400"
          aria-label={`Quitar ${label}`}
          title="Quitar"
        >
          <Trash2 size={14} />
        </button>
      )}
    </div>
  );
}
