/** Componentes base de EzLlamaCpp. Todos sin dependencias externas. */
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { AlertTriangle, Check, Info, Loader2, X } from "lucide-react";
import clsx from "clsx";

// ---------------------------------------------------------------------------
// Botón
// ---------------------------------------------------------------------------

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "primary" | "ghost" | "danger" | "quiet";
  loading?: boolean;
  icon?: ReactNode;
  size?: "sm" | "md";
}

export function Button({
  variant = "ghost",
  loading = false,
  icon,
  size = "md",
  className,
  children,
  disabled,
  ...rest
}: ButtonProps) {
  return (
    <button
      className={clsx(
        "btn",
        variant === "primary" && "btn-primary",
        variant === "ghost" && "btn-ghost",
        variant === "danger" && "btn-danger",
        variant === "quiet" && "btn-quiet",
        size === "sm" && "px-2.5 py-1 text-xs",
        className,
      )}
      disabled={disabled || loading}
      {...rest}
    >
      {loading ? <Loader2 size={14} className="animate-spin" /> : icon}
      {children}
    </button>
  );
}

// ---------------------------------------------------------------------------
// Tarjetas y secciones
// ---------------------------------------------------------------------------

export function Card({
  title,
  subtitle,
  actions,
  children,
  className,
  bodyClassName,
}: {
  title?: ReactNode;
  subtitle?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
  bodyClassName?: string;
}) {
  return (
    <section className={clsx("card overflow-hidden", className)}>
      {(title || actions) && (
        <header className="flex items-start justify-between gap-4 border-b border-base-750 px-4 py-3">
          <div className="min-w-0">
            {title && (
              <h2 className="truncate text-[0.8125rem] font-semibold tracking-tight text-ink-100">
                {title}
              </h2>
            )}
            {subtitle && (
              <p className="mt-0.5 text-xs leading-relaxed text-ink-400">{subtitle}</p>
            )}
          </div>
          {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
        </header>
      )}
      <div className={clsx("p-4", bodyClassName)}>{children}</div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Campos
// ---------------------------------------------------------------------------

export function Field({
  label,
  hint,
  htmlFor,
  children,
  className,
}: {
  label: string;
  hint?: ReactNode;
  htmlFor?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={className}>
      <label className="label" htmlFor={htmlFor}>
        {label}
      </label>
      {children}
      {hint && <p className="mt-1.5 text-[0.75rem] leading-relaxed text-ink-500">{hint}</p>}
    </div>
  );
}

export function NumberField({
  label,
  value,
  onChange,
  min,
  max,
  step = 1,
  hint,
  suffix,
  disabled,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  min?: number;
  max?: number;
  step?: number;
  hint?: ReactNode;
  suffix?: string;
  disabled?: boolean;
}) {
  return (
    <Field label={label} hint={hint}>
      <div className="relative">
        <input
          type="number"
          className="field mono tabular-nums"
          value={value}
          min={min}
          max={max}
          step={step}
          disabled={disabled}
          onChange={(e) => {
            const v = Number(e.target.value);
            if (!Number.isNaN(v)) onChange(v);
          }}
        />
        {suffix && (
          <span className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-[0.75rem] font-medium text-ink-500">
            {suffix}
          </span>
        )}
      </div>
    </Field>
  );
}

export function SelectField({
  label,
  value,
  onChange,
  options,
  hint,
  disabled,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
  hint?: ReactNode;
  disabled?: boolean;
}) {
  return (
    <Field label={label} hint={hint}>
      <select
        className="field"
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value)}
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </Field>
  );
}

/** Deslizador con lectura numérica al lado. */
export function SliderField({
  label,
  value,
  onChange,
  min,
  max,
  step = 1,
  format,
  hint,
  disabled,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  min: number;
  max: number;
  step?: number;
  format?: (v: number) => string;
  hint?: ReactNode;
  disabled?: boolean;
}) {
  return (
    <Field label={label} hint={hint}>
      <div className="flex items-center gap-3">
        <input
          type="range"
          className="h-1.5 flex-1 cursor-pointer appearance-none rounded-full bg-base-700 accent-accent-500 disabled:cursor-not-allowed disabled:opacity-40"
          value={value}
          min={min}
          max={max}
          step={step}
          disabled={disabled}
          onChange={(e) => onChange(Number(e.target.value))}
        />
        <span className="mono w-16 shrink-0 text-right text-xs tabular-nums text-ink-200">
          {format ? format(value) : value}
        </span>
      </div>
    </Field>
  );
}

// ---------------------------------------------------------------------------
// Medidor (barra de uso con umbral)
// ---------------------------------------------------------------------------

export function Meter({
  value,
  max,
  label,
  valueLabel,
  thresholds = { warn: 0.8, danger: 0.95 },
}: {
  value: number;
  max: number;
  label?: ReactNode;
  valueLabel?: ReactNode;
  thresholds?: { warn: number; danger: number };
}) {
  const ratio = max > 0 ? Math.min(1, Math.max(0, value / max)) : 0;
  const tone =
    ratio >= thresholds.danger
      ? "meter-danger"
      : ratio >= thresholds.warn
        ? "meter-warn"
        : "";
  return (
    <div>
      {(label || valueLabel) && (
        <div className="mb-1.5 flex items-baseline justify-between gap-3">
          {label && <span className="text-xs text-ink-300">{label}</span>}
          {valueLabel && (
            <span className="mono text-xs tabular-nums text-ink-100">{valueLabel}</span>
          )}
        </div>
      )}
      <div
        className={clsx("meter", tone)}
        role="meter"
        aria-valuenow={Math.round(ratio * 100)}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={typeof label === "string" ? label : undefined}
      >
        <span style={{ width: `${ratio * 100}%` }} />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Estado vacío
// ---------------------------------------------------------------------------

export function EmptyState({
  icon,
  title,
  description,
  action,
}: {
  icon?: ReactNode;
  title: string;
  description?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 px-6 py-12 text-center">
      {icon && (
        <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-base-800 text-ink-400">
          {icon}
        </div>
      )}
      <div>
        <p className="text-sm font-medium text-ink-200">{title}</p>
        {description && (
          <p className="mx-auto mt-1 max-w-sm text-xs leading-relaxed text-ink-400">
            {description}
          </p>
        )}
      </div>
      {action}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Avisos
// ---------------------------------------------------------------------------

export function Alert({
  tone = "info",
  title,
  children,
  onClose,
}: {
  tone?: "info" | "warn" | "danger" | "success";
  title?: ReactNode;
  children?: ReactNode;
  onClose?: () => void;
}) {
  const tones = {
    info: { border: "border-info-500/35", bg: "bg-info-500/10", text: "text-info-400" },
    warn: { border: "border-warn-500/35", bg: "bg-warn-500/10", text: "text-warn-400" },
    danger: {
      border: "border-danger-500/35",
      bg: "bg-danger-500/10",
      text: "text-danger-400",
    },
    success: {
      border: "border-accent-500/35",
      bg: "bg-accent-500/10",
      text: "text-accent-300",
    },
  } as const;
  const t = tones[tone];
  const Icon = tone === "success" ? Check : tone === "info" ? Info : AlertTriangle;

  return (
    <div
      className={clsx(
        "flex items-start gap-2.5 rounded-lg border px-3 py-2.5",
        t.border,
        t.bg,
      )}
      role={tone === "danger" ? "alert" : "status"}
    >
      <Icon size={15} className={clsx("mt-0.5 shrink-0", t.text)} />
      <div className="min-w-0 flex-1">
        {title && <p className={clsx("text-xs font-semibold", t.text)}>{title}</p>}
        {children && (
          <div className="text-xs leading-relaxed text-ink-300 [&_code]:text-ink-100">
            {children}
          </div>
        )}
      </div>
      {onClose && (
        <button
          onClick={onClose}
          className="btn-quiet -m-1 cursor-pointer rounded p-1 text-ink-500 hover:text-ink-200"
          aria-label="Cerrar"
        >
          <X size={13} />
        </button>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Avisos flotantes (toasts)
// ---------------------------------------------------------------------------

interface Toast {
  id: number;
  tone: "info" | "success" | "danger";
  message: string;
}

const ToastContext = createContext<{
  push: (message: string, tone?: Toast["tone"]) => void;
}>({ push: () => {} });

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const counter = useRef(0);

  const push = useCallback((message: string, tone: Toast["tone"] = "info") => {
    const id = ++counter.current;
    setToasts((t) => [...t, { id, tone, message }]);
    setTimeout(() => {
      setToasts((t) => t.filter((x) => x.id !== id));
    }, 5200);
  }, []);

  const value = useMemo(() => ({ push }), [push]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div className="pointer-events-none fixed bottom-4 right-4 z-50 flex w-[min(26rem,calc(100vw-2rem))] flex-col gap-2">
        {toasts.map((t) => (
          <div
            key={t.id}
            className={clsx(
              "animate-fade-up pointer-events-auto flex items-start gap-2.5 rounded-lg border px-3 py-2.5 shadow-float backdrop-blur",
              t.tone === "danger"
                ? "border-danger-500/40 bg-base-900/95 text-danger-400"
                : t.tone === "success"
                  ? "border-accent-500/40 bg-base-900/95 text-accent-300"
                  : "border-base-700 bg-base-900/95 text-ink-200",
            )}
            role="status"
          >
            {t.tone === "danger" ? (
              <AlertTriangle size={15} className="mt-0.5 shrink-0" />
            ) : t.tone === "success" ? (
              <Check size={15} className="mt-0.5 shrink-0" />
            ) : (
              <Info size={15} className="mt-0.5 shrink-0 text-ink-400" />
            )}
            <span className="min-w-0 flex-1 text-xs leading-relaxed break-words">
              {t.message}
            </span>
            <button
              onClick={() => setToasts((all) => all.filter((x) => x.id !== t.id))}
              className="btn-quiet -m-1 shrink-0 cursor-pointer rounded p-1 text-ink-500 hover:text-ink-200"
              aria-label="Cerrar aviso"
            >
              <X size={13} />
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  return useContext(ToastContext);
}

// ---------------------------------------------------------------------------
// Confirmación
// ---------------------------------------------------------------------------

export function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel = "Confirmar",
  danger,
  onConfirm,
  onCancel,
}: {
  open: boolean;
  title: string;
  message: ReactNode;
  confirmLabel?: string;
  danger?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onCancel();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onCancel]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center p-4">
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-[2px]"
        onClick={onCancel}
        aria-hidden
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className="card animate-fade-up relative w-full max-w-md p-5 shadow-float"
      >
        <h3 className="text-sm font-semibold text-ink-100">{title}</h3>
        <div className="mt-2 text-xs leading-relaxed text-ink-300">{message}</div>
        <div className="mt-5 flex justify-end gap-2">
          <Button variant="quiet" onClick={onCancel}>
            Cancelar
          </Button>
          <Button variant={danger ? "danger" : "primary"} onClick={onConfirm}>
            {confirmLabel}
          </Button>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Icono + texto de una etiqueta de estado
// ---------------------------------------------------------------------------

export function StatusDot({
  tone,
  label,
}: {
  tone: "ok" | "warn" | "danger" | "idle";
  label: ReactNode;
}) {
  const colors = {
    ok: "bg-accent-400",
    warn: "bg-warn-400",
    danger: "bg-danger-400",
    idle: "bg-ink-500",
  };
  return (
    <span className="inline-flex items-center gap-2 text-xs text-ink-300">
      <span className={clsx("h-1.5 w-1.5 rounded-full", colors[tone])} />
      {label}
    </span>
  );
}


// ---------------------------------------------------------------------------
// Sección de dominio
// ---------------------------------------------------------------------------

/**
 * Una sección agrupada por dominio, no una caja más.
 *
 * La diferencia con `Card`: aquí el título describe QUÉ se configura
 * ("Modelo", "Memoria y capacidad"), no el orden en que se llena. El
 * `rail` marca la sección que se está tocando.
 */
export function Section({
  title,
  description,
  actions,
  children,
  active,
  className,
  bodyClassName,
}: {
  title?: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
  active?: boolean;
  className?: string;
  bodyClassName?: string;
}) {
  return (
    <section className={clsx("section", active && "section-active", className)}>
      {(title || actions) && (
        <header className="flex items-start justify-between gap-4 border-b border-base-800 px-4 py-3">
          <div className="min-w-0">
            {title && (
              <h2 className="flex items-center gap-2 text-[0.8125rem] font-semibold tracking-tight text-ink-100">
                {active && <span className="rail -ml-4 pl-2" aria-hidden />}
                {title}
              </h2>
            )}
            {description && (
              <p className="mt-1 text-xs leading-relaxed text-ink-400">{description}</p>
            )}
          </div>
          {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
        </header>
      )}
      <div className={clsx("p-4", bodyClassName)}>{children}</div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Diálogo de entrada de texto
// ---------------------------------------------------------------------------

/**
 * Sustituye a `window.prompt`: un diálogo del sistema operativo dentro de
 * una app de escritorio rompe la experiencia y tiene el peor contraste
 * posible.
 */
export function PromptDialog({
  open,
  title,
  label,
  defaultValue,
  placeholder,
  confirmLabel = "Guardar",
  onConfirm,
  onCancel,
}: {
  open: boolean;
  title: string;
  label?: string;
  defaultValue?: string;
  placeholder?: string;
  confirmLabel?: string;
  onConfirm: (value: string) => void;
  onCancel: () => void;
}) {
  const [value, setValue] = useState(defaultValue ?? "");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) {
      setValue(defaultValue ?? "");
      // El foco entra en el campo al abrirse: se puede escribir de inmediato.
      setTimeout(() => inputRef.current?.select(), 30);
    }
  }, [open, defaultValue]);

  if (!open) return null;

  const submit = () => {
    const v = value.trim();
    if (v) onConfirm(v);
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-[2px]"
      onClick={onCancel}
      role="dialog"
      aria-modal="true"
    >
      <div
        className="card w-full max-w-sm overflow-hidden shadow-float"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="border-b border-base-800 px-4 py-3">
          <h2 className="text-[0.8125rem] font-semibold text-ink-100">{title}</h2>
        </header>
        <div className="space-y-3 p-4">
          {label && <label className="label">{label}</label>}
          <input
            ref={inputRef}
            className="field"
            value={value}
            placeholder={placeholder}
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") submit();
              if (e.key === "Escape") onCancel();
            }}
          />
        </div>
        <footer className="flex justify-end gap-2 border-t border-base-800 px-4 py-3">
          <Button variant="quiet" onClick={onCancel}>
            Cancelar
          </Button>
          <Button variant="primary" onClick={submit} disabled={!value.trim()}>
            {confirmLabel}
          </Button>
        </footer>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Par clave-valor
// ---------------------------------------------------------------------------

/** Una fila de dato. Para listas densas de especificaciones. */
export function KeyValue({
  label,
  value,
  mono,
  tone,
}: {
  label: string;
  value: ReactNode;
  mono?: boolean;
  tone?: "accent" | "warn" | "danger";
}) {
  return (
    <div className="flex items-baseline justify-between gap-4 py-1">
      <dt className="shrink-0 text-xs text-ink-400">{label}</dt>
      <dd
        className={clsx(
          "min-w-0 truncate text-right text-xs",
          mono && "mono tabular-nums",
          tone === "accent" && "text-accent-400",
          tone === "warn" && "text-warn-400",
          tone === "danger" && "text-danger-400",
          !tone && "text-ink-100",
        )}
        title={typeof value === "string" ? value : undefined}
      >
        {value}
      </dd>
    </div>
  );
}
