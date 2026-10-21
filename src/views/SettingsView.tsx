import { useCallback, useState } from "react";
import {
  FolderOpen,
  KeyRound,
  RefreshCw,
  ShieldCheck,
  Trash2,
} from "lucide-react";
import { open } from "@tauri-apps/plugin-dialog";

import { api } from "../lib/api";
import {
  Button,
  Card,
  ConfirmDialog,
  Field,
  SelectField,
  StatusDot,
  useToast,
} from "../components/ui";
import { formatBytes } from "../lib/format";
import type { AppConfig, HardwareReport, PreferredBackend } from "../types";

const BACKENDS: { value: PreferredBackend; label: string; hint: string }[] = [
  { value: "auto", label: "Automático", hint: "Prefiere Vulkan; usa CUDA o ROCm si es lo único disponible." },
  { value: "vulkan", label: "Vulkan", hint: "Funciona en la mayoría de GPUs de escritorio sin instalar drivers extra." },
  { value: "cuda", label: "CUDA", hint: "Solo GPUs NVIDIA. Necesita el CUDA Toolkit." },
  { value: "rocm", label: "ROCm", hint: "Solo GPUs AMD. Necesita ROCm instalado." },
  { value: "cpu", label: "CPU", hint: "Sin aceleración. Funciona en cualquier equipo, pero es lento." },
];

export default function SettingsView({
  config,
  hardware,
  onConfigChange,
  onRefreshHardware,
}: {
  config: AppConfig | null;
  hardware: HardwareReport | null;
  onConfigChange: (c: AppConfig) => void;
  onRefreshHardware: () => void;
}) {
  const toast = useToast();
  const [showToken, setShowToken] = useState(false);
  const [pendingReset, setPendingReset] = useState(false);

  const pickFolder = useCallback(
    async (key: "modelsDir" | "llamaDir") => {
      try {
        const picked = await open({
          directory: true,
          multiple: false,
          defaultPath: config?.[key] ?? undefined,
          title: key === "modelsDir" ? "Elige la carpeta de modelos" : "Elige la carpeta de llama.cpp",
        });
        if (typeof picked === "string" && picked) {
          if (config) onConfigChange({ ...config, [key]: picked });
        }
      } catch (e) {
        toast.push(`No se pudo abrir el explorador: ${String(e)}`, "danger");
      }
    },
    [config, onConfigChange, toast],
  );

  if (!config) {
    return (
      <Card>
        <p className="py-6 text-center text-xs text-ink-400">Cargando ajustes…</p>
      </Card>
    );
  }

  const backend = BACKENDS.find((b) => b.value === config.preferredBackend);

  return (
    <div className="space-y-5">
      <header>
        <h1 className="text-lg font-semibold tracking-tight text-ink-100">Ajustes</h1>
        <p className="mt-1 text-xs leading-relaxed text-ink-400">
          Rutas, credenciales y preferencias de descarga. Todo se guarda en tu equipo.
        </p>
      </header>

      {/* --- Rutas --- */}
      <Card title="Carpetas">
        <div className="space-y-4">
          <FolderRow
            label="Modelos"
            value={config.modelsDir}
            onBrowse={() => pickFolder("modelsDir")}
            onClear={
              config.modelsDir
                ? () => onConfigChange({ ...config, modelsDir: null })
                : undefined
            }
            hint="Dónde escanea EzLlamaCpp para encontrar tus ficheros GGUF."
          />
          <FolderRow
            label="llama.cpp"
            value={config.llamaDir}
            onBrowse={() => pickFolder("llamaDir")}
            onClear={
              config.llamaDir
                ? () => onConfigChange({ ...config, llamaDir: null })
                : undefined
            }
            hint="Dónde se instalan las versiones de llama.cpp."
          />
        </div>
      </Card>

      {/* --- Descargas --- */}
      <Card
        title="Descargas"
        subtitle="Qué paquete de llama.cpp se ofrece por defecto."
      >
        <SelectField
          label="Backend preferido"
          value={config.preferredBackend}
          onChange={(v) =>
            onConfigChange({ ...config, preferredBackend: v as PreferredBackend })
          }
          options={BACKENDS.map((b) => ({ value: b.value, label: b.label }))}
          hint={backend?.hint}
        />
      </Card>

      {/* --- Token de GitHub --- */}
      <Card
        title="Token de GitHub"
        subtitle="Opcional. Solo para subir el límite de peticiones de la API."
        actions={
          <span className={config.githubToken ? "chip chip-accent" : "chip"}>
            {config.githubToken ? "Configurado" : "Sin token"}
          </span>
        }
      >
        <Field
          label="Token personal"
          hint="Sin token: 60 peticiones por hora. Con token: 5000. Se guarda solo en tu equipo, en la carpeta de datos de la app."
        >
          <div className="relative">
            <input
              type={showToken ? "text" : "password"}
              className="field mono pr-10 text-xs"
              placeholder="ghp_…"
              value={config.githubToken ?? ""}
              onChange={(e) =>
                onConfigChange({ ...config, githubToken: e.target.value || null })
              }
            />
            <button
              onClick={() => setShowToken((s) => !s)}
              className="btn-quiet absolute top-1/2 right-1 -translate-y-1/2 cursor-pointer rounded p-1.5 text-ink-400 hover:text-ink-100"
              title={showToken ? "Ocultar" : "Mostrar"}
              aria-label={showToken ? "Ocultar token" : "Mostrar token"}
            >
              <KeyRound size={14} />
            </button>
          </div>
        </Field>
      </Card>

      {/* --- Equipo --- */}
      <Card
        title="Este equipo"
        actions={
          <Button
            variant="quiet"
            size="sm"
            icon={<RefreshCw size={12} />}
            onClick={onRefreshHardware}
          >
            Volver a leer
          </Button>
        }
      >
        {!hardware ? (
          <p className="py-3 text-center text-xs text-ink-500">Leyendo el hardware…</p>
        ) : (
          <div className="space-y-3">
            <div className="grid gap-3 sm:grid-cols-2">
              <Info label="Sistema" value={`${hardware.os} · ${hardware.arch}`} mono />
              <Info
                label="Procesador"
                value={
                  hardware.cpu.physicalCores
                    ? `${hardware.cpu.physicalCores} núcleos / ${hardware.cpu.logicalThreads} hilos`
                    : `${hardware.cpu.logicalThreads} hilos`
                }
              />
              <Info
                label="Memoria"
                value={`${hardware.ram.totalGb.toFixed(1)} GB (${hardware.ram.availableGb.toFixed(1)} libres)`}
              />
              <Info
                label="llama-server"
                value={hardware.llamaServer ? "Localizado" : "No instalado"}
              />
            </div>

            {hardware.gpu.length > 0 && (
              <div className="space-y-1.5 border-t border-base-800 pt-3">
                {hardware.gpu.map((g, i) => (
                  <div key={i} className="flex items-center justify-between gap-3">
                    <span className="min-w-0 truncate text-xs text-ink-200">{g.name}</span>
                    <span className="mono shrink-0 text-[0.6875rem] text-ink-500">
                      {g.vramTotalMib > 0
                        ? `${formatBytes(g.vramTotalMib * 1024 * 1024)} VRAM`
                        : g.api}
                    </span>
                  </div>
                ))}
              </div>
            )}

            <div className="flex flex-wrap gap-2 border-t border-base-800 pt-3">
              <StatusDot
                tone={hardware.accelerators.hasVulkan ? "ok" : "idle"}
                label={`Vulkan ${hardware.accelerators.hasVulkan ? "disponible" : "no detectado"}`}
              />
              <StatusDot
                tone={hardware.accelerators.hasCuda ? "ok" : "idle"}
                label={`CUDA ${hardware.accelerators.hasCuda ? "disponible" : "no detectado"}`}
              />
              <StatusDot
                tone={hardware.accelerators.hasRocm ? "ok" : "idle"}
                label={`ROCm ${hardware.accelerators.hasRocm ? "disponible" : "no detectado"}`}
              />
            </div>
          </div>
        )}
      </Card>

      {/* --- Zona de peligro --- */}
      <Card title="Restablecer">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <p className="text-xs font-medium text-ink-100">Borrar la configuración</p>
            <p className="mt-1 text-[0.6875rem] leading-relaxed text-ink-500">
              Devuelve todos los ajustes a sus valores por defecto. No borra los modelos ni las
              versiones instaladas de llama.cpp.
            </p>
          </div>
          <Button variant="danger" icon={<Trash2 size={13} />} onClick={() => setPendingReset(true)}>
            Restablecer
          </Button>
        </div>
      </Card>

      <ConfirmDialog
        open={pendingReset}
        title="Restablecer la configuración"
        message="Todos los ajustes volverán a sus valores por defecto. Las versiones instaladas de llama.cpp y tus modelos no se tocan."
        confirmLabel="Restablecer"
        danger
        onConfirm={async () => {
          try {
            const fresh = await api.getConfig();
            await api.setConfig({
              ...fresh,
              modelsDir: null,
              llamaDir: null,
              githubToken: null,
              preferredBackend: "auto",
              lastModel: null,
              lastMmproj: null,
              lastDraftModel: null,
            });
            toast.push("Configuración restablecida", "success");
          } catch (e) {
            toast.push(`No se pudo restablecer: ${String(e)}`, "danger");
          } finally {
            setPendingReset(false);
          }
        }}
        onCancel={() => setPendingReset(false)}
      />
    </div>
  );
}

function FolderRow({
  label,
  value,
  hint,
  onBrowse,
  onClear,
}: {
  label: string;
  value: string | null;
  hint: string;
  onBrowse: () => void;
  onClear?: () => void;
}) {
  return (
    <div>
      <Field label={label} hint={hint}>
        <div className="flex gap-2">
          <input
            className="field mono flex-1 text-xs"
            value={value ?? ""}
            placeholder="Sin asignar"
            readOnly
          />
          <Button icon={<FolderOpen size={13} />} onClick={onBrowse}>
            Buscar
          </Button>
          {onClear && (
            <button
              onClick={onClear}
              className="btn-quiet cursor-pointer rounded-lg px-2 text-ink-500 hover:text-danger-400"
              aria-label={`Quitar ${label}`}
              title="Quitar"
            >
              <Trash2 size={14} />
            </button>
          )}
        </div>
      </Field>
    </div>
  );
}

function Info({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="rounded-lg bg-base-850 px-3 py-2">
      <p className="text-[0.6875rem] font-medium tracking-wide text-ink-500 uppercase">{label}</p>
      <p className={mono ? "mono mt-0.5 text-xs text-ink-100" : "mt-0.5 text-xs text-ink-100"}>
        {value}
      </p>
    </div>
  );
}

export { ShieldCheck };
