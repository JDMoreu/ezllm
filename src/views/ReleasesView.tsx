import { useCallback, useEffect, useState } from "react";
import clsx from "clsx";
import {
  Check,
  CheckCircle2,
  Cpu,
  Download,
  ExternalLink,
  FolderOpen,
  HardDrive,
  Info,
  RefreshCw,
  Trash2,
  Zap,
} from "lucide-react";

import { api, onInstallProgress } from "../lib/api";
import {
  Alert,
  Button,
  Card,
  ConfirmDialog,
  EmptyState,
  Meter,
  Section,
  useToast,
} from "../components/ui";
import {
  backendLabel,
  dirname,
  formatBytes,
  formatDate,
  formatSpeed,
} from "../lib/format";
import { t } from "../lib/i18n";
import type {
  BinaryAsset,
  DownloadProgress,
  InstalledBuild,
  ReleaseView,
  StableRelease,
} from "../types";

export default function ReleasesView({
  onInstalledChange,
  onPickLlamaFolder,
  onUseBuild,
  serverRunning = false,
  embedded = false,
}: {
  onInstalledChange?: () => void;
  onPickLlamaFolder?: () => Promise<boolean>;
  onUseBuild?: (build: InstalledBuild) => void;
  serverRunning?: boolean;
  embedded?: boolean;
}) {
  const toast = useToast();
  const [releases, setReleases] = useState<ReleaseView[]>([]);
  const [installed, setInstalled] = useState<InstalledBuild[]>([]);
  const [activeServer, setActiveServer] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [progress, setProgress] = useState<DownloadProgress | null>(null);
  const [installing, setInstalling] = useState<string | null>(null);
  const [switching, setSwitching] = useState<string | null>(null);
  const [pendingDelete, setPendingDelete] = useState<string | null>(null);
  const [channel, setChannel] = useState<"nightly" | "stable">("nightly");
  const [stable, setStable] = useState<StableRelease[]>([]);
  const [loadingStable, setLoadingStable] = useState(false);
  const [showAll, setShowAll] = useState(false);
  const [showAllStable, setShowAllStable] = useState(false);
  const [showAllAssets, setShowAllAssets] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [rels, inst, serverPath] = await Promise.all([
        api.listReleases(12),
        api.listInstalled(),
        api.llamaServerPath().catch(() => null),
      ]);
      setReleases(rels);
      setInstalled(inst);
      setActiveServer(serverPath);
      // Abre la primera release para que el usuario vea las opciones sin clic.
      setExpanded((prev) => prev ?? rels[0]?.tag ?? null);
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  // Las releases estables se piden aparte: cada una necesita descargar su
  // nightly-tag.txt para saber que tag trae los binarios.
  useEffect(() => {
    if (channel !== "stable") return;
    let alive = true;
    setLoadingStable(true);
    api
      .listStableReleases(8)
      .then((s) => {
        if (!alive) return;
        setStable(s);
      })
      .catch(() => {
        if (alive) setStable([]);
      })
      .finally(() => {
        if (alive) setLoadingStable(false);
      });
    return () => {
      alive = false;
    };
  }, [channel]);

  useEffect(() => onInstallProgress(setProgress), []);

  const refreshInstalled = useCallback(async () => {
    const [inst, serverPath] = await Promise.all([
      api.listInstalled(),
      api.llamaServerPath().catch(() => null),
    ]);
    setInstalled(inst);
    setActiveServer(serverPath);
  }, []);

  const install = useCallback(
    async (tag: string, asset: BinaryAsset) => {
      setInstalling(asset.name);
      setProgress({
        downloaded: 0,
        total: asset.size,
        percent: 0,
        bytesPerSec: 0,
        phase: "preparando",
      });
      try {
        const res = await api.installRelease(tag, asset.name);
        if (!res.ok) {
          toast.push(res.error ?? "La instalación falló", "danger");
        } else {
          toast.push(
            `llama.cpp ${tag} instalado. ${res.binaries.length} binarios listos.`,
            "success",
          );
          await refreshInstalled();
          onInstalledChange?.();
        }
      } catch (e) {
        toast.push(`Falló la instalación: ${String(e)}`, "danger");
      } finally {
        setInstalling(null);
        setProgress(null);
      }
    },
    [toast, refreshInstalled, onInstalledChange],
  );

  const remove = useCallback(
    async (tag: string) => {
      try {
        await api.removeInstall(tag);
        toast.push(`Versión ${tag} eliminada`, "info");
        await refreshInstalled();
        onInstalledChange?.();
      } catch (e) {
        toast.push(`No se pudo eliminar: ${String(e)}`, "danger");
      } finally {
        setPendingDelete(null);
      }
    },
    [toast, refreshInstalled, onInstalledChange],
  );

  const visibleReleases = embedded && !showAll ? releases.slice(0, 1) : releases;
  const visibleStable = embedded && !showAllStable ? stable.slice(0, 1) : stable;
  const activeTag =
    installed.find(
      (build) =>
        !!activeServer &&
        !!build.llamaServer &&
        build.llamaServer.toLowerCase() === activeServer.toLowerCase(),
    )?.tag ?? null;
  const customBuild = !!activeServer && !activeTag;

  const pickLocalBuild = useCallback(async () => {
    if (!onPickLlamaFolder) return;
    const picked = await onPickLlamaFolder();
    if (!picked) return;
    await new Promise((resolve) => setTimeout(resolve, 450));
    await refreshInstalled();
    onInstalledChange?.();
    toast.push("Build local seleccionado", "success");
  }, [onPickLlamaFolder, refreshInstalled, onInstalledChange, toast]);

  const useBuild = useCallback(
    async (build: InstalledBuild) => {
      if (!onUseBuild || serverRunning) return;
      setSwitching(build.tag);
      onUseBuild(build);
      await new Promise((resolve) => setTimeout(resolve, 450));
      await refreshInstalled();
      onInstalledChange?.();
      setSwitching(null);
    },
    [onUseBuild, serverRunning, refreshInstalled, onInstalledChange],
  );

  return (
    <div className="space-y-4">
      <header
        className={clsx(
          "flex flex-wrap justify-between gap-3",
          embedded ? "items-center" : "items-end gap-4",
        )}
      >
        <p className="max-w-2xl text-body leading-relaxed text-ink-500">
          {t("Instala y actualiza los binarios oficiales de")}{" "}
          <span className="mono text-ink-300">ggml-org/llama.cpp</span>. Cada paquete se
          verifica con el SHA-256 de GitHub antes de instalarse.
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <div
            className="flex gap-0.5 rounded-card bg-base-850 p-0.5"
            role="tablist"
            aria-label="Canal de versión"
          >
            {(
              [
                ["nightly", "Nightly", "La última build de desarrollo"],
                ["stable", "Estable", "Última versión con etiqueta vX.Y.Z"],
              ] as const
            ).map(([id, label, hint]) => (
              <button
                key={id}
                role="tab"
                aria-selected={channel === id}
                onClick={() => setChannel(id)}
                title={hint}
                className={clsx(
                  "cursor-pointer rounded-control px-2.5 py-1 text-label font-medium transition-colors duration-150",
                  channel === id
                    ? "bg-base-800 text-ink-100 shadow-[inset_0_1px_0_0_rgb(255_255_255/0.04)]"
                    : "text-ink-400 hover:text-ink-200",
                )}
              >
                {label}
              </button>
            ))}
          </div>
          {onPickLlamaFolder && (
            <Button
              icon={<FolderOpen size={13} />}
              onClick={() => void pickLocalBuild()}
              variant="quiet"
              title="Usar un build local, fork o binarios propios"
            >
              {t("Build local")}
            </Button>
          )}
          <a
            href="https://github.com/ggml-org/llama.cpp"
            target="_blank"
            rel="noreferrer"
            className="btn btn-quiet"
          >
            <ExternalLink size={13} />
            {t("Repositorio")}
          </a>
          <Button
            icon={<RefreshCw size={13} />}
            onClick={load}
            loading={loading}
            variant="ghost"
          >
            {t("Actualizar")}
          </Button>
        </div>
      </header>

      {error && (
        <Alert tone="danger" title={t("No se pudo contactar con GitHub")}>
          {error}
          <p className="mt-1.5">
            GitHub limita las peticiones anónimas. Espera unos minutos y vuelve a
            intentarlo.
          </p>
        </Alert>
      )}

      {/* --- Versiones instaladas --- */}
      <Card
        title={t("Versiones instaladas")}
        subtitle={
          loading
            ? t("Consultando versiones…")
            : installed.length + (customBuild ? 1 : 0) > 0
              ? `${installed.length + (customBuild ? 1 : 0)} ${
                  installed.length + (customBuild ? 1 : 0) === 1
                    ? t("build disponible")
                    : t("builds disponibles")
                }`
              : t("Todavía no hay ninguna versión instalada")
        }
        actions={
          !loading &&
          (activeTag || customBuild) && (
            <span className="meta-mark meta-mark-accent">
              {customBuild ? <FolderOpen size={11} /> : <CheckCircle2 size={11} />}
              {t("En uso")}: {activeTag ?? t("build local")}
            </span>
          )
        }
      >
        {loading && installed.length === 0 ? (
          <p className="py-8 text-center text-body text-ink-500">
            {t("Buscando versiones instaladas…")}
          </p>
        ) : installed.length === 0 && !customBuild ? (
          <EmptyState
            icon={<PackageIcon />}
            title={t("Sin instalar")}
            description={t("Elige una versión de la lista y pulsa «Instalar». Se descarga el paquete de tu plataforma y se verifica su integridad.")}
          />
        ) : (
          <ul className="divide-y divide-base-800">
            {customBuild && (
              <li className="flex items-center gap-3 py-2.5 first:pt-0">
                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-card bg-accent-600/15 text-accent-400">
                  <FolderOpen size={14} />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-label font-medium text-ink-100">{t("Build local")}</p>
                  <p
                    className="truncate text-label text-ink-500"
                    title={activeServer ? dirname(activeServer) : undefined}
                  >
                    {activeServer ? dirname(activeServer) : ""}
                  </p>
                </div>
                <span className="meta-mark meta-mark-accent">
                  <CheckCircle2 size={11} />
                  {t("En uso")}
                </span>
              </li>
            )}
            {installed.map((build) => {
              const isActive = build.tag === activeTag;
              return (
                <li key={build.tag} className="flex items-center gap-3 py-2.5 first:pt-0 last:pb-0">
                  <span
                    className={clsx(
                      "flex h-7 w-7 shrink-0 items-center justify-center rounded-card",
                      isActive
                        ? "bg-accent-600/15 text-accent-400"
                        : "bg-base-800 text-ink-400",
                    )}
                  >
                    <HardDrive size={14} />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="mono text-label font-medium text-ink-100">{build.tag}</p>
                    <p className="truncate text-label text-ink-500" title={build.dir}>
                      {build.dir}
                    </p>
                  </div>
                  {isActive ? (
                    <span className="meta-mark meta-mark-accent">
                      <CheckCircle2 size={11} />
                      {t("En uso")}
                    </span>
                  ) : (
                    onUseBuild && (
                      <Button
                        size="sm"
                        variant="ghost"
                        icon={<Check size={12} />}
                        loading={switching === build.tag}
                        disabled={
                          serverRunning ||
                          (switching !== null && switching !== build.tag)
                        }
                        onClick={() => void useBuild(build)}
                        title={
                          serverRunning
                            ? t("Detén el servidor para cambiar de build")
                            : t("Usar este build")
                        }
                      >
                        {t("Usar")}
                      </Button>
                    )
                  )}
                  <button
                    onClick={() => setPendingDelete(build.tag)}
                    className="btn-quiet cursor-pointer rounded-card p-1.5 text-ink-500 hover:text-danger-400"
                    aria-label={`Eliminar ${build.tag}`}
                  >
                    <Trash2 size={14} />
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </Card>

      {/* --- Progreso de descarga --- */}
      {progress && (
        <Card title={`Instalando ${installing ?? ""}`}>
          <div className="space-y-2">
            <Meter
              value={progress.downloaded}
              max={progress.total || 1}
              label={<span className="capitalize">{progress.phase}</span>}
              valueLabel={`${progress.percent.toFixed(0)}%`}
            />
            <div className="flex justify-between text-label text-ink-500">
              <span className="mono">
                {formatBytes(progress.downloaded)} / {formatBytes(progress.total)}
              </span>
              <span className="mono">{formatSpeed(progress.bytesPerSec)}</span>
            </div>
          </div>
        </Card>
      )}

      {/* --- Releases estables --- */}
      {channel === "stable" && (
        <div className="space-y-2">
          <p className="flex items-start gap-2 px-1 py-1 text-label leading-relaxed text-ink-500">
            <Info size={13} className="mt-0.5 shrink-0" />
            <span>
              Las etiquetas <span className="mono">vX.Y.Z</span> no publican binarios:
              apuntan con <span className="mono">nightly-tag.txt</span> a la build
              real. Aquí se resuelve ese puntero automáticamente.
            </span>
          </p>

          {stable.length === 0 && !loadingStable && (
            <Section title="Sin versiones estables">
              <p className="py-4 text-center text-body text-ink-400">
                No se encontraron releases estables.
              </p>
            </Section>
          )}

          {loadingStable && stable.length === 0 && (
            <Section title="Consultando">
              <div className="space-y-2 py-2">
                {[0, 1, 2].map((i) => (
                  <div key={i} className="skeleton h-14 w-full" />
                ))}
              </div>
            </Section>
          )}

          {visibleStable.map((s) => {
            const compatAssets = s.assets.filter((a) => a.compatible && !a.isCudart);
            const orderedAssets = [...compatAssets].sort((a, b) => {
              const ra = a.name === s.recommended ? 0 : 1;
              const rb = b.name === s.recommended ? 0 : 1;
              if (ra !== rb) return ra - rb;
              const oa = backendOrder(a.backend);
              const ob = backendOrder(b.backend);
              if (oa !== ob) return oa - ob;
              return a.size - b.size;
            });
            const preferredAssets = s.recommended
              ? orderedAssets.filter((asset) => asset.name === s.recommended)
              : [];
            const visibleAssets =
              embedded && showAllAssets !== s.tag
                ? preferredAssets.length > 0
                  ? preferredAssets
                  : orderedAssets.slice(0, 1)
                : orderedAssets;

            return (
            <Section
              key={s.tag}
              title={
                <span className="flex items-center gap-2">
                  <span className="mono">{s.tag}</span>
                  <span className="meta-mark meta-mark-ok">{t("Estable")}</span>
                </span>
              }
              description={
                <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
                  <span>{formatDate(s.publishedAt)}</span>
                  {s.nightlyTag && (
                    <>
                      <span aria-hidden>·</span>
                      <span className="mono text-ink-300">{s.nightlyTag}</span>
                      <span className="meta-mark">build equivalente</span>
                    </>
                  )}
                </span>
              }
            >
              {s.unavailableReason ? (
                <Alert tone="warn" title="No hay paquetes para este equipo">
                  {s.unavailableReason}
                </Alert>
              ) : (
                <>
                  <ul className="-mx-1">
                    {visibleAssets.map((asset) => (
                      <li
                        key={asset.name}
                        className="row flex items-center gap-3 px-1 py-2"
                      >
                        <span
                          className={clsx(
                            "flex h-7 w-7 shrink-0 items-center justify-center rounded-control",
                            asset.name === s.recommended
                              ? "bg-accent-500/14 text-accent-400"
                              : "bg-base-850 text-ink-400",
                          )}
                        >
                          <Cpu size={13} />
                        </span>
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-1.5">
                            <span className="text-label font-medium text-ink-100">
                              {backendLabel(asset.backend)}
                            </span>
                            {asset.name === s.recommended && (
                              <span className="meta-mark meta-mark-accent">
                                <Zap size={9} />
                                {t("Recomendado")}
                              </span>
                            )}
                            {asset.sha256 && (
                              <span
                                className="meta-mark meta-mark-ok"
                                title={`SHA-256: ${asset.sha256}`}
                              >
                                <CheckCircle2 size={9} />
                                {t("Verificado")}
                              </span>
                            )}
                          </div>
                          <p
                            className="mono mt-0.5 truncate text-label text-ink-500"
                            title={asset.name}
                          >
                            {asset.name}
                          </p>
                        </div>
                        <span className="mono shrink-0 text-label text-ink-400">
                          {formatBytes(asset.size)}
                        </span>
                        <Button
                          size="sm"
                          variant={asset.name === s.recommended ? "primary" : "ghost"}
                          icon={<Download size={12} />}
                          loading={installing === asset.name}
                          onClick={() => install(s.nightlyTag ?? s.tag, asset)}
                        >
                          {t("Instalar")}
                        </Button>
                      </li>
                    ))}
                  </ul>
                  {embedded && orderedAssets.length > 1 && (
                    <button
                      onClick={() =>
                        setShowAllAssets((value) => (value === s.tag ? null : s.tag))
                      }
                      className="btn btn-quiet mt-1 w-full cursor-pointer justify-center border-t border-base-800 py-2 text-label text-ink-400 hover:text-ink-100"
                      aria-expanded={showAllAssets === s.tag}
                    >
                      {showAllAssets === s.tag
                        ? t("Mostrar solo el recomendado")
                        : `${t("Ver")} ${orderedAssets.length - visibleAssets.length} ${t("paquetes alternativos")}`}
                    </button>
                  )}
                </>
              )}
            </Section>
            );
          })}

          {embedded && stable.length > 1 && (
            <button
              onClick={() => setShowAllStable((value) => !value)}
              className="btn btn-quiet w-full cursor-pointer justify-center border border-base-800 py-2 text-label text-ink-400 hover:text-ink-100"
              aria-expanded={showAllStable}
            >
              {showAllStable
                ? t("Mostrar solo la última")
                : `Ver ${stable.length - 1} versiones estables anteriores`}
            </button>
          )}
        </div>
      )}

      {/* --- Releases nightly --- */}
      <div className={clsx("space-y-2", channel === "stable" && "hidden")}>
        {loading && releases.length === 0 && (
          <Card>
            <div className="flex items-center gap-3 py-6 text-body text-ink-400">
              <RefreshCw size={14} className="animate-spin" />
              Consultando las releases oficiales…
            </div>
          </Card>
        )}

        {!loading && releases.length === 0 && !error && (
          <Card>
            <EmptyState title="No se encontraron releases" />
          </Card>
        )}

        {visibleReleases.map((rel) => {
          const isOpen = expanded === rel.tag;
          const compat = rel.assets.filter((a) => a.compatible && !a.isCudart);
          const recommended = rel.recommended;
          // El recomendado va PRIMERO: es la opcion que el usuario quiere
          // y no debe exigir scroll para llegar a ella.
          const ordered = [...compat].sort((a, b) => {
            const ra = a.name === recommended ? 0 : 1;
            const rb = b.name === recommended ? 0 : 1;
            if (ra !== rb) return ra - rb;
            const oa = backendOrder(a.backend);
            const ob = backendOrder(b.backend);
            if (oa !== ob) return oa - ob;
            return a.size - b.size;
          });
          const preferredAssets = recommended
            ? ordered.filter((asset) => asset.name === recommended)
            : [];
          const shown =
            embedded && showAllAssets !== rel.tag
              ? preferredAssets.length > 0
                ? preferredAssets
                : ordered.slice(0, 1)
              : ordered;

          return (
            <section key={rel.tag} className="card overflow-hidden">
              <button
                onClick={() => setExpanded(isOpen ? null : rel.tag)}
                className="flex w-full cursor-pointer items-center gap-3 px-4 py-3 text-left transition-colors duration-200 hover:bg-base-850"
                aria-expanded={isOpen}
              >
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="mono text-[0.8125rem] font-semibold text-ink-100">
                      {rel.tag}
                    </span>
                    {rel.prerelease && (
                      <span className="meta-mark meta-mark-violet">{t("Nightly")}</span>
                    )}
                    {recommended && (
                      <span className="meta-mark meta-mark-accent">
                        <Zap size={10} />
                        {t("Recomendado")}
                      </span>
                    )}
                  </div>
                  <p className="mt-0.5 text-label text-ink-500">
                    {formatDate(rel.publishedAt)} ·{" "}
                    {rel.assets.filter((a) => !a.isCudart).length} paquetes
                  </p>
                </div>
                {isOpen && (
                  <a
                    href={rel.htmlUrl}
                    target="_blank"
                    rel="noreferrer"
                    onClick={(e) => e.stopPropagation()}
                    className="btn btn-quiet px-2 py-1 text-label"
                    title="Abrir en GitHub"
                  >
                    <ExternalLink size={12} />
                    GitHub
                  </a>
                )}
              </button>

              {isOpen && (
                <div className="border-t border-base-800">
                  {compat.length === 0 ? (
                    <div className="px-4 py-5">
                      <Alert tone="warn" title="No hay ningún paquete para este equipo">
                        Esta release no publica binarios compatibles con{" "}
                        <span className="mono">
                          {rel.assets[0]?.os ?? "tu plataforma"}
                        </span>
                        . Prueba con otra versión.
                      </Alert>
                    </div>
                  ) : (
                    <>
                      <ul className="divide-y divide-base-800">
                        {shown.map((asset) => (
                          <AssetRow
                            key={asset.name}
                            asset={asset}
                            recommended={asset.name === recommended}
                            installing={installing === asset.name}
                            onInstall={() => install(rel.tag, asset)}
                          />
                        ))}
                      </ul>
                      {embedded && ordered.length > 1 && (
                        <button
                          onClick={() =>
                            setShowAllAssets((value) => (value === rel.tag ? null : rel.tag))
                          }
                          className="btn btn-quiet w-full cursor-pointer justify-center border-t border-base-800 py-2 text-label text-ink-400 hover:text-ink-100"
                          aria-expanded={showAllAssets === rel.tag}
                        >
                          {showAllAssets === rel.tag
                            ? t("Mostrar solo el recomendado")
                            : `${t("Ver")} ${ordered.length - shown.length} ${t("paquetes alternativos")}`}
                        </button>
                      )}
                    </>
                  )}
                </div>
              )}
            </section>
          );
        })}

        {embedded && releases.length > 1 && (
          <button
            onClick={() => setShowAll((value) => !value)}
            className="btn btn-quiet w-full cursor-pointer justify-center border border-base-800 py-2 text-label text-ink-400 hover:text-ink-100"
            aria-expanded={showAll}
          >
            {showAll
              ? t("Mostrar solo la última")
              : `${t("Ver")} ${releases.length - 1} ${t("versiones anteriores")}`}
          </button>
        )}
      </div>

      <ConfirmDialog
        open={pendingDelete !== null}
        title="Eliminar versión"
        message={
          <>
            Se borrará <span className="mono text-ink-100">{pendingDelete}</span> y todos sus
            binarios. Los modelos no se tocan.
          </>
        }
        confirmLabel="Eliminar"
        danger
        onConfirm={() => pendingDelete && remove(pendingDelete)}
        onCancel={() => setPendingDelete(null)}
      />
    </div>
  );
}

/** Orden de presentación de los backends: del más habitual al más raro. */
function backendOrder(backend: string): number {
  switch (backend) {
    case "vulkan":
      return 0;
    case "cuda":
      return 1;
    case "rocm":
      return 2;
    case "sycl":
      return 3;
    case "openvino":
      return 4;
    case "opencl":
      return 5;
    case "cpu":
      return 9;
    default:
      return 8;
  }
}

function AssetRow({
  asset,
  recommended,
  installing,
  onInstall,
}: {
  asset: BinaryAsset;
  recommended: boolean;
  installing: boolean;
  onInstall: () => void;
}) {
  return (
    <li className="flex items-center gap-3 px-4 py-2.5">
      <span
        className={clsx(
          "flex h-7 w-7 shrink-0 items-center justify-center rounded-card",
          recommended ? "bg-accent-600/15 text-accent-400" : "bg-base-800 text-ink-400",
        )}
      >
        <Cpu size={14} />
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-label font-medium text-ink-100">
            {backendLabel(asset.backend)}
          </span>
          <span className="meta-mark">{asset.arch}</span>
          {asset.cudaVersion && (
            <span className="meta-mark">CUDA {asset.cudaVersion}</span>
          )}
          {asset.sha256 && (
            <span
              className="meta-mark meta-mark-ok"
              title={`SHA-256: ${asset.sha256}`}
            >
              <CheckCircle2 size={10} />
              {t("Verificado")}
            </span>
          )}
        </div>
        <p className="mono mt-0.5 truncate text-label text-ink-500" title={asset.name}>
          {asset.name}
        </p>
      </div>
      <span className="mono shrink-0 text-label text-ink-400">
        {formatBytes(asset.size)}
      </span>
      <Button
        variant={recommended ? "primary" : "ghost"}
        size="sm"
        icon={<Download size={12} />}
        loading={installing}
        onClick={onInstall}
      >
        {t("Instalar")}
      </Button>
    </li>
  );
}

function PackageIcon() {
  return (
    <Info size={20} />
  );
}
