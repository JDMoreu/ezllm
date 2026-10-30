import { useCallback, useEffect, useState } from "react";
import clsx from "clsx";
import { Check, ChevronDown, FilePlus, Save, Trash2, Upload, X } from "lucide-react";
import { open } from "@tauri-apps/plugin-dialog";

import { api } from "../lib/api";
import { basename } from "../lib/format";
import { t } from "../lib/i18n";
import { Button, ConfirmDialog, PromptDialog, useToast } from "./ui";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui-kit/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui-kit/dropdown-menu";
import type { AppConfig, Deployment } from "../types";

type PromptMode = "save-as" | "import" | null;

/**
 * Configuración activa en la barra superior: nombre, cambiar, guardar y sus
 * diálogos. Vive en el header porque aplica a toda la app, no solo al panel
 * de ejecución.
 */
export default function ConfigBar({
  config,
  selectedModel,
  selectedMmproj,
  selectedDraft,
  onSelect,
  onConfigChange,
}: {
  config: AppConfig;
  selectedModel: string | null;
  selectedMmproj: string | null;
  selectedDraft: string | null;
  onSelect: (model: string | null, mmproj: string | null, draft: string | null) => void;
  onConfigChange: (config: AppConfig) => void;
}) {
  const toast = useToast();
  const [loadOpen, setLoadOpen] = useState(false);
  const [promptMode, setPromptMode] = useState<PromptMode>(null);
  const [imported, setImported] = useState<Deployment | null>(null);
  const [pendingDelete, setPendingDelete] = useState<Deployment | null>(null);
  const [presetBusy, setPresetBusy] = useState(false);

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
    <div className="config-group">
      {deployments.length > 0 ? (
        <button
          type="button"
          className="config-group-name"
          onClick={() => setLoadOpen(true)}
          title={t("Cambiar configuración…")}
          aria-haspopup="dialog"
        >
          {selectedModel
            ? active
              ? active.name
              : t("Configuración actual")
            : t("Sin configuración")}
        </button>
      ) : (
        <span className="config-group-name">
          {selectedModel
            ? active
              ? active.name
              : t("Configuración actual")
            : t("Sin configuración")}
        </span>
      )}
      <span className="config-group-divider" aria-hidden />
      <button
        type="button"
        className={clsx(
          "config-group-action",
          dirty && "config-group-action-accent",
        )}
        onClick={saveActive}
        disabled={presetBusy}
        title={dirty ? t("Cambios sin guardar") : t("Guardar")}
      >
        <Save size={12} aria-hidden />
        {t("Guardar")}
      </button>
      <span className="config-group-divider" aria-hidden />
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            className="config-group-action config-group-action-icon"
            disabled={presetBusy}
            aria-label={t("Más opciones de guardado")}
            title={t("Más opciones de guardado")}
          >
            <ChevronDown size={12} aria-hidden />
          </button>
        </DropdownMenuTrigger>
          <DropdownMenuContent
            align="end"
            className="min-w-56 border border-base-700 bg-base-900 text-ink-200 shadow-float"
          >
            <DropdownMenuItem className="text-label" onSelect={() => setPromptMode("save-as")}>
              <FilePlus size={12} />
              {t("Guardar como…")}
            </DropdownMenuItem>
            <DropdownMenuItem className="text-label" onSelect={() => void pickImport()}>
              <Upload size={12} />
              {t("Importar archivo…")}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>

        <Dialog open={loadOpen} onOpenChange={setLoadOpen}>
        <DialogContent
          showCloseButton={false}
          className="flex max-h-[min(80vh,40rem)] w-full max-w-2xl flex-col gap-0 overflow-hidden border border-base-700 bg-base-900 p-0 ring-0 shadow-float"
        >
          <DialogHeader className="flex-row items-start justify-between gap-4 border-b border-base-800 px-4 py-3">
            <div>
              <DialogTitle className="text-title">
                {t("Configuraciones guardadas")}
                {deployments.length > 0 && (
                  <span className="mono ml-2 text-meta font-normal text-ink-500">
                    {deployments.length}
                  </span>
                )}
              </DialogTitle>
              <DialogDescription className="mt-0.5 text-meta text-ink-500">
                {t("Aplica una configuración al comando actual.")}
              </DialogDescription>
            </div>
            <button
              type="button"
              className="btn-quiet -m-1 p-1 text-ink-500 hover:text-ink-200"
              onClick={() => setLoadOpen(false)}
              aria-label={t("Cerrar")}
            >
              <X size={14} />
            </button>
          </DialogHeader>

          <div className="min-h-0 flex-1 overflow-y-auto p-2">
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
                      aria-current={selected ? "true" : undefined}
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

          <div className="flex items-center justify-between gap-3 border-t border-base-800 px-4 py-3">
            <Button
              variant="quiet"
              icon={<Upload size={12} />}
              onClick={() => void pickImport()}
            >
              {t("Importar archivo…")}
            </Button>
            <Button variant="quiet" onClick={() => setLoadOpen(false)}>
              {t("Cerrar")}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <PromptDialog
        open={promptMode !== null}
        title={promptMode === "import" ? "Importar configuración" : t("Guardar como")}
        label="Nombre"
        defaultValue={promptDefault}
        placeholder="Gemma 32k en la RX 9070"
        confirmLabel={promptMode === "import" ? "Importar" : t("Guardar como")}
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
    </div>
  );
}
