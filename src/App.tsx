import { useCallback, useEffect, useMemo, useState } from "react";
import clsx from "clsx";
import { Activity, Cpu, Download, Layers, Loader2, Play, Square, Zap } from "lucide-react";

import { api } from "./lib/api";
import { ToastProvider, useToast } from "./components/ui";
import type { AppConfig, HardwareReport, ServerStatus } from "./types";

import ReleasesView from "./views/ReleasesView";
import DashboardView from "./views/DashboardView";
import DeployView from "./views/DeployView";
import SettingsView from "./views/SettingsView";

type ViewId = "dashboard" | "deploy" | "releases" | "settings";

const NAV: { id: ViewId; label: string; icon: typeof Activity; hint: string }[] = [
  { id: "dashboard", label: "Panel", icon: Activity, hint: "Estado del equipo y del servidor" },
  { id: "releases", label: "llama.cpp", icon: Download, hint: "Instalar binarios oficiales" },
  { id: "deploy", label: "Despliegue", icon: Layers, hint: "Modelo + configuración + presets" },
  { id: "settings", label: "Ajustes", icon: Cpu, hint: "Rutas, token y equipo" },
];

function Shell() {
  const toast = useToast();
  const [view, setView] = useState<ViewId>("dashboard");
  const [config, setConfig] = useState<AppConfig | null>(null);
  const [hardware, setHardware] = useState<HardwareReport | null>(null);
  const [server, setServer] = useState<ServerStatus | null>(null);
  const [modelsDir, setModelsDir] = useState<string>("");
  const [selectedModel, setSelectedModel] = useState<string | null>(null);
  const [selectedMmproj, setSelectedMmproj] = useState<string | null>(null);
  const [selectedDraft, setSelectedDraft] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const boot = await api.bootstrap();
        if (!alive) return;
        setConfig(boot.config);
        const dir = boot.config.modelsDir ?? boot.defaults.modelsDir;
        setModelsDir(dir);
        setSelectedModel(boot.config.lastModel);
        setSelectedMmproj(boot.config.lastMmproj);
        setSelectedDraft(boot.config.lastDraftModel);

        const [hw, st] = await Promise.all([api.hardwareReport(), api.serverStatus()]);
        if (!alive) return;
        setHardware(hw);
        setServer(st);
      } catch (e) {
        toast.push(`No se pudo iniciar EzLlamaCpp: ${String(e)}`, "danger");
      }
    })();
    return () => {
      alive = false;
    };
  }, [toast]);

  useEffect(() => {
    const id = setInterval(() => {
      api.serverStatus().then(setServer).catch(() => {});
    }, 3000);
    return () => clearInterval(id);
  }, []);

  const saveConfig = useCallback(
    async (next: AppConfig) => {
      setConfig(next);
      try {
        await api.setConfig(next);
      } catch (e) {
        toast.push(`No se pudo guardar la configuración: ${String(e)}`, "danger");
      }
    },
    [toast],
  );

  // La carpeta de modelos se persiste con retardo: si no, al reiniciar la
  // app se pierde el sitio donde el usuario dejó sus modelos. Se escribe
  // poco despues de que el usuario deja de teclear, no en cada tecla.
  useEffect(() => {
    if (!config) return;
    if (config.modelsDir === modelsDir) return;
    const id = setTimeout(() => {
      void saveConfig({ ...config, modelsDir });
    }, 600);
    return () => clearTimeout(id);
  }, [modelsDir, config, saveConfig]);

  const refreshHardware = useCallback(async () => {
    try {
      setHardware(await api.hardwareReport());
    } catch (e) {
      toast.push(`No se pudo leer el hardware: ${String(e)}`, "danger");
    }
  }, [toast]);

  const handleStart = useCallback(async () => {
    setBusy(true);
    try {
      let model = selectedModel;
      let mmproj = selectedMmproj;
      let draft = selectedDraft;
      if (config?.activeDeploymentId) {
        const [cfg] = await api.applyDeployment(config.activeDeploymentId);
        model = cfg.lastModel;
        mmproj = cfg.lastMmproj;
        draft = cfg.lastDraftModel;
        setConfig(cfg);
      }
      const st = await api.startServer(model, mmproj, draft);
      setServer(st);
      toast.push(
        st.health ? `Servidor en marcha en http://${st.host}:${st.port}` : "El servidor arrancó; todavía no responde.",
        st.health ? "success" : "info",
      );
      refreshHardware();
    } catch (e) {
      toast.push(`No se pudo arrancar el servidor: ${String(e)}`, "danger");
    } finally {
      setBusy(false);
    }
  }, [config, selectedModel, selectedMmproj, selectedDraft, toast, refreshHardware]);

  const handleStop = useCallback(async () => {
    setBusy(true);
    try {
      const st = await api.stopServer();
      setServer(st);
      toast.push("Servidor detenido", "info");
      refreshHardware();
    } catch (e) {
      toast.push(`No se pudo parar el servidor: ${String(e)}`, "danger");
    } finally {
      setBusy(false);
    }
  }, [toast, refreshHardware]);

  const onModelPicked = useCallback(
    (model: string | null, mmproj: string | null, draft: string | null) => {
      setSelectedModel(model);
      setSelectedMmproj(mmproj);
      setSelectedDraft(draft);
      if (config) {
        void saveConfig({ ...config, lastModel: model, lastMmproj: mmproj, lastDraftModel: draft });
      }
    },
    [config, saveConfig],
  );

  const content = useMemo(() => {
    switch (view) {
      case "deploy":
        return (
          <DeployView
            config={config}
            server={server}
            hardware={hardware}
            modelsDir={modelsDir}
            onModelsDirChange={setModelsDir}
            selectedModel={selectedModel}
            selectedMmproj={selectedMmproj}
            selectedDraft={selectedDraft}
            onSelect={onModelPicked}
            onConfigChange={saveConfig}
          />
        );
      case "releases":
        return (
          <ReleasesView
            config={config}
            hardware={hardware}
            onConfigChange={saveConfig}
          />
        );
      case "settings":
        return (
          <SettingsView
            config={config}
            hardware={hardware}
            onConfigChange={saveConfig}
            onRefreshHardware={refreshHardware}
          />
        );
      default:
        return (
          <DashboardView
            hardware={hardware}
            server={server}
            selectedModel={selectedModel}
            onNavigate={(v) => setView(v as ViewId)}
            onConfigChange={saveConfig}
            onModelPicked={onModelPicked}
          />
        );
    }
  }, [view, config, saveConfig, modelsDir, selectedModel, selectedMmproj, selectedDraft, onModelPicked, server, handleStart, handleStop, busy, hardware, refreshHardware]);

  return (
    <div className="flex h-full">
      {/* ==================================================================
          Barra lateral: navegación + control del servidor.

          El control del servidor vive AQUÍ y en ningún otro sitio, para que
          esté disponible desde cualquier sección sin repetir el botón en
          cada vista.
          ================================================================== */}
      <aside className="app-sidebar flex w-[13.5rem] shrink-0 flex-col border-r border-base-800 bg-base-950">
        {/* Marca */}
        <div className="flex h-12 shrink-0 items-center gap-2.5 border-b border-base-800 px-4">
          <span className="flex h-6 w-6 items-center justify-center rounded-md bg-accent-500/15 text-accent-400">
            <Zap size={13} />
          </span>
          <span className="app-sidebar-label text-[0.8125rem] font-semibold tracking-tight text-ink-100">
            EzLlamaCpp
          </span>
        </div>

        {/* Navegación */}
        <nav className="flex-1 space-y-0.5 overflow-y-auto p-2" aria-label="Secciones">
          {NAV.map((item) => {
            const Icon = item.icon;
            const active = view === item.id;
            return (
              <button
                key={item.id}
                onClick={() => setView(item.id)}
                title={item.hint}
                className={clsx(
                  "app-sidebar-btn group flex w-full cursor-pointer items-center gap-2.5 rounded-md px-2.5 py-2 text-left text-xs font-medium transition-colors duration-150",
                  active
                    ? "bg-base-850 text-ink-100"
                    : "text-ink-400 hover:bg-base-900 hover:text-ink-200",
                )}
                aria-current={active ? "page" : undefined}
              >
                <span
                  className={clsx(
                    "flex h-5 w-5 shrink-0 items-center justify-center rounded transition-colors duration-150",
                    active
                      ? "text-accent-400"
                      : "text-ink-500 group-hover:text-ink-300",
                  )}
                >
                  <Icon size={14} />
                </span>
                <span className="app-sidebar-label">{item.label}</span>
              </button>
            );
          })}
        </nav>

        {/* --- Control del servidor: único en toda la app --- */}
        <div className="shrink-0 space-y-2.5 border-t border-base-800 p-3">
          <div className="flex items-center justify-between gap-2">
            <span className="app-sidebar-section text-meta font-medium tracking-wide text-ink-400 uppercase">
              Servidor
            </span>
            <span
              className={clsx(
                "pulse-dot",
                server?.running
                  ? server.health
                    ? "pulse-dot-ok"
                    : "pulse-dot-warn"
                  : "",
              )}
              aria-hidden
            />
          </div>

          <p className="mono truncate text-meta text-ink-400">
            {server?.running
              ? `http://${server.host}:${server.port}`
              : "Detenido"}
          </p>

          {server?.running && server.models.length > 0 && (
            <p className="truncate text-meta text-ink-500" title={server.models.join(", ")}>
              {server.models.join(", ")}
            </p>
          )}

          <button
            onClick={server?.running ? handleStop : handleStart}
            disabled={busy}
            className={clsx(
              "flex w-full cursor-pointer items-center justify-center gap-2 rounded-md px-3 py-2 text-xs font-semibold transition-colors duration-150",
              server?.running
                ? "bg-danger-500/15 text-danger-400 hover:bg-danger-500/25"
                : "bg-accent-500 text-[#08091c] hover:bg-accent-400",
            )}
          >
            {busy ? (
              <Loader2 size={13} className="animate-spin" />
            ) : server?.running ? (
              <Square size={12} />
            ) : (
              <Play size={12} />
            )}
            {busy ? "…" : server?.running ? "Detener" : "Arrancar"}
          </button>
        </div>
      </aside>

      {/* --- Contenido --- */}
      <main className="min-w-0 flex-1 overflow-y-auto">
        <div className="app-content mx-auto max-w-[76rem] px-6 py-5">{content}</div>
      </main>
    </div>
  );
}

export default function App() {
  return (
    <ToastProvider>
      <Shell />
    </ToastProvider>
  );
}
