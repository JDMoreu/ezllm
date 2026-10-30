import { useCallback, useEffect, useState } from "react";
import clsx from "clsx";
import {
  Check,
  CheckCircle2,
  ChevronDown,
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
} from "@/components/ui-kit/select";
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
  onStopServer,
  serverRunning = false,
  embedded = false,
}: {
  onInstalledChange?: () => void;
  onPickLlamaFolder?: () => Promise<boolean>;
  onUseBuild?: (build: InstalledBuild) => void;
  onStopServer?: () => Promise<unknown> | void;
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
  const [channel, setChannel] = useState<"nightly" | "stable">("stable");
  const [stable, setStable] = useState<StableRelease[]>([]);
  const [loadingStable, setLoadingStable] = useState(false);
  const [showAll, setShowAll] = useState(false);
  const [showAllStable, setShowAllStable] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    // Las versiones instaladas son locales: no deben desaparecer porque
    // GitHub limite las peticiones. Cada fuente se resuelve por separado.
    const [instResult, serverResult, relResult] = await Promise.allSettled([
      api.listInstalled(),
      api.llamaServerPath(),
      api.listReleases(12),
    ]);

    if (instResult.status === "fulfilled") setInstalled(instResult.value);
    if (serverResult.status === "fulfilled") setActiveServer(serverResult.value);

    if (relResult.status === "fulfilled") {
      const rels = relResult.value;
      setReleases(rels);
      // Abre la primera release que realmente tenga binarios para este equipo.
      const installable = rels.filter((rel) =>
        rel.assets.some((asset) => asset.compatible && !asset.isCudart),
      );
      setExpanded((prev) =>
        installable.some((rel) => rel.tag === prev)
          ? prev
          : (installable[0]?.tag ?? null),
      );
    } else {
      setError(friendlyGitHubError(relResult.reason));
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  // Las releases estables se piden aparte: cada una necesita descargar su
  // nightly-tag.txt para saber que tag trae los binarios.
  const loadStable = useCallback(async () => {
    setLoadingStable(true);
    try {
      setStable(await api.listStableReleases(8));
    } catch {
      setStable([]);
    } finally {
      setLoadingStable(false);
    }
  }, []);

  useEffect(() => {
    if (channel === "stable") void loadStable();
  }, [channel, loadStable]);

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

  const installableReleases = releases.filter((rel) =>
    rel.assets.some((asset) => asset.compatible && !asset.isCudart),
  );
  const expandedTag = installableReleases.some((rel) => rel.tag === expanded)
    ? expanded
    : (installableReleases[0]?.tag ?? null);
  const visibleReleases =
    embedded && !showAll ? installableReleases.slice(0, 6) : installableReleases;
  const visibleStable = embedded && !showAllStable ? stable.slice(0, 4) : stable;
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
      if (!onUseBuild) return;
      setSwitching(build.tag);
      try {
        if (serverRunning && onStopServer) {
          const stopped = await onStopServer();
          if (stopped === false) return;
        }
        onUseBuild(build);
        await new Promise((resolve) => setTimeout(resolve, 450));
        await refreshInstalled();
        onInstalledChange?.();
      } finally {
        setSwitching(null);
      }
    },
    [onUseBuild, onStopServer, serverRunning, refreshInstalled, onInstalledChange],
  );

  return (
    <div className="space-y-4">
      <header
        className={clsx(
          "flex flex-wrap justify-between gap-3",
          embedded ? "items-center" : "items-end gap-4",
        )}
      >
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-meta text-ink-500">{t("Canal")}</span>
          <Select
            value={channel}
            onValueChange={(value) => setChannel(value as "stable" | "nightly")}
          >
            <SelectTrigger
              className="w-[7.5rem]"
              aria-label={t("Canal")}
              title={
                channel === "stable"
                  ? "Recomendado para empezar: versión con etiqueta vX.Y.Z"
                  : "La última build de desarrollo; puede romper"
              }
            >
              <span className="min-w-0 flex-1 truncate text-left">
                {channel === "stable" ? t("Estable") : t("Nightly")}
              </span>
            </SelectTrigger>
            <SelectContent position="popper" align="start" sideOffset={0}>
              <SelectItem value="stable">{t("Estable")}</SelectItem>
              <SelectItem value="nightly">{t("Nightly")}</SelectItem>
            </SelectContent>
          </Select>
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
            {t("Las versiones instaladas siguen disponibles aunque la lista remota no cargue.")}
          </p>
          <div className="mt-2">
            <Button size="sm" variant="ghost" onClick={() => void load()}>
              {t("Reintentar")}
            </Button>
          </div>
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
      >
        {serverRunning && (
          <p className="mb-2 flex items-start gap-1.5 text-label leading-relaxed text-warn-400">
            <Info size={13} className="mt-0.5 shrink-0" aria-hidden />
            {t("Al cambiar de build se detendrá el servidor en marcha.")}
          </p>
        )}
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
              <li className="relative flex items-center gap-3 py-2.5 pl-2 first:pt-0">
                <span
                  className="absolute inset-y-2 left-0 w-0.5 rounded-full bg-accent-500"
                  aria-hidden
                />
                <FolderOpen size={14} className="shrink-0 text-accent-400" aria-hidden />
                <div className="min-w-0 flex-1">
                  <p className="text-label font-medium text-ink-100">{t("Build local")}</p>
                  <p
                    className="truncate text-label text-ink-500"
                    title={activeServer ? dirname(activeServer) : undefined}
                  >
                    {activeServer ? dirname(activeServer) : ""}
                  </p>
                </div>
                <span className="inline-flex items-center gap-1 text-meta font-medium text-ok-400">
                  <CheckCircle2 size={11} />
                  {t("En uso")}
                </span>
              </li>
            )}
            {installed.map((build) => {
              const isActive = build.tag === activeTag;
              return (
                <li
                  key={build.tag}
                  className="relative flex items-center gap-3 py-2.5 pl-2 first:pt-0 last:pb-0"
                >
                  {isActive && (
                    <span
                      className="absolute inset-y-2 left-0 w-0.5 rounded-full bg-accent-500"
                      aria-hidden
                    />
                  )}
                  <HardDrive
                    size={14}
                    className={clsx(
                      "shrink-0",
                      isActive ? "text-accent-400" : "text-ink-500",
                    )}
                    aria-hidden
                  />
                  <div className="min-w-0 flex-1">
                    <p className="mono text-label font-medium text-ink-100">{build.tag}</p>
                    <p className="truncate text-label text-ink-500" title={build.dir}>
                      {build.dir}
                    </p>
                  </div>
                  {isActive ? (
                    <span className="inline-flex items-center gap-1 text-meta font-medium text-ok-400">
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
                        disabled={switching !== null && switching !== build.tag}
                        onClick={() => void useBuild(build)}
                        title={
                          serverRunning
                            ? t("Detener el servidor y usar este build")
                            : t("Usar este build")
                        }
                      >
                        {serverRunning ? t("Detener y usar") : t("Usar")}
                      </Button>
                    )
                  )}
                  <button
                    onClick={() => setPendingDelete(build.tag)}
                    className="btn-quiet cursor-pointer rounded-card p-1.5 text-ink-500 hover:text-danger-400 disabled:cursor-not-allowed disabled:opacity-40"
                    aria-label={`Eliminar ${build.tag}`}
                    disabled={serverRunning && isActive}
                    title={
                      serverRunning && isActive
                        ? t("Detén el servidor para eliminar este build")
                        : t("Eliminar build")
                    }
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
            <span className="sr-only" role="status" aria-live="polite">
              {`Instalando · ${progress.phase} · ${progress.percent.toFixed(0)}%`}
            </span>
            <Meter
              value={progress.downloaded}
              max={progress.total || 1}
              label={`${t("Instalando")} · ${progress.phase}`}
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
            <Alert tone="warn" title={t("No se pudieron cargar las versiones estables")}>
              {t("GitHub puede limitar las peticiones anónimas. Las builds nightly siguen disponibles mientras tanto.")}
              <div className="mt-2 flex flex-wrap gap-2">
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => setChannel("nightly")}
                >
                  {t("Ver Nightly")}
                </Button>
                <Button size="sm" variant="ghost" onClick={() => void loadStable()}>
                  {t("Reintentar")}
                </Button>
              </div>
            </Alert>
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
            const visibleAssets = orderedAssets;

            return (
            <Section
              key={s.tag}
              title={
                <span className="flex items-center gap-2">
                  <span className="mono">{s.tag}</span>
                  <span className="inline-flex items-center gap-1 text-meta text-ok-400">
                    <CheckCircle2 size={10} />
                    {t("Estable")}
                  </span>
                </span>
              }
              description={
                <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
                  <span>{formatDate(s.publishedAt)}</span>
                  {s.nightlyTag && (
                    <>
                      <span aria-hidden>·</span>
                      <span className="mono text-ink-300">{s.nightlyTag}</span>
                      <span className="text-meta text-ink-500">
                        build equivalente
                      </span>
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
                        <Cpu
                          size={13}
                          className={clsx(
                            "shrink-0",
                            asset.name === s.recommended
                              ? "text-accent-400"
                              : "text-ink-500",
                          )}
                          aria-hidden
                        />
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-1.5">
                            <span className="text-label font-medium text-ink-100">
                              {backendLabel(asset.backend)}
                            </span>
                            {asset.name === s.recommended && (
                              <span className="inline-flex items-center gap-1 text-meta font-medium text-accent-300">
                                <Zap size={9} />
                                {t("Recomendado")}
                              </span>
                            )}
                            {asset.sha256 && (
                              <span
                                className="inline-flex items-center gap-1 text-meta text-ok-400"
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
                </>
              )}
            </Section>
            );
          })}

          {embedded && stable.length > 1 && (
            <button
              onClick={() => setShowAllStable((value) => !value)}
              className="btn btn-quiet inline-flex w-full cursor-pointer items-center justify-center gap-1.5 border border-base-800 py-2 text-label text-ink-400 hover:text-ink-100"
              aria-expanded={showAllStable}
            >
              {showAllStable
                ? "Mostrar solo las últimas 4"
                : `Ver ${stable.length - visibleStable.length} versiones anteriores`}
              <ChevronDown
                size={13}
                className={clsx(
                  "transition-transform duration-200",
                  showAllStable && "rotate-180",
                )}
                aria-hidden
              />
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
          const isOpen = expandedTag === rel.tag;
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
          const shown = ordered;

          return (
            <section key={rel.tag} className="card overflow-hidden">
              <div className="flex items-center gap-3 px-4 py-3">
                <button
                  type="button"
                  onClick={() => setExpanded(isOpen ? null : rel.tag)}
                  className="flex min-w-0 flex-1 cursor-pointer items-center gap-3 rounded-control text-left transition-colors duration-200 hover:bg-base-850"
                  aria-expanded={isOpen}
                  aria-controls={`release-${rel.tag}`}
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="mono text-[0.8125rem] font-semibold text-ink-100">
                        {rel.tag}
                      </span>
                      {rel.prerelease && (
                        <span className="text-meta text-violet-400">
                          {t("Nightly")}
                        </span>
                      )}
                      {recommended && (
                        <span className="inline-flex items-center gap-1 text-meta font-medium text-accent-300">
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
                  <ChevronDown
                    size={13}
                    className={clsx(
                      "shrink-0 text-ink-500 transition-transform duration-200",
                      isOpen && "rotate-180",
                    )}
                    aria-hidden
                  />
                </button>
                {isOpen && (
                  <a
                    href={rel.htmlUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="btn btn-quiet px-2 py-1 text-label"
                    title="Abrir en GitHub"
                  >
                    <ExternalLink size={12} />
                    GitHub
                  </a>
                )}
              </div>

              {isOpen && (
                <div id={`release-${rel.tag}`} className="border-t border-base-800">
                  {compat.length === 0 ? (
                    <div className="px-4 py-5">
                      <Alert tone="warn" title="No hay ningún paquete para este equipo">
                        Esta release no publica binarios compatibles con este
                        equipo. Prueba con otra versión.
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
                    </>
                  )}
                </div>
              )}
            </section>
          );
        })}

        {embedded && installableReleases.length > 1 && (
          <button
            onClick={() => setShowAll((value) => !value)}
            className="btn btn-quiet inline-flex w-full cursor-pointer items-center justify-center gap-1.5 border border-base-800 py-2 text-label text-ink-400 hover:text-ink-100"
            aria-expanded={showAll}
          >
            {showAll
              ? "Mostrar solo las últimas 6"
              : `${t("Ver")} ${installableReleases.length - visibleReleases.length} ${t("versiones anteriores")}`}
            <ChevronDown
              size={13}
              className={clsx(
                "transition-transform duration-200",
                showAll && "rotate-180",
              )}
              aria-hidden
            />
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

      {/* La explicación cierra la vista: arriba competía con los controles. */}
      <p className="max-w-2xl border-t border-base-800 pt-3 text-meta leading-relaxed text-ink-500">
        {t("Instala y actualiza los binarios oficiales de")}{" "}
        <span className="mono text-ink-400">ggml-org/llama.cpp</span>.{" "}
        {t("Cada paquete se verifica con el SHA-256 de GitHub antes de instalarse.")}
      </p>
    </div>
  );
}

/** Orden de presentación de los backends: del más habitual al más raro. */
function friendlyGitHubError(error: unknown): string {
  const raw = String(error);
  if (/403|rate limit|límite de la api/i.test(raw)) {
    return "GitHub ha limitado las peticiones anónimas. Espera unos minutos o añade un token en Ajustes: el límite sube de 60 a 5000 peticiones por hora.";
  }
  return raw;
}

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
      <Cpu
        size={14}
        className={clsx(
          "shrink-0",
          recommended ? "text-accent-400" : "text-ink-500",
        )}
        aria-hidden
      />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-label font-medium text-ink-100">
            {backendLabel(asset.backend)}
          </span>
          <span className="text-meta text-ink-500">{asset.arch}</span>
          {asset.cudaVersion && (
            <span className="text-meta text-ink-500">
              CUDA {asset.cudaVersion}
            </span>
          )}
          {asset.sha256 && (
            <span
              className="inline-flex items-center gap-1 text-meta text-ok-400"
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
