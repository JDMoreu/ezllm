import { type CSSProperties, useCallback, useEffect, useMemo, useRef, useState } from "react";
import clsx from "clsx";
import {
  AlertTriangle,
  ArrowLeft,
  ArrowUpDown,
  Boxes,
  Check,
  Download,
  ExternalLink,
  Heart,
  Search,
} from "lucide-react";

import { api, onHfDownloadProgress } from "../lib/api";
import { Button, useToast } from "../components/ui";
import { Progress } from "@/components/ui-kit/progress";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
} from "@/components/ui-kit/select";
import { basename, formatBytes, formatSpeed } from "../lib/format";
import { t } from "../lib/i18n";
import type {
  HfModelDetail,
  HfModelSummary,
  HfQuant,
} from "../types";

type Sort = "downloads" | "likes" | "lastModified";

/** Orden de resultados. Etiqueta corta a la vista y nombre completo al pasar. */
const SORTS: { value: Sort; label: string; title: string }[] = [
  { value: "downloads", label: "Descargas", title: "Más descargados" },
  { value: "likes", label: "Likes", title: "Mejor valorados" },
  { value: "lastModified", label: "Recientes", title: "Más recientes" },
];

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
  onUseModel,
}: {
  modelsDir: string;
  onUseModel: (model: string, mmproj: string | null, draft: string | null) => void;
}) {
  const toast = useToast();

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

  const [narrow, setNarrow] = useState(() => window.innerWidth < 1200);
  const [narrowDetail, setNarrowDetail] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  const selectedDetail = selectedId ? details[selectedId] ?? null : null;

  useEffect(() => {
    const element = rootRef.current;
    if (!element) return;
    const update = () => setNarrow(element.clientWidth < 900);
    update();
    const observer = new ResizeObserver(update);
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

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
    setNarrowDetail(false);
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
      setNarrowDetail(false);
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
    } catch (error) {
      toast.push(`No se pudo descargar ${quant.label}: ${String(error)}`, "danger");
    } finally {
      setActiveDownload(null);
    }
  }


  const currentSort = SORTS.find((option) => option.value === sort) ?? SORTS[0];

  // El buscador y el orden viven en la cabecera del contenedor. El título de
  // la izquierda cierra el hueco y da nombre al bloque.
  const searchBar = (
    <form
      className="model-searchbar shrink-0"
      onSubmit={(event) => {
        event.preventDefault();
        void runSearch(query);
      }}
    >
      <p className="model-searchbar-title mr-auto flex items-center gap-1.5">
        <Boxes size={13} aria-hidden />
        {t("Explora modelos")}
      </p>
      <label className="model-search-field">
        <Search size={15} className="shrink-0 text-ink-500" aria-hidden />
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          // Enter busca. Sin botón, esta es la única forma: se deja
          // explícita para no depender del envío implícito del form.
          onKeyDown={(event) => {
            if (event.key !== "Enter") return;
            event.preventDefault();
            void runSearch(query);
          }}
          placeholder={t("Busca un GGUF: Qwen3, Gemma 3, DeepSeek…")}
          spellCheck={false}
          aria-label="Buscar modelos GGUF en Hugging Face"
        />
      </label>
      <div className="model-search-actions">
        <Select
          value={sort}
          onValueChange={(value) => {
            const next = value as Sort;
            setSort(next);
            if (searchedFor) void runSearch(searchedFor, next);
            else void loadFeatured(next);
          }}
        >
          <SelectTrigger
            className="w-[8.75rem]"
            aria-label={t("Ordenar resultados")}
            title={t(currentSort.title)}
          >
            <ArrowUpDown size={13} aria-hidden />
            <span className="min-w-0 flex-1 truncate text-left">{t(currentSort.label)}</span>
          </SelectTrigger>
          <SelectContent
            position="popper"
            align="start"
            sideOffset={0}
            className="w-(--radix-select-trigger-width) min-w-0"
          >
            {SORTS.map((option) => (
              <SelectItem key={option.value} value={option.value} title={t(option.title)}>
                {t(option.label)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

      </div>
    </form>
  );

  return (
    <div ref={rootRef} className="flex h-full min-h-0 flex-col gap-4">
      {activeDownload && (
        <div className="model-download-strip">
          <span className="sr-only" role="status">
            {`Descargando ${repoName(activeDownload.repo)} · ${activeDownload.phase}`}
          </span>
          <div className="flex min-w-0 flex-1 items-center gap-2.5">
            <Download size={14} className="shrink-0 text-accent-300" aria-hidden />
            <div className="min-w-0">
              <p className="truncate text-label font-medium text-ink-200">
                {repoName(activeDownload.repo)}{" "}
                <span className="mono text-meta text-ink-500">· {activeDownload.quantId}</span>
              </p>
              <p className="truncate text-meta text-ink-500">
                {activeDownload.phase}
                {activeDownload.file && ` · ${basename(activeDownload.file)}`}
                {activeDownload.fileCount > 0 &&
                  ` (${activeDownload.fileIndex}/${activeDownload.fileCount})`}
              </p>
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-3">
            <span className="mono text-meta text-ink-500">
              {formatSpeed(activeDownload.speed)}
            </span>
            <Progress
              value={Math.min(100, activeDownload.percent)}
              className="h-1.5 w-40"
              aria-label="Progreso de descarga"
            />
            <span className="mono w-9 text-right text-meta text-ink-200">
              {Math.round(activeDownload.percent)}%
            </span>
            <Button
              size="sm"
              variant="quiet"
              onClick={() => {
                setSelectedId(activeDownload.repo);
                if (narrow) setNarrowDetail(true);
              }}
            >
              {t("Ver")}
            </Button>
          </div>
        </div>
      )}

        <section
          className="model-browser flex min-h-0 flex-1 flex-col"
          aria-label="Modelos de Hugging Face"
        >
          {/* Cabecera única del contenedor: buscador y orden, a la derecha. */}
          {searchBar}

          <div
            className={clsx(
              "model-split min-h-0 flex-1",
              !results.length &&
                !searching &&
                !featuredLoading &&
                !selectedId &&
                "model-split-idle",
              narrow && "model-split-narrow",
            )}
          >
            {(!narrow || !narrowDetail) && (
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
                          if (narrow) setNarrowDetail(true);
                        }}
                        className={clsx(
                          "model-result",
                          selectedId === model.id && "model-result-on",
                        )}
                        aria-current={selectedId === model.id ? "true" : undefined}
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
                          <span
                            aria-label={`${formatCount(model.downloads)} descargas`}
                            title={`${formatCount(model.downloads)} descargas`}
                          >
                            <Download size={10} aria-hidden />
                            {formatCount(model.downloads)}
                          </span>
                          <span
                            aria-label={`${formatCount(model.likes)} me gusta`}
                            title={`${formatCount(model.likes)} me gusta`}
                          >
                            <Heart size={10} aria-hidden />
                            {formatCount(model.likes)}
                          </span>
                          {model.lastModified && (
                            <span
                              aria-label={`Actualizado ${formatDate(model.lastModified)}`}
                              title={`Actualizado ${formatDate(model.lastModified)}`}
                            >
                              {formatDate(model.lastModified)}
                            </span>
                          )}
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
                <div className="model-empty">
                  <p>{t("Prueba con un nombre conocido")}</p>
                  <div className="mt-1 flex flex-wrap gap-1.5">
                    {SUGGESTIONS.map((suggestion) => (
                      <button
                        key={suggestion}
                        type="button"
                        className="chip chip-action"
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
            )}

            {(!narrow || narrowDetail) && (
              <div className="model-detail">
              {narrow && selectedId && (
                <div className="model-detail-back">
                  <Button
                    size="sm"
                    variant="quiet"
                    icon={<ArrowLeft size={13} />}
                    onClick={() => setNarrowDetail(false)}
                  >
                    {t("Resultados")}
                    {results.length > 0 && ` (${results.length})`}
                  </Button>
                </div>
              )}
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
            )}
          </div>
        </section>
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
        {t("Los archivos se guardan en")}{" "}
        <span className="mono text-ink-400">{modelsDir || t("la carpeta de modelos")}</span>.
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
                {quantNote(quant.quant) && (
                  <span className="chip" title={quantNoteDetail(quant.quant)}>
                    {quantNote(quant.quant)}
                  </span>
                )}
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

/** Etiqueta corta para la píldora: una línea, sin alargar la fila. */
function quantNote(quant: string): string {
  const value = quant.toUpperCase();
  if (value.startsWith("IQ1") || value.startsWith("Q2")) return t("Mínima");
  if (value.startsWith("IQ2") || value.startsWith("Q3")) return t("Baja");
  if (value === "Q4_0" || value === "Q4_1") return t("Rápida");
  if (value.startsWith("Q4")) return t("Equilibrada");
  if (value.startsWith("Q5")) return t("Alta");
  if (value.startsWith("Q6")) return t("Muy alta");
  if (value.startsWith("Q8")) return t("Casi exacta");
  if (value === "F16" || value === "BF16" || value === "FP16") return t("Exacta");
  return "";
}

/** La explicación larga vive en el tooltip, no dentro de la píldora. */
function quantNoteDetail(quant: string): string {
  const value = quant.toUpperCase();
  if (value.startsWith("IQ1") || value.startsWith("Q2")) return t("Ocupa muy poco y pierde bastante calidad.");
  if (value.startsWith("IQ2") || value.startsWith("Q3")) return t("Ocupa poco y pierde algo de calidad.");
  if (value === "Q4_0" || value === "Q4_1") return t("Rápida de generar, con más pérdida que Q4_K.");
  if (value.startsWith("Q4")) return t("Buen equilibrio entre tamaño y calidad.");
  if (value.startsWith("Q5")) return t("Alta calidad con poco más de tamaño.");
  if (value.startsWith("Q6")) return t("Calidad muy alta; apenas se nota la compresión.");
  if (value.startsWith("Q8")) return t("Casi idéntica al modelo original.");
  if (value === "F16" || value === "BF16" || value === "FP16") return t("El modelo original, sin comprimir.");
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