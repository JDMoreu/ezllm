/** Gestor de descargas de Hugging Face.
 *
 * Vive en `Shell`, no en la vista de Modelos: una descarga de 17 GB no debe
 * desaparecer porque el usuario cambie de pestaña. La cola es secuencial (el
 * backend descarga un archivo a la vez) y cada trabajo se puede cancelar.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { api, onHfDownloadProgress } from "./api";
import { basename } from "./format";
import { useToast } from "../components/ui";
import type { CatalogEntry, CatalogView, HfModelDetail, HfQuant } from "../types";

export interface DownloadJob {
  repo: string;
  quantId: string;
  label: string;
  role: HfQuant["role"];
  size: number;
  files: string[];
  key: string;
}

export interface ActiveDownload extends DownloadJob {
  percent: number;
  phase: string;
  file: string;
  fileIndex: number;
  fileCount: number;
  speed: number;
  startedAt: number;
}

export interface DownloadsApi {
  active: ActiveDownload | null;
  queue: DownloadJob[];
  /** Rutas completadas en esta sesión, por `repo::cuantización`. */
  downloaded: Record<string, string>;
  /** Catálogo real de la carpeta de modelos, para reconocer lo ya descargado. */
  catalog: CatalogView | null;
  enqueue: (detail: HfModelDetail, quant: HfQuant) => void;
  cancel: () => void;
  isQueued: (repo: string, quantId: string) => boolean;
  /** Entrada local que corresponde a todos los archivos de una cuantización. */
  localFor: (files: { path: string }[]) => CatalogEntry | null;
  refreshCatalog: () => void;
}

export function downloadKey(repo: string, quantId: string): string {
  return `${repo}::${quantId}`;
}

export function useDownloads(modelsDir: string): DownloadsApi {
  const toast = useToast();
  const [active, setActive] = useState<ActiveDownload | null>(null);
  const [queue, setQueue] = useState<DownloadJob[]>([]);
  const [downloaded, setDownloaded] = useState<Record<string, string>>({});
  const [catalog, setCatalog] = useState<CatalogView | null>(null);
  const activeRef = useRef<ActiveDownload | null>(null);
  const runningRef = useRef(false);

  useEffect(() => {
    activeRef.current = active;
  }, [active]);

  const refreshCatalog = useCallback(() => {
    if (!modelsDir) {
      setCatalog(null);
      return;
    }
    api
      .scanModels(modelsDir)
      .then(setCatalog)
      .catch(() => setCatalog(null));
  }, [modelsDir]);

  useEffect(() => {
    refreshCatalog();
  }, [refreshCatalog]);

  useEffect(
    () =>
      onHfDownloadProgress((progress) => {
        setActive((current) => {
          if (!current || current.repo !== progress.repo) {
            return current;
          }
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
      }),
    [],
  );

  const localByName = useMemo(() => {
    const map = new Map<string, CatalogEntry>();
    for (const entry of catalog?.entries ?? []) {
      map.set(basename(entry.fileName).toLowerCase(), entry);
    }
    return map;
  }, [catalog]);

  const localFor = useCallback(
    (files: { path: string }[]) => {
      if (files.length === 0) return null;
      let first: CatalogEntry | null = null;
      for (const file of files) {
        const entry = localByName.get(basename(file.path).toLowerCase());
        if (!entry) return null;
        first ??= entry;
      }
      return first;
    },
    [localByName],
  );

  const run = useCallback(
    async (job: DownloadJob) => {
      setActive({
        ...job,
        percent: 0,
        phase: "preparando",
        file: "",
        fileIndex: 0,
        fileCount: job.files.length,
        speed: 0,
        startedAt: Date.now(),
      });
      try {
        const result = await api.hfDownload(job.repo, job.files);
        setDownloaded((prev) => ({
          ...prev,
          [job.key]: result.modelPath ?? "",
        }));
        toast.push(`${job.label} descargado`, "success");
        refreshCatalog();
      } catch (error) {
        const message = String(error);
        if (message.toLowerCase().includes("cancelada")) {
          toast.push("Descarga cancelada", "info");
          refreshCatalog();
        } else {
          toast.push(`No se pudo descargar ${job.label}: ${message}`, "danger");
        }
      } finally {
        setActive(null);
        runningRef.current = false;
      }
    },
    [refreshCatalog, toast],
  );

  useEffect(() => {
    if (active || queue.length === 0 || runningRef.current) return;
    runningRef.current = true;
    const [job, ...rest] = queue;
    setQueue(rest);
    void run(job);
  }, [active, queue, run]);

  const enqueue = useCallback(
    (detail: HfModelDetail, quant: HfQuant) => {
      const key = downloadKey(detail.id, quant.id);
      if (activeRef.current?.key === key) return;
      if (localFor(quant.files)) {
        toast.push(`${quant.label} ya está en tu carpeta de modelos`, "info");
        return;
      }
      setQueue((prev) => {
        if (prev.some((job) => job.key === key)) return prev;
        return [
          ...prev,
          {
            repo: detail.id,
            quantId: quant.id,
            label: `${repoName(detail.id)} · ${quant.label}`,
            role: quant.role,
            size: quant.size,
            files: quant.files.map((file) => file.path),
            key,
          },
        ];
      });
    },
    [localFor, toast],
  );

  const cancel = useCallback(() => {
    setQueue([]);
    setActive((current) => (current ? { ...current, phase: "cancelando" } : current));
    api.hfCancelDownload().catch(() => {});
  }, []);

  const isQueued = useCallback(
    (repo: string, quantId: string) => {
      const key = downloadKey(repo, quantId);
      return active?.key === key || queue.some((job) => job.key === key);
    },
    [active, queue],
  );

  return {
    active,
    queue,
    downloaded,
    catalog,
    enqueue,
    cancel,
    isQueued,
    localFor,
    refreshCatalog,
  };
}

function repoName(id: string): string {
  return id.split("/").filter(Boolean).pop() ?? id;
}
