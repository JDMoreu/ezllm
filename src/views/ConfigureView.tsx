import { useCallback, useEffect, useMemo, useState } from "react";
import clsx from "clsx";
import {
  Copy,
  Cpu,
  HardDrive,
  MemoryStick,
  Play,
  Square,
  Terminal,
  Zap,
} from "lucide-react";

import { api } from "../lib/api";
import {
  Alert,
  Button,
  Card,
  Meter,
  NumberField,
  SelectField,
  useToast,
} from "../components/ui";
import { basename, formatGb } from "../lib/format";
import type { AppConfig, MemoryEstimate, ServerConfig, ServerStatus } from "../types";

const CACHE_TYPES = [
  { value: "f16", label: "F16 (por defecto)" },
  { value: "q8_0", label: "Q8_0 (más rápido, menos memoria)" },
  { value: "q5_1", label: "Q5_1" },
  { value: "q5_0", label: "Q5_0" },
  { value: "q4_1", label: "Q4_1" },
  { value: "q4_0", label: "Q4_0" },
  { value: "iq4_nl", label: "IQ4_NL" },
  { value: "f32", label: "F32 (máxima calidad)" },
];

const FLASH_OPTIONS = [
  { value: "auto", label: "Automático" },
  { value: "on", label: "Activado" },
  { value: "off", label: "Desactivado" },
];

const LOAD_MODES = [
  { value: "", label: "Por defecto" },
  { value: "mmap", label: "mmap (mapeo en memoria)" },
  { value: "mlock", label: "mlock (memoria bloqueada)" },
];

export default function ConfigureView({
  config,
  server,
  selectedModel,
  selectedMmproj,
  selectedDraft,
  onConfigChange,
  onStart,
  onStop,
  busy,
}: {
  config: AppConfig | null;
  server: ServerStatus | null;
  selectedModel: string | null;
  selectedMmproj: string | null;
  selectedDraft: string | null;
  onConfigChange: (c: AppConfig) => void;
  onStart: () => void;
  onStop: () => void;
  busy: boolean;
}) {
  const toast = useToast();
  const [estimate, setEstimate] = useState<MemoryEstimate | null>(null);
  const [flags, setFlags] = useState<string[]>([]);
  const [log, setLog] = useState("");

  const sc = config?.server;

  const update = useCallback(
    (patch: Partial<ServerConfig>) => {
      if (!config) return;
      onConfigChange({ ...config, server: { ...config.server, ...patch } });
    },
    [config, onConfigChange],
  );

  // Estimación de memoria en vivo.
  useEffect(() => {
    if (!selectedModel || !sc) {
      setEstimate(null);
      return;
    }
    let alive = true;
    const id = setTimeout(async () => {
      try {
        const est = await api.estimateMemory(
          selectedModel,
          sc.ctxSize,
          sc.nParallel,
          sc.cacheTypeK,
          sc.ubatchSize,
          sc.nGpuLayers,
        );
        if (alive) setEstimate(est);
      } catch {
        if (alive) setEstimate(null);
      }
    }, 220);
    return () => {
      alive = false;
      clearTimeout(id);
    };
  }, [selectedModel, sc]);

  // Flags exactos que se pasarían a llama-server.
  useEffect(() => {
    let alive = true;
    api
      .previewFlags(selectedModel, selectedMmproj, selectedDraft)
      .then((f) => alive && setFlags(f))
      .catch(() => alive && setFlags([]));
    return () => {
      alive = false;
    };
  }, [selectedModel, selectedMmproj, selectedDraft, config?.server]);

  // Log del servidor.
  useEffect(() => {
    let alive = true;
    const load = () =>
      api
        .serverLog(80)
        .then((t) => alive && setLog(t))
        .catch(() => {});
    void load();
    const id = setInterval(load, 4000);
    return () => {
      alive = false;
      clearInterval(id);
    };
  }, [server?.running, server?.startedAt]);

  const ctxSteps = useMemo(() => [1024, 2048, 4096, 8192, 16384, 32768, 65536, 131072, 262144], []);

  if (!config || !sc) {
    return (
      <Card>
        <p className="py-6 text-center text-xs text-ink-400">Cargando configuración…</p>
      </Card>
    );
  }

  return (
    <div className="space-y-5">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-lg font-semibold tracking-tight text-ink-100">Configurar</h1>
          <p className="mt-1 max-w-2xl text-xs leading-relaxed text-ink-400">
            Ajusta el servidor y comprueba en vivo cuánto ocupará. Los valores se traducen a
            las flags exactas de <span className="mono">llama-server</span>.
          </p>
        </div>
        <div className="flex gap-2">
          {server?.running ? (
            <Button variant="danger" icon={<Square size={13} />} onClick={onStop} loading={busy}>
              Detener
            </Button>
          ) : (
            <Button variant="primary" icon={<Play size={13} />} onClick={onStart} loading={busy}>
              Arrancar servidor
            </Button>
          )}
        </div>
      </header>

      {!selectedModel && (
        <Alert tone="info" title="No hay ningún modelo seleccionado">
          Elige un modelo en la sección <strong>Modelos</strong> para ver la estimación de
          memoria. Puedes arrancar el servidor sin modelo (modo router) para cargarlos después.
        </Alert>
      )}

      <div className="grid gap-4 xl:grid-cols-[1fr_21rem]">
        <div className="space-y-4">
          {/* --- Contexto y lotes --- */}
          <Card title="Contexto y lotes" subtitle="Define cuánto recuerda el modelo por sesión.">
            <div className="grid gap-4 sm:grid-cols-2">
              <SelectField
                label="Contexto"
                value={String(sc.ctxSize)}
                onChange={(v) => update({ ctxSize: Number(v) })}
                options={ctxSteps.map((s) => ({
                  value: String(s),
                  label: `${s.toLocaleString("es-ES")} tokens`,
                }))}
                hint="El contexto se alinea a múltiplos de 256."
              />
              <NumberField
                label="Tamaño de lote"
                value={sc.batchSize}
                onChange={(v) => update({ batchSize: v })}
                min={32}
                max={65536}
                step={32}
                suffix="tokens"
                hint="Tokens procesados por tanda de lógica."
              />
              <NumberField
                label="Micro-lote"
                value={sc.ubatchSize}
                onChange={(v) => update({ ubatchSize: v })}
                min={32}
                max={8192}
                step={32}
                suffix="tokens"
                hint="Sub-bloque de cómputo. Más alto usa más VRAM."
              />
              <NumberField
                label="Sesiones en paralelo"
                value={sc.nParallel}
                onChange={(v) => update({ nParallel: v })}
                min={1}
                max={64}
                hint={
                  sc.nParallel > 1
                    ? "La caché SWA reserva memoria por sesión: el consumo sube."
                    : "Cuántas peticiones simultáneas atiende el servidor."
                }
              />
            </div>
          </Card>

          {/* --- GPU --- */}
          <Card title="GPU" subtitle="Reparto entre la tarjeta y el procesador.">
            <div className="grid gap-4 sm:grid-cols-2">
              <SelectField
                label="Capas en la GPU"
                value={sc.nGpuLayers === null ? "auto" : String(sc.nGpuLayers)}
                onChange={(v) =>
                  update({ nGpuLayers: v === "auto" ? null : Number(v) })
                }
                options={[
                  { value: "auto", label: "Automático" },
                  ...Array.from({ length: 65 }, (_, i) => ({
                    value: String(i),
                    label: i === 0 ? "0 (solo CPU)" : `${i} capas`,
                  })),
                ]}
                hint="Todas las capas es lo más rápido, si la VRAM alcanza."
              />
              <NumberField
                label="Dispositivo"
                value={0}
                onChange={() => {}}
                disabled
                hint="Se detecta automáticamente en el Panel."
              />
              <SelectField
                label="Flash Attention"
                value={sc.flashAttn}
                onChange={(v) => update({ flashAttn: v })}
                options={FLASH_OPTIONS}
                hint="Acelera la atención y ahorra memoria en contextos largos."
              />
              <SelectField
                label="Tipo de caché K"
                value={sc.cacheTypeK}
                onChange={(v) => update({ cacheTypeK: v })}
                options={CACHE_TYPES}
                hint="Cuantizar la caché reduce la VRAM a costa de calidad."
              />
              <SelectField
                label="Tipo de caché V"
                value={sc.cacheTypeV}
                onChange={(v) => update({ cacheTypeV: v })}
                options={CACHE_TYPES}
              />
              <SelectField
                label="Modo de carga"
                value={sc.loadMode}
                onChange={(v) => update({ loadMode: v })}
                options={LOAD_MODES}
                hint="Sustituye a las antiguas --mmap y --mlock."
              />
            </div>
          </Card>

          {/* --- Procesador y red --- */}
          <Card title="Procesador y red">
            <div className="grid gap-4 sm:grid-cols-2">
              <NumberField
                label="Hilos (generación)"
                value={sc.threads ?? 0}
                onChange={(v) => update({ threads: v > 0 ? v : null })}
                min={0}
                suffix={sc.threads ? "hilos" : "auto"}
                hint="0 usa todos los núcleos físicos."
              />
              <NumberField
                label="Hilos (lote)"
                value={sc.threadsBatch ?? 0}
                onChange={(v) => update({ threadsBatch: v > 0 ? v : null })}
                min={0}
                suffix={sc.threadsBatch ? "hilos" : "auto"}
              />
              <SelectField
                label="Dirección"
                value={sc.host}
                onChange={(v) => update({ host: v })}
                options={[
                  { value: "127.0.0.1", label: "127.0.0.1 (solo este equipo)" },
                  { value: "0.0.0.0", label: "0.0.0.0 (accesible en la red)" },
                ]}
                hint="Escuchar en la red expone el modelo a otros equipos."
              />
              <NumberField
                label="Puerto"
                value={sc.port}
                onChange={(v) => update({ port: v })}
                min={1024}
                max={65535}
              />
              <div className="sm:col-span-2">
                <label className="label" htmlFor="alias">
                  Alias del modelo
                </label>
                <input
                  id="alias"
                  className="field"
                  placeholder="mi-modelo"
                  value={sc.alias ?? ""}
                  onChange={(e) => update({ alias: e.target.value || null })}
                />
                <p className="mt-1.5 text-[0.6875rem] text-ink-500">
                  Nombre con el que el modelo aparece en la API.
                </p>
              </div>
            </div>
          </Card>
        </div>

        {/* --- Columna lateral: memoria y flags --- */}
        <div className="space-y-4">
          <Card title="Memoria estimada" subtitle={selectedModel ? basename(selectedModel) : undefined}>
            {!estimate ? (
              <p className="py-4 text-center text-xs text-ink-500">
                Selecciona un modelo para ver la estimación.
              </p>
            ) : (
              <div className="space-y-3.5">
                <div>
                  <p className="text-[0.6875rem] text-ink-400">Peso total en memoria</p>
                  <p className="mono mt-0.5 text-xl font-semibold text-ink-100">
                    {formatGb(estimate.totalGb)}
                  </p>
                </div>

                <Meter
                  value={estimate.weightsGpuGb}
                  max={estimate.weightsGpuGb + estimate.kvCacheGb + estimate.computeBufferGb}
                  label="En la GPU"
                  valueLabel={formatGb(
                    estimate.weightsGpuGb + estimate.kvCacheGb + estimate.computeBufferGb,
                  )}
                />

                <dl className="space-y-1.5 border-t border-base-800 pt-3 text-[0.6875rem]">
                  {(
                    [
                      ["Pesos (GPU)", formatGb(estimate.weightsGpuGb)],
                      ["Pesos (CPU)", formatGb(estimate.weightsCpuGb)],
                      ["Caché KV", `${estimate.kvCacheMib.toFixed(0)} MiB`],
                      ["— densas", formatGb(estimate.kvDenseGb)],
                      ["— deslizante", formatGb(estimate.kvSwaGb)],
                      ["Compute buffer", formatGb(estimate.computeBufferGb)],
                    ] as const
                  ).map(([k, v]) => (
                    <div key={k} className="flex justify-between gap-3">
                      <dt className="text-ink-500">{k}</dt>
                      <dd className="mono tabular-nums text-ink-200">{v}</dd>
                    </div>
                  ))}
                </dl>

                <div className="flex items-start gap-2 border-t border-base-800 pt-3 text-[0.6875rem] leading-relaxed text-ink-500">
                  <MemoryStick size={12} className="mt-0.5 shrink-0" />
                  <span>
                    Contexto efectivo {estimate.ctxPadded.toLocaleString("es-ES")} tokens
                    {estimate.nSwaLayers > 0 && (
                      <>
                        , {estimate.nDenseLayers} capas densas y {estimate.nSwaLayers} con
                        ventana deslizante
                      </>
                    )}
                    .
                  </span>
                </div>
              </div>
            )}
          </Card>

          <Card
            title="Flags del servidor"
            subtitle="Lo que se ejecutará exactamente."
            actions={
              flags.length > 0 && (
                <button
                  onClick={() => {
                    navigator.clipboard
                      .writeText(flags.join(" "))
                      .then(() => toast.push("Flags copiados al portapapeles", "success"))
                      .catch(() => toast.push("No se pudo copiar", "danger"));
                  }}
                  className="btn-quiet cursor-pointer rounded p-1.5 text-ink-400 hover:text-ink-100"
                  title="Copiar los flags"
                  aria-label="Copiar los flags"
                >
                  <Copy size={13} />
                </button>
              )
            }
          >
            {flags.length === 0 ? (
              <p className="py-3 text-center text-xs text-ink-500">Sin flags que mostrar.</p>
            ) : (
              <div className="mono max-h-56 overflow-y-auto rounded-lg bg-base-950 p-3 text-[0.6875rem] leading-relaxed break-all text-ink-300">
                {flags.map((f, i) => (
                  <span key={i}>
                    <span className="text-accent-400">{f}</span>
                    {i < flags.length - 1 && " "}
                  </span>
                ))}
              </div>
            )}
          </Card>

          {server?.running && (
            <Card title="Registro del servidor" subtitle={server.logFile ?? undefined}>
              <pre className="mono max-h-64 overflow-auto rounded-lg bg-base-950 p-3 text-[0.6875rem] leading-relaxed text-ink-400">
                {log || "Sin líneas todavía."}
              </pre>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}

export { Cpu, HardDrive, Terminal, Zap, clsx };
