import { Download, ListOrdered, X } from "lucide-react";

import { Button } from "./ui";
import { Progress } from "@/components/ui-kit/progress";
import { formatBytes, formatSpeed } from "../lib/format";
import type { DownloadsApi } from "../lib/useDownloads";

/** Barra persistente de descargas: vive en `Shell` y se ve en las tres vistas. */
export default function DownloadBar({
  downloads,
  onOpen,
}: {
  downloads: DownloadsApi;
  onOpen: () => void;
}) {
  const { active, queue, cancel } = downloads;
  if (!active && queue.length === 0) return null;

  const remaining = active
    ? Math.max(0, active.size * (1 - Math.min(100, active.percent) / 100))
    : 0;
  const eta =
    active && active.speed > 0 ? Math.max(0, remaining / active.speed) : null;

  return (
    <div className="model-download-strip mx-6 mt-3">
      <span className="sr-only" role="status" aria-live="polite">
        {active
          ? `Descargando ${active.label} · ${active.phase}`
          : `${queue.length} ${queue.length === 1 ? "descarga en cola" : "descargas en cola"}`}
      </span>
      <div className="flex min-w-0 flex-1 items-center gap-2.5">
        <Download size={14} className="shrink-0 text-accent-300" aria-hidden />
        <div className="min-w-0">
          {active ? (
            <>
              <p className="truncate text-label font-medium text-ink-200">
                {active.label}{" "}
                <span className="mono text-meta text-ink-500">
                  · {active.phase}
                </span>
              </p>
              <p className="truncate text-meta text-ink-500">
                {active.file && basenameOf(active.file)}
                {active.fileCount > 0 && ` (${active.fileIndex}/${active.fileCount})`}
                {queue.length > 0 && ` · ${queue.length} en cola`}
                {eta !== null && ` · quedan ${formatEta(eta)}`}
              </p>
            </>
          ) : (
            <p className="flex items-center gap-2 text-label text-ink-300">
              <ListOrdered size={13} aria-hidden />
              {queue.length} {queue.length === 1 ? "descarga en cola" : "descargas en cola"}
            </p>
          )}
        </div>
      </div>

      {active && (
        <>
          <div className="flex shrink-0 items-center gap-3">
            <span className="mono text-meta text-ink-500">
              {formatSpeed(active.speed)}
            </span>
            <Progress
              value={Math.min(100, active.percent)}
              className="h-1.5 w-40"
              aria-label="Progreso de descarga"
            />
            <span className="mono w-9 text-right text-meta text-ink-200">
              {Math.round(active.percent)}%
            </span>
            <span className="mono hidden text-meta text-ink-500 lg:inline">
              {formatBytes(active.size)}
            </span>
          </div>
          <div className="flex shrink-0 items-center gap-1.5">
            <Button size="sm" variant="quiet" onClick={onOpen}>
              Ver
            </Button>
            <Button
              size="sm"
              variant="quiet"
              icon={<X size={12} />}
              onClick={cancel}
              title="Cancelar la descarga y vaciar la cola"
            >
              Cancelar
            </Button>
          </div>
        </>
      )}

      {!active && queue.length > 0 && (
        <div className="flex shrink-0 items-center gap-1.5">
          <Button size="sm" variant="quiet" onClick={onOpen}>
            Ver cola
          </Button>
          <Button size="sm" variant="quiet" onClick={cancel}>
            Vaciar cola
          </Button>
        </div>
      )}
    </div>
  );
}

function basenameOf(path: string): string {
  const parts = path.split(/[\\/]/).filter(Boolean);
  return parts[parts.length - 1] ?? path;
}

function formatEta(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 1) return "menos de 1 s";
  if (seconds < 60) return `${Math.round(seconds)} s`;
  const minutes = Math.floor(seconds / 60);
  const rest = Math.round(seconds % 60);
  if (minutes < 60) return `${minutes} min ${rest} s`;
  const hours = Math.floor(minutes / 60);
  return `${hours} h ${minutes % 60} min`;
}
