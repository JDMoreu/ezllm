import { useCallback, useEffect, useMemo, useState } from "react";
import clsx from "clsx";
import {
  Check,
  ChevronRight,
  Copy,
  FileSearch,
  FolderOpen,
  Gauge,
  Layers,
  Pencil,
  Play,
  Plus,
  Save,
  Sparkles,
  Trash2,
  Video,
  X,
  Zap,
} from "lucide-react";
import { open } from "@tauri-apps/plugin-dialog";

import { api } from "../lib/api";
import {
  Alert,
  Button,
  Card,
  ConfirmDialog,
  EmptyState,
  Field,
  NumberField,
  SelectField,
  useToast,
} from "../components/ui";
import { basename, formatBytes, formatNumber } from "../lib/format";
import type {
  AppConfig,
  CatalogEntry,
  CatalogView,
  Deployment,
  ServerConfig,
} from "../types";

/**
 * Seccion unica de modelos.
 *
 * El flujo es uno solo: se elige el modelo, opcionalmente su mmproj y su MTP
 * (que aparecen solo si existen), se ajusta la configuracion, y se guarda
 * como un despliegue que se aplica con un clic.
 */
export default function ModelsView({
  config,
  onConfigChange,
}: {
  config: AppConfig | null;
  onConfigChange: (c: AppConfig) => void;
}) {
  const toast = useToast();
  const [catalog, setCatalog] = useState<CatalogView | null>(null);
  const [scanning, setScanning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [deployments, setDeployments] = useState<Deployment[]>([]);
  const [editing, setEditing] = useState<Deployment | null>(null);
  const [pendingDelete, setPendingDelete] = useState<string | null>(null);
  const [showAdvanced, setShowAdvanced] = useState(false);

  // El modelo y sus companeros se editan en un draft local hasta guardar.
  const [modelPath, setModelPath] = useState<string | null>(null);
  const [mmprojPath, setMmprojPath] = useState<string | null>(null);
  const [draftPath, setDraftPath] = useState<string | null>(null);

  const modelsDir = config?.modelsDir ?? "";

  const scan = useCallback(async (dir: string) => {
    if (!dir) return;
    setScanning(true);
    setError(null);
    try {
      setCatalog(await api.scanModels(dir));
    } catch (e) {
      setError(String(e));
      setCatalog(null);
    } finally {
      setScanning(false);
    }
  }, []);

  useEffect(() => {
    if (modelsDir) void scan(modelsDir);
  }, [modelsDir, scan]);

  const loadDeployments = useCallback(async () => {
    try {
      setDeployments(await api.listDeployments());
    } catch (e) {
      toast.push(`No se pudieron cargar los despliegues: ${String(e)}`, "danger");
    }
  }, [toast]);

  useEffect(() => {
    void loadDeployments();
  }, [loadDeployments]);

  const openDeployment = useCallback((d: Deployment, edit: boolean) => {
    // Al editar, se toman los modelos del despliegue. Al crear uno nuevo, se
    // conservan los que ya haya elegido el usuario: no se pisa su seleccion.
    if (edit) {
      setModelPath(d.modelPath);
      setMmprojPath(d.mmprojPath);
      setDraftPath(d.draftPath);
    }
    setEditing(
      edit
        ? { ...d, server: { ...d.server } }
        : {
            id: "",
            name: d.name,
            modelPath: d.modelPath,
            mmprojPath: d.mmprojPath,
            draftPath: d.draftPath,
            server: { ...d.server },
            notes: "",
            createdAt: 0,
          },
    );
  }, []);

  const pickFolder = useCallback(async () => {
    try {
      const picked = await open({
        directory: true,
        multiple: false,
        defaultPath: modelsDir || undefined,
        title: "Elige la carpeta donde tienes los modelos",
      });
      if (typeof picked === "string" && picked && config) {
        onConfigChange({ ...config, modelsDir: picked });
      }
    } catch (e) {
      toast.push(`No se pudo abrir el explorador: ${String(e)}`, "danger");
    }
  }, [modelsDir, config, onConfigChange, toast]);

  /** Al elegir un modelo, se buscan solos sus companeros (mmproj / MTP). */
  const chooseModel = useCallback(
    async (entry: CatalogEntry) => {
      setModelPath(entry.path);
      try {
        const [mmproj, draft] = await api.findCompanions(entry.path, modelsDir);
        setMmprojPath(mmproj);
        setDraftPath(draft);
        const extras = [mmproj && "proyector", draft && "MTP"].filter(Boolean);
        toast.push(
          extras.length > 0
            ? `Detectado automaticamente: ${extras.join(" y ")}`
            : "Modelo seleccionado",
          "success",
        );
      } catch {
        setMmprojPath(null);
        setDraftPath(null);
      }
    },
    [modelsDir, toast],
  );

  const save = useCallback(async () => {
    if (!editing) return;
    if (!modelPath) {
      toast.push("Elige un modelo antes de guardar", "danger");
      return;
    }
    const deployment: Deployment = {
      ...editing,
      name: editing.name.trim() || basename(modelPath),
      modelPath,
      mmprojPath,
      draftPath,
    };
    try {
      await api.saveDeployment(deployment);
      toast.push(`Despliegue "${deployment.name}" guardado`, "success");
      setEditing(null);
      await loadDeployments();
    } catch (e) {
      toast.push(`No se pudo guardar: ${String(e)}`, "danger");
    }
  }, [editing, modelPath, mmprojPath, draftPath, loadDeployments, toast]);

  const apply = useCallback(
    async (d: Deployment) => {
      try {
        const [cfg] = await api.applyDeployment(d.id);
        onConfigChange(cfg);
        setModelPath(d.modelPath);
        setMmprojPath(d.mmprojPath);
        setDraftPath(d.draftPath);
        toast.push(`"${d.name}" listo para arrancar`, "success");
        await loadDeployments();
      } catch (e) {
        toast.push(`No se pudo aplicar: ${String(e)}`, "danger");
      }
    },
    [onConfigChange, loadDeployments, toast],
  );

  const duplicate = useCallback(
    async (d: Deployment) => {
      try {
        const copy = await api.duplicateDeployment(d.id, `${d.name} (copia)`);
        toast.push(`Despliegue "${copy.name}" creado`, "success");
        await loadDeployments();
      } catch (e) {
        toast.push(`No se pudo duplicar: ${String(e)}`, "danger");
      }
    },
    [loadDeployments, toast],
  );

  const remove = useCallback(
    async (id: string) => {
      try {
        await api.deleteDeployment(id);
        toast.push("Despliegue eliminado", "info");
        await loadDeployments();
      } catch (e) {
        toast.push(`No se pudo eliminar: ${String(e)}`, "danger");
      } finally {
        setPendingDelete(null);
      }
    },
    [loadDeployments, toast],
  );

  // Los companeros que la app puede ofrecer para el modelo elegido.
  const companions = useMemo(() => {
    if (!catalog) return { mmproj: [] as CatalogEntry[], draft: [] as CatalogEntry[] };
    return {
      mmproj: catalog.mmproj.filter((m) => m.path !== mmprojPath),
      draft: catalog.draft.filter((d) => d.path !== draftPath),
    };
  }, [catalog, mmprojPath, draftPath]);

  const activeId = config?.activeDeploymentId ?? null;
  const selectedEntry = useMemo(
    () => catalog?.entries.find((e) => e.path === modelPath) ?? null,
    [catalog, modelPath],
  );

  if (!config) {
    return (
      <Card>
        <p className="py-6 text-center text-xs text-ink-400">Cargando...</p>
      </Card>
    );
  }

  return (
    <div className="space-y-5">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-lg font-semibold tracking-tight text-ink-100">Modelos</h1>
          <p className="mt-1 max-w-2xl text-xs leading-relaxed text-ink-400">
            Elige un modelo, ajusta lo que necesites y guardalo como despliegue.
            Luego pasas de uno a otro con un clic.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            icon={<FolderOpen size={14} />}
            onClick={pickFolder}
            title="Cambiar la carpeta de modelos"
          >
            Carpeta
          </Button>
          <Button
            variant="primary"
            icon={<Plus size={14} />}
            onClick={() =>
              setEditing({
                id: "",
                name: "",
                modelPath,
                mmprojPath,
                draftPath,
                server: { ...config.server },
                notes: "",
                createdAt: 0,
              })
            }
          >
            Nuevo despliegue
          </Button>
        </div>
      </header>

      {error && (
        <Alert tone="danger" title="No se pudo escanear la carpeta">
          {error}
        </Alert>
      )}

      <div className="grid gap-4 lg:grid-cols-[1fr_23rem]">
        {/* ============ COLUMNA IZQUIERDA ============ */}
        <div className="space-y-4">
          {/* --- 1. El modelo --- */}
          <Card
            title="1 - Modelo"
            subtitle={
              selectedEntry
                ? `Elegido: ${selectedEntry.fileName} - ${selectedEntry.quant} - ${formatBytes(selectedEntry.sizeBytes)}`
                : "Elige el fichero GGUF principal"
            }
            actions={
              scanning ? (
                <span className="chip">Escaneando...</span>
              ) : (
                <Button size="sm" icon={<FolderOpen size={12} />} onClick={pickFolder}>
                  Buscar
                </Button>
              )
            }
          >
            {catalog && catalog.entries.length > 0 ? (
              <>
                <ModelPicker
                  catalog={catalog}
                  selectedPath={modelPath}
                  onSelect={chooseModel}
                />
                <p className="mt-3 truncate text-[0.6875rem] text-ink-500">
                  Carpeta: <span className="mono">{catalog.scanned}</span>
                </p>
              </>
            ) : (
              <EmptyState
                icon={<FileSearch size={20} />}
                title={scanning ? "Buscando modelos..." : "No hay modelos aqui"}
                description={
                  scanning
                    ? "Recorriendo la carpeta y leyendo los GGUF."
                    : "Pulsa «Buscar» para elegir la carpeta donde tienes los modelos."
                }
                action={
                  !scanning && (
                    <Button
                      variant="primary"
                      icon={<FolderOpen size={13} />}
                      onClick={pickFolder}
                    >
                      Buscar carpeta
                    </Button>
                  )
                }
              />
            )}
          </Card>

          {/* --- 2. Los companeros --- */}
          <Card
            title="2 - Modulos opcionales"
            subtitle="Se detectan solos al elegir el modelo. Anadelos solo si los usas."
          >
            <div className="space-y-2.5">
              <CompanionRow
                icon={<Video size={14} />}
                tone="violet"
                title="Proyector multimodal"
                description="Anade vision, audio y video al modelo."
                value={mmprojPath}
                candidates={companions.mmproj}
                onClear={() => setMmprojPath(null)}
                onSelect={setMmprojPath}
                onBrowse={async () => {
                  const picked = await open({
                    directory: false,
                    multiple: false,
                    filters: [{ name: "GGUF", extensions: ["gguf"] }],
                    title: "Elige el proyector multimodal",
                  });
                  if (typeof picked === "string" && picked) setMmprojPath(picked);
                }}
              />
              <CompanionRow
                icon={<Zap size={14} />}
                tone="info"
                title="MTP / draft"
                description="Predice varios tokens por paso: mas rapido."
                value={draftPath}
                candidates={companions.draft}
                onClear={() => setDraftPath(null)}
                onSelect={setDraftPath}
                onBrowse={async () => {
                  const picked = await open({
                    directory: false,
                    multiple: false,
                    filters: [{ name: "GGUF", extensions: ["gguf"] }],
                    title: "Elige el modelo MTP",
                  });
                  if (typeof picked === "string" && picked) setDraftPath(picked);
                }}
              />
            </div>
          </Card>

          {/* --- 3. La configuracion --- */}
          <Card
            title="3 - Configuracion"
            subtitle="Como se va a ejecutar este modelo."
            actions={
              <button
                onClick={() => setShowAdvanced((s) => !s)}
                className="btn-quiet cursor-pointer rounded px-2 py-1 text-[0.6875rem] font-medium"
              >
                {showAdvanced ? "Ocultar avanzado" : "Opciones avanzadas"}
              </button>
            }
          >
            {editing ? (
              <>
                {!modelPath && (
                  <p className="mb-3 rounded-lg border border-warn-500/30 bg-warn-500/10 px-3 py-2 text-[0.6875rem] text-warn-400">
                    Todavia no has elegido modelo. Elige uno en el paso 1 para
                    poder guardar el despliegue.
                  </p>
                )}
                <ConfigEditor
                  server={editing.server}
                  onChange={(s) => setEditing({ ...editing, server: s })}
                  showAdvanced={showAdvanced}
                />
              </>
            ) : (
              <div className="flex items-center justify-between gap-4 rounded-lg bg-base-850 px-3 py-3">
                <p className="text-xs leading-relaxed text-ink-400">
                  Pulsa <strong className="text-ink-200">Nuevo despliegue</strong> o
                  edita uno de la lista para ajustar su configuracion.
                </p>
                <span className="mono shrink-0 text-[0.6875rem] text-ink-500">
                  ctx {formatNumber(config.server.ctxSize)} -{" "}
                  {config.server.nParallel} par.
                </span>
              </div>
            )}
          </Card>
        </div>

        {/* ============ COLUMNA DERECHA ============ */}
        <div className="space-y-4">
          <Card
            title="Despliegues"
            subtitle={
              deployments.length > 0
                ? `${deployments.length} guardados`
                : "Tus modelos listos para arrancar"
            }
          >
            {deployments.length === 0 ? (
              <EmptyState
                icon={<Layers size={20} />}
                title="Sin despliegues"
                description="Elige un modelo arriba, ajusta la configuracion y guardala. La proxima vez solo tendras que aplicarlo."
              />
            ) : (
              <ul className="space-y-2">
                {deployments.map((d) => (
                  <DeploymentRow
                    key={d.id}
                    deployment={d}
                    active={d.id === activeId}
                    onApply={() => apply(d)}
                    onEdit={() => openDeployment(d, true)}
                    onDuplicate={() => duplicate(d)}
                    onDelete={() => setPendingDelete(d.id)}
                  />
                ))}
              </ul>
            )}
          </Card>

          {editing && (
            <Card
              title={editing.id ? "Editando despliegue" : "Nuevo despliegue"}
              actions={
                <>
                  <Button variant="quiet" size="sm" onClick={() => setEditing(null)}>
                    Cancelar
                  </Button>
                  <Button
                    variant="primary"
                    size="sm"
                    icon={<Save size={12} />}
                    onClick={save}
                  >
                    Guardar
                  </Button>
                </>
              }
            >
              <Field label="Nombre" hint="Como lo veras en la lista. Ej: «Gemma 32k».">
                <input
                  className="field"
                  value={editing.name}
                  placeholder="Gemma 4 en la GPU dedicada"
                  onChange={(e) => setEditing({ ...editing, name: e.target.value })}
                />
              </Field>
              <div className="mt-3">
                <Field label="Notas" hint="Opcional.">
                  <input
                    className="field"
                    value={editing.notes}
                    placeholder="Para el trabajo"
                    onChange={(e) => setEditing({ ...editing, notes: e.target.value })}
                  />
                </Field>
              </div>
              <Button
                variant="primary"
                className="mt-4 w-full"
                icon={<Save size={13} />}
                onClick={save}
                disabled={!modelPath}
              >
                Guardar despliegue
              </Button>
              {!modelPath && (
                <p className="mt-2 text-center text-[0.6875rem] text-ink-500">
                  Elige un modelo para poder guardar.
                </p>
              )}
            </Card>
          )}
        </div>
      </div>

      <ConfirmDialog
        open={pendingDelete !== null}
        title="Eliminar despliegue"
        message="Se borra el despliegue guardado. Los ficheros GGUF no se tocan."
        confirmLabel="Eliminar"
        danger
        onConfirm={() => pendingDelete && remove(pendingDelete)}
        onCancel={() => setPendingDelete(null)}
      />
    </div>
  );
}

function ModelPicker({
  catalog,
  selectedPath,
  onSelect,
}: {
  catalog: CatalogView;
  selectedPath: string | null;
  onSelect: (e: CatalogEntry) => void;
}) {
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<"all" | "primary" | "mmproj" | "draft">("all");

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return catalog.entries.filter((e) => {
      if (filter !== "all" && e.role !== filter) return false;
      if (!q) return true;
      return (
        e.fileName.toLowerCase().includes(q) ||
        e.name.toLowerCase().includes(q) ||
        e.quant.toLowerCase().includes(q)
      );
    });
  }, [catalog, query, filter]);

  const counts = {
    all: catalog.entries.length,
    primary: catalog.primary.length,
    mmproj: catalog.mmproj.length,
    draft: catalog.draft.length,
  };

  return (
    <div className="space-y-2.5">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-[13rem] flex-1">
          <input
            className="field pl-2.5 text-xs"
            placeholder="Filtrar por nombre o cuantizacion..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
        <div className="flex gap-0.5 rounded-lg bg-base-850 p-0.5">
          {(
            [
              ["all", `Todos ${counts.all}`],
              ["primary", `Modelos ${counts.primary}`],
              ["mmproj", `Proyector ${counts.mmproj}`],
              ["draft", `MTP ${counts.draft}`],
            ] as const
          ).map(([id, label]) => (
            <button
              key={id}
              onClick={() => setFilter(id)}
              className={clsx(
                "cursor-pointer rounded-md px-2 py-1 text-[0.6875rem] font-medium transition-colors duration-200",
                filter === id
                  ? "bg-base-700 text-ink-100"
                  : "text-ink-400 hover:text-ink-200",
              )}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {visible.length === 0 ? (
        <p className="py-6 text-center text-xs text-ink-500">
          Ningun modelo coincide con el filtro.
        </p>
      ) : (
        <ul className="max-h-72 space-y-1 overflow-y-auto pr-0.5">
          {visible.map((e) => {
            const on = e.path === selectedPath;
            return (
              <li key={e.path}>
                <button
                  onClick={() => onSelect(e)}
                  className={clsx(
                    "flex w-full cursor-pointer items-center gap-2.5 rounded-lg border px-2.5 py-2 text-left transition-colors duration-200",
                    on
                      ? "border-accent-500/50 bg-accent-600/12"
                      : "border-transparent hover:border-base-750 hover:bg-base-850",
                  )}
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
                    <span className="block truncate text-xs text-ink-100">
                      {e.fileName}
                    </span>
                    <span className="mt-0.5 flex flex-wrap items-center gap-x-2 text-[0.6875rem] text-ink-500">
                      <span className="mono">{e.quant}</span>
                      {e.nLayers > 0 && <span>{e.nLayers} capas</span>}
                      {e.contextLength > 0 && (
                        <span>ctx {formatNumber(e.contextLength)}</span>
                      )}
                      {e.isMoe && <span>MoE</span>}
                    </span>
                  </span>
                  <span className="mono shrink-0 text-[0.6875rem] text-ink-400">
                    {formatBytes(e.sizeBytes)}
                  </span>
                  {on && <Check size={13} className="shrink-0 text-accent-400" />}
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

function CompanionRow({
  icon,
  tone,
  title,
  description,
  value,
  candidates,
  onSelect,
  onClear,
  onBrowse,
}: {
  icon: React.ReactNode;
  tone: "violet" | "info";
  title: string;
  description: string;
  value: string | null;
  candidates: CatalogEntry[];
  onSelect: (path: string) => void;
  onClear: () => void;
  onBrowse: () => void;
}) {
  const tones = {
    violet: "bg-violet-500/15 text-violet-400",
    info: "bg-info-500/15 text-info-400",
  };
  const [openList, setOpenList] = useState(false);

  return (
    <div className="rounded-lg border border-base-750 p-2.5">
      <div className="flex items-center gap-2.5">
        <span
          className={clsx(
            "flex h-7 w-7 shrink-0 items-center justify-center rounded-lg",
            value ? tones[tone] : "bg-base-800 text-ink-500",
          )}
        >
          {icon}
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-xs font-medium text-ink-100">{title}</p>
          {value ? (
            <p className="mono truncate text-[0.6875rem] text-ink-400" title={value}>
              {basename(value)}
            </p>
          ) : (
            <p className="text-[0.6875rem] text-ink-500">{description}</p>
          )}
        </div>
        {value ? (
          <button
            onClick={onClear}
            className="btn-quiet cursor-pointer rounded p-1 text-ink-500 hover:text-danger-400"
            title="Quitar"
            aria-label={`Quitar ${title}`}
          >
            <X size={13} />
          </button>
        ) : (
          <div className="flex shrink-0 gap-1">
            {candidates.length > 0 && (
              <button
                onClick={() => setOpenList((o) => !o)}
                className="btn btn-ghost px-2 py-1 text-[0.6875rem]"
              >
                <Sparkles size={11} />
                Detectados
                <ChevronRight
                  size={11}
                  className={clsx("transition-transform", openList && "rotate-90")}
                />
              </button>
            )}
            <button
              onClick={onBrowse}
              className="btn btn-quiet px-2 py-1 text-[0.6875rem]"
            >
              <FolderOpen size={11} />
              Buscar
            </button>
          </div>
        )}
      </div>

      {openList && candidates.length > 0 && (
        <ul className="mt-2 space-y-1 border-t border-base-800 pt-2">
          {candidates.map((c) => (
            <li key={c.path}>
              <button
                onClick={() => {
                  onSelect(c.path);
                  setOpenList(false);
                }}
                className="flex w-full cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-left transition-colors duration-200 hover:bg-base-850"
              >
                <span className="mono min-w-0 flex-1 truncate text-[0.6875rem] text-ink-200">
                  {c.fileName}
                </span>
                <span className="mono shrink-0 text-[0.625rem] text-ink-500">
                  {formatBytes(c.sizeBytes)}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

const CACHE_TYPES = [
  { value: "f16", label: "F16 (por defecto)" },
  { value: "q8_0", label: "Q8_0 (mas rapido)" },
  { value: "q5_1", label: "Q5_1" },
  { value: "q4_1", label: "Q4_1" },
  { value: "q4_0", label: "Q4_0" },
  { value: "iq4_nl", label: "IQ4_NL" },
];

function ConfigEditor({
  server,
  onChange,
  showAdvanced,
}: {
  server: ServerConfig;
  onChange: (s: ServerConfig) => void;
  showAdvanced: boolean;
}) {
  const set = (patch: Partial<ServerConfig>) => onChange({ ...server, ...patch });

  return (
    <div className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <SelectField
          label="Contexto"
          value={String(server.ctxSize)}
          onChange={(v) => set({ ctxSize: Number(v) })}
          options={[2048, 4096, 8192, 16384, 32768, 65536, 131072].map((s) => ({
            value: String(s),
            label: `${formatNumber(s)} tokens`,
          }))}
          hint="Cuanto recuerda el modelo por sesion."
        />
        <NumberField
          label="Sesiones en paralelo"
          value={server.nParallel}
          onChange={(v) => set({ nParallel: v })}
          min={1}
          max={64}
          hint="Peticiones simultaneas. Con mas de una, la cache consume mas."
        />
      </div>

      {showAdvanced ? (
        <>
          <div className="grid gap-4 sm:grid-cols-2">
            <NumberField
              label="Capas en la GPU"
              value={server.nGpuLayers ?? 0}
              onChange={(v) => set({ nGpuLayers: v > 0 ? v : null })}
              min={0}
              suffix={server.nGpuLayers ? "capas" : "auto"}
              hint="0 usa todas. Menos capas = menos VRAM."
            />
            <SelectField
              label="Flash Attention"
              value={server.flashAttn}
              onChange={(v) => set({ flashAttn: v })}
              options={[
                { value: "auto", label: "Automatico" },
                { value: "on", label: "Activado" },
                { value: "off", label: "Desactivado" },
              ]}
            />
            <SelectField
              label="Tipo de cache K"
              value={server.cacheTypeK}
              onChange={(v) => set({ cacheTypeK: v })}
              options={CACHE_TYPES}
            />
            <SelectField
              label="Tipo de cache V"
              value={server.cacheTypeV}
              onChange={(v) => set({ cacheTypeV: v })}
              options={CACHE_TYPES}
            />
          </div>

          <Field
            label="Flags avanzados"
            hint="Comandos extra de llama-server. Se anaden al final, asi que pisan lo que genere la app. Ej: --temp 0.7 --top-p 0.9"
          >
            <input
              className="field mono text-xs"
              value={server.extraArgs}
              placeholder="--temp 0.7 --top-p 0.9"
              onChange={(e) => set({ extraArgs: e.target.value })}
            />
          </Field>
        </>
      ) : (
        <p className="text-[0.6875rem] leading-relaxed text-ink-500">
          Contexto y paralelismo cubren lo habitual. Abre «Opciones avanzadas»
          para tocar las capas en la GPU, el tipo de cache o pasar comandos
          extra a llama-server.
        </p>
      )}
    </div>
  );
}

function DeploymentRow({
  deployment: d,
  active,
  onApply,
  onEdit,
  onDuplicate,
  onDelete,
}: {
  deployment: Deployment;
  active: boolean;
  onApply: () => void;
  onEdit: () => void;
  onDuplicate: () => void;
  onDelete: () => void;
}) {
  return (
    <li
      className={clsx(
        "rounded-lg border p-2.5 transition-colors duration-200",
        active
          ? "border-accent-500/45 bg-accent-600/8"
          : "border-base-750 bg-base-900 hover:border-base-700",
      )}
    >
      <div className="flex items-start gap-2">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="truncate text-xs font-medium text-ink-100">{d.name}</span>
            {active && <span className="chip chip-accent">Activo</span>}
          </div>
          <p
            className="mono mt-0.5 truncate text-[0.6875rem] text-ink-500"
            title={d.modelPath ?? ""}
          >
            {d.modelPath ? basename(d.modelPath) : "Sin modelo"}
          </p>
          <p className="mt-1 flex flex-wrap items-center gap-1.5">
            <span className="chip" title="Contexto">
              <Gauge size={9} />
              {formatNumber(d.server.ctxSize)}
            </span>
            {d.mmprojPath && (
              <span className="chip chip-violet" title="Proyector multimodal">
                <Video size={9} />
                multimodal
              </span>
            )}
            {d.draftPath && (
              <span className="chip" title="MTP">
                <Zap size={9} />
                MTP
              </span>
            )}
            {d.server.device && (
              <span className="chip mono" title="Tarjeta">
                {d.server.device}
              </span>
            )}
          </p>
        </div>
        <div className="flex shrink-0 gap-0.5">
          <button
            onClick={onDuplicate}
            className="btn-quiet cursor-pointer rounded p-1 text-ink-500 hover:text-ink-100"
            title="Duplicar"
            aria-label="Duplicar despliegue"
          >
            <Copy size={12} />
          </button>
          <button
            onClick={onDelete}
            className="btn-quiet cursor-pointer rounded p-1 text-ink-500 hover:text-danger-400"
            title="Eliminar"
            aria-label="Eliminar despliegue"
          >
            <Trash2 size={12} />
          </button>
        </div>
      </div>

      <div className="mt-2.5 flex gap-1.5">
        <Button
          variant="primary"
          size="sm"
          icon={<Play size={11} />}
          onClick={onApply}
          className="flex-1"
        >
          Usar
        </Button>
        <Button size="sm" icon={<Pencil size={11} />} onClick={onEdit}>
          Editar
        </Button>
      </div>
    </li>
  );
}
