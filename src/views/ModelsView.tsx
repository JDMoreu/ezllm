import { useCallback, useEffect, useMemo, useState } from "react";
import clsx from "clsx";
import {
  Eye,
  EyeOff,
  FileSearch,
  FolderOpen,
  Layers,
  RefreshCw,
  Search,
  Sparkles,
  Video,
  Zap,
} from "lucide-react";
import { open } from "@tauri-apps/plugin-dialog";

import { api } from "../lib/api";
import {
  Alert,
  Button,
  Card,
  EmptyState,
  useToast,
} from "../components/ui";
import { basename, formatBytes, formatParams } from "../lib/format";
import type { CatalogEntry, CatalogView, ModelInfo } from "../types";

export default function ModelsView({
  modelsDir,
  onModelsDirChange,
  selectedModel,
  selectedMmproj,
  selectedDraft,
  onSelect,
}: {
  modelsDir: string;
  onModelsDirChange: (dir: string) => void;
  selectedModel: string | null;
  selectedMmproj: string | null;
  selectedDraft: string | null;
  onSelect: (model: string | null, mmproj: string | null, draft: string | null) => void;
}) {
  const toast = useToast();
  const [catalog, setCatalog] = useState<CatalogView | null>(null);
  const [scanning, setScanning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<"all" | "primary" | "mmproj" | "draft">("all");
  const [detail, setDetail] = useState<ModelInfo | null>(null);
  const [detailPath, setDetailPath] = useState<string | null>(null);

  const scan = useCallback(
    async (dir: string) => {
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

  const inspect = useCallback(async (path: string) => {
    setDetailPath(path);
    try {
      setDetail(await api.inspectModel(path));
    } catch (e) {
      toast.push(`No se pudo leer el modelo: ${String(e)}`, "danger");
      setDetail(null);
    }
  }, [toast]);

  const visible = useMemo(() => {
    if (!catalog) return [];
    const q = query.trim().toLowerCase();
    return catalog.entries.filter((e) => {
      if (filter !== "all" && e.role !== filter) return false;
      if (!q) return true;
      return (
        e.fileName.toLowerCase().includes(q) ||
        e.name.toLowerCase().includes(q) ||
        e.quant.toLowerCase().includes(q) ||
        e.arch.toLowerCase().includes(q)
      );
    });
  }, [catalog, query, filter]);

  const counts = useMemo(() => {
    if (!catalog) return { all: 0, primary: 0, mmproj: 0, draft: 0 };
    return {
      all: catalog.entries.length,
      primary: catalog.primary.length,
      mmproj: catalog.mmproj.length,
      draft: catalog.draft.length,
    };
  }, [catalog]);

  const pick = useCallback(
    async (entry: CatalogEntry) => {
      // Si se elige un mmproj o un draft, se busca su modelo base.
      if (entry.role === "primary") {
        const [mmproj, draft] = await api.findCompanions(entry.path, modelsDir);
        onSelect(entry.path, mmproj, draft);
        toast.push(
          mmproj || draft
            ? "Modelo seleccionado con sus compañeros detectados."
            : "Modelo seleccionado.",
          "success",
        );
      } else {
        // Se selecciona el compañero del modelo principal.
        const [mmproj, draft] = await api.findCompanions(entry.path, modelsDir);
        onSelect(
          mmproj === entry.path ? null : mmproj,
          entry.role === "mmproj" ? entry.path : mmproj,
          entry.role === "draft" ? entry.path : draft,
        );
      }
      void inspect(entry.path);
    },
    [modelsDir, onSelect, toast, inspect],
  );

  return (
    <div className="space-y-5">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-lg font-semibold tracking-tight text-ink-100">Modelos</h1>
          <p className="mt-1 max-w-2xl text-xs leading-relaxed text-ink-400">
            Escanea una carpeta y encuentra tus ficheros GGUF. EzLlamaCpp distingue el modelo
            principal, el proyector multimodal y el bloque MTP por sus metadatos, no por el
            nombre.
          </p>
        </div>
        <Button icon={<RefreshCw size={14} />} onClick={() => scan(modelsDir)} loading={scanning}>
          Escanear
        </Button>
      </header>

      {/* --- Ruta de la carpeta --- */}
      <Card>
        <div className="flex flex-wrap items-end gap-3">
          <div className="min-w-[16rem] flex-1">
            <label className="label" htmlFor="models-dir">
              Carpeta de modelos
            </label>
            <div className="relative">
              <input
                id="models-dir"
                className="field mono pr-10 text-xs"
                value={modelsDir}
                placeholder="C:\Users\...\modelos"
                onChange={(e) => onModelsDirChange(e.target.value)}
              />
              <button
                onClick={pickFolder}
                className="btn-quiet absolute top-1/2 right-1 -translate-y-1/2 cursor-pointer rounded p-1.5 text-ink-400 hover:text-ink-100"
                title="Buscar carpeta en el explorador"
                aria-label="Buscar carpeta en el explorador"
              >
                <FolderOpen size={15} />
              </button>
            </div>
          </div>
          {modelsDir && (
            <Button
              variant="quiet"
              icon={<FolderOpen size={13} />}
              onClick={() => api.openFolder(modelsDir)}
            >
              Abrir carpeta
            </Button>
          )}
        </div>
      </Card>

      {error && (
        <Alert tone="danger" title="No se pudo escanear la carpeta">
          {error}
        </Alert>
      )}

      {scanning && catalog && (
        <Alert tone="info">Escaneando… los GGUF grandes tardan un momento en leerse.</Alert>
      )}

      {/* --- Filtros --- */}
      {catalog && catalog.entries.length > 0 && (
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative min-w-[15rem] flex-1">
            <Search
              size={14}
              className="pointer-events-none absolute top-1/2 left-2.5 -translate-y-1/2 text-ink-500"
            />
            <input
              className="field pl-8"
              placeholder="Filtrar por nombre, arquitectura o cuantización…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </div>
          <div className="flex gap-1 rounded-lg bg-base-850 p-0.5">
            {(
              [
                ["all", `Todos ${counts.all}`],
                ["primary", `Modelos ${counts.primary}`],
                ["mmproj", `Proyectores ${counts.mmproj}`],
                ["draft", `MTP ${counts.draft}`],
              ] as const
            ).map(([id, label]) => (
              <button
                key={id}
                onClick={() => setFilter(id)}
                className={clsx(
                  "cursor-pointer rounded-md px-2.5 py-1 text-[0.6875rem] font-medium transition-colors duration-200",
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
      )}

      {/* --- Catálogo --- */}
      <div className="grid gap-4 lg:grid-cols-[1fr_20rem]">
        <Card
          title="Catálogo"
          subtitle={
            catalog
              ? `${visible.length} de ${catalog.entries.length} ficheros`
              : "Sin escanear"
          }
          bodyClassName="p-0"
        >
          {!catalog ? (
            <EmptyState
              icon={<FileSearch size={20} />}
              title="Elige una carpeta"
              description="Pulsa «Buscar» para elegir dónde tienes los modelos. EzLlamaCpp recorre la carpeta y sus subcarpetas hasta 4 niveles."
            />
          ) : catalog.entries.length === 0 ? (
            <EmptyState
              icon={<FileSearch size={20} />}
              title="No hay ficheros GGUF"
              description={`En ${catalog.scanned} no hay ningún .gguf. Prueba con otra carpeta.`}
            />
          ) : visible.length === 0 ? (
            <EmptyState
              icon={<Search size={20} />}
              title="Sin resultados"
              description="Ningún modelo coincide con el filtro."
            />
          ) : (
            <ul className="divide-y divide-base-800">
              {visible.map((entry) => {
                const isSelected =
                  entry.path === selectedModel ||
                  entry.path === selectedMmproj ||
                  entry.path === selectedDraft;
                return (
                  <li key={entry.path}>
                    <div
                      className={clsx(
                        "flex items-center gap-3 px-4 py-2.5 transition-colors duration-200",
                        isSelected ? "bg-accent-600/8" : "hover:bg-base-850",
                      )}
                    >
                      <button
                        onClick={() => pick(entry)}
                        className="flex min-w-0 flex-1 cursor-pointer items-center gap-3 text-left"
                      >
                        <span
                          className={clsx(
                            "flex h-7 w-7 shrink-0 items-center justify-center rounded-lg",
                            entry.role === "primary"
                              ? "bg-accent-600/15 text-accent-400"
                              : entry.role === "mmproj"
                                ? "bg-violet-500/15 text-violet-400"
                                : "bg-info-500/15 text-info-400",
                          )}
                        >
                          {entry.role === "primary" ? (
                            <Layers size={14} />
                          ) : entry.role === "mmproj" ? (
                            <Video size={14} />
                          ) : (
                            <Zap size={14} />
                          )}
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="flex flex-wrap items-center gap-1.5">
                            <span className="truncate text-xs font-medium text-ink-100">
                              {entry.fileName}
                            </span>
                            {entry.role === "mmproj" && (
                              <span className="chip chip-violet">Multimodal</span>
                            )}
                            {entry.role === "draft" && <span className="chip">MTP</span>}
                            {entry.hasMtp && entry.role === "primary" && (
                              <span className="chip chip-violet">Con MTP</span>
                            )}
                          </span>
                          <span className="mt-0.5 flex flex-wrap items-center gap-x-2 text-[0.6875rem] text-ink-500">
                            <span className="mono">{entry.quant}</span>
                            {entry.arch && <span className="mono">{entry.arch}</span>}
                            {entry.nLayers > 0 && <span>{entry.nLayers} capas</span>}
                            {entry.contextLength > 0 && (
                              <span>ctx {entry.contextLength.toLocaleString("es-ES")}</span>
                            )}
                            {entry.isMoe && (
                              <span>MoE {entry.nExpertUsed}/{entry.nExpert}</span>
                            )}
                          </span>
                        </span>
                        <span className="mono shrink-0 text-[0.6875rem] text-ink-400">
                          {formatBytes(entry.sizeBytes)}
                        </span>
                      </button>
                      <button
                        onClick={() =>
                          detailPath === entry.path
                            ? setDetail(null)
                            : inspect(entry.path)
                        }
                        className="btn-quiet shrink-0 cursor-pointer rounded-lg p-1.5 text-ink-500 hover:text-ink-100"
                        title={detailPath === entry.path ? "Ocultar detalle" : "Ver detalle"}
                        aria-label="Ver detalle del modelo"
                      >
                        {detailPath === entry.path ? (
                          <EyeOff size={14} />
                        ) : (
                          <Eye size={14} />
                        )}
                      </button>
                    </div>
                    {detailPath === entry.path && detail && (
                      <ModelDetail info={detail} />
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </Card>

        {/* --- Panel lateral: selección actual --- */}
        <div className="space-y-4">
          <Card title="Selección actual">
            <SelectionSlot
              label="Modelo principal"
              path={selectedModel}
              icon={<Layers size={14} />}
            />
            <SelectionSlot
              label="Proyector multimodal"
              path={selectedMmproj}
              icon={<Video size={14} />}
              tone="violet"
            />
            <SelectionSlot
              label="MTP / draft"
              path={selectedDraft}
              icon={<Zap size={14} />}
              tone="info"
            />
            {selectedModel && (
              <Button
                variant="quiet"
                className="mt-3 w-full"
                onClick={() => onSelect(null, null, null)}
              >
                Vaciar selección
              </Button>
            )}
          </Card>

          <Card title="Cómo se detectan los roles">
            <ul className="space-y-2.5 text-[0.6875rem] leading-relaxed text-ink-400">
              <li className="flex gap-2">
                <Sparkles size={12} className="mt-0.5 shrink-0 text-accent-400" />
                <span>
                  <strong className="text-ink-200">Modelo</strong> — el GGUF con capas de
                  transformer.
                </span>
              </li>
              <li className="flex gap-2">
                <Video size={12} className="mt-0.5 shrink-0 text-violet-400" />
                <span>
                  <strong className="text-ink-200">Proyector</strong> — metadato{" "}
                  <span className="mono">general.type = mmproj</span>. Añade visión, audio y
                  vídeo al servidor.
                </span>
              </li>
              <li className="flex gap-2">
                <Zap size={12} className="mt-0.5 shrink-0 text-info-400" />
                <span>
                  <strong className="text-ink-200">MTP</strong> — tensores{" "}
                  <span className="mono">nextn.*</span> o metadato{" "}
                  <span className="mono">nextn_predict_layers</span>. Acelera la generación
                  especulando varios tokens.
                </span>
              </li>
            </ul>
          </Card>
        </div>
      </div>
    </div>
  );
}

function SelectionSlot({
  label,
  path,
  icon,
  tone = "accent",
}: {
  label: string;
  path: string | null;
  icon: React.ReactNode;
  tone?: "accent" | "violet" | "info";
}) {
  const tones = {
    accent: "bg-accent-600/15 text-accent-400",
    violet: "bg-violet-500/15 text-violet-400",
    info: "bg-info-500/15 text-info-400",
  };
  return (
    <div className="flex items-start gap-2.5 py-2 first:pt-0 last:pb-0">
      <span
        className={clsx(
          "mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-md",
          path ? tones[tone] : "bg-base-800 text-ink-500",
        )}
      >
        {icon}
      </span>
      <div className="min-w-0">
        <p className="text-[0.6875rem] font-medium text-ink-400">{label}</p>
        <p
          className={clsx(
            "mono truncate text-xs",
            path ? "text-ink-100" : "text-ink-500 italic",
          )}
          title={path ?? undefined}
        >
          {path ? basename(path) : "Sin asignar"}
        </p>
      </div>
    </div>
  );
}

function ModelDetail({ info }: { info: ModelInfo }) {
  const rows: [string, string][] = [
    ["Arquitectura", info.arch || "—"],
    ["Cuantización", `${info.quant} (${info.quantBpw.toFixed(2)} bits/peso)`],
    ["Parámetros", formatParams(info.nParamsEst)],
    ["Capas", String(info.nLayers)],
    ["Cabezas KV", String(info.nHeadKv)],
    ["Embedding", String(info.embeddingLength)],
    ["Contexto nativo", info.contextLength ? info.contextLength.toLocaleString("es-ES") : "—"],
    ["Ventana deslizante", info.slidingWindow ? String(info.slidingWindow) : "—"],
    ["Vocabulario", info.vocabSize ? info.vocabSize.toLocaleString("es-ES") : "—"],
    ["Tensores", String(info.nTensors)],
  ];

  return (
    <div className="animate-fade-up border-t border-base-800 bg-base-900/50 px-4 py-3">
      <div className="grid gap-x-6 gap-y-1.5 sm:grid-cols-2">
        {rows.map(([k, v]) => (
          <div key={k} className="flex items-baseline justify-between gap-3">
            <span className="text-[0.6875rem] text-ink-500">{k}</span>
            <span className="mono text-[0.6875rem] text-ink-200">{v}</span>
          </div>
        ))}
      </div>

      {info.mtp.hasMtp && (
        <div className="mt-3 rounded-lg border border-violet-500/30 bg-violet-500/8 px-3 py-2">
          <p className="text-[0.6875rem] font-semibold text-violet-400">
            Incluye bloque de predicción multi-token
          </p>
          <p className="mt-0.5 text-[0.6875rem] leading-relaxed text-ink-400">
            {info.mtp.nPredictLayers !== null && (
              <>Capas de predicción: {info.mtp.nPredictLayers}. </>
            )}
            {info.mtp.convention && <>Convención: {info.mtp.convention}. </>}
            {info.mtp.nTensorsMtp} tensores MTP.
          </p>
        </div>
      )}

      {info.tensorGroups.length > 0 && (
        <div className="mt-3">
          <p className="mb-1.5 text-[0.6875rem] font-medium text-ink-400">
            Reparto de los tensores
          </p>
          <div className="space-y-1">
            {info.tensorGroups.slice(0, 6).map((g) => (
              <div key={g.group} className="flex items-center gap-2">
                <span className="mono w-44 shrink-0 truncate text-[0.6875rem] text-ink-400">
                  {g.group}
                </span>
                <span className="h-1 flex-1 overflow-hidden rounded-full bg-base-800">
                  <span
                    className="block h-full rounded-full bg-accent-500/60"
                    style={{
                      width: `${Math.min(100, (g.mib / (info.tensorGroups[0].mib || 1)) * 100)}%`,
                    }}
                  />
                </span>
                <span className="mono w-16 shrink-0 text-right text-[0.6875rem] tabular-nums text-ink-300">
                  {formatBytes(g.bytes)}
                </span>
              </div>
            ))}
          </div>
          {info.lazyTensorMib > 0 && (
            <p className="mt-2 text-[0.6875rem] leading-relaxed text-ink-500">
              El tensor <span className="mono">per_layer_token_embd</span> ({info.lazyTensorMib}{" "}
              MiB) se carga de forma diferida y se queda en la CPU: no ocupa VRAM.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
