import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import clsx from "clsx";
import {
  AlertTriangle,
  Check,
  Download,
  ExternalLink,
  FolderOpen,
  HardDrive,
  Heart,
  RefreshCw,
  Search,
} from "lucide-react";

import { api, onHfDownloadProgress } from "../lib/api";
import { Button, useToast } from "../components/ui";
import { basename, formatBytes, formatParams, formatSpeed } from "../lib/format";
import { t } from "../lib/i18n";
import type {
  CatalogEntry,
  CatalogView,
  HfModelDetail,
  HfModelSummary,
  HfQuant,
} from "../types";

type Mode = "hub" | "local";
type Sort = "downloads" | "likes" | "lastModified";

const SUGGESTIONS = ["Qwen3", "Gemma 3", "Llama 3.1", "DeepSeek R1", "Mistral Small"];

interface ActiveDownload {
  repo: string;
  quantId: string;
  percent: number;
  phase: string;
  file: string;
  fileIndex: number;
  fileCount: number;
  speed: number;
}

export default function ModelsView({
  modelsDir,
  selectedModel,
  onUseModel,
  onPickModelsFolder,
}: {
  modelsDir: string;
  selectedModel: string | null;
  onUseModel: (model: string, mmproj: string | null, draft: string | null) => void;
  onPickModelsFolder: () => void;
}) {
  const toast = useToast();
  const [mode, setMode] = useState<Mode>("hub");

  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<Sort>("downloads");
  const [results, setResults] = useState<HfModelSummary[]>([]);
  const [searchedFor, setSearchedFor] = useState("");
  const [searching, setSearching] = useState(false);
  const [featuredLoading, setFeaturedLoading] = useState(true);
  const [searchError, setSearchError] = useState<string | null>(null);
  const featuredRequested = useRef(false);
  const requestId = useRef(0);

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [details, setDetails] = useState<Record<string, HfModelDetail>>({});
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState<string | null>(null);
  const [detailAttempt, setDetailAttempt] = useState(0);

  const [activeDownload, setActiveDownload] = useState<ActiveDownload | null>(null);
  const [downloaded, setDownloaded] = useState<Record<string, string>>({});
  const [using, setUsing] = useState<string | null>(null);

  const [catalog, setCatalog] = useState<CatalogView | null>(null);
  const [catalogLoading, setCatalogLoading] = useState(false);
  const [catalogError, setCatalogError] = useState<string | null>(null);
  const [localQuery, setLocalQuery] = useState("");

  const selectedDetail = selectedId ? details[selectedId] ?? null : null;

  const loadLocal = useCallback(async () => {
    if (!modelsDir) {
      setCatalog(null);
      return;
    }
    setCatalogLoading(true);
    setCatalogError(null);
    try {
      setCatalog(await api.scanModels(modelsDir));
    } catch (error) {
      setCatalogError(String(error));
    } finally {
      setCatalogLoading(false);
    }
  }, [modelsDir]);

  useEffect(() => {
    void loadLocal();
  }, [loadLocal]);

  useEffect(() => {
    if (!selectedId || details[selectedId]) return;
    let alive = true;
    setDetailLoading(true);
    setDetailError(null);
    api
      .hfModel(selectedId)
      .then((detail) => {
        if (alive) setDetails((prev) => ({ ...prev, [selectedId]: detail }));
      })
      .catch((error) => {
        if (alive) setDetailError(String(error));
      })
      .finally(() => {
        if (alive) setDetailLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [selectedId, details, detailAttempt]);

  useEffect(() => {
    return onHfDownloadProgress((progress) => {
      setActiveDownload((current) => {
        if (!current || progress.repo !== current.repo) return current;
        return {
          ...current,
          percent: progress.percent,
          phase: progress.phase,
          file: progress.file,
          fileIndex: progress.fileIndex,
          fileCount: progress.fileCount,
          speed: progress.bytesPerSec,
        };
      });
    });
  }, []);

  const loadFeatured = useCallback(async (nextSort: Sort = "downloads") => {
    const request = ++requestId.current;
    setFeaturedLoading(true);
    setSearchError(null);
    setSelectedId(null);
    setDetailError(null);
    setSearchedFor("");
    try {
      const found = await api.hfPopular(nextSort, 12);
      if (request !== requestId.current) return;
      setResults(found);
      setSelectedId(found[0]?.id ?? null);
    } catch (error) {
      if (request !== requestId.current) return;
      setResults([]);
      setSelectedId(null);
      setSearchError(String(error));
    } finally {
      if (request === requestId.current) setFeaturedLoading(false);
    }
  }, []);

  useEffect(() => {
    if (featuredRequested.current) return;
    featuredRequested.current = true;
    void loadFeatured("downloads");
  }, [loadFeatured]);

  const runSearch = useCallback(
    async (term: string, nextSort: Sort = sort) => {
      const value = term.trim();
      if (!value) {
        setQuery("");
        await loadFeatured(nextSort);
        return;
      }
      const request = ++requestId.current;
      setFeaturedLoading(false);
      setSearching(true);
      setSearchError(null);
      setSearchedFor(value);
      setSelectedId(null);
      setDetailError(null);
      try {
        const found = await api.hfSearch(value, nextSort, 30);
        if (request !== requestId.current) return;
        setResults(found);
        setSelectedId(found[0]?.id ?? null);
      } catch (error) {
        if (request !== requestId.current) return;
        setResults([]);
        setSelectedId(null);
        setSearchError(String(error));
      } finally {
        if (request === requestId.current) setSearching(false);
      }
    },
    [loadFeatured, sort],
  );

  const useModel = useCallback(
    async (path: string) => {
      setUsing(path);
      try {
        let companions: [string | null, string | null] = [null, null];
        if (modelsDir) {
          companions = await api
            .findCompanions(path, modelsDir)
            .catch(() => [null, null] as [string | null, string | null]);
        }
        onUseModel(path, companions[0], companions[1]);
        toast.push("Modelo listo en Ejecutar", "success");
      } finally {
        setUsing(null);
      }
    },
    [modelsDir, onUseModel, toast],
  );

  async function download(detail: HfModelDetail, quant: HfQuant) {
    if (activeDownload || detail.gated || quant.incomplete) return;
    const key = downloadKey(detail.id, quant.id);
    setActiveDownload({
      repo: detail.id,
      quantId: quant.id,
      percent: 0,
      phase: "preparando",
      file: "",
      fileIndex: 0,
      fileCount: quant.files.length,
      speed: 0,
    });
    try {
      const result = await api.hfDownload(
        detail.id,
        quant.files.map((file) => file.path),
      );
      setDownloaded((prev) => ({
        ...prev,
        [key]: result.modelPath ?? "",
      }));
      toast.push(`${quant.label} descargado`, "success");
      void loadLocal();
    } catch (error) {
      toast.push(`No se pudo descargar ${quant.label}: ${String(error)}`, "danger");
    } finally {
      setActiveDownload(null);
    }
  }

  const filteredLocal = useMemo(() => {
    const entries = catalog?.entries ?? [];
    const needle = localQuery.trim().toLowerCase();
    return entries
      .filter((entry) => {
        if (!needle) return true;
        return [entry.name, entry.fileName, entry.quant, entry.arch]
          .filter(Boolean)
          .some((value) => value.toLowerCase().includes(needle));
      })
      .sort((a, b) => {
        const order = roleOrder(a.role) - roleOrder(b.role);
        return order || a.fileName.localeCompare(b.fileName);
      });
  }, [catalog, localQuery]);

  return (
    <div className="space-y-4">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-body leading-relaxed text-ink-500">
          {t("Explora GGUF en Hugging Face y elige un modelo para el servidor.")}
        </p>
        <div className="model-tabs" role="tablist" aria-label="Origen de modelos">
          <button
            type="button"
            role="tab"
            aria-selected={mode === "hub"}
            onClick={() => setMode("hub")}
            className={clsx("model-tab", mode === "hub" && "model-tab-on")}
          >
            Hugging Face
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={mode === "local"}
            onClick={() => setMode("local")}
            className={clsx("model-tab", mode === "local" && "model-tab-on")}
          >
            Local
            {catalog && catalog.primary.length > 0 && <span>{catalog.primary.length}</span>}
          </button>
        </div>
      </header>

      {mode === "hub" ? (
        <section className="model-browser" aria-label="Modelos de Hugging Face">
          <form
            className="model-searchbar"
            onSubmit={(event) => {
              event.preventDefault();
              void runSearch(query);
            }}
          >
            <label className="model-search-field">
              <Search size={15} className="shrink-0 text-ink-500" aria-hidden />
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder={t("Busca un GGUF: Qwen3, Gemma 3, DeepSeek…")}
                spellCheck={false}
                aria-label="Buscar modelos GGUF en Hugging Face"
              />
            </label>
            <select
              value={sort}
              onChange={(event) => {
                const next = event.target.value as Sort;
                setSort(next);
                if (searchedFor) void runSearch(searchedFor, next);
                else void loadFeatured(next);
              }}
              className="field model-sort"
              aria-label="Ordenar resultados"
            >
              <option value="downloads">{t("Más descargados")}</option>
              <option value="likes">{t("Mejor valorados")}</option>
              <option value="lastModified">{t("Más recientes")}</option>
            </select>
            <Button type="submit" variant="primary" loading={searching}>
              {t("Buscar")}
            </Button>
          </form>

          <div
            className={clsx(
              "model-split",
              !results.length &&
                !searching &&
                !featuredLoading &&
                !selectedId &&
                "model-split-idle",
            )}
          >
            <div className="model-results">
              <div className="model-results-head">
                <span>
                  {searchedFor
                    ? `${t("Resultados para")} “${searchedFor}”`
                    : t("Populares en Hugging Face")}
                </span>
                {results.length > 0 && <span className="mono">{results.length}</span>}
              </div>

              {searching || featuredLoading ? (
                <div className="space-y-2 p-3">
                  {Array.from({ length: 7 }).map((_, index) => (
                    <div key={index} className="skeleton h-14" />
                  ))}
                </div>
              ) : searchError ? (
                <div className="model-empty" role="alert">
                  <AlertTriangle size={16} className="text-warn-400" />
                  <p>{searchError}</p>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => void (searchedFor ? runSearch(searchedFor) : loadFeatured(sort))}
                  >
                    Reintentar
                  </Button>
                </div>
              ) : results.length > 0 ? (
                <ul className="model-result-list">
                  {results.map((model) => (
                    <li key={model.id}>
                      <button
                        type="button"
                        onClick={() => {
                          setSelectedId(model.id);
                          setDetailError(null);
                        }}
                        className={clsx(
                          "model-result",
                          selectedId === model.id && "model-result-on",
                        )}
                        title={model.id}
                      >
                        <div className="flex min-w-0 items-start gap-2">
                          <div className="min-w-0 flex-1">
                            <p className="model-result-title">{repoName(model.id)}</p>
                            <p className="model-result-author">{model.author || "Hugging Face"}</p>
                          </div>
                          {model.gated && <span className="chip chip-warn">Gated</span>}
                        </div>
                        <div className="model-result-meta">
                          <span>
                            <Download size={10} />
                            {formatCount(model.downloads)}
                          </span>
                          <span>
                            <Heart size={10} />
                            {formatCount(model.likes)}
                          </span>
                          {model.lastModified && <span>{formatDate(model.lastModified)}</span>}
                        </div>
                      </button>
                    </li>
                  ))}
                </ul>
              ) : searchedFor ? (
                <div className="model-empty">
                  <p>{t("No hay modelos GGUF para")} “{searchedFor}”. {t("Prueba otra búsqueda.")}</p>
                </div>
              ) : (
                <div className="model-idle">
                  <p className="text-body font-medium text-ink-200">No hay populares ahora</p>
                  <p className="mt-1 text-label leading-relaxed text-ink-500">
                    Escribe un modelo o empieza por una de estas búsquedas.
                  </p>
                  <div className="mt-3 flex flex-wrap gap-1.5">
                    {SUGGESTIONS.map((suggestion) => (
                      <button
                        key={suggestion}
                        type="button"
                        className="quick-search"
                        onClick={() => {
                          setQuery(suggestion);
                          void runSearch(suggestion);
                        }}
                      >
                        {suggestion}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>

            <div className="model-detail">
              {!selectedId ? (
                <div className="model-empty">
                  <p className="text-body font-medium text-ink-200">{t("Detalle del modelo")}</p>
                  <p className="mt-1 max-w-[46ch] text-label leading-relaxed text-ink-500">
                    {t("Elige un resultado para ver arquitectura, contexto y las cuantizaciones disponibles antes de descargar.")}
                  </p>
                </div>
              ) : detailLoading && !selectedDetail ? (
                <div className="space-y-3 p-4">
                  <div className="skeleton h-8 w-2/3" />
                  <div className="skeleton h-4 w-1/3" />
                  <div className="skeleton mt-5 h-20" />
                  <div className="skeleton h-14" />
                  <div className="skeleton h-14" />
                </div>
              ) : detailError && !selectedDetail ? (
                <div className="model-empty" role="alert">
                  <AlertTriangle size={16} className="text-warn-400" />
                  <p>{detailError}</p>
                  <Button size="sm" variant="ghost" onClick={() => setDetailAttempt((n) => n + 1)}>
                    Reintentar
                  </Button>
                </div>
              ) : selectedDetail ? (
                <Detail
                  detail={selectedDetail}
                  modelsDir={modelsDir}
                  active={activeDownload}
                  downloaded={downloaded}
                  using={using}
                  onDownload={(quant) => void download(selectedDetail, quant)}
                  onUse={(path) => void useModel(path)}
                />
              ) : null}
            </div>
          </div>
        </section>
      ) : (
        <section className="model-browser" aria-label="Modelos instalados">
          <div className="local-bar">
            <div className="min-w-0">
              <p className="flex items-center gap-1.5 text-label font-medium text-ink-200">
                <HardDrive size={13} className="text-ink-500" />
                {modelsDir ? basename(modelsDir) : "Sin carpeta de modelos"}
              </p>
              <p className="mt-0.5 truncate text-meta text-ink-500" title={modelsDir}>
                {modelsDir || "Elige una carpeta para escanear modelos GGUF."}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <Button
                size="sm"
                variant="ghost"
                icon={<FolderOpen size={13} />}
                onClick={onPickModelsFolder}
              >
                {t("Cambiar carpeta")}
              </Button>
              <Button
                size="sm"
                variant="quiet"
                icon={<RefreshCw size={13} className={catalogLoading ? "animate-spin" : ""} />}
                onClick={() => void loadLocal()}
                disabled={!modelsDir || catalogLoading}
              >
                {t("Actualizar")}
              </Button>
            </div>
          </div>

          <div className="local-toolbar">
            <label className="model-search-field">
              <Search size={14} className="shrink-0 text-ink-500" aria-hidden />
              <input
                value={localQuery}
                onChange={(event) => setLocalQuery(event.target.value)}
                placeholder={t("Filtrar modelos instalados…")}
                aria-label="Filtrar modelos instalados"
                spellCheck={false}
              />
            </label>
            <span className="text-meta text-ink-500">
              {catalogLoading
                ? "Escaneando…"
                : `${filteredLocal.length} de ${catalog?.entries.length ?? 0} archivos`}
            </span>
          </div>

          {catalogError ? (
            <div className="model-empty" role="alert">
              <AlertTriangle size={16} className="text-warn-400" />
              <p>{catalogError}</p>
            </div>
          ) : catalogLoading && !catalog ? (
            <div className="space-y-2 p-3">
              {Array.from({ length: 5 }).map((_, index) => (
                <div key={index} className="skeleton h-14" />
              ))}
            </div>
          ) : filteredLocal.length > 0 ? (
            <ul className="local-list">
              {filteredLocal.map((entry) => (
                <LocalRow
                  key={entry.path}
                  entry={entry}
                  selected={selectedModel === entry.path}
                  using={using === entry.path}
                  onUse={() => void useModel(entry.path)}
                />
              ))}
            </ul>
          ) : (
            <div className="model-empty">
              <p className="text-body font-medium text-ink-200">
                {modelsDir ? t("No hay archivos GGUF aquí") : t("Elige una carpeta de modelos")}
              </p>
              <p className="mt-1 text-label text-ink-500">
                {modelsDir
                  ? t("Descarga uno desde Hugging Face o elige otra carpeta.")
                  : "EzLLM escanea la carpeta de forma recursiva."}
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                {!modelsDir && (
                  <Button size="sm" variant="primary" onClick={onPickModelsFolder}>
                    Elegir carpeta
                  </Button>
                )}
                <Button size="sm" variant="ghost" onClick={() => setMode("hub")}>
                  {t("Buscar en Hugging Face")}
                </Button>
              </div>
            </div>
          )}
        </section>
      )}
    </div>
  );
}

function Detail({
  detail,
  modelsDir,
  active,
  downloaded,
  using,
  onDownload,
  onUse,
}: {
  detail: HfModelDetail;
  modelsDir: string;
  active: ActiveDownload | null;
  downloaded: Record<string, string>;
  using: string | null;
  onDownload: (quant: HfQuant) => void;
  onUse: (path: string) => void;
}) {
  const groups = useMemo(
    () => ({
      primary: detail.quants.filter((quant) => quant.role === "primary"),
      mmproj: detail.quants.filter((quant) => quant.role === "mmproj"),
      draft: detail.quants.filter((quant) => quant.role === "draft"),
    }),
    [detail.quants],
  );

  return (
    <div className="model-detail-body">
      <div className="model-detail-head">
        <div className="min-w-0">
          <p className="mono truncate text-meta text-ink-500" title={detail.id}>
            {detail.id}
          </p>
          <h2 className="mt-1 text-title font-semibold tracking-tight text-ink-100">
            {repoName(detail.id)}
          </h2>
          <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
            {detail.gguf.architecture && <span className="chip">{detail.gguf.architecture}</span>}
            {detail.pipelineTag && <span className="chip">{detail.pipelineTag}</span>}
            {detail.tags
              .filter((tag) => tag !== "gguf" && tag !== detail.pipelineTag)
              .slice(0, 3)
              .map((tag) => (
                <span key={tag} className="chip">
                  {tag}
                </span>
              ))}
          </div>
          <a
            href={`https://huggingface.co/${detail.id}`}
            target="_blank"
            rel="noreferrer"
            className="mt-2 inline-flex items-center gap-1.5 text-label font-medium text-accent-300 hover:text-accent-200"
          >
            {t("Ver en Hugging Face")}
            <ExternalLink size={12} />
          </a>
        </div>
      </div>

      <dl className="model-metrics">
        <Metric label={t("Contexto")} value={formatContext(detail.gguf.contextLength)} />
        <Metric label={t("Descargas")} value={formatCount(detail.downloads)} />
        <Metric label={t("Me gusta")} value={formatCount(detail.likes)} />
        <Metric label={t("Actualizado")} value={detail.lastModified ? formatDate(detail.lastModified) : "—"} />
      </dl>

      {detail.gated && (
        <p className="model-warning">
          <AlertTriangle size={14} className="mt-0.5 shrink-0" />
          Repositorio con acceso restringido: acepta la licencia en Hugging Face. Esta versión
          descarga de forma anónima y no acepta tokens.
        </p>
      )}

      <div className="mt-5 flex items-end justify-between gap-3">
        <div>
          <h3 className="text-body font-semibold text-ink-100">{t("Descargas GGUF")}</h3>
          <p className="mt-0.5 text-meta text-ink-500">
            {groups.primary.length}{" "}
            {groups.primary.length === 1 ? t("cuantización") : t("cuantizaciones")}
            {groups.mmproj.length > 0 &&
              ` · ${groups.mmproj.length} ${
                groups.mmproj.length === 1 ? "proyector" : "proyectores"
              }`}
            {groups.draft.length > 0 &&
              ` · ${groups.draft.length} ${groups.draft.length === 1 ? "draft" : "drafts"}`}
          </p>
        </div>
      </div>

      {groups.primary.length === 0 && groups.mmproj.length === 0 && groups.draft.length === 0 ? (
        <p className="model-empty">Este repositorio no contiene archivos GGUF descargables.</p>
      ) : (
        <div className="quant-list">
          {groups.primary.length > 0 && (
            <QuantGroup
              title="Modelo"
              quants={groups.primary}
              repo={detail.id}
              gated={detail.gated}
              active={active}
              downloaded={downloaded}
              using={using}
              onDownload={onDownload}
              onUse={onUse}
            />
          )}
          {groups.mmproj.length > 0 && (
            <QuantGroup
              title={t("Proyector multimodal")}
              hint={t("Necesario para imágenes, audio o vídeo.")}
              quants={groups.mmproj}
              repo={detail.id}
              gated={detail.gated}
              active={active}
              downloaded={downloaded}
              using={using}
              onDownload={onDownload}
              onUse={onUse}
            />
          )}
          {groups.draft.length > 0 && (
            <QuantGroup
              title={t("Draft / MTP")}
              hint={t("Opcional para decodificación especulativa.")}
              quants={groups.draft}
              repo={detail.id}
              gated={detail.gated}
              active={active}
              downloaded={downloaded}
              using={using}
              onDownload={onDownload}
              onUse={onUse}
            />
          )}
        </div>
      )}

      <p className="mt-5 border-t border-base-800 pt-3 text-meta leading-relaxed text-ink-500">
        Los archivos se guardan en{" "}
        <span className="mono text-ink-400">{modelsDir || "la carpeta de modelos"}</span>.
        {" "}Puedes usar el modelo descargado desde la pestaña Local.
      </p>
    </div>
  );
}

function QuantGroup({
  title,
  hint,
  quants,
  repo,
  gated,
  active,
  downloaded,
  using,
  onDownload,
  onUse,
}: {
  title: string;
  hint?: string;
  quants: HfQuant[];
  repo: string;
  gated: boolean;
  active: ActiveDownload | null;
  downloaded: Record<string, string>;
  using: string | null;
  onDownload: (quant: HfQuant) => void;
  onUse: (path: string) => void;
}) {
  return (
    <section className="quant-group">
      <div className="quant-group-head">
        <h4>{title}</h4>
        {hint && <p>{hint}</p>}
      </div>
      {quants.map((quant) => {
        const key = downloadKey(repo, quant.id);
        const path = downloaded[key];
        const hasDownloaded = path !== undefined;
        const isActive = active?.repo === repo && active.quantId === quant.id;
        const isPrimary = quant.role === "primary";
        return (
          <div key={quant.id} className={clsx("quant-row", isActive && "quant-row-on")}>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <span
                  className="quant-label"
                  title={quant.files.map((file) => file.path).join("\n")}
                >
                  {quant.quant || quant.label}
                </span>
                {quant.incomplete && <span className="chip chip-warn">Incompleto</span>}
                {quant.sharded && <span className="chip">{quant.files.length} archivos</span>}
                {quantNote(quant.quant) && <span className="chip">{quantNote(quant.quant)}</span>}
              </div>
              <p className="mt-0.5 truncate text-meta text-ink-500">
                {formatBytes(quant.size)}
                {quant.files.length === 1 && ` · ${basename(quant.files[0].path)}`}
              </p>
            </div>

            <div className="flex shrink-0 items-center gap-2">
              {path && isPrimary && (
                <Button
                  size="sm"
                  variant={using === path ? "quiet" : "primary"}
                  loading={using === path}
                  onClick={() => onUse(path)}
                >
                  {t("Usar")}
                </Button>
              )}
              {hasDownloaded ? (
                <span className="flex items-center gap-1 text-label font-medium text-ok-400">
                  <Check size={13} />
                  {t("Descargado")}
                </span>
              ) : (
                <Button
                  size="sm"
                  variant="ghost"
                  icon={<Download size={13} />}
                  onClick={() => onDownload(quant)}
                  disabled={!!active || gated || quant.incomplete}
                  title={
                    gated
                      ? "Este repositorio requiere acceso en Hugging Face"
                      : quant.incomplete
                        ? "Faltan archivos de esta cuantización"
                        : undefined
                  }
                >
                  {t("Descargar")}
                </Button>
              )}
            </div>

            {isActive && active && (
              <div className="quant-progress">
                <div className="flex items-center justify-between gap-3 text-meta">
                  <span className="truncate text-ink-300">
                    {active.phase}
                    {active.file && ` · ${basename(active.file)}`}
                    {active.fileCount > 0 && ` (${active.fileIndex}/${active.fileCount})`}
                  </span>
                  <span className="mono shrink-0 text-ink-200">
                    {active.percent.toFixed(0)}%
                  </span>
                </div>
                <div className="meter mt-1.5">
                  <span style={{ "--fill": Math.min(1, active.percent / 100) } as CSSProperties} />
                </div>
                <div className="mt-1 flex justify-between text-meta text-ink-500">
                  <span>{active.phase === "verificando" ? "Comprobando SHA-256" : "Descargando"}</span>
                  <span className="mono">{formatSpeed(active.speed)}</span>
                </div>
              </div>
            )}
          </div>
        );
      })}
    </section>
  );
}

function LocalRow({
  entry,
  selected,
  using,
  onUse,
}: {
  entry: CatalogEntry;
  selected: boolean;
  using: boolean;
  onUse: () => void;
}) {
  const isPrimary = entry.role === "primary";
  return (
    <li className={clsx("local-row", selected && "local-row-on")}>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className={clsx("role-mark", isPrimary ? "role-mark-primary" : "role-mark-alt")}>
            {roleLabel(entry.role)}
          </span>
          <p className="truncate text-body font-medium text-ink-100" title={entry.name || entry.fileName}>
            {entry.name || entry.fileName}
          </p>
          {entry.error && <span className="chip chip-warn">Lectura parcial</span>}
        </div>
        <p className="mt-0.5 truncate font-mono text-meta text-ink-500" title={entry.path}>
          {entry.fileName}
        </p>
        <p className="mt-0.5 flex flex-wrap gap-x-2 gap-y-0.5 text-meta text-ink-400">
          {entry.quant && <span>{entry.quant}</span>}
          {entry.arch && <span>{entry.arch}</span>}
          {entry.nParamsEst > 0 && <span>{formatParams(entry.nParamsEst)}</span>}
          {entry.contextLength > 0 && <span>{formatContext(entry.contextLength)}</span>}
          {entry.nLayers > 0 && <span>{entry.nLayers} {t("capas")}</span>}
        </p>
        {entry.error && <p className="mt-1 text-meta text-warn-400">{entry.error}</p>}
      </div>

      <div className="flex shrink-0 items-center gap-3">
        <span className="mono text-label text-ink-300">{formatBytes(entry.sizeBytes)}</span>
        {isPrimary &&
          (selected ? (
            <span className="flex items-center gap-1 text-label font-medium text-accent-300">
              <Check size={13} />
              {t("En uso")}
            </span>
          ) : (
            <Button size="sm" variant="ghost" loading={using} onClick={onUse}>
              {t("Usar")}
            </Button>
          ))}
      </div>
    </li>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt>{label}</dt>
      <dd className="mono mt-0.5 text-label text-ink-200">{value}</dd>
    </div>
  );
}

function repoName(id: string): string {
  return id.split("/").filter(Boolean).pop() ?? id;
}

function downloadKey(repo: string, quant: string): string {
  return `${repo}::${quant}`;
}

function roleLabel(role: string): string {
  switch (role) {
    case "primary":
      return "Modelo";
    case "mmproj":
      return "Proyector";
    case "draft":
      return "Draft";
    default:
      return role;
  }
}

function roleOrder(role: string): number {
  return role === "primary" ? 0 : role === "mmproj" ? 1 : 2;
}

function quantNote(quant: string): string {
  const value = quant.toUpperCase();
  if (value.startsWith("IQ1") || value.startsWith("Q2")) return "Mínimo";
  if (value.startsWith("IQ2") || value.startsWith("Q3")) return "Bajo";
  if (value === "Q4_0" || value === "Q4_1") return "Rápido";
  if (value.startsWith("Q4")) return "Equilibrado";
  if (value.startsWith("Q5")) return "Alta calidad";
  if (value.startsWith("Q6")) return "Casi fiel";
  if (value.startsWith("Q8")) return "Prácticamente fiel";
  if (value === "F16" || value === "BF16" || value === "FP16") return "Original";
  return "";
}

function formatCount(value: number): string {
  if (!Number.isFinite(value) || value <= 0) return "0";
  return new Intl.NumberFormat("es-ES", {
    notation: "compact",
    maximumFractionDigits: 1,
  }).format(value);
}

function formatContext(tokens: number | null): string {
  if (!tokens) return "—";
  return `${formatCount(tokens)} tokens`;
}

function formatDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("es-ES", {
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(date);
}
