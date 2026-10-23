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
