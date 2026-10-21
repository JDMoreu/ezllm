import {
  ArrowRight,
  Cpu,
  Download,
  Layers,
  MemoryStick,
  Play,
  Settings2,
  Square,
  Zap,
} from "lucide-react";

import { Button, Card, Meter, StatusDot } from "../components/ui";
import { basename, formatBytes, formatElapsed } from "../lib/format";
import type { HardwareReport, ServerStatus } from "../types";

type NavTarget = "dashboard" | "releases" | "models" | "configure" | "settings";

export default function DashboardView({
  hardware,
  server,
  selectedModel,
  onNavigate,
  onStart,
  onStop,
  busy,
}: {
  hardware: HardwareReport | null;
  server: ServerStatus | null;
  selectedModel: string | null;
  onNavigate: (v: NavTarget) => void;
  onStart: () => void;
  onStop: () => void;
  busy: boolean;
}) {
  const gpu = hardware?.gpu[0];

  const steps: {
    id: NavTarget;
    title: string;
    description: string;
    done: boolean;
    cta: string;
  }[] = [
    {
      id: "releases",
      title: "Instala llama.cpp",
      description: "Descarga los binarios oficiales de tu plataforma.",
      done: !!hardware?.llamaServer,
      cta: "Ver versiones",
    },
    {
      id: "models",
      title: "Elige un modelo",
      description: "Escanea tu carpeta y selecciona el GGUF principal.",
      done: !!selectedModel,
      cta: "Abrir modelos",
    },
    {
      id: "configure",
      title: "Ajusta el servidor",
      description: "Contexto, GPU y caché. Comprueba la memoria en vivo.",
      done: false,
      cta: "Configurar",
    },
  ];

  return (
    <div className="space-y-5">
      <header>
        <h1 className="text-lg font-semibold tracking-tight text-ink-100">Panel</h1>
        <p className="mt-1 text-xs leading-relaxed text-ink-400">
          Todo lo que EzLlamaCpp sabe de tu equipo y de tu servidor, en un vistazo.
        </p>
      </header>

      {/* --- Estado del servidor --- */}
      <Card
        title="Servidor"
        subtitle={
          server?.running
            ? `En marcha desde hace ${formatElapsed(server.startedAt)}`
            : "Detenido"
        }
        actions={
          server?.running ? (
            <Button variant="danger" size="sm" icon={<Square size={12} />} onClick={onStop} loading={busy}>
              Detener
            </Button>
          ) : (
            <Button variant="primary" size="sm" icon={<Play size={12} />} onClick={onStart} loading={busy}>
              Arrancar
            </Button>
          )
        }
      >
        <div className="grid gap-4 sm:grid-cols-3">
          <Stat
            label="Estado"
            value={
              server?.running ? (server.health ? "Sana" : "Cargando") : "Detenido"
            }
            icon={<Zap size={13} />}
            tone={server?.running ? (server.health ? "ok" : "warn") : "idle"}
          />
          <Stat
            label="Dirección"
            value={server?.running ? `http://${server.host}:${server.port}` : "—"}
            mono
          />
          <Stat
            label="Modelo cargado"
            value={
              server?.models.length ? server.models.join(", ") : selectedModel ? basename(selectedModel) : "—"
            }
          />
        </div>
      </Card>

      {/* --- Hardware --- */}
      <div className="grid gap-4 lg:grid-cols-2">
        <Card title="Tarjeta gráfica" subtitle={gpu?.source}>
          {!gpu ? (
            <p className="py-4 text-center text-xs text-ink-500">
              No se ha detectado ninguna GPU. Instala llama.cpp para consultarla.
            </p>
          ) : (
            <div className="space-y-3">
              {(hardware?.gpu ?? []).map((g, i) => (
                <div key={i} className="space-y-2.5">
                  {i > 0 && <div className="border-t border-base-800 pt-2.5" />}
                  <div className="flex items-start gap-2.5">
                    <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-accent-600/15 text-accent-400">
                      <Zap size={15} />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="text-xs font-medium text-ink-100">{g.name}</p>
                      <p className="mt-0.5 flex flex-wrap items-center gap-1.5 text-[0.6875rem] text-ink-500">
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
                        {g.vramTotalMib > 0 && (
                          <span className="mono">
                            {(g.vramTotalMib / 1024).toFixed(1)} GB
                          </span>
                        )}
                      </p>
                    </div>
                  </div>
                  {g.vramTotalMib > 0 && (
                    <Meter
                      value={g.vramTotalMib - g.vramFreeMib}
                      max={g.vramTotalMib}
                      label="VRAM en uso"
                      valueLabel={`${formatBytes((g.vramTotalMib - g.vramFreeMib) * 1024 * 1024)} / ${formatBytes(g.vramTotalMib * 1024 * 1024)}`}
                    />
                  )}
                </div>
              ))}
            </div>
          )}
        </Card>

        <Card title="Procesador y memoria">
          <div className="space-y-3">
            <div className="flex items-start gap-2.5">
              <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-base-800 text-ink-300">
                <Cpu size={15} />
              </span>
              <div className="min-w-0">
                <p className="text-xs font-medium text-ink-100">
                  {hardware?.cpu.model ?? "Procesador"}
                </p>
                <p className="mt-0.5 text-[0.6875rem] text-ink-500">
                  {hardware?.cpu.physicalCores
                    ? `${hardware.cpu.physicalCores} núcleos físicos · ${hardware.cpu.logicalThreads} hilos lógicos`
                    : `${hardware?.cpu.logicalThreads ?? "?"} hilos lógicos`}
                </p>
              </div>
            </div>
            {hardware && hardware.ram.totalGb > 0 && (
              <div className="space-y-2">
                <div className="flex items-start gap-2.5">
                  <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-base-800 text-ink-300">
                    <MemoryStick size={15} />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-medium text-ink-100">Memoria del sistema</p>
                    <p className="mt-0.5 text-[0.6875rem] text-ink-500">
                      {hardware.ram.availableGb.toFixed(1)} GB libres de{" "}
                      {hardware.ram.totalGb.toFixed(1)} GB
                    </p>
                  </div>
                </div>
                <Meter
                  value={hardware.ram.totalGb - hardware.ram.availableGb}
                  max={hardware.ram.totalGb}
                  label="RAM en uso"
                  valueLabel={`${(hardware.ram.totalGb - hardware.ram.availableGb).toFixed(1)} GB`}
                />
              </div>
            )}
          </div>
        </Card>
      </div>

      {/* --- Pasos --- */}
      <Card title="Puesta en marcha" subtitle="Tres pasos y el servidor responde.">
        <ol className="space-y-2">
          {steps.map((step, i) => (
            <li key={step.id}>
              <button
                onClick={() => onNavigate(step.id)}
                className="group flex w-full cursor-pointer items-center gap-3 rounded-lg border border-base-800 px-3.5 py-3 text-left transition-colors duration-200 hover:border-base-700 hover:bg-base-850"
              >
                <span
                  className={
                    step.done
                      ? "flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-accent-600/15 text-[0.6875rem] font-semibold text-accent-400"
                      : "flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-base-800 text-[0.6875rem] font-semibold text-ink-400"
                  }
                >
                  {step.done ? "✓" : i + 1}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-xs font-medium text-ink-100">{step.title}</span>
                  <span className="mt-0.5 block text-[0.6875rem] text-ink-500">
                    {step.description}
                  </span>
                </span>
                <span className="flex shrink-0 items-center gap-1 text-[0.6875rem] font-medium text-ink-400 transition-colors duration-200 group-hover:text-accent-400">
                  {step.cta}
                  <ArrowRight size={12} />
                </span>
              </button>
            </li>
          ))}
        </ol>
      </Card>

      {/* --- Atajos --- */}
      <div className="grid gap-3 sm:grid-cols-3">
        <Shortcut
          icon={<Download size={15} />}
          title="Instalar llama.cpp"
          description="Binarios oficiales con verificación de hash."
          onClick={() => onNavigate("releases")}
        />
        <Shortcut
          icon={<Layers size={15} />}
          title="Buscar modelos"
          description="Explora tu carpeta y detecta MTP y mmproj."
          onClick={() => onNavigate("models")}
        />
        <Shortcut
          icon={<Settings2 size={15} />}
          title="Ajustes"
          description="Rutas, token de GitHub y backend preferido."
          onClick={() => onNavigate("settings")}
        />
      </div>
    </div>
  );
}

function Stat({
  label,
  value,
  icon,
  mono,
  tone,
}: {
  label: string;
  value: string;
  icon?: React.ReactNode;
  mono?: boolean;
  tone?: "ok" | "warn" | "idle";
}) {
  return (
    <div className="rounded-lg bg-base-850 px-3 py-2.5">
      <p className="flex items-center gap-1.5 text-[0.6875rem] font-medium tracking-wide text-ink-500 uppercase">
        {icon}
        {label}
      </p>
      {tone ? (
        <div className="mt-1.5">
          <StatusDot tone={tone} label={value} />
        </div>
      ) : (
        <p className={mono ? "mono mt-1 truncate text-xs text-ink-100" : "mt-1 truncate text-xs text-ink-100"}>
          {value}
        </p>
      )}
    </div>
  );
}

function Shortcut({
  icon,
  title,
  description,
  onClick,
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className="group cursor-pointer rounded-xl border border-base-750 bg-base-900 p-3.5 text-left transition-colors duration-200 hover:border-base-700 hover:bg-base-850"
    >
      <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-base-800 text-ink-300 transition-colors duration-200 group-hover:bg-accent-600/15 group-hover:text-accent-400">
        {icon}
      </span>
      <p className="mt-2.5 text-xs font-medium text-ink-100">{title}</p>
      <p className="mt-0.5 text-[0.6875rem] leading-relaxed text-ink-500">{description}</p>
    </button>
  );
}
