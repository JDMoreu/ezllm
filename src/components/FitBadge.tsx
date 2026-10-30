import clsx from "clsx";
import { CircleCheck, CircleHelp, CircleX } from "lucide-react";

import type { FitTone } from "../lib/fit";
import { t } from "../lib/i18n";

const META: Record<
  FitTone,
  {
    label: string;
    title: string;
    ramTitle: string;
    icon: typeof CircleCheck;
    text: string;
  }
> = {
  fit: {
    label: "Cabe",
    title: "Cabe con margen en la VRAM de tu GPU.",
    ramTitle: "Cabe con margen en la RAM disponible.",
    icon: CircleCheck,
    text: "text-ok-400",
  },
  tight: {
    label: "Justa",
    title: "Cabe, pero está por encima del 75% de tu VRAM: queda poco margen.",
    ramTitle: "Cabe, pero está por encima del 75% de la RAM disponible.",
    icon: CircleCheck,
    text: "text-warn-400",
  },
  no: {
    label: "No cabe",
    title: "No cabe en la VRAM; necesitará RAM/CPU o fallará al cargar.",
    ramTitle: "No cabe en la RAM disponible ahora.",
    icon: CircleX,
    text: "text-danger-400",
  },
  unknown: {
    label: "Sin datos",
    title: "No hay datos de VRAM o el tamaño es desconocido.",
    ramTitle: "No hay datos de RAM o el tamaño es desconocido.",
    icon: CircleHelp,
    text: "text-ink-500",
  },
};

/**
 * Icono de compatibilidad, sin palabra visible. El check verde y el ámbar son
 * el mismo icono; solo cambia el color. El nombre accesible y el tooltip
 * explican el estado y, si se pasa, el porcentaje de VRAM que ocupa.
 */
export default function FitBadge({
  tone,
  where = "gpu",
  detail,
  size = 14,
  className,
}: {
  tone: FitTone;
  where?: "gpu" | "ram";
  detail?: string;
  size?: number;
  className?: string;
}) {
  const meta = META[tone];
  const Icon = meta.icon;
  const base = t(where === "ram" ? meta.ramTitle : meta.title);
  const title = detail ? `${base} ${detail}` : base;
  return (
    <span
      role="img"
      aria-label={`${t(meta.label)}: ${title}`}
      title={title}
      className={clsx("inline-flex shrink-0 items-center", meta.text, className)}
    >
      <Icon size={size} aria-hidden />
    </span>
  );
}
