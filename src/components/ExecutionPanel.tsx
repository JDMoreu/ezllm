import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import clsx from "clsx";
import {
  AlertTriangle,
  Check,
  Copy,
  Cpu,
  ExternalLink,
  FolderOpen,
  MemoryStick,
  Play,
  RefreshCw,
  Square,
  Terminal,
  X,
} from "lucide-react";

import { api } from "../lib/api";
import { commandLine, composeFlags } from "../lib/args";
import type { FitTone } from "../lib/fit";
import { dirname } from "../lib/format";
import { t } from "../lib/i18n";
import FitBadge from "./FitBadge";
import ModelSlots from "./ModelSlots";
import { Button, useToast } from "./ui";
import type { AppConfig, ModelRole, ServerStatus } from "../types";

/** Memoria de la configuración actual, lista para mostrar junto al botón. */
export type MemoryReading = {
  text: string;
  tone: FitTone;
  where: "gpu" | "ram";
  detail: string;
};

const ANSI_SEQUENCE =
  /\x1b\[[0-?]*[ -/]*[@-~]|\x1b\][^\x07]*(?:\x07|\x1b\\)/g;
const CONTROL_CHARS = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g;

function cleanLog(text: string) {
  return text
    .replace(ANSI_SEQUENCE, "")
    .replace(/\r\n?/g, "\n")
    .replace(CONTROL_CHARS, "");
}

export default function ExecutionPanel({
  config,
  server,
  selectedModel,
  selectedMmproj,
  selectedDraft,
  args,
  argsError,
  memory,
  onArgsChange,
  onSelect,
  onPickModel,
  onStart,
  onStop,
  onRestart,
  onOpenChat,
  chatAvailable,
  onNavigate,
  hasRuntime,
  hasModel,
  serverBusy,
}: {
  config: AppConfig;
  server: ServerStatus | null;
  selectedModel: string | null;
  selectedMmproj: string | null;
  selectedDraft: string | null;
  args: string;
  argsError: string | null;
  memory: MemoryReading | null;
  onArgsChange: (value: string) => void;
  onSelect: (model: string | null, mmproj: string | null, draft: string | null) => void;
  onPickModel: (slot: ModelRole) => void;
  onStart: () => void;
  onStop: () => void;
  onRestart: () => void;
  onOpenChat: () => void;
  chatAvailable: boolean;
  onNavigate: (tab: "run" | "models" | "runtime") => void;
  hasRuntime: boolean;
  hasModel: boolean;
  serverBusy: boolean;
}) {
  const toast = useToast();
  const [copied, setCopied] = useState(false);
  const [log, setLog] = useState("");
  const [showLog, setShowLog] = useState(false);
  const logRef = useRef<HTMLPreElement>(null);

  const starting = serverBusy && !server?.running;

  const preview = useMemo(() => {
    const flags = composeFlags(config.server, selectedModel, selectedMmproj, selectedDraft);
    return `llama-server ${commandLine(flags)}`;
  }, [config.server, selectedModel, selectedMmproj, selectedDraft]);

  const baseFlags = useMemo(
    () =>
      commandLine(
        composeFlags(
          { ...config.server, extraArgs: "" },
          selectedModel,
          selectedMmproj,
          selectedDraft,
        ),
      ),
    [config.server, selectedModel, selectedMmproj, selectedDraft],
  );

  const setSlot = useCallback(
    (slot: ModelRole, path: string | null) => {
      if (slot === "primary") onSelect(path, selectedMmproj, selectedDraft);
      else if (slot === "mmproj") onSelect(selectedModel, path, selectedDraft);
      else onSelect(selectedModel, selectedMmproj, path);
    },
    [onSelect, selectedDraft, selectedMmproj, selectedModel],
  );

  const copyCommand = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(preview);
    } catch {
      const field = document.createElement("textarea");
      field.value = preview;
      field.style.position = "fixed";
      field.style.opacity = "0";
      document.body.appendChild(field);
      field.select();
      document.execCommand("copy");
      field.remove();
    }
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1600);
    toast.push("Comando copiado", "success");
  }, [preview, toast]);

  const copyLog = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(log);
      toast.push("Salida copiada", "success");
    } catch (error) {
      toast.push(`No se pudo copiar la salida: ${String(error)}`, "danger");
    }
  }, [log, toast]);

  const openLogFolder = useCallback(async () => {
    if (!server?.logFile) return;
    try {
      await api.openFolder(dirname(server.logFile));
    } catch (error) {
      toast.push(`No se pudo abrir la carpeta: ${String(error)}`, "danger");
    }
  }, [server?.logFile, toast]);

  useEffect(() => {
    if (serverBusy && !server?.running) {
      setShowLog(true);
      setLog("");
    } else if (server?.running) {
      setShowLog(true);
    }
  }, [serverBusy, server?.running]);

  useEffect(() => {
    if (!serverBusy && !server?.running) return;
    let alive = true;
    const load = () => {
      api
        .serverLog(80)
        .then((text) => {
          if (alive) setLog(cleanLog(text));
        })
        .catch(() => {});
    };
    void load();
    const id = window.setInterval(load, 1200);
    return () => {
      alive = false;
      window.clearInterval(id);
    };
  }, [serverBusy, server?.running, server?.startedAt]);

  useEffect(() => {
    const element = logRef.current;
    if (element) element.scrollTop = element.scrollHeight;
  }, [log]);


  return (
    <section
      className={clsx("execution-panel", starting && "execution-panel-deploying")}
    >
      <ModelSlots
        primary={selectedModel}
        mmproj={selectedMmproj}
        draft={selectedDraft}
        onChange={setSlot}
        onBrowse={(slot) => void onPickModel(slot)}
      />

    {starting && (
      <div className="execution-deploying" role="status" aria-live="polite">
        <span className="execution-deploying-track" aria-hidden>
          <span />
        </span>
        <span className="execution-deploying-label">{t("Desplegando modelo…")}</span>
      </div>
    )}

    <div className="execution-command">
      <div className="execution-section-head">
        <span className="execution-label">
          <Terminal size={12} aria-hidden />
          {t("Comando")}
        </span>
      </div>
      <div
        className={clsx(
          "execution-command-shell",
          argsError && "execution-command-shell-invalid",
        )}
      >
        <button
          type="button"
          className={clsx("command-copy", copied && "is-copied")}
          onClick={() => void copyCommand()}
          aria-label={copied ? t("Copiado") : t("Copiar")}
          title={copied ? t("Copiado") : t("Copiar")}
        >
          {copied ? <Check size={12} /> : <Copy size={12} />}
        </button>
        <div className="execution-command-base mono" title={baseFlags}>
          <span>llama-server</span> {baseFlags}
        </div>
        <textarea
          className="execution-command-input mono"
          value={args}
          onChange={(event) => onArgsChange(event.target.value)}
          placeholder="Argumentos adicionales: -c 32768 -ngl -1 -fa on"
          spellCheck={false}
          rows={3}
          aria-label="Argumentos adicionales del comando"
          aria-invalid={!!argsError}
          aria-describedby={argsError ? "command-error" : undefined}
        />
      </div>
      {argsError && (
        <p
          id="command-error"
          role="alert"
          className="mt-1.5 flex items-start gap-1.5 text-label leading-relaxed text-danger-400"
        >
          <AlertTriangle size={13} className="mt-0.5 shrink-0" />
          {argsError}
        </p>
      )}
      {server?.running && (
        <p className="mt-1 flex items-center gap-1.5 text-meta text-warn-400">
          <AlertTriangle size={12} className="shrink-0" aria-hidden />
          {t("Los cambios se aplican al reiniciar el servidor.")}
        </p>
      )}
      <div className="execution-memory">
        {memory && (
          <span className="flex flex-wrap items-center gap-1.5 text-label text-ink-400">
            <MemoryStick size={12} aria-hidden />
            {t("Memoria")}
            <span className="mono text-label text-ink-200">{memory.text}</span>
            <FitBadge tone={memory.tone} where={memory.where} detail={memory.detail} />
          </span>
        )}
        <div className="ml-auto flex flex-wrap items-center gap-2">
          {server?.running && chatAvailable && (
            <Button
              size="sm"
              variant="primary"
              icon={<ExternalLink size={11} />}
              onClick={onOpenChat}
            >
              {t("Abrir chat")}
            </Button>
          )}
          {server?.running && (
            <Button
              size="sm"
              variant="quiet"
              icon={<RefreshCw size={11} />}
              onClick={onRestart}
              disabled={serverBusy}
              title="Detener y volver a arrancar con estos argumentos"
            >
              {t("Reiniciar")}
            </Button>
          )}
          {server?.running ? (
            <Button
              size="sm"
              variant="danger"
              loading={serverBusy}
              icon={<Square size={11} />}
              onClick={onStop}
              aria-keyshortcuts="Control+Enter"
            >
              {serverBusy ? t("Deteniendo…") : t("Detener")}
            </Button>
          ) : !hasRuntime ? (
            <Button
              size="sm"
              variant="primary"
              icon={<Cpu size={11} />}
              onClick={() => onNavigate("runtime")}
            >
              {t("Instalar el motor")}
            </Button>
          ) : !hasModel ? (
            <Button
              size="sm"
              variant="primary"
              icon={<FolderOpen size={11} />}
              onClick={() => onNavigate("models")}
            >
              {t("Elegir un modelo")}
            </Button>
          ) : (
            <Button
              size="sm"
              variant="primary"
              loading={serverBusy}
              icon={<Play size={11} />}
              onClick={onStart}
              aria-keyshortcuts="Control+Enter"
            >
              {serverBusy ? t("Iniciando…") : t("Iniciar modelo")}
            </Button>
          )}
        </div>
      </div>
    </div>

    {showLog && (
      <div className="execution-log">
        <div className="execution-log-head">
          <span className="execution-label">
            <Terminal size={12} />
            {t("Salida del modelo")}
          </span>
          <div className="flex items-center gap-2">
            {serverBusy && (
              <span className="execution-log-state">
                {server?.running ? t("Deteniendo…") : t("Iniciando…")}
              </span>
            )}
            <button
              type="button"
              className="execution-log-close"
              onClick={() => void copyLog()}
              aria-label="Copiar la salida"
              title="Copiar la salida"
            >
              <Copy size={11} />
            </button>
            {server?.logFile && (
              <button
                type="button"
                className="execution-log-close"
                onClick={() => void openLogFolder()}
                aria-label="Abrir la carpeta de logs"
                title="Abrir la carpeta de logs"
              >
                <FolderOpen size={11} />
              </button>
            )}
            <button
              type="button"
              className="execution-log-close"
              onClick={() => setShowLog(false)}
              aria-label={t("Ocultar salida")}
              title={t("Ocultar salida")}
            >
              <X size={11} />
            </button>
          </div>
        </div>
        <pre
          ref={logRef}
          className="execution-log-body mono"
          role="log"
          aria-live="polite"
        >
          {log.trim() ||
            (serverBusy ? t("Esperando salida del modelo…") : t("Sin líneas todavía."))}
        </pre>
      </div>
    )}

    </section>
  );
}
