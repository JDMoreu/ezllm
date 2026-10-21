import { useCallback, useEffect, useState } from "react";
import { Activity, Cpu, Gauge, Play, Zap } from "lucide-react";

import { Button, Section, useToast } from "../components/ui";
import { LiveMeter, Pulse, Readout, Sparkline } from "../components/Telemetry";
import { basename, formatBytes } from "../lib/format";
import { api } from "../lib/api";
import { useTelemetry } from "../lib/useTelemetry";
import type { AppConfig, Deployment, HardwareReport, ServerStatus } from "../types";

type NavTarget = "dashboard" | "deploy" | "releases" | "settings";

export default function DashboardView({
  hardware,
  server,
  selectedModel,
  onNavigate,
  onConfigChange,
  onModelPicked,
}: {
  hardware: HardwareReport | null;
  server: ServerStatus | null;
  selectedModel: string | null;
  onNavigate: (v: NavTarget) => void;
  onConfigChange: (c: AppConfig) => void;
  onModelPicked: (m: string | null, mm: string | null, d: string | null) => void;
}) {
  const toast = useToast();
  const [deployments, setDeployments] = useState<Deployment[]>([]);
  const [probing, setProbing] = useState(false);

  // Telemetría viva: 1 Hz. Todo lo que se muestra aquí está medido.
  const tel = useTelemetry(true, 1);

  useEffect(() => {
    api.listDeployments().then(setDeployments).catch(() => {});
  }, []);

  const applyDeployment = useCallback(
    async (d: Deployment) => {
      try {
        // El backend devuelve la config ya aplicada. Si se descarta, el
        // modelo seleccionado sigue siendo el anterior y el servidor arranca
        // con otro: el toast prometia una cosa y hacia otra.
        const [cfg] = await api.applyDeployment(d.id);
        onConfigChange(cfg);
        onModelPicked(cfg.lastModel, cfg.lastMmproj, cfg.lastDraftModel);
        toast.push(`«${d.name}» aplicado. Ya puedes arrancar.`, "success");
        setDeployments(await api.listDeployments());
      } catch (e) {
        toast.push(`No se pudo aplicar: ${String(e)}`, "danger");
      }
    },
    [toast, onConfigChange, onModelPicked],
  );

  const probe = useCallback(async () => {
    setProbing(true);
    await tel.measureSpeed();
    setProbing(false);
  }, [tel]);

  const snap = tel.snapshot;
  const cpuPct = snap?.cpu.percent ?? 0;
  const ramUsed = snap?.ram.usedBytes ?? 0;
  const ramTotal = snap?.ram.totalBytes ?? 0;

  // VRAM: se mide con la misma API que usa llama.cpp.
  const gpus = snap?.gpus ?? hardware?.gpu ?? [];
  const vramTotal = gpus.reduce((a, g) => a + g.vramTotalMib, 0);

  const running = !!server?.running;

  return (
    <div className="space-y-4 animate-fade-up">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-display font-semibold tracking-tight text-ink-100">Panel</h1>
          <p className="mt-1 text-xs text-ink-400">
            Estado medido del equipo y del servidor. Los valores se releen cada
            segundo.
          </p>
        </div>
        <Pulse
          tone={running ? (server?.health ? "ok" : "warn") : "idle"}
          label={
            running
              ? server?.health
                ? "Servidor sano"
                : "Cargando el modelo"
              : "Servidor detenido"
          }
        />
      </header>

      {/* ================= SERVIDOR ================= */}
      <Section
        title="Servidor"
        description="El proceso de llama-server y lo que está sirviendo ahora mismo."
      >
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Readout
            label="Estado"
            value={running ? (server?.health ? "Sano" : "Cargando") : "Detenido"}
            tone={running ? (server?.health ? "accent" : "warn") : "default"}
            hint={
              running
                ? `Activo desde hace ${elapsed(server?.startedAt)}`
                : "El botón de la barra lateral lo arranca."
            }
          />
          <Readout
            label="Dirección"
            value={running ? `${server?.host}:${server?.port}` : "—"}
            hint={running ? "Escucha en este puerto" : undefined}
          />
          <Readout
            label="Modelo"
            value={
              server?.models.length
                ? basename(server.models[0])
                : selectedModel
                  ? basename(selectedModel)
                  : "—"
            }
            hint={server?.models.length ? "Cargado en memoria" : "Seleccionado, no cargado"}
          />
          <Readout
            label="Slots"
            value={tel.slots ? `${tel.slots.busy}/${tel.slots.total}` : "—"}
            tone={tel.slots && tel.slots.busy > 0 ? "accent" : "default"}
            hint={
              tel.slots
                ? `${tel.slots.nCtx.toLocaleString("es-ES")} tokens por slot`
                : "Requiere un servidor en marcha"
            }
          />
        </div>

        {running && (
          <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-base-800 pt-3">
            <Button
              size="sm"
              variant="ghost"
              icon={<Gauge size={12} />}
              onClick={probe}
              loading={probing}
            >
              Medir velocidad
            </Button>
            {tel.speed && (
              <span className="mono text-label text-ink-300">
                {tel.speed.predictedPerSecond.toFixed(1)} tok/s generación ·{" "}
                {tel.speed.promptPerSecond.toFixed(0)} tok/s prompt
              </span>
            )}
          </div>
        )}
      </Section>

      {/* ================= RECURSOS ================= */}
      <div className="grid gap-4 xl:grid-cols-2">
        {/* GPU */}
        <Section
          title="Tarjetas gráficas"
          description="VRAM real, leída con la misma API que usa llama.cpp."
        >
          {gpus.length === 0 ? (
            <p className="py-6 text-center text-xs text-ink-400">
              No se ha detectado ninguna GPU. Instala llama.cpp para consultarla.
            </p>
          ) : (
            <div className="space-y-4">
              {gpus.map((g, i) => {
                const used = g.vramTotalMib - g.vramFreeMib;
                const ratio = g.vramTotalMib > 0 ? used / g.vramTotalMib : 0;
                return (
                  <div key={i} className={clsxJoin(i > 0 && "border-t border-base-800 pt-4")}>
                    <div className="mb-2 flex items-center gap-2.5">
                      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-accent-500/12 text-accent-400">
                        <Zap size={13} />
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-xs font-medium text-ink-100">
                          {g.name}
                        </p>
                        <p className="mt-0.5 flex flex-wrap items-center gap-1.5 text-label text-ink-400">
                          <span className="mono uppercase">
                            {g.api}
                            {g.index}
                          </span>
                          <span className="chip">
                            {g.kind === "discrete"
                              ? "Dedicada"
                              : g.kind === "integrated"
                                ? "Integrada"
                                : g.kind}
                          </span>
                        </p>
                      </div>
                    </div>
                    {g.vramTotalMib > 0 ? (
                      <>
                        <LiveMeter
                          value={used}
                          max={g.vramTotalMib}
                          label={
                            running
                              ? "VRAM reservada (sistema + modelo)"
                              : "VRAM reservada por el sistema"
                          }
                          valueLabel={`${formatBytes(used * 1024 * 1024)} / ${formatBytes(g.vramTotalMib * 1024 * 1024)}`}
                          tone={ratio > 0.95 ? "danger" : ratio > 0.85 ? "warn" : undefined}
                        />
                        <div className="mt-2 h-8">
                          <Sparkline
                            samples={tel.vramSeries.values()}
                            height={32}
                            tone={ratio > 0.95 ? "danger" : ratio > 0.85 ? "warn" : undefined}
                          />
                        </div>
                      </>
                    ) : (
                      <p className="text-label text-ink-500">
                        VRAM no disponible desde este dispositivo.
                      </p>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </Section>

        {/* CPU y RAM */}
        <Section
          title="Procesador y memoria"
          description="Uso medido del sistema, actualizado cada segundo."
        >
          <div className="space-y-4">
            <div className="flex items-center gap-2.5">
              <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-info-500/12 text-info-400">
                <Cpu size={13} />
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-xs font-medium text-ink-100">
                  {hardware?.cpu.model ?? "—"}
                </p>
                <p className="mt-0.5 text-label text-ink-400">
                  {hardware?.cpu.physicalCores
                    ? `${hardware.cpu.physicalCores} núcleos físicos · ${hardware.cpu.logicalThreads} hilos`
                    : `${hardware?.cpu.logicalThreads ?? "?"} hilos`}
                </p>
              </div>
            </div>

            <LiveMeter
              value={cpuPct}
              max={100}
              label="CPU en uso"
              valueLabel={`${cpuPct.toFixed(0)}%`}
              tone={cpuPct > 90 ? "danger" : cpuPct > 70 ? "warn" : undefined}
            />
            <div className="-mt-1 h-8">
              <Sparkline
                samples={tel.cpuSeries.values()}
                height={32}
                max={100}
                tone={cpuPct > 90 ? "danger" : cpuPct > 70 ? "warn" : undefined}
              />
            </div>

            <LiveMeter
              value={ramUsed}
              max={ramTotal}
              label="RAM en uso"
              valueLabel={
                ramTotal > 0
                  ? `${formatBytes(ramUsed)} / ${formatBytes(ramTotal)}`
                  : "—"
              }
              tone={
                ramTotal > 0 && ramUsed / ramTotal > 0.92
                  ? "danger"
                  : ramTotal > 0 && ramUsed / ramTotal > 0.8
                    ? "warn"
                    : undefined
              }
            />
            <div className="-mt-1 h-8">
              <Sparkline
                samples={tel.ramSeries.values()}
                height={32}
                max={1}
                tone={
                  ramTotal > 0 && ramUsed / ramTotal > 0.92
                    ? "danger"
                    : ramTotal > 0 && ramUsed / ramTotal > 0.8
                      ? "warn"
                      : undefined
                }
              />
            </div>

            {snap?.process && (
              <div className="border-t border-base-800 pt-3">
                <LiveMeter
                  value={snap.process.workingSetBytes}
                  max={Math.max(snap.process.workingSetBytes, vramTotal * 1024 * 1024)}
                  label="Memoria de llama-server"
                  valueLabel={formatBytes(snap.process.workingSetBytes)}
                />
              </div>
            )}
          </div>
        </Section>
      </div>

      {/* ================= DESPLIEGUES ================= */}
      {deployments.length > 0 ? (
        <Section
          title="Despliegues guardados"
          description="Cada uno trae su modelo y su configuración. Aplica uno y arranca."
        >
          <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {deployments.map((d) => (
              <li key={d.id}>
                <button
                  onClick={() => applyDeployment(d)}
                  className="flex w-full cursor-pointer items-center gap-2.5 rounded-lg border border-base-800 bg-base-950 px-3 py-2.5 text-left transition-colors duration-150 hover:border-accent-500/40 hover:bg-base-850"
                >
                  <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-accent-500/12 text-accent-400">
                    <Play size={12} />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-xs font-medium text-ink-100">
                      {d.name}
                    </span>
                    <span className="mt-0.5 block truncate text-label text-ink-400">
                      {d.modelPath ? basename(d.modelPath) : "Sin modelo"} ·{" "}
                      {(d.server.ctxSize / 1024).toFixed(0)}k ctx
                    </span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </Section>
      ) : (
        <Section
          title="Despliegues guardados"
          description="Aún no hay ninguno. Crea uno en Despliegue: un modelo con su configuración."
          actions={
            <Button
              size="sm"
              icon={<Play size={12} />}
              onClick={() => onNavigate("deploy")}
            >
              Ir a Despliegue
            </Button>
          }
        >
          <div className="flex flex-col items-center gap-3 py-6 text-center">
            <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-base-850 text-ink-400">
              <Activity size={16} />
            </span>
            <p className="max-w-sm text-xs leading-relaxed text-ink-400">
              Un despliegue es un modelo con su configuración guardada. Elige
              un GGUF, ajústalo y guárdalo: la próxima vez se carga de un clic.
            </p>
          </div>
        </Section>
      )}
    </div>
  );
}

function elapsed(seconds: number | null | undefined): string {
  if (!seconds) return "—";
  const diff = Math.max(0, Math.floor(Date.now() / 1000) - seconds);
  if (diff < 60) return `${diff} s`;
  if (diff < 3600) return `${Math.floor(diff / 60)} min`;
  return `${Math.floor(diff / 3600)} h`;
}

/** Une clases sin importar clsx en este fichero. */
function clsxJoin(...parts: (string | false | undefined)[]): string {
  return parts.filter(Boolean).join(" ");
}
