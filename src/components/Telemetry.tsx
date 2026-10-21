/** Componentes de telemetría viva.
 *
 * Un valor que no cambia no necesita una barra: aquí solo se dibuja lo que
 * se está midiendo de verdad, y se ve que se mueve.
 */
import { useMemo } from "react";
import clsx from "clsx";

import type { Sample } from "../lib/useTelemetry";

/** Sparkline: serie temporal como línea, con área bajo la curva.
 *
 * Se dibuja en un viewBox fijo (100x32) y se estira con `preserveAspectRatio`,
 * así que no hace falta medir el DOM para saber el tamaño.
 */
export function Sparkline({
  samples,
  height = 32,
  tone,
  min,
  max,
  className,
}: {
  samples: Sample[];
  height?: number;
  tone?: "accent" | "warn" | "danger";
  min?: number;
  max?: number;
  className?: string;
}) {
  const path = useMemo(() => {
    if (samples.length < 2) return null;
    const values = samples.map((s) => s.value);
    const dataMin = Math.min(...values);
    const dataMax = Math.max(...values);

    // La FORMA de la serie muestra la variacion; el VALOR lo dice el numero
    // que va al lado. Si se escala la forma contra un tope absoluto (100%
    // de CPU, 100% de RAM), una fluctuacion del 13% al 20% ocupa dos pixels
    // pegados al borde: la linea existe pero no comunica nada.
    //
    // Por eso, sin min/max explicitos, la serie usa su propio rango con un
    // 12% de margen. El numero que acompaña al grafico es el absoluto.
    let lo: number;
    let hi: number;
    if (min !== undefined && max !== undefined) {
      lo = min;
      hi = max;
    } else {
      const span = dataMax - dataMin;
      const margin = span > 1e-9 ? span * 0.12 : Math.max(Math.abs(dataMax) * 0.05, 1);
      lo = (min ?? dataMin) - margin;
      hi = (max ?? dataMax) + margin;
    }

    const span = hi - lo;
    const flat = span < 1e-9;
    const stepX = 100 / (samples.length - 1);
    const y = (v: number) => {
      if (flat) return 16;
      return 30 - ((v - lo) / span) * 28;
    };

    const line = samples
      .map((s, i) => `${i === 0 ? "M" : "L"}${(i * stepX).toFixed(2)},${y(s.value).toFixed(2)}`)
      .join(" ");
    const area = `${line} L100,32 L0,32 Z`;
    return { line, area };
  }, [samples, min, max]);

  if (!path) {
    return (
      <div
        className={clsx("flex items-center justify-center", className)}
        style={{ height }}
        aria-hidden
      >
        <div className="h-px w-full bg-base-800" />
      </div>
    );
  }

  return (
    <svg
      className={clsx(
        "spark",
        tone === "warn" && "spark-warn",
        tone === "danger" && "spark-danger",
        className,
      )}
      viewBox="0 0 100 32"
      preserveAspectRatio="none"
      style={{ height }}
      role="img"
      aria-label={`Serie de ${samples.length} muestras`}
    >
      <path className="spark-area" d={path.area} />
      <path className="spark-line" d={path.line} />
    </svg>
  );
}

/** Medidor con pulso: una barra cuyo relleno se re-lanza cada vez que el
 * valor cambia, para que se note que es una lectura viva.
 */
export function LiveMeter({
  value,
  max,
  label,
  valueLabel,
  tone,
  className,
}: {
  value: number;
  max: number;
  label: React.ReactNode;
  valueLabel: React.ReactNode;
  tone?: "ok" | "warn" | "danger";
  className?: string;
}) {
  const ratio = max > 0 ? Math.min(1, Math.max(0, value / max)) : 0;
  return (
    <div className={clsx("space-y-1.5", className)}>
      <div className="flex items-baseline justify-between gap-3">
        <span className="text-label text-ink-300">{label}</span>
        <span className="mono text-label tabular-nums text-ink-100">{valueLabel}</span>
      </div>
      <div
        className={clsx(
          "meter",
          tone === "danger" && "meter-danger",
          tone === "warn" && "meter-warn",
        )}
        role="meter"
        aria-valuenow={Math.round(ratio * 100)}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={typeof label === "string" ? label : undefined}
      >
        <span style={{ "--fill": ratio } as React.CSSProperties} />
      </div>
    </div>
  );
}

/** Cifra grande con su etiqueta. Para las magnitudes que importan. */
export function Readout({
  label,
  value,
  unit,
  hint,
  tone = "default",
  mono = false,
}: {
  label: string;
  value: string;
  unit?: string;
  hint?: React.ReactNode;
  tone?: "default" | "accent" | "ok" | "warn" | "danger";
  /** El valor es tecnico (cifras, rutas): se compone en mono. */
  mono?: boolean;
}) {
  return (
    <div className="min-w-0">
      <p className="text-meta font-medium tracking-[0.08em] text-ink-400 uppercase">
        {label}
      </p>
      <p
        className={clsx(
          // 20px: el dato es el dato. Si mide lo mismo que el titulo de
          // vista (24px), los dos compiten y la jerarquia se rompe.
          "mt-1 text-[1.25rem] leading-none font-semibold tabular-nums",
          // El mono es un rol de dato TECNICO (cifras, rutas, flags), no un
          // disfraz: "Detenido" en mono se ve como un valor medido cuando
          // es solo una palabra.
          mono && "mono",
          tone === "accent" && "text-accent-400",
          tone === "ok" && "text-ok-400",
          tone === "warn" && "text-warn-400",
          tone === "danger" && "text-danger-400",
          tone === "default" && "text-ink-100",
        )}
      >
        {value}
        {unit && (
          <span className="ml-1 text-sm font-medium text-ink-400">{unit}</span>
        )}
      </p>
      {hint && <p className="mt-1.5 text-label text-ink-400">{hint}</p>}
    </div>
  );
}

/** Punto de estado con pulso. Cuando algo está en marcha, late. */
export function Pulse({
  tone = "idle",
  label,
  className,
}: {
  tone?: "idle" | "ok" | "warn" | "danger";
  label?: React.ReactNode;
  className?: string;
}) {
  return (
    <span className={clsx("inline-flex items-center gap-2", className)}>
      <span
        className={clsx(
          "pulse-dot",
          tone === "ok" && "pulse-dot-ok",
          tone === "warn" && "pulse-dot-warn",
          tone === "danger" && "pulse-dot-danger",
        )}
        aria-hidden
      />
      {label && <span className="text-label text-ink-300">{label}</span>}
    </span>
  );
}
