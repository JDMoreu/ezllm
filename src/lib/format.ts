/** Utilidades de formato: Bytes, GiB, fechas, números. */

export function formatBytes(bytes: number, decimals = 1): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  const value = bytes / Math.pow(1024, i);
  return `${value.toFixed(i === 0 ? 0 : decimals)} ${units[i]}`;
}

/**
 * Bytes forzando una unidad.
 *
 * Sin esto, la misma columna mezcla "9.7 GB" y "907.0 MB": dos numeros que
 * no se pueden comparar de un vistazo. Cuando se comparan dos cifras de la
 * misma metrica, la unidad tiene que ser la misma.
 */
export function formatBytesAs(bytes: number, unit: "MiB" | "GiB", decimals = 1): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return `0 ${unit}`;
  const div = unit === "MiB" ? 1024 ** 2 : 1024 ** 3;
  return `${(bytes / div).toFixed(decimals)} ${unit}`;
}

export function formatGb(gb: number, decimals = 2): string {
  if (!Number.isFinite(gb)) return "—";
  return `${gb.toFixed(decimals).replace(".", ",")} GB`;
}

export function formatMiB(mib: number, decimals = 0): string {
  if (!Number.isFinite(mib)) return "—";
  return `${mib.toFixed(decimals)} MiB`;
}

/** Bytes por segundo en una unidad legible. */
export function formatSpeed(bytesPerSec: number): string {
  if (!Number.isFinite(bytesPerSec) || bytesPerSec <= 0) return "—";
  return `${formatBytes(bytesPerSec, 1)}/s`;
}

/** Fecha ISO de GitHub ("2026-10-20T00:23:31Z") a formato corto local. */
export function formatDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("es-ES", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

export function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString("es-ES", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/** "hace 3 h" a partir de un timestamp en segundos. */
export function formatElapsed(seconds: number | null | undefined): string {
  if (!seconds) return "—";
  const diff = Math.max(0, Math.floor(Date.now() / 1000) - seconds);
  if (diff < 60) return `${diff} s`;
  if (diff < 3600) return `${Math.floor(diff / 60)} min`;
  if (diff < 86400) return `${Math.floor(diff / 3600)} h`;
  return `${Math.floor(diff / 86400)} d`;
}

/** Número grande con separador de miles. */
export function formatNumber(n: number | null | undefined): string {
  if (n === null || n === undefined || !Number.isFinite(n)) return "—";
  return n.toLocaleString("es-ES");
}

/** Millones de parámetros a texto legible: 4.28B -> "4.28 B". */
export function formatParams(n: number): string {
  if (!n) return "—";
  if (n >= 1e9) return `${(n / 1e9).toFixed(2)} B`;
  if (n >= 1e6) return `${(n / 1e6).toFixed(1)} M`;
  return formatNumber(n);
}

/** Última parte de una ruta de Windows o Unix. */
export function basename(path: string): string {
  const parts = path.split(/[\\/]/).filter(Boolean);
  return parts[parts.length - 1] ?? path;
}

/** Carpeta que contiene un fichero. */
export function dirname(path: string): string {
  const idx = Math.max(path.lastIndexOf("\\"), path.lastIndexOf("/"));
  return idx > 0 ? path.slice(0, idx) : path;
}

/** Etiqueta legible del backend de un asset. */
export function backendLabel(backend: string): string {
  switch (backend) {
    case "vulkan":
      return "Vulkan";
    case "cuda":
      return "CUDA";
    case "rocm":
      return "ROCm";
    case "sycl":
      return "SYCL";
    case "openvino":
      return "OpenVINO";
    case "opencl":
      return "OpenCL";
    case "cpu":
      return "CPU";
    default:
      return backend;
  }
}

/** Rol del modelo en español. */
export function roleLabel(role: string): string {
  switch (role) {
    case "primary":
      return "Modelo";
    case "mmproj":
      return "Proyector";
    case "draft":
      return "MTP / draft";
    default:
      return role;
  }
}
