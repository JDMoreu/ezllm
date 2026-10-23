/** Sondeo de la telemetría del equipo.
 *
 * Todo lo que devuelve aquí está MEDIDO por el backend Rust (GetSystemTimes,
 * GlobalMemoryStatusEx, llama-server --list-devices, GetProcessMemoryInfo).
 * No hay cifras inventadas ni estimaciones.
 *
 * Cadencia: 1 Hz para los medidores. La VRAM se refresca cada 3 s porque
 * leerla lanza `llama-server --list-devices`, que es un proceso nuevo.
 */
import { useCallback, useEffect, useRef, useState } from "react";

import { api } from "./api";
import type { SlotsState, SpeedResult, Telemetry } from "../types";

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
  /** Velocidad medida en la última prueba. */
  speed: SpeedResult | null;
  /** Series temporales para las sparklines. */
  cpuSeries: Ring;
  ramSeries: Ring;
  vramSeries: Ring;
  /** Mide la velocidad real contra el servidor (una completion de prueba). */
  measureSpeed: () => Promise<void>;
  /** Velocidad de refresco en Hz. */
  hz: number;
  /** Pausa el sondeo (p. ej. cuando la ventana no está visible). */
  paused: boolean;
}

const VRAM_REFRESH_MS = 3000;
const MAX_SAMPLES = 90;

export function useTelemetry(active: boolean, hz = 1): TelemetryState {
  const [snapshot, setSnapshot] = useState<Telemetry | null>(null);
  const [slots, setSlots] = useState<SlotsState | null>(null);
  const [speed, setSpeed] = useState<SpeedResult | null>(null);
  const [paused, setPaused] = useState(false);

  // Las series viven en refs: no tienen que provocar un render al escribir.
  const cpuSeries = useRef(new Ring(MAX_SAMPLES)).current;
  const ramSeries = useRef(new Ring(MAX_SAMPLES)).current;
  const vramSeries = useRef(new Ring(MAX_SAMPLES)).current;

  // Última VRAM conocida, para no relanzar el proceso cada segundo.
  const lastGpu = useRef<Telemetry["gpus"]>([]);
  const lastGpuAt = useRef(0);

  const measureSpeed = useCallback(async () => {
    try {
      const s = await api.telemetrySpeed();
      setSpeed(s);
    } catch {
      // El servidor puede estar apagándose: se ignora.
    }
  }, []);

  useEffect(() => {
    if (!active) return;
    let alive = true;

    const tick = async () => {
      if (!alive || paused) return;
      try {
        const snap = await api.telemetrySnapshot();
        if (!alive) return;

        const now = Date.now();
        if (now - lastGpuAt.current >= VRAM_REFRESH_MS) {
          lastGpu.current = snap.gpus;
          lastGpuAt.current = now;
        } else {
          snap.gpus = lastGpu.current;
        }

        setSnapshot(snap);
        cpuSeries.push(snap.cpu.percent, now);
        ramSeries.push(snap.ram.usedBytes / snap.ram.totalBytes, now);
        const vramUsed = snap.gpus.reduce(
          (acc, g) => acc + (g.vramTotalMib - g.vramFreeMib),
          0,
        );
        const vramTotal = snap.gpus.reduce((acc, g) => acc + g.vramTotalMib, 0);
        if (vramTotal > 0) vramSeries.push(vramUsed / vramTotal, now);
      } catch {
        // Un fallo puntual de sondeo no debe parar el bucle.
      }
    };

    const id = setInterval(tick, 1000 / Math.max(0.25, hz));
    void tick();
    return () => {
      alive = false;
      clearInterval(id);
    };
  }, [active, hz, paused, cpuSeries, ramSeries, vramSeries]);

  // Los slots del servidor se consultan aparte: es una llamada HTTP.
  useEffect(() => {
    if (!active) return;
    let alive = true;
    const load = () =>
      api
        .telemetrySlots()
        .then((s) => alive && setSlots(s))
        .catch(() => alive && setSlots(null));
    void load();
    const id = setInterval(load, 2000);
    return () => {
      alive = false;
      clearInterval(id);
    };
  }, [active]);

  // Pausa el sondeo cuando la ventana pierde el foco: una app de escritorio
  // no debería lanzar procesos en segundo plano sin que nadie la mire.
  useEffect(() => {
    if (!active) return;
    const onVisibility = () => setPaused(document.hidden);
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, [active]);

  return {
    snapshot,
    slots,
    speed,
    measureSpeed,
    cpuSeries,
    ramSeries,
    vramSeries,
    hz,
    paused,
  };
}
