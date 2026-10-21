import { useCallback, useEffect, useMemo, useState } from "react";
import clsx from "clsx";
import { Activity, Cpu, Download, Layers, Settings2, SlidersHorizontal, Zap } from "lucide-react";

import { api } from "./lib/api";
import { ToastProvider, useToast } from "./components/ui";
import type { AppConfig, HardwareReport, ServerStatus } from "./types";

import ReleasesView from "./views/ReleasesView";
import ModelsView from "./views/ModelsView";
import ConfigureView from "./views/ConfigureView";
import DashboardView from "./views/DashboardView";
import SettingsView from "./views/SettingsView";
import ProfilesView from "./views/ProfilesView";

type ViewId = "dashboard" | "releases" | "models" | "configure" | "profiles" | "settings";

const NAV: { id: ViewId; label: string; icon: typeof Activity; hint: string }[] = [
  { id: "dashboard", label: "Panel", icon: Activity, hint: "Estado del equipo y del servidor" },
  { id: "releases", label: "llama.cpp", icon: Download, hint: "Instalar binarios oficiales" },
  { id: "models", label: "Modelos", icon: Layers, hint: "Catálogo GGUF, MTP y mmproj" },
  { id: "configure", label: "Configurar", icon: Settings2, hint: "Parámetros del servidor" },
  { id: "profiles", label: "Perfiles", icon: SlidersHorizontal, hint: "Modelos con su configuración" },
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

  // --- Carga inicial ------------------------------------------------------
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

  // --- Refresco periódico del servidor ------------------------------------
  useEffect(() => {
    const id = setInterval(() => {
      api
        .serverStatus()
        .then(setServer)
        .catch(() => {});
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
      const st = await api.startServer(selectedModel, selectedMmproj, selectedDraft);
      setServer(st);
      toast.push(
        st.health
          ? `Servidor en marcha en http://${st.host}:${st.port}`
          : "El servidor arrancó; todavía no responde.",
        st.health ? "success" : "info",
      );
      refreshHardware();
    } catch (e) {
      toast.push(`No se pudo arrancar el servidor: ${String(e)}`, "danger");
    } finally {
      setBusy(false);
    }
  }, [selectedModel, selectedMmproj, selectedDraft, toast, refreshHardware]);

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
        void saveConfig({
          ...config,
          lastModel: model,
          lastMmproj: mmproj,
          lastDraftModel: draft,
        });
      }
    },
    [config, saveConfig],
  );

  const content = useMemo(() => {
    switch (view) {
      case "releases":
        return <ReleasesView config={config} onConfigChange={saveConfig} />;
      case "models":
        return (
          <ModelsView
            modelsDir={modelsDir}
            onModelsDirChange={setModelsDir}
            selectedModel={selectedModel}
            selectedMmproj={selectedMmproj}
            selectedDraft={selectedDraft}
            onSelect={onModelPicked}
          />
        );
      case "configure":
        return (
          <ConfigureView
            config={config}
            server={server}
            hardware={hardware}
            selectedModel={selectedModel}
            selectedMmproj={selectedMmproj}
            selectedDraft={selectedDraft}
            onConfigChange={saveConfig}
            onStart={handleStart}
            onStop={handleStop}
            busy={busy}
          />
        );
      case "profiles":
        return (
          <ProfilesView
            config={config}
            selectedModel={selectedModel}
            selectedMmproj={selectedMmproj}
            selectedDraft={selectedDraft}
            onConfigChange={saveConfig}
            onApply={(cfg) => {
              setSelectedModel(cfg.lastModel);
              setSelectedMmproj(cfg.lastMmproj);
              setSelectedDraft(cfg.lastDraftModel);
            }}
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
            onNavigate={setView}
            onStart={handleStart}
            onStop={handleStop}
            busy={busy}
          />
        );
    }
  }, [
    view,
    config,
    saveConfig,
    modelsDir,
    selectedModel,
    selectedMmproj,
    selectedDraft,
    onModelPicked,
    server,
    handleStart,
    handleStop,
    busy,
    hardware,
    refreshHardware,
  ]);

  return (
    <div className="flex h-full">
      {/* --- Barra lateral --- */}
      <nav
        className="flex w-[13.5rem] shrink-0 flex-col border-r border-base-800 bg-base-950/60"
        aria-label="Secciones"
      >
        <div className="flex items-center gap-2.5 px-4 py-4">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-accent-600/15 text-accent-400">
            <Zap size={17} />
          </div>
          <div className="min-w-0">
            <p className="truncate text-[0.8125rem] font-semibold tracking-tight text-ink-100">
              EzLlamaCpp
            </p>
            <p className="truncate text-[0.6875rem] text-ink-500">Cliente de llama.cpp</p>
          </div>
        </div>

        <ul className="flex-1 space-y-0.5 px-2.5 py-1">
          {NAV.map((item) => {
            const Icon = item.icon;
            const active = view === item.id;
            return (
              <li key={item.id}>
                <button
                  onClick={() => setView(item.id)}
                  title={item.hint}
                  className={clsx(
                    "flex w-full cursor-pointer items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-[0.8125rem] font-medium transition-colors duration-200",
                    active
                      ? "bg-accent-600/14 text-accent-300"
                      : "text-ink-300 hover:bg-base-850 hover:text-ink-100",
                  )}
                  aria-current={active ? "page" : undefined}
                >
                  <Icon size={15} className="shrink-0" />
                  {item.label}
                </button>
              </li>
            );
          })}
        </ul>

        {/* --- Estado del servidor (siempre visible) --- */}
        <div className="border-t border-base-800 p-3">
          <div className="rounded-lg bg-base-900 px-3 py-2.5">
            <div className="flex items-center justify-between gap-2">
              <span className="text-[0.6875rem] font-semibold tracking-wide text-ink-400 uppercase">
                Servidor
              </span>
              <span
                className={clsx(
                  "h-1.5 w-1.5 rounded-full",
                  server?.running
                    ? server.health
                      ? "bg-accent-400"
                      : "bg-warn-400 animate-pulse"
                    : "bg-ink-500",
                )}
              />
            </div>
            <p className="mono mt-1 text-xs text-ink-200">
              {server?.running ? `http://${server.host}:${server.port}` : "Detenido"}
            </p>
            {server?.running && server.models.length > 0 && (
              <p className="mt-1 truncate text-[0.6875rem] text-ink-400">
                {server.models.join(", ")}
              </p>
            )}
            <div className="mt-2.5 flex gap-1.5">
              <button
                onClick={handleStart}
                disabled={busy || server?.running}
                className="btn btn-primary flex-1 px-2 py-1 text-[0.6875rem]"
              >
                {server?.running ? "En marcha" : "Arrancar"}
              </button>
              <button
                onClick={handleStop}
                disabled={busy || !server?.running}
                className="btn btn-ghost px-2 py-1 text-[0.6875rem]"
              >
                Parar
              </button>
            </div>
          </div>
        </div>
      </nav>

      {/* --- Contenido --- */}
      <main className="flex-1 overflow-y-auto">
        <div className="mx-auto max-w-[68rem] px-6 py-6">{content}</div>
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
