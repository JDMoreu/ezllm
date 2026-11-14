/** Sondeo de la telemetría del equipo.
 *
 * Todo lo que devuelve aquí está MEDIDO por el backend Rust (GetSystemTimes,
 * GlobalMemoryStatusEx, Windows GPU Adapter Memory, GetProcessMemoryInfo).
 * No hay cifras inventadas ni estimaciones.
 *
 * Cadencia: 1 Hz, sin procesos auxiliares en Windows ni sondeos solapados.
 */
import { useEffect, useRef, useState } from "react";

import { api } from "./api";
import type { SlotsState, Telemetry } from "../types";

/** Una muestra con su marca de tiempo, para las series temporales. */
export interface Sample {
  at: number;
  value: number;
}

/** Serie temporal acotada: solo guarda las últimas `max` muestras. */
export class Ring {
  private items: Sample[] = [];

  constructor(private readonly max: number) {}

  push(value: number, at = Date.now()): void {
    this.items.push({ at, value });
    if (this.items.length > this.max) {
      this.items.splice(0, this.items.length - this.max);
    }
  }

  /** Últimas muestras, de la más antigua a la más reciente. */
  values(): Sample[] {
    return [...this.items];
  }

  /** El valor más reciente, o `null` si no hay muestras. */
  last(): number | null {
    return this.items.length ? this.items[this.items.length - 1].value : null;
  }

  /** Máximo del rango, para escalar la serie. */
  peak(): number {
    return this.items.reduce((m, s) => Math.max(m, s.value), 0);
  }

  clear(): void {
    this.items = [];
  }
}

export interface TelemetryState {
  /** Última instantánea medida. */
  snapshot: Telemetry | null;
  /** Slots ocupados del servidor. */
  slots: SlotsState | null;
  /** Series temporales para las sparklines. */
  cpuSeries: Ring;
  ramSeries: Ring;
  vramSeries: Ring;
  gpuSeries: Ring;
  /** Velocidad de refresco en Hz. */
  hz: number;
  /** Pausa el sondeo (p. ej. cuando la ventana no está visible). */
  paused: boolean;
}

const MAX_SAMPLES = 90;

export function useTelemetry(active: boolean, hz = 1): TelemetryState {
  const [snapshot, setSnapshot] = useState<Telemetry | null>(null);
  const [slots, setSlots] = useState<SlotsState | null>(null);
  const [paused, setPaused] = useState(false);

  // Las series viven en refs: no tienen que provocar un render al escribir.
  const cpuSeries = useRef(new Ring(MAX_SAMPLES)).current;
  const ramSeries = useRef(new Ring(MAX_SAMPLES)).current;
  const vramSeries = useRef(new Ring(MAX_SAMPLES)).current;
  const gpuSeries = useRef(new Ring(MAX_SAMPLES)).current;

  // No mezclar series de adaptadores distintos al cambiar el hardware.
  const lastAdapterId = useRef<string | null>(null);


  useEffect(() => {
    if (!active) return;
    let alive = true;
    let timer: ReturnType<typeof setTimeout> | undefined;

    const tick = async () => {
      if (!alive || paused) return;
      try {
        const snap = await api.telemetrySnapshot();
        if (!alive) return;

        const now = Date.now();
        setSnapshot(snap);
        cpuSeries.push(snap.cpu.percent, now);
        if (snap.ram.totalBytes > 0)
          ramSeries.push(snap.ram.usedBytes / snap.ram.totalBytes, now);
        if (snap.gpu) gpuSeries.push(snap.gpu.percent, now);
        const adapter = [...(snap.gpuMemory ?? [])].sort(
          (a, b) => b.dedicatedTotalBytes - a.dedicatedTotalBytes,
        )[0];
        if (lastAdapterId.current !== (adapter?.id ?? null)) {
          vramSeries.clear();
          lastAdapterId.current = adapter?.id ?? null;
        }
        if (
          adapter?.dedicatedUsedBytes != null &&
          adapter.dedicatedTotalBytes > 0
        ) {
          vramSeries.push(
            adapter.dedicatedUsedBytes / adapter.dedicatedTotalBytes,
            now,
          );
        }
      } catch {
        if (alive) setSnapshot(null);
      } finally {
        if (alive) timer = setTimeout(tick, 1000 / Math.max(0.25, hz));
      }
    };

    void tick();
    return () => {
      alive = false;
      clearTimeout(timer);
    };
  }, [active, hz, paused, cpuSeries, ramSeries, vramSeries, gpuSeries]);

  // Los slots del servidor se consultan aparte: es una llamada HTTP.
  useEffect(() => {
    if (!active || paused) return;
    let alive = true;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const load = async () => {
      try {
        const result = await api.telemetrySlots();
        if (alive) setSlots(result);
      } catch {
        if (alive) setSlots(null);
      } finally {
        if (alive) timer = setTimeout(load, 2000);
      }
    };
    void load();
    return () => {
      alive = false;
      clearTimeout(timer);
    };
  }, [active, paused]);

  // Pausa al ocultarse; al volver, solicita una lectura nueva de inmediato.
  useEffect(() => {
    if (!active) return;
    const onVisibility = () => setPaused(document.hidden);
    onVisibility();
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, [active]);

  return {
    snapshot,
    slots,
    cpuSeries,
    ramSeries,
    vramSeries,
    gpuSeries,
    hz,
    paused,
  };
}
