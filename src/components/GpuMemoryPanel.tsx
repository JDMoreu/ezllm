import { useId, useRef, useState } from "react";
import { Check, ChevronDown, Gpu, Info } from "lucide-react";
import type { GpuMemory } from "../types";
import { formatBytesAs } from "../lib/format";
import { t } from "../lib/i18n";
import Hint from "./Hint";

/** El adaptador elegido o, por defecto, el de más VRAM dedicada. */
export function pickGpu(devices: GpuMemory[], selected?: string) {
  return (
    devices.find((item) => item.id === selected) ??
    [...devices].sort((a, b) => b.dedicatedTotalBytes - a.dedicatedTotalBytes)[0]
  );
}

/**
 * Adaptador que gobierna el grupo GPU del lateral. Es una lista desplegable
 * integrada: el nombre abre la lista en su sitio y empuja hacia abajo el
 * resto de métricas, sin capas flotantes encima del lateral.
 */
export function GpuAdapterSelect({
  devices,
  value,
  onChange,
}: {
  devices: GpuMemory[];
  value: GpuMemory | undefined;
  onChange: (id: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const listId = useId();
  const optionRefs = useRef<(HTMLButtonElement | null)[]>([]);

  if (devices.length <= 1) {
    return value ? (
      <p className="sidebar-metric-sub" title={value.name}>
        {value.name}
      </p>
    ) : null;
  }

  const choose = (id: string) => {
    onChange(id);
    setOpen(false);
  };
  const focusOption = (index: number) => {
    const count = devices.length;
    optionRefs.current[(index + count) % count]?.focus();
  };

  return (
    <div className="gpu-switch-wrap" data-open={open || undefined}>
      <button
        type="button"
        className="gpu-switch"
        aria-expanded={open}
        aria-controls={listId}
        aria-label={`${t("GPU a monitorizar")}: ${value?.name ?? ""}`}
        onClick={() => setOpen((current) => !current)}
        onKeyDown={(event) => {
          if (event.key === "ArrowDown" && !open) {
            event.preventDefault();
            setOpen(true);
            requestAnimationFrame(() =>
              focusOption(Math.max(0, devices.findIndex((d) => d.id === value?.id))),
            );
          }
        }}
      >
        <span className="min-w-0 truncate">{value?.name}</span>
        <ChevronDown aria-hidden />
      </button>
      <div className="gpu-switch-panel" aria-hidden={!open}>
        <div
          id={listId}
          role="radiogroup"
          aria-label={t("GPU a monitorizar")}
          className="gpu-switch-list"
          onKeyDown={(event) => {
            const index = optionRefs.current.findIndex(
              (node) => node === document.activeElement,
            );
            if (event.key === "ArrowDown") {
              event.preventDefault();
              focusOption(index + 1);
            } else if (event.key === "ArrowUp") {
              event.preventDefault();
              focusOption(index - 1);
            } else if (event.key === "Escape") {
              event.preventDefault();
              setOpen(false);
            }
          }}
        >
          {devices.map((item, index) => {
            const checked = item.id === value?.id;
            return (
              <button
                key={item.id}
                ref={(node) => {
                  optionRefs.current[index] = node;
                }}
                type="button"
                role="radio"
                aria-checked={checked}
                tabIndex={open ? (checked ? 0 : -1) : -1}
                className="gpu-switch-option"
                onClick={() => choose(item.id)}
              >
                <span className="min-w-0 flex-1 truncate">{item.name}</span>
                <span className="mono gpu-switch-size">
                  {item.dedicatedTotalBytes > 0
                    ? formatBytesAs(item.dedicatedTotalBytes, "GiB", 1)
                    : "—"}
                </span>
                <Check aria-hidden className="gpu-switch-check" />
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

/**
 * VRAM dedicada de todos los procesos para el adaptador elegido en el
 * bloque GPU. Misma anatomía que el resto de métricas del lateral.
 */
export default function GpuMemoryPanel({
  device,
  paused,
}: {
  device: GpuMemory | undefined;
  paused: boolean;
}) {
  const used = device?.dedicatedUsedBytes;
  const total = device?.dedicatedTotalBytes ?? 0;
  const available = used != null && total > 0 && !paused;
  const ratio = available ? Math.min(1, Math.max(0, used / total)) : 0;
  const usedLabel = available
    ? formatBytesAs(
        used,
        used < 1024 ** 3 ? "MiB" : "GiB",
        used < 1024 ** 3 ? 1 : 2,
      )
    : "—";
  const totalLabel = total > 0 ? formatBytesAs(total, "GiB", 1) : null;
  const percent = Math.round(ratio * 100);

  return (
    <section className="sidebar-metric" aria-label={t("Memoria de GPU")}>
      <div className="sidebar-metric-head">
        <span className="sidebar-metric-label">
          <Gpu aria-hidden />
          VRAM
          <Hint
            label={t(
              "Memoria dedicada de todos los procesos. No incluye la RAM compartida ni la estimación del modelo.",
            )}
          >
            <button
              type="button"
              className="sidebar-help"
              aria-label={t("Acerca de la VRAM")}
            >
              <Info aria-hidden />
            </button>
          </Hint>
        </span>
        <span
          className="sidebar-metric-value mono"
          title={available ? `${percent}%` : undefined}
        >
          {usedLabel}
          {totalLabel && <small> / {totalLabel}</small>}
        </span>
      </div>
      <div
        className="sidebar-track"
        data-tone={ratio >= 0.95 ? "danger" : ratio >= 0.8 ? "warn" : undefined}
        role={available ? "meter" : undefined}
        aria-label={t("VRAM dedicada en uso")}
        aria-valuemin={available ? 0 : undefined}
        aria-valuemax={available ? 100 : undefined}
        aria-valuenow={available ? percent : undefined}
        aria-valuetext={
          available && totalLabel ? `${usedLabel} / ${totalLabel}` : undefined
        }
      >
        <span style={{ transform: `scaleX(${ratio})` }} />
      </div>
      {!available && (
        <p className="sidebar-metric-sub">
          {paused ? t("Lectura en pausa") : t("Sin lectura disponible")}
        </p>
      )}
    </section>
  );
}
