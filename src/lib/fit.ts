/**
 * Compatibilidad de memoria: un solo criterio para Modelos y para Ejecutar.
 *
 * Verde: el uso queda por debajo del 75 % de la capacidad. Ámbar: entre el
 * 75 % y el 95 %, cabe justo. Rojo: por encima del 95 %, no cabe.
 */

/** Hasta esta fracción de la capacidad, el uso cabe con margen. */
export const FIT_LIMIT = 0.75;
/** Hasta esta fracción cabe justo; por encima, no cabe. */
export const TIGHT_LIMIT = 0.95;

export type FitTone = "fit" | "tight" | "no" | "unknown";

/** Clasifica una necesidad de memoria frente a la capacidad disponible. */
export function fitOf(needGb: number, capacityGb: number): FitTone {
  if (!(capacityGb > 0) || !Number.isFinite(needGb)) return "unknown";
  const ratio = needGb / capacityGb;
  if (ratio <= FIT_LIMIT) return "fit";
  if (ratio <= TIGHT_LIMIT) return "tight";
  return "no";
}

/** Porcentaje de la capacidad que ocupa la necesidad. */
export function percentOf(needGb: number, capacityGb: number): number {
  return capacityGb > 0 ? Math.round((needGb / capacityGb) * 100) : 0;
}

/** Contextos que se ofrecen al calcular el automático, en tokens enteros. */
export const CONTEXT_STEPS = [2048, 4096, 8192, 16384, 32768, 65536, 131072];

/**
 * Mayor contexto de la lista que cabe con margen. `fixedGb` son los pesos y la
 * caché que no crecen con el contexto; `kvPerTokenGb` es lo que cuesta cada
 * token de la caché densa. Nunca baja de 4096, el mínimo que `--fit` respeta.
 */
export function recommendedContext(args: {
  capacityGb: number;
  fixedGb: number;
  kvPerTokenGb: number;
  maxCtx: number | null;
}): number | null {
  const { capacityGb, fixedGb, kvPerTokenGb, maxCtx } = args;
  if (!(capacityGb > 0) || !(kvPerTokenGb > 0)) return null;
  const freeGb = capacityGb * FIT_LIMIT - fixedGb;
  const byMemory = freeGb > 0 ? Math.floor(freeGb / kvPerTokenGb) : 0;
  const fits = CONTEXT_STEPS.filter((step) => step >= 4096 && step <= byMemory);
  const best = fits.length > 0 ? fits[fits.length - 1] : 4096;
  return maxCtx !== null ? Math.min(best, maxCtx) : best;
}
