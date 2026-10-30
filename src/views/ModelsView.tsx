import {
  type CSSProperties,
  type ReactNode,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import clsx from "clsx";
import {
  AlertTriangle,
  ArrowLeft,
  ArrowUpDown,
  Check,
  Clock,
  Download,
  ExternalLink,
  Heart,
  ListFilter,
  Lock,
  ScrollText,
  Search,
  Star,
  X,
} from "lucide-react";

import { api } from "../lib/api";
import { Button, ConfirmDialog, useToast } from "../components/ui";
import FitBadge from "../components/FitBadge";
import Hint from "../components/Hint";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
} from "@/components/ui-kit/select";
import { fitOf, percentOf, type FitTone } from "../lib/fit";
import { formatSpeed } from "../lib/format";
import { currentLocale, t } from "../lib/i18n";
import type { DownloadsApi } from "../lib/useDownloads";
import { downloadKey } from "../lib/useDownloads";
import type { HfModelDetail, HfModelSummary, HfQuant } from "../types";

type Sort = "downloads" | "likes" | "lastModified";

/** Orden de resultados. Etiqueta corta a la vista y nombre completo al pasar. */
const SORTS: { value: Sort; label: string; title: string }[] = [
  { value: "downloads", label: "Descargas", title: "Más descargados" },
  { value: "likes", label: "Likes", title: "Mejor valorados" },
  { value: "lastModified", label: "Recientes", title: "Más recientes" },
];

const SUGGESTIONS = ["Qwen3", "Gemma 3", "Llama 3.1", "DeepSeek R1", "Mistral Small"];

/** Desde 4 GiB la descarga se confirma: 17 GB no es un clic. */
const CONFIRM_BYTES = 4 * 1024 * 1024 * 1024;

export default function ModelsView({
  modelsDir,
  onUseModel,
  downloads,
  vramTotalMib,
}: {
  modelsDir: string;
  onUseModel: (model: string, mmproj: string | null, draft: string | null) => void;
  downloads: DownloadsApi;
  vramTotalMib: number;
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

  const [pendingDownload, setPendingDownload] = useState<{
    detail: HfModelDetail;
    quant: HfQuant;
  } | null>(null);
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

  const clearSearch = useCallback(() => {
    setQuery("");
    void loadFeatured(sort);
  }, [loadFeatured, sort]);

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
        toast.push(t("Modelo listo en Ejecutar"), "success");
      } finally {
        setUsing(null);
      }
    },
    [modelsDir, onUseModel, toast],
  );

  /** Las descargas grandes se confirman con su tamaño: 17 GB no es un clic. */
  const requestDownload = useCallback(
    (detail: HfModelDetail, quant: HfQuant) => {
      if (downloads.isQueued(detail.id, quant.id) || detail.gated || quant.incomplete) return;
      if (quant.size >= CONFIRM_BYTES) {
        setPendingDownload({ detail, quant });
        return;
      }
      downloads.enqueue(detail, quant);
    },
    [downloads],
  );

  const confirmDownload = useCallback(() => {
    if (!pendingDownload) return;
    downloads.enqueue(pendingDownload.detail, pendingDownload.quant);
    setPendingDownload(null);
  }, [downloads, pendingDownload]);

  const currentSort = SORTS.find((option) => option.value === sort) ?? SORTS[0];

  // Una sola búsqueda y su orden, en la cabecera del contenedor. Enter busca,
  // Esc limpia y vuelve a los populares.
  const searchBar = (
    <form
      className="model-searchbar shrink-0"
      onSubmit={(event) => {
        event.preventDefault();
        void runSearch(query);
      }}
    >
      <label className="model-search-field max-w-none flex-1">
        <Search size={15} className="shrink-0 text-ink-500" aria-hidden />
        <input
          id="model-search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Escape") clearSearch();
          }}
          placeholder={t("Busca un GGUF: Qwen3, Gemma 3, DeepSeek…")}
          spellCheck={false}
          aria-label={t("Buscar modelos GGUF en Hugging Face")}
        />
        {query && (
          <button
            type="button"
            onClick={clearSearch}
            className="arg-search-clear"
            aria-label={t("Limpiar búsqueda")}
            title={t("Limpiar búsqueda")}
          >
            <X size={12} />
          </button>
        )}
      </label>

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
    </form>
  );

  return (
    <div ref={rootRef} className="flex h-full min-h-0 flex-col gap-4">
      <section
        className="model-browser flex min-h-0 flex-1 flex-col"
        aria-label={t("Modelos de Hugging Face")}
      >
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
                    {t("Reintentar")}
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
                          {model.gated && (
                            <span
                              role="img"
                              aria-label={t("Requiere acceso en Hugging Face")}
                              title={t("Requiere acceso en Hugging Face")}
                              className="inline-flex shrink-0 pt-0.5 text-ink-500"
                            >
                              <Lock size={12} aria-hidden />
                            </span>
                          )}
                        </div>
                        <div className="model-result-meta">
                          <span title={t("Descargas")}>
                            <Download size={10} aria-hidden />
                            {formatCount(model.downloads)}
                          </span>
                          <span title={t("Me gusta")}>
                            <Heart size={10} aria-hidden />
                            {formatCount(model.likes)}
                          </span>
                          {model.lastModified && (
                            <span title={t("Actualizado {date}", { date: formatDate(model.lastModified) })}>
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
                  <p>
                    {t("No hay modelos GGUF para")} “{searchedFor}”. {t("Prueba otra búsqueda.")}
                  </p>
                </div>
              ) : (
                <div className="model-empty">
                  <p>{t("Prueba con un nombre conocido")}</p>
                  <div className="flex flex-wrap gap-x-3 gap-y-1">
                    {SUGGESTIONS.map((suggestion) => (
                      <Button
                        key={suggestion}
                        size="sm"
                        variant="quiet"
                        onClick={() => {
                          setQuery(suggestion);
                          void runSearch(suggestion);
                        }}
                      >
                        {suggestion}
                      </Button>
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
                  <p>{t("Elige un modelo para ver sus archivos GGUF.")}</p>
                </div>
              ) : detailLoading && !selectedDetail ? (
                <div className="space-y-3 p-4">
                  <div className="skeleton h-8 w-2/3" />
                  <div className="skeleton h-4 w-1/3" />
                  <div className="skeleton mt-5 h-14" />
                  <div className="skeleton h-12" />
                  <div className="skeleton h-12" />
                </div>
              ) : detailError && !selectedDetail ? (
                <div className="model-empty" role="alert">
                  <AlertTriangle size={16} className="text-warn-400" />
                  <p>{detailError}</p>
                  <Button size="sm" variant="ghost" onClick={() => setDetailAttempt((n) => n + 1)}>
                    {t("Reintentar")}
                  </Button>
                </div>
              ) : selectedDetail ? (
                <Detail
                  detail={selectedDetail}
                  modelsDir={modelsDir}
                  downloads={downloads}
                  vramTotalMib={vramTotalMib}
                  using={using}
                  onDownload={requestDownload}
                  onUse={(path) => void useModel(path)}
                />
              ) : null}
            </div>
          )}
        </div>
      </section>

      <ConfirmDialog
        open={pendingDownload !== null}
        title={t("Descargar un modelo grande")}
        message={
          pendingDownload ? (
            <>
              {t("El archivo ocupa {size} y puede tardar varios minutos. Se guardará en", {
                size: formatSize(pendingDownload.quant.size),
              })}{" "}
              <span className="mono text-ink-100">{modelsDir || t("la carpeta de modelos")}</span>.
            </>
          ) : null
        }
        confirmLabel={t("Descargar")}
        onConfirm={confirmDownload}
        onCancel={() => setPendingDownload(null)}
      />
    </div>
  );
}

function Detail({
  detail,
  modelsDir,
  downloads,
  vramTotalMib,
  using,
  onDownload,
  onUse,
}: {
  detail: HfModelDetail;
  modelsDir: string;
  downloads: DownloadsApi;
  vramTotalMib: number;
  using: string | null;
  onDownload: (detail: HfModelDetail, quant: HfQuant) => void;
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

  const author = detail.id.includes("/") ? detail.id.split("/")[0] : "";
  const meta = [author, detail.lastModified ? formatDate(detail.lastModified) : ""]
    .filter(Boolean)
    .join(" · ");
  const vramGb = vramTotalMib / 1024;

  // Un solo criterio para toda la lista: el icono sale de fitOf() y el
  // porcentaje del tooltip, de percentOf(). Sin VRAM conocida, gris.
  const fitFor = useCallback(
    (quant: HfQuant): { tone: FitTone; detail: string } | null => {
      if (quant.role !== "primary") return null;
      const gb = quant.size / 1024 ** 3;
      const tone = fitOf(gb, vramGb);
      if (tone === "unknown") return { tone, detail: formatSize(quant.size) };
      return {
        tone,
        detail: t("{size} de {vram} ({percent}%)", {
          size: formatSize(quant.size),
          vram: `${vramGb.toFixed(0)} GB`,
          percent: percentOf(gb, vramGb),
        }),
      };
    },
    [vramGb],
  );

  const recommended = useMemo(() => {
    if (groups.primary.length === 0 || vramTotalMib <= 0) return null;
    const fits = groups.primary.filter((quant) => {
      const tone = fitFor(quant)?.tone;
      return tone === "fit" || tone === "tight";
    });
    const pool = fits.length > 0 ? fits : groups.primary;
    return (
      pool.find((quant) => /Q4_K_M/i.test(quant.quant)) ??
      [...pool].sort((a, b) => (fits.length > 0 ? b.size - a.size : a.size - b.size))[0] ??
      null
    );
  }, [fitFor, groups.primary, vramTotalMib]);

  const [onlyFitting, setOnlyFitting] = useState(false);
  const primaryVisible = useMemo(
    () =>
      onlyFitting
        ? groups.primary.filter((quant) => fitFor(quant)?.tone !== "no")
        : groups.primary,
    [fitFor, groups.primary, onlyFitting],
  );

  const renderRows = (quants: HfQuant[]) =>
    quants.map((quant) => (
      <FileRow
        key={quant.id}
        quant={quant}
        repo={detail.id}
        gated={detail.gated}
        downloads={downloads}
        recommended={recommended?.id === quant.id}
        fit={fitFor(quant)}
        showVariant={quants.length > 1}
        using={using}
        onDownload={(item) => onDownload(detail, item)}
        onUse={onUse}
      />
    ));

  const filterToggle =
    vramTotalMib > 0 && groups.primary.length > 1 ? (
      <Hint label={t("Ocultar las que no caben en tu VRAM")}>
        <span className="inline-flex">
          <Button
            size="sm"
            variant="ghost"
            icon={<ListFilter size={13} />}
            aria-label={t("Ocultar las que no caben en tu VRAM")}
            aria-pressed={onlyFitting}
            onClick={() => setOnlyFitting((value) => !value)}
            className={clsx("w-7 px-0!", onlyFitting && "text-accent-300")}
          />
        </span>
      </Hint>
    ) : null;

  const hasFiles = groups.primary.length + groups.mmproj.length + groups.draft.length > 0;

  return (
    <div className="model-detail-body">
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <h2
            className="truncate text-title font-semibold tracking-tight text-ink-100"
            title={detail.id}
          >
            {repoName(detail.id)}
          </h2>
          {meta && <p className="mt-1 truncate text-meta text-ink-500">{meta}</p>}
          <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-label text-ink-300">
            <Stat icon={<Download size={12} />} label={t("Descargas")} value={formatCount(detail.downloads)} />
            <Stat icon={<Heart size={12} />} label={t("Me gusta")} value={formatCount(detail.likes)} />
            {detail.gguf.contextLength ? (
              <Stat
                icon={<ScrollText size={12} />}
                label={t("Contexto máximo")}
                value={formatInteger(detail.gguf.contextLength)}
              />
            ) : null}
          </div>
        </div>
        <Hint label={t("Abrir en Hugging Face")}>
          <a
            href={`https://huggingface.co/${detail.id}`}
            target="_blank"
            rel="noreferrer"
            aria-label={t("Abrir en Hugging Face")}
            className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-control border border-base-700 text-ink-300 transition-colors duration-150 hover:border-base-600 hover:text-ink-100"
          >
            <ExternalLink size={13} aria-hidden />
          </a>
        </Hint>
      </div>

      {detail.gated && (
        <p className="mt-3 flex items-start gap-2 text-label leading-relaxed text-ink-300">
          <AlertTriangle size={14} className="mt-0.5 shrink-0 text-warn-400" aria-hidden />
          {t(
            "Repositorio con acceso restringido: acepta la licencia en Hugging Face. Esta versión descarga de forma anónima y no acepta tokens.",
          )}
        </p>
      )}

      {hasFiles ? (
        <div className="quant-list mt-5">
          {groups.primary.length > 0 && (
            <FileGroup
              title={
                <>
                  {t("Archivos GGUF")}
                  <span className="mono font-normal text-ink-500">{groups.primary.length}</span>
                </>
              }
              aside={filterToggle}
            >
              {primaryVisible.length > 0 ? (
                renderRows(primaryVisible)
              ) : (
                <p className="model-empty">
                  {t("Ninguna cuantización cabe en tu equipo. Quita el filtro para ver todas.")}
                </p>
              )}
            </FileGroup>
          )}
          {groups.mmproj.length > 0 && (
            <FileGroup title={t("Proyector multimodal")}>{renderRows(groups.mmproj)}</FileGroup>
          )}
          {groups.draft.length > 0 && (
            <FileGroup title={t("Draft / MTP")}>{renderRows(groups.draft)}</FileGroup>
          )}
        </div>
      ) : (
        <p className="model-empty mt-5">
          {t("Este repositorio no contiene archivos GGUF descargables.")}
        </p>
      )}

      <p className="mt-5 border-t border-base-800 pt-3 text-meta leading-relaxed text-ink-500">
        {t("Los archivos se guardan en")}{" "}
        <span className="mono text-ink-400">{modelsDir || t("la carpeta de modelos")}</span>.
      </p>
    </div>
  );
}

function FileGroup({
  title,
  aside,
  children,
}: {
  title: ReactNode;
  aside?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section>
      <div className="quant-group-head items-center">
        <h4 className="flex items-baseline gap-1.5">{title}</h4>
        {aside}
      </div>
      <div className="mt-1">{children}</div>
    </section>
  );
}

/** Una línea por archivo: icono de encaje, nombre, tamaño y la acción. */
function FileRow({
  quant,
  repo,
  gated,
  downloads,
  recommended,
  fit,
  showVariant,
  using,
  onDownload,
  onUse,
}: {
  quant: HfQuant;
  repo: string;
  gated: boolean;
  downloads: DownloadsApi;
  recommended: boolean;
  fit: { tone: FitTone; detail: string } | null;
  showVariant: boolean;
  using: string | null;
  onDownload: (quant: HfQuant) => void;
  onUse: (path: string) => void;
}) {
  const key = downloadKey(repo, quant.id);
  const local = downloads.localFor(quant.files);
  const path = downloads.downloaded[key] || local?.path;
  const isActive = downloads.active?.key === key;
  const isQueued = downloads.isQueued(repo, quant.id) && !isActive;
  const blocked = gated || quant.incomplete;
  const variant = showVariant ? variantTag(repo, quant) : "";

  let action: ReactNode;
  if (path || local) {
    action = (
      <>
        <Hint label={t("Descargado")}>
          <span role="img" aria-label={t("Descargado")} className="inline-flex text-ok-400">
            <Check size={14} aria-hidden />
          </span>
        </Hint>
        {path && quant.role === "primary" && (
          <Button size="sm" variant="ghost" loading={using === path} onClick={() => onUse(path)}>
            {t("Usar")}
          </Button>
        )}
      </>
    );
  } else if (isActive && downloads.active) {
    const phase =
      downloads.active.phase === "verificando" ? t("Comprobando SHA-256") : t("Descargando");
    action = (
      <Hint label={`${phase} · ${formatSpeed(downloads.active.speed)}`}>
        <span className="inline-flex">
          <Button size="sm" variant="ghost" loading aria-label={phase} className="w-7 px-0!" />
        </span>
      </Hint>
    );
  } else if (isQueued) {
    action = (
      <Hint label={t("En cola")}>
        <span className="inline-flex">
          <Button
            size="sm"
            variant="ghost"
            disabled
            icon={<Clock size={13} />}
            aria-label={t("En cola")}
            className="w-7 px-0!"
          />
        </span>
      </Hint>
    );
  } else {
    const label = gated
      ? t("Requiere acceso en Hugging Face")
      : quant.incomplete
        ? t("Faltan archivos de esta cuantización")
        : t("Descargar");
    action = (
      <Hint label={label}>
        <span className="inline-flex">
          <Button
            size="sm"
            variant="ghost"
            disabled={blocked}
            icon={<Download size={13} />}
            onClick={() => onDownload(quant)}
            aria-label={label}
            className="w-7 px-0!"
          />
        </span>
      </Hint>
    );
  }

  return (
    <div className="quant-row">
      <div className="flex w-full min-w-0 items-center gap-2.5">
        <span className="flex w-3.5 shrink-0 justify-center">
          {fit && <FitBadge tone={fit.tone} detail={fit.detail} />}
        </span>
        <span
          className="min-w-0 flex-1 truncate text-label text-ink-100"
          title={quant.files.map((file) => file.path).join("\n")}
        >
          {repoName(repo)}
        </span>
        {variant && (
          <span className="mono shrink-0 text-meta text-ink-500">{variant}</span>
        )}
        {recommended && (
          <Hint label={t("Recomendado para tu equipo")}>
            <span
              role="img"
              aria-label={t("Recomendado para tu equipo")}
              className="inline-flex text-accent-300"
            >
              <Star size={12} className="fill-current" aria-hidden />
            </span>
          </Hint>
        )}
        {quant.incomplete && (
          <Hint label={t("Faltan archivos")}>
            <span role="img" aria-label={t("Faltan archivos")} className="inline-flex text-warn-400">
              <AlertTriangle size={13} aria-hidden />
            </span>
          </Hint>
        )}
        <span className="mono shrink-0 text-meta tabular-nums text-ink-300">
          {formatSize(quant.size)}
        </span>
        <div className="flex shrink-0 items-center gap-2">{action}</div>
      </div>

      {isActive && downloads.active && (
        <div className="meter w-full">
          <span
            style={
              {
                "--fill": Math.min(1, downloads.active.percent / 100),
              } as CSSProperties
            }
          />
        </div>
      )}
    </div>
  );
}

function Stat({ icon, label, value }: { icon: ReactNode; label: string; value: string }) {
  return (
    <span className="inline-flex items-center gap-1.5" title={label}>
      <span className="text-ink-500" aria-hidden>
        {icon}
      </span>
      <span className="mono tabular-nums">{value}</span>
      <span className="sr-only">{label}</span>
    </span>
  );
}

function repoName(id: string): string {
  return id.split("/").filter(Boolean).pop() ?? id;
}

/**
 * Lo que distingue dos archivos del mismo repo: el trozo del nombre que no es
 * el modelo. Sin él, todas las filas dirían lo mismo; se muestra apagado y no
 * como etiqueta. Se recorta el prefijo común, no el nombre del repo entero,
 * porque los archivos suelen omitir sufijos como «-GGUF».
 */
function variantTag(repo: string, quant: HfQuant): string {
  const file = quant.files[0]?.path.split("/").pop() ?? "";
  const name = file
    .replace(/\.gguf$/i, "")
    .replace(/-\d{5}-of-\d{5}$/i, "")
    .trim();
  const base = repoName(repo).toLowerCase();
  const lower = name.toLowerCase();
  let shared = 0;
  while (shared < name.length && shared < base.length && lower[shared] === base[shared]) {
    shared += 1;
  }
  const tag = name.slice(shared).replace(/^[-_. ]+/, "").trim();
  return tag || quant.quant;
}

function formatCount(value: number): string {
  if (!Number.isFinite(value) || value <= 0) return "0";
  return new Intl.NumberFormat(currentLocale(), {
    notation: "compact",
    maximumFractionDigits: 1,
  }).format(value);
}

/** Enteros completos, sin redondear: 131072 y no «128K». */
function formatInteger(value: number): string {
  return new Intl.NumberFormat(currentLocale()).format(value);
}

/** Tamaño con el separador del idioma activo, sin depender de formatBytes. */
function formatSize(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 B";
  const gb = bytes / 1024 ** 3;
  if (gb >= 1) {
    return `${new Intl.NumberFormat(currentLocale(), {
      maximumFractionDigits: 1,
    }).format(gb)} GB`;
  }
  return `${new Intl.NumberFormat(currentLocale(), {
    maximumFractionDigits: 0,
  }).format(bytes / 1024 ** 2)} MB`;
}

function formatDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat(currentLocale(), {
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(date);
}
