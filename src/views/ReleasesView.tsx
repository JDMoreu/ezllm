import { useCallback, useEffect, useMemo, useState } from "react";
import clsx from "clsx";
import {
  AlertTriangle,
  CheckCircle2,
  Cpu,
  Download,
  ExternalLink,
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
  formatBytes,
  formatDate,
  formatSpeed,
} from "../lib/format";
import type {
  AppConfig,
  BinaryAsset,
  DownloadProgress,
  HardwareReport,
  InstalledBuild,
  ReleaseView,
  StableRelease,
} from "../types";

export default function ReleasesView({
  config,
  hardware,
  onConfigChange,
}: {
  config: AppConfig | null;
  hardware: HardwareReport | null;
  onConfigChange: (c: AppConfig) => void;
}) {
  const toast = useToast();
  const [releases, setReleases] = useState<ReleaseView[]>([]);
  const [installed, setInstalled] = useState<InstalledBuild[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [progress, setProgress] = useState<DownloadProgress | null>(null);
  const [installing, setInstalling] = useState<string | null>(null);
  const [pendingDelete, setPendingDelete] = useState<string | null>(null);
  const [channel, setChannel] = useState<"nightly" | "stable">("nightly");
  const [stable, setStable] = useState<StableRelease[]>([]);
  const [loadingStable, setLoadingStable] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [rels, inst] = await Promise.all([api.listReleases(12), api.listInstalled()]);
      setReleases(rels);
      setInstalled(inst);
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
          setInstalled(await api.listInstalled());
        }
      } catch (e) {
        toast.push(`Falló la instalación: ${String(e)}`, "danger");
      } finally {
        setInstalling(null);
        setProgress(null);
      }
    },
    [toast],
  );

  const remove = useCallback(
    async (tag: string) => {
      try {
        await api.removeInstall(tag);
        toast.push(`Versión ${tag} eliminada`, "info");
        setInstalled(await api.listInstalled());
      } catch (e) {
        toast.push(`No se pudo eliminar: ${String(e)}`, "danger");
      } finally {
        setPendingDelete(null);
      }
    },
    [toast],
  );

  const backendFilter = config?.preferredBackend ?? "auto";
  const gpuNames = (hardware?.gpu ?? []).map((g) => g.name);

  const filteredReleases = useMemo(() => {
    if (backendFilter === "auto") return releases;
    return releases.map((r) => ({
      ...r,
      assets: r.assets.filter((a) => a.backend === backendFilter),
    }));
  }, [releases, backendFilter]);

  return (
    <div className="space-y-5">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-lg font-semibold tracking-tight text-ink-100">
            llama.cpp
          </h1>
          <p className="mt-1 max-w-2xl text-xs leading-relaxed text-ink-400">
            Binarios oficiales de{" "}
            <span className="mono text-ink-300">ggml-org/llama.cpp</span>, verificados
            con el hash SHA-256 que publica GitHub antes de instalarse.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div
            className="flex gap-0.5 rounded-lg bg-base-850 p-0.5"
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
                  "cursor-pointer rounded-md px-2.5 py-1 text-xs font-medium transition-colors duration-150",
                  channel === id
                    ? "bg-base-800 text-ink-100 shadow-[inset_0_1px_0_0_rgb(255_255_255/0.04)]"
                    : "text-ink-400 hover:text-ink-200",
                )}
              >
                {label}
              </button>
            ))}
          </div>
          <Button
            icon={<RefreshCw size={13} />}
            onClick={load}
            loading={loading}
            variant="ghost"
          >
            Actualizar
          </Button>
        </div>
      </header>

      {error && (
        <Alert tone="danger" title="No se pudo contactar con GitHub">
          {error}
          <p className="mt-1.5">
            Si es un límite de peticiones, añade un token de GitHub en{" "}
            <strong>Ajustes</strong> para subir el límite de 60 a 5000 por hora.
          </p>
        </Alert>
      )}

      {/* --- Versiones instaladas --- */}
      <Card
        title="Versiones instaladas"
        subtitle={
          installed.length > 0
            ? `${installed.length} ${installed.length === 1 ? "versión disponible" : "versiones disponibles"}`
            : "Todavía no hay ninguna versión instalada"
        }
        actions={
          installed.length > 0 && (
            <span className="chip chip-accent">
              <CheckCircle2 size={11} />
              Activa: {installed[0]?.tag}
            </span>
          )
        }
      >
        {installed.length === 0 ? (
          <EmptyState
            icon={<PackageIcon />}
            title="Sin instalar"
            description="Elige una versión de la lista y pulsa «Instalar». Se descarga el paquete de tu plataforma y se verifica su integridad."
          />
        ) : (
          <ul className="divide-y divide-base-800">
            {installed.map((b, i) => (
              <li key={b.tag} className="flex items-center gap-3 py-2.5 first:pt-0 last:pb-0">
                <span
                  className={clsx(
                    "flex h-7 w-7 shrink-0 items-center justify-center rounded-lg",
                    i === 0 ? "bg-accent-600/15 text-accent-400" : "bg-base-800 text-ink-400",
                  )}
                >
                  <HardDrive size={14} />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="mono text-xs font-medium text-ink-100">{b.tag}</p>
                  <p className="truncate text-[0.75rem] text-ink-500" title={b.dir}>
                    {b.dir}
                  </p>
                </div>
                {i === 0 && <span className="chip chip-accent">En uso</span>}
                <button
                  onClick={() => setPendingDelete(b.tag)}
                  className="btn-quiet cursor-pointer rounded-lg p-1.5 text-ink-500 hover:text-danger-400"
                  aria-label={`Eliminar ${b.tag}`}
                >
                  <Trash2 size={14} />
                </button>
              </li>
            ))}
          </ul>
        )}
      </Card>

      {/* --- Recomendación para este equipo --- */}
      <Section
        title="Para este equipo"
        description="Qué paquete encaja con tu hardware y por qué."
        actions={
          <select
            className="field w-auto py-1 text-xs"
            value={backendFilter}
            onChange={(e) =>
              config &&
              onConfigChange({
                ...config,
                preferredBackend: e.target.value as AppConfig["preferredBackend"],
              })
            }
            aria-label="Backend preferido"
          >
            <option value="auto">Automático</option>
            <option value="vulkan">Vulkan</option>
            <option value="cuda">CUDA</option>
            <option value="rocm">ROCm</option>
            <option value="cpu">CPU</option>
          </select>
        }
      >
        <p className="text-xs leading-relaxed text-ink-300">
          {backendFilter === "auto"
            ? "Vulkan es la opción por defecto: funciona con la mayoría de GPUs de escritorio sin instalar drivers extra."
            : `Solo se ofrecerán los paquetes de ${backendFilter.toUpperCase()}.`}
        </p>
        {gpuNames.length > 0 && (
          <p className="mt-2 border-t border-base-800 pt-2 text-[0.75rem] text-ink-400">
            Detectado: {gpuNames.join(", ")}
          </p>
        )}
      </Section>

      {/* --- Progreso de descarga --- */}
      {progress && (
        <Card title={`Instalando ${installing ?? ""}`}>
          <div className="space-y-2.5">
            <Meter
              value={progress.downloaded}
              max={progress.total || 1}
              label={<span className="capitalize">{progress.phase}</span>}
              valueLabel={`${progress.percent.toFixed(0)}%`}
            />
            <div className="flex justify-between text-[0.75rem] text-ink-500">
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
        <div className="space-y-3">
          <Alert tone="info" title="Cómo funcionan las versiones estables">
            Las releases con etiqueta <span className="mono">vX.Y.Z</span> no
            publican binarios: publican un puntero{" "}
            <span className="mono">nightly-tag.txt</span> con la build exacta
            <span className="mono"> b#####</span> de ese mismo commit. EzLlamaCpp
            resuelve ese puntero y te muestra los paquetes reales para que
            puedas instalarlos aquí mismo.
          </Alert>

          {stable.length === 0 && !loadingStable && (
            <Section title="Sin versiones estables">
              <p className="py-4 text-center text-xs text-ink-400">
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

          {stable.map((s) => (
            <Section
              key={s.tag}
              title={
                <span className="flex items-center gap-2">
                  <span className="mono">{s.tag}</span>
                  <span className="chip chip-ok">Estable</span>
                </span>
              }
              description={
                <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
                  <span>{formatDate(s.publishedAt)}</span>
                  {s.nightlyTag && (
                    <>
                      <span aria-hidden>·</span>
                      <span className="mono text-ink-300">{s.nightlyTag}</span>
                      <span className="chip">build equivalente</span>
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
                <ul className="-mx-1">
                  {s.assets
                    .filter((a) => a.compatible && !a.isCudart)
                    .map((asset) => (
                      <li
                        key={asset.name}
                        className="row flex items-center gap-3 px-1 py-2"
                      >
                        <span
                          className={clsx(
                            "flex h-7 w-7 shrink-0 items-center justify-center rounded-md",
                            asset.name === s.recommended
                              ? "bg-accent-500/14 text-accent-400"
                              : "bg-base-850 text-ink-400",
                          )}
                        >
                          <Cpu size={13} />
                        </span>
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-1.5">
                            <span className="text-xs font-medium text-ink-100">
                              {backendLabel(asset.backend)}
                            </span>
                            {asset.name === s.recommended && (
                              <span className="chip chip-accent">
                                <Zap size={9} />
                                Recomendado
                              </span>
                            )}
                            {asset.sha256 && (
                              <span
                                className="chip chip-ok"
                                title={`SHA-256: ${asset.sha256}`}
                              >
                                <CheckCircle2 size={9} />
                                Verificado
                              </span>
                            )}
                          </div>
                          <p
                            className="mono mt-0.5 truncate text-[0.75rem] text-ink-500"
                            title={asset.name}
                          >
                            {asset.name}
                          </p>
                        </div>
                        <span className="mono shrink-0 text-[0.75rem] text-ink-400">
                          {formatBytes(asset.size)}
                        </span>
                        <Button
                          size="sm"
                          variant={asset.name === s.recommended ? "primary" : "ghost"}
                          icon={<Download size={12} />}
                          loading={installing === asset.name}
                          onClick={() => install(s.nightlyTag ?? s.tag, asset)}
                        >
                          Instalar
                        </Button>
                      </li>
                    ))}
                </ul>
              )}
            </Section>
          ))}
        </div>
      )}

      {/* --- Releases nightly --- */}
      <div className={clsx("space-y-2.5", channel === "stable" && "hidden")}>
        {loading && releases.length === 0 && (
          <Card>
            <div className="flex items-center gap-3 py-6 text-xs text-ink-400">
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

        {filteredReleases.map((rel) => {
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
                    {rel.prerelease && <span className="chip">Nightly</span>}
                    {recommended && (
                      <span className="chip chip-accent">
                        <Zap size={10} />
                        Recomendado
                      </span>
                    )}
                  </div>
                  <p className="mt-0.5 text-[0.75rem] text-ink-500">
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
                    className="btn btn-quiet px-2 py-1 text-[0.75rem]"
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
                        Esta release no publica binarios para{" "}
                        <span className="mono">{config?.preferredBackend ?? "auto"}</span> en{" "}
                        <span className="mono">
                          {rel.assets[0]?.os ?? "tu plataforma"}
                        </span>
                        . Prueba a cambiar el backend en Ajustes.
                      </Alert>
                    </div>
                  ) : (
                    <ul className="divide-y divide-base-800">
                      {ordered.map((asset) => (
                        <AssetRow
                          key={asset.name}
                          asset={asset}
                          recommended={asset.name === recommended}
                          installing={installing === asset.name}
                          onInstall={() => install(rel.tag, asset)}
                        />
                      ))}
                    </ul>
                  )}
                </div>
              )}
            </section>
          );
        })}
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
          "flex h-7 w-7 shrink-0 items-center justify-center rounded-lg",
          recommended ? "bg-accent-600/15 text-accent-400" : "bg-base-800 text-ink-400",
        )}
      >
        <Cpu size={14} />
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-xs font-medium text-ink-100">
            {backendLabel(asset.backend)}
          </span>
          <span className="chip">{asset.arch}</span>
          {asset.cudaVersion && <span className="chip">CUDA {asset.cudaVersion}</span>}
          {asset.sha256 && (
            <span
              className="chip chip-accent"
              title={`SHA-256: ${asset.sha256}`}
            >
              <CheckCircle2 size={10} />
              Verificado
            </span>
          )}
        </div>
        <p className="mono mt-0.5 truncate text-[0.75rem] text-ink-500" title={asset.name}>
          {asset.name}
        </p>
      </div>
      <span className="mono shrink-0 text-[0.75rem] text-ink-400">
        {formatBytes(asset.size)}
      </span>
      <Button
        variant={recommended ? "primary" : "ghost"}
        size="sm"
        icon={<Download size={12} />}
        loading={installing}
        onClick={onInstall}
      >
        Instalar
      </Button>
    </li>
  );
}

function PackageIcon() {
  return (
    <Info size={20} />
  );
}

export { AlertTriangle };
