import clsx from "clsx";
import { Field } from "./ui";
import type { GpuDevice } from "../types";

/**
 * Selección de dispositivo(s) de GPU.
 *
 * El valor es la lista que espera `--device`: "Vulkan0", "Vulkan0,Vulkan1".
 * Con varias GPUs seleccionadas se activa el reparto entre ellas.
 */
export function DeviceField({
  gpus,
  value,
  onChange,
  label = "Tarjeta gráfica",
  compact = false,
}: {
  gpus: GpuDevice[];
  value: string | null;
  onChange: (v: string | null) => void;
  label?: string;
  compact?: boolean;
}) {
  if (gpus.length === 0) {
    return (
      <Field
        label={label}
        hint="No se ha detectado ninguna GPU. Se usará el dispositivo por defecto de llama.cpp."
      >
        <div className="field flex items-center text-xs text-ink-500">Sin GPU detectada</div>
      </Field>
    );
  }

  const selected = (value ?? "").split(",").filter(Boolean);
  const ids = gpus.map((g) => `${g.api}${g.index}`);

  const toggle = (id: string) => {
    const next = selected.includes(id)
      ? selected.filter((s) => s !== id)
      : [...selected, id];
    // Se mantiene el orden de la lista de GPUs, no el de pulsación.
    const ordered = ids.filter((i) => next.includes(i));
    onChange(ordered.length === 0 ? null : ordered.join(","));
  };

  return (
    <Field
      label={label}
      hint={
        gpus.length > 1
          ? "Puedes elegir varias para repartir el modelo entre ellas."
          : "Dispositivo donde se cargan los pesos del modelo."
      }
    >
      <div className={clsx("grid gap-1.5", compact && "sm:grid-cols-2")}>
        {gpus.map((g) => {
          const id = `${g.api}${g.index}`;
          const on = selected.includes(id);
          return (
            <button
              key={id}
              onClick={() => toggle(id)}
              className={clsx(
                "flex w-full cursor-pointer items-center gap-2.5 rounded-lg border px-2.5 py-2 text-left transition-colors duration-200",
                on
                  ? "border-accent-500/50 bg-accent-600/12"
                  : "border-base-750 bg-base-950 hover:border-base-700",
              )}
              aria-pressed={on}
            >
              <span
                className={clsx(
                  "flex h-4 w-4 shrink-0 items-center justify-center rounded border",
                  on ? "border-accent-500 bg-accent-500" : "border-base-600",
                )}
              >
                {on && (
                  <svg width="10" height="10" viewBox="0 0 24 24" fill="none">
                    <path
                      d="m5 13 4 4L19 7"
                      stroke="#04150e"
                      strokeWidth="3.5"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                )}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-xs text-ink-100">{g.name}</span>
                <span className="mt-0.5 flex flex-wrap items-center gap-1.5">
                  <span className="mono text-[0.6875rem] text-ink-500">{id}</span>
                  <span className="chip">
                    {g.kind === "discrete"
                      ? "Dedicada"
                      : g.kind === "integrated"
                        ? "Integrada"
                        : g.kind}
                  </span>
                  {g.vramTotalMib > 0 && (
                    <span className="mono text-[0.6875rem] text-ink-500">
                      {(g.vramTotalMib / 1024).toFixed(1)} GB
                    </span>
                  )}
                </span>
              </span>
            </button>
          );
        })}
      </div>
    </Field>
  );
}
