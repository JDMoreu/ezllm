import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import clsx from "clsx";
import {
  AlertTriangle,
  Check,
  Copy,
  FilePlus,
  FolderOpen,
  MemoryStick,
  Play,
  Save,
  Settings,
  Square,
  Terminal,
  Trash2,
  Upload,
  X,
} from "lucide-react";
import { open } from "@tauri-apps/plugin-dialog";

import { api } from "../lib/api";
import { commandLine, composeFlags } from "../lib/args";
import { basename } from "../lib/format";
import { t } from "../lib/i18n";
import { Button, ConfirmDialog, PromptDialog, useToast } from "./ui";
import type { AppConfig, Deployment, ModelRole, ServerStatus } from "../types";

type PromptMode = "save-as" | "import" | null;

const MODEL_SLOTS: { label: string; slot: ModelRole }[] = [
  { label: "Principal", slot: "primary" },
  { label: "Multimodal", slot: "mmproj" },
  { label: "MTP", slot: "draft" },
];

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
  tokens,
  memoryLabel,
  onArgsChange,
  onSelect,
  onConfigChange,
  onPickModel,
  onStart,
  onStop,
  serverBusy,
}: {
  config: AppConfig;
  server: ServerStatus | null;
  selectedModel: string | null;
  selectedMmproj: string | null;
  selectedDraft: string | null;
  args: string;
  argsError: string | null;
  tokens: number;
  memoryLabel: string | null;
  onArgsChange: (value: string) => void;
  onSelect: (model: string | null, mmproj: string | null, draft: string | null) => void;
  onConfigChange: (config: AppConfig) => void;
  onPickModel: (slot: ModelRole) => void;
  onStart: () => void;
  onStop: () => void;
  serverBusy: boolean;
}) {
  const toast = useToast();
  const [loadOpen, setLoadOpen] = useState(false);
  const [promptMode, setPromptMode] = useState<PromptMode>(null);
  const [imported, setImported] = useState<Deployment | null>(null);
  const [pendingDelete, setPendingDelete] = useState<Deployment | null>(null);
  const [presetBusy, setPresetBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const [log, setLog] = useState("");
  const [showLog, setShowLog] = useState(false);
  const logRef = useRef<HTMLPreElement>(null);

  const deployments = config.deployments;
  const active =
    deployments.find((deployment) => deployment.id === config.activeDeploymentId) ?? null;
  const defaultName = selectedModel
    ? basename(selectedModel).replace(/\.gguf$/i, "")
    : "Mi configuración";
  const promptDefault =
    promptMode === "import"
      ? (imported?.name ?? defaultName)
      : promptMode === "save-as"
        ? active
          ? `${active.name} copia`
          : defaultName
        : defaultName;
  const dirty =
    !!active &&
    (JSON.stringify(active.server) !== JSON.stringify(config.server) ||
      active.modelPath !== selectedModel ||
      active.mmprojPath !== selectedMmproj ||
      active.draftPath !== selectedDraft);
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

  useEffect(() => {
    if (!loadOpen) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setLoadOpen(false);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [loadOpen]);

  const apply = useCallback(
    async (deployment: Deployment) => {
      setPresetBusy(true);
      setLoadOpen(false);
      try {
        const [next] = await api.applyDeployment(deployment.id);
        onConfigChange(next);
        onSelect(next.lastModel, next.lastMmproj, next.lastDraftModel);
        toast.push(`Configuración «${deployment.name}» aplicada`, "success");
      } catch (error) {
        toast.push(`No se pudo aplicar: ${String(error)}`, "danger");
      } finally {
        setPresetBusy(false);
      }
    },
    [onConfigChange, onSelect, toast],
  );

  const currentDeployment = useCallback(
    (name: string, forceNew = false): Deployment => {
      const updating = !forceNew && !!active && name.trim() === active.name;
      return {
        id: updating ? active.id : "",
        name: name.trim(),
        modelPath: selectedModel,
        mmprojPath: selectedMmproj,
        draftPath: selectedDraft,
        server: { ...config.server },
        notes: updating ? active.notes : "",
        createdAt: updating ? active.createdAt : 0,
      };
    },
    [active, config.server, selectedDraft, selectedMmproj, selectedModel],
  );

  const saveCurrent = useCallback(
    async (name: string, forceNew = false) => {
      setPromptMode(null);
      setPresetBusy(true);
      try {
        const saved = await api.saveDeployment(currentDeployment(name, forceNew));
        const [next] = await api.applyDeployment(saved.id);
        onConfigChange(next);
        onSelect(next.lastModel, next.lastMmproj, next.lastDraftModel);
        toast.push(`Configuración «${saved.name}» guardada`, "success");
      } catch (error) {
        toast.push(`No se pudo guardar: ${String(error)}`, "danger");
      } finally {
        setPresetBusy(false);
      }
    },
    [currentDeployment, onConfigChange, onSelect, toast],
  );

  const saveActive = useCallback(() => {
    void saveCurrent(active?.name ?? defaultName);
  }, [active, defaultName, saveCurrent]);

  const confirmImport = useCallback(
    async (name: string) => {
      if (!imported) return;
      setPromptMode(null);
      setPresetBusy(true);
      try {
        const saved = await api.saveDeployment({
          ...imported,
          id: "",
          name: name.trim(),
          createdAt: 0,
        });
        const [next] = await api.applyDeployment(saved.id);
        onConfigChange(next);
        onSelect(next.lastModel, next.lastMmproj, next.lastDraftModel);
        toast.push(`Configuración «${saved.name}» cargada`, "success");
      } catch (error) {
        toast.push(`No se pudo cargar: ${String(error)}`, "danger");
      } finally {
        setPresetBusy(false);
        setImported(null);
      }
    },
    [imported, onConfigChange, onSelect, toast],
  );

  const pickImport = useCallback(async () => {
    setLoadOpen(false);
    try {
      const path = await open({
        multiple: false,
        filters: [{ name: "Configuración de EzLLM", extensions: ["json"] }],
        title: "Cargar configuración",
      });
      if (typeof path !== "string" || !path) return;
      const deployment = await api.readDeploymentFile(path);
      setImported(deployment);
      setPromptMode("import");
    } catch (error) {
      toast.push(`No se pudo abrir el archivo: ${String(error)}`, "danger");
    }
  }, [toast]);

  const deletePreset = useCallback(
    async (deployment: Deployment) => {
      try {
        await api.deleteDeployment(deployment.id);
        const fresh = await api.getConfig();
        onConfigChange({
          ...fresh,
          server: config.server,
          lastModel: selectedModel,
          lastMmproj: selectedMmproj,
          lastDraftModel: selectedDraft,
        });
        toast.push(`Configuración «${deployment.name}» eliminada`, "info");
      } catch (error) {
        toast.push(`No se pudo eliminar: ${String(error)}`, "danger");
      } finally {
        setPendingDelete(null);
      }
    },
    [config.server, onConfigChange, selectedDraft, selectedMmproj, selectedModel, toast],
  );

  return (
    <section
      className={clsx("execution-panel", starting && "execution-panel-deploying")}
    >
      <div className="execution-config-bar">
        <div className="execution-config-meta">
          <button
            type="button"
            className="config-gear"
            onClick={() => setLoadOpen(true)}
            disabled={presetBusy}
            aria-haspopup="dialog"
            aria-label={t("Configuraciones guardadas")}
            title={t("Configuraciones guardadas")}
          >
            <Settings size={13} />
          </button>
          <span className="execution-config-name" title={active?.name}>
            {active ? `${active.name}${dirty ? ` · ${t("modificada")}` : ""}` : t("Sin guardar")}
          </span>
        </div>
        <div className="execution-config-actions">
          <button
            type="button"
            className="config-action"
            onClick={saveActive}
            disabled={presetBusy}
            title={t("Guardar")}
          >
            <Save size={12} />
            {t("Guardar")}
          </button>
          <button
            type="button"
            className="config-action"
            onClick={() => setPromptMode("save-as")}
            disabled={presetBusy}
            title={t("Guardar como")}
          >
            <FilePlus size={12} />
            {t("Guardar como")}
          </button>
          <button
            type="button"
            className="config-action"
            onClick={() => void pickImport()}
            disabled={presetBusy}
            title={t("Cargar configuración desde un archivo")}
          >
            <Upload size={12} />
            {t("Cargar")}
          </button>
        </div>
      </div>

      <div className="execution-models">
        {MODEL_SLOTS.map(({ label, slot }) => {
          const value =
            slot === "primary" ? selectedModel : slot === "mmproj" ? selectedMmproj : selectedDraft;
          return (
            <div className="execution-model" key={slot}>
              <span className="execution-model-label">{t(label)}</span>
              <button
                type="button"
                className="execution-model-value"
                onClick={() => void onPickModel(slot)}
                title={value ?? `Elegir ${label.toLowerCase()}`}
              >
                {value ? basename(value) : t("Elegir…")}
              </button>
              {value && (
                <button
                  type="button"
                  className="execution-model-action"
                  onClick={() => {
                    if (slot === "primary") onSelect(null, selectedMmproj, selectedDraft);
                    else if (slot === "mmproj") onSelect(selectedModel, null, selectedDraft);
                    else onSelect(selectedModel, selectedMmproj, null);
                  }}
                  aria-label={`Quitar ${label}`}
                  title={`Quitar ${label}`}
                >
                  <X size={12} />
                </button>
              )}
              <button
                type="button"
                className="execution-model-action"
                onClick={() => void onPickModel(slot)}
                aria-label={`Buscar ${label}`}
                title={`Buscar ${label}`}
              >
                <FolderOpen size={13} />
              </button>
            </div>
          );
        })}
      </div>

      {starting && (
        <div className="execution-deploying" role="status" aria-live="polite">
          <span className="execution-deploying-track" aria-hidden>
            <span />
          </span>
          <span className="execution-deploying-label">{t("Desplegando modelo…")}</span>
        </div>
      )}

      <div className="execution-command">
        <div className="execution-command-head">
          <span className="execution-label">
            <Terminal size={12} />
            {t("Comando")}
          </span>
          <Button
            size="sm"
            variant={server?.running ? "danger" : "primary"}
            loading={serverBusy}
            icon={server?.running ? <Square size={11} /> : <Play size={11} />}
            onClick={() => void (server?.running ? onStop() : onStart())}
          >
            {serverBusy
              ? server?.running
                ? t("Deteniendo…")
                : t("Iniciando…")
              : server?.running
                ? t("Detener")
                : t("Iniciar modelo")}
          </Button>
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
            placeholder="--jinja -c 32768 -ngl 99 -fa on"
            spellCheck={false}
            rows={4}
            aria-label="Comando de llama-server"
            aria-invalid={!!argsError}
            aria-describedby={argsError ? "command-error" : undefined}
          />
        </div>
        <div className="execution-command-foot">
          {argsError ? (
            <p
              id="command-error"
              role="alert"
              className="flex items-start gap-1.5 text-label leading-relaxed text-danger-400"
            >
              <AlertTriangle size={13} className="mt-0.5 shrink-0" />
              {argsError}
            </p>
          ) : (
            <p className="text-label leading-relaxed text-ink-500">
              {t("Edita los flags. La biblioteca los añade a este mismo comando.")}
            </p>
          )}
          <span className="mono shrink-0 text-meta text-ink-500">{tokens} {t("tokens")}</span>
        </div>
        {memoryLabel && (
          <div className="execution-memory">
            <span className="flex items-center gap-1.5 text-label text-ink-400">
              <MemoryStick size={12} />
              {t("Memoria estimada")}
            </span>
            <span className="mono text-label text-ink-200">{memoryLabel}</span>
          </div>
        )}
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

      {loadOpen &&
        createPortal(
          <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-[2px]"
            role="dialog"
            aria-modal="true"
            aria-labelledby="load-config-title"
            onMouseDown={(event) => {
              if (event.target === event.currentTarget) setLoadOpen(false);
            }}
          >
            <div className="card w-full max-w-2xl overflow-hidden shadow-float">
              <header className="flex items-start justify-between gap-4 border-b border-base-800 px-4 py-3">
                <div>
                  <h2
                    id="load-config-title"
                    className="text-[0.8125rem] font-semibold text-ink-100"
                  >
                    {t("Configuraciones guardadas")}
                  </h2>
                  <p className="mt-0.5 text-meta text-ink-500">
                    {t("Aplica una configuración al comando actual.")}
                  </p>
                </div>
                <button
                  type="button"
                  className="btn-quiet -m-1 p-1 text-ink-500 hover:text-ink-200"
                  onClick={() => setLoadOpen(false)}
                  aria-label={t("Cerrar")}
                >
                  <X size={14} />
                </button>
              </header>

              <div className="max-h-[min(60vh,28rem)] overflow-y-auto p-2">
                {deployments.length === 0 ? (
                  <p className="px-3 py-8 text-center text-label text-ink-500">
                    {t("Todavía no hay configuraciones guardadas.")}
                  </p>
                ) : (
                  deployments.map((deployment) => {
                    const selected = deployment.id === config.activeDeploymentId;
                    return (
                      <div
                        key={deployment.id}
                        className={clsx("config-row", selected && "config-row-on")}
                      >
                        <button
                          type="button"
                          className="config-row-main"
                          onClick={() => void apply(deployment)}
                          title={deployment.name}
                        >
                          <span className="config-row-check">
                            {selected && <Check size={13} />}
                          </span>
                          <span className="config-row-copy">
                            <span className="config-row-name">{deployment.name}</span>
                            <span className="config-row-model">
                              {deployment.modelPath
                                ? basename(deployment.modelPath)
                                : t("Sin modelo")}
                            </span>
                          </span>
                        </button>
                        <button
                          type="button"
                          className="config-row-delete"
                          onClick={() => {
                            setLoadOpen(false);
                            setPendingDelete(deployment);
                          }}
                          aria-label={`Eliminar ${deployment.name}`}
                          title={t("Eliminar configuración")}
                        >
                          <Trash2 size={13} />
                        </button>
                      </div>
                    );
                  })
                )}
              </div>

              <footer className="flex items-center justify-between gap-3 border-t border-base-800 px-4 py-3">
                <Button
                  variant="quiet"
                  icon={<Upload size={12} />}
                  onClick={() => void pickImport()}
                >
                  {t("Cargar archivo…")}
                </Button>
                <Button variant="quiet" onClick={() => setLoadOpen(false)}>
                  {t("Cerrar")}
                </Button>
              </footer>
            </div>
          </div>,
          document.body,
        )}

      <PromptDialog
        open={promptMode !== null}
        title={promptMode === "import" ? "Cargar configuración" : t("Guardar como")}
        label="Nombre"
        defaultValue={promptDefault}
        placeholder="Gemma 32k en la RX 9070"
        confirmLabel={promptMode === "import" ? "Cargar" : t("Guardar como")}
        onConfirm={(name) => {
          if (promptMode === "import") void confirmImport(name);
          else void saveCurrent(name, true);
        }}
        onCancel={() => {
          setPromptMode(null);
          setImported(null);
        }}
      />

      <ConfirmDialog
        open={pendingDelete !== null}
        title="Eliminar configuración"
        message="Se borra la configuración guardada. Los modelos y los argumentos actuales no se tocan."
        confirmLabel="Eliminar"
        danger
        onConfirm={() => pendingDelete && void deletePreset(pendingDelete)}
        onCancel={() => setPendingDelete(null)}
      />
    </section>
  );
}
