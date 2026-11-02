import { useCallback, useEffect, useRef, useState } from "react";
import clsx from "clsx";
import {
  Boxes,
  Cpu,
  ExternalLink,
  Gauge,
  Gpu,
  HardDrive,
  Play,
  Settings2,
} from "lucide-react";
import { open } from "@tauri-apps/plugin-dialog";
import { openUrl } from "@tauri-apps/plugin-opener";
import { getCurrentWebview } from "@tauri-apps/api/webview";

import { api } from "./lib/api";
import { ToastProvider, useToast } from "./components/ui";
import { Sparkline } from "./components/Telemetry";
import WindowControls from "./components/WindowControls";
import { Logo } from "./components/Logo";
import DownloadBar from "./components/DownloadBar";
import ConfigBar from "./components/ConfigBar";
import { basename, dirname, formatBytes } from "./lib/format";
import { languageFrom, setLanguage, t, type Language } from "./lib/i18n";
import { useDownloads } from "./lib/useDownloads";
import { useTelemetry } from "./lib/useTelemetry";
import type { AppConfig, HardwareReport, InstalledBuild, ServerStatus } from "./types";

import ReleasesView from "./views/ReleasesView";
import DeployView from "./views/DeployView";
import ModelsView from "./views/ModelsView";
import SettingsView from "./views/SettingsView";

type WorkspaceTab = "run" | "models" | "runtime" | "settings";

const WORKSPACE_TABS: {
  id: WorkspaceTab;
  label: string;
  icon: typeof Play;
}[] = [
  { id: "run", label: "Ejecutar", icon: Play },
  { id: "models", label: "Modelos", icon: Boxes },
  { id: "runtime", label: "Motor", icon: Cpu },
  { id: "settings", label: "Ajustes", icon: Settings2 },
];

function Shell() {
  const toast = useToast();
  const [config, setConfig] = useState<AppConfig | null>(null);
  const configRef = useRef<AppConfig | null>(null);
  const saveTimerRef = useRef<number | null>(null);
  const [hardware, setHardware] = useState<HardwareReport | null>(null);
  const [installed, setInstalled] = useState<InstalledBuild[]>([]);
  const [server, setServer] = useState<ServerStatus | null>(null);
  const [modelsDir, setModelsDir] = useState<string>("");
  const [configPath, setConfigPath] = useState<string>("");  const [selectedModel, setSelectedModel] = useState<string | null>(null);
  const [selectedMmproj, setSelectedMmproj] = useState<string | null>(null);
  const [selectedDraft, setSelectedDraft] = useState<string | null>(null);
  const [tab, setTab] = useState<WorkspaceTab>("run");
  const [visited, setVisited] = useState<WorkspaceTab[]>(["run"]);
  const [busy, setBusy] = useState(false);
  const tel = useTelemetry(true, 1);
  const downloads = useDownloads(modelsDir);

  const showTab = useCallback((next: WorkspaceTab) => {
    setTab(next);
    setVisited((current) => (current.includes(next) ? current : [...current, next]));
  }, []);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const boot = await api.bootstrap();
        if (!alive) return;
        configRef.current = boot.config;
        setConfig(boot.config);
        const dir = boot.config.modelsDir ?? boot.defaults.modelsDir;
        setModelsDir(dir);
        setSelectedModel(boot.config.lastModel);
        setSelectedMmproj(boot.config.lastMmproj);
        setSelectedDraft(boot.config.lastDraftModel);

        const [hw, st, inst, path] = await Promise.all([
          api.hardwareReport(),
          api.serverStatus(),
          api.listInstalled().catch(() => [] as InstalledBuild[]),
          api.configPath().catch(() => ""),
        ]);
        if (!alive) return;
        setHardware(hw);
        setServer(st);
        setInstalled(inst);
        setConfigPath(path);
      } catch (e) {
        toast.push(`No se pudo iniciar EzLLM: ${String(e)}`, "danger");
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
    (next: AppConfig) => {
      // La ref evita que dos acciones encadenadas (aplicar un preset y
      // seleccionar su modelo) guarden una versión antigua de la config.
      configRef.current = next;
      setConfig(next);
      // Escribir en cada tecla castiga el disco sin aportar nada. Se
      // guarda la última versión; arrancar el servidor fuerza el guardado.
      if (saveTimerRef.current !== null) window.clearTimeout(saveTimerRef.current);
      saveTimerRef.current = window.setTimeout(() => {
        saveTimerRef.current = null;
        api.setConfig(next).catch((e) => {
          toast.push(`No se pudo guardar la configuración: ${String(e)}`, "danger");
        });
      }, 300);
    },
    [toast],
  );

  const changeLanguage = useCallback(
    (language: Language) => {
      const current = configRef.current;
      if (!current) return;
      saveConfig({ ...current, language });
    },
    [saveConfig],
  );

  useEffect(() => {
    return () => {
      if (saveTimerRef.current !== null) window.clearTimeout(saveTimerRef.current);
    };
  }, []);

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

  const refreshInstalled = useCallback(async () => {
    try {
      setInstalled(await api.listInstalled());
    } catch {
      // Si aún no hay carpeta de llama.cpp, la lista queda vacía.
    }
  }, []);

  const handleStart = useCallback(async () => {
    const currentConfig = configRef.current;
    const runtimeReady =
      !!currentConfig?.llamaDir || installed.length > 0 || !!hardware?.llamaServer;
    if (!runtimeReady) {
      toast.push("Primero instala un motor de llama.cpp", "info");
      showTab("runtime");
      return;
    }
    if (!selectedModel) {
      toast.push("Elige o descarga un modelo antes de iniciar", "info");
      showTab("models");
      return;
    }
    setBusy(true);
    try {
      // Se arranca exactamente con lo que hay en pantalla. Reaplicar el
      // preset activo aquí pisaba los cambios de argumentos sin avisar.
      const pendingSave = saveTimerRef.current !== null;
      if (pendingSave) {
        window.clearTimeout(saveTimerRef.current!);
        saveTimerRef.current = null;
      }
      const current = configRef.current;
      if (pendingSave && current) await api.setConfig(current);
      tel.resetSpeed();
      const st = await api.startServer(selectedModel, selectedMmproj, selectedDraft);
      setServer(st);
      const localHost =
        st.host === "0.0.0.0" || st.host === "::" || st.host === "[::]"
          ? "127.0.0.1"
          : st.host;
      toast.push(
        st.health
          ? `Modelo desplegado · http://${localHost}:${st.port}`
          : "El servidor arrancó pero no responde. Revisa la salida.",
        st.health ? "success" : "danger",
      );
      refreshHardware();
    } catch (e) {
      const message = String(e);
      toast.push(`No se pudo arrancar: ${message.split("\n")[0]}`, "danger");
    } finally {
      setBusy(false);
    }
  }, [
    selectedModel,
    selectedMmproj,
    selectedDraft,
    toast,
    refreshHardware,
    installed,
    hardware,
    showTab,
    tel,
  ]);

  const handleStop = useCallback(async () => {
    setBusy(true);
    try {
      const st = await api.stopServer();
      tel.resetSpeed();
      setServer(st);
      toast.push("Servidor detenido", "info");
      refreshHardware();
      return true;
    } catch (e) {
      toast.push(`No se pudo parar el servidor: ${String(e)}`, "danger");
      return false;
    } finally {
      setBusy(false);
    }
  }, [toast, refreshHardware, tel]);

  /** Reinicia con los flags que hay en pantalla, sin pasar por Detener → Iniciar. */
  const handleRestart = useCallback(async () => {
    if (!selectedModel) return;
    setBusy(true);
    try {
      await api.stopServer();
      tel.resetSpeed();
      const st = await api.startServer(selectedModel, selectedMmproj, selectedDraft);
      setServer(st);
      toast.push(
        st.health ? "Modelo reiniciado" : "El modelo no responde. Revisa la salida.",
        st.health ? "success" : "danger",
      );
      refreshHardware();
    } catch (e) {
      const message = String(e);
      toast.push(`No se pudo reiniciar: ${message.split("\n")[0]}`, "danger");
    } finally {
      setBusy(false);
    }
  }, [selectedModel, selectedMmproj, selectedDraft, toast, refreshHardware, tel]);

  // Atajos de experto: no añaden ruido a la interfaz y evitan el ratón en
  // las dos acciones más repetidas (cambiar de vista y arrancar/parar).
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const meta = event.ctrlKey || event.metaKey;
      if (!meta) return;
      if (event.key >= "1" && event.key <= String(WORKSPACE_TABS.length)) {
        event.preventDefault();
        showTab(WORKSPACE_TABS[Number(event.key) - 1].id);
        return;
      }
      if (event.key.toLowerCase() === "k") {
        event.preventDefault();
        showTab("models");
        requestAnimationFrame(() => document.getElementById("model-search")?.focus());
        return;
      }
      if (event.key === "Enter") {
        event.preventDefault();
        if (server?.running) void handleStop();
        else void handleStart();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [handleStart, handleStop, server?.running, showTab]);

  const onModelPicked = useCallback(
    (model: string | null, mmproj: string | null, draft: string | null) => {
      setSelectedModel(model);
      setSelectedMmproj(mmproj);
      setSelectedDraft(draft);
      const current = configRef.current;
      if (current) {
        void saveConfig({
          ...current,
          lastModel: model,
          lastMmproj: mmproj,
          lastDraftModel: draft,
        });
      }
    },
    [saveConfig],
  );

  const useModelForRun = useCallback(
    (model: string, mmproj: string | null, draft: string | null) => {
      onModelPicked(model, mmproj, draft);
      showTab("run");
    },
    [onModelPicked, showTab],
  );

  // Arrastrar un GGUF a la ventana lo asigna sin abrir el explorador. El rol
  // se deduce del nombre; si es dudoso, cae en el modelo principal.
  useEffect(() => {
    let unlisten: (() => void) | undefined;
    let disposed = false;
    getCurrentWebview()
      .onDragDropEvent((event) => {
        if (event.payload.type !== "drop") return;
        const paths = event.payload.paths.filter((path) => /\.gguf$/i.test(path));
        if (paths.length === 0) return;
        const path = paths[0];
        const lower = path.toLowerCase();
        if (lower.includes("mmproj")) {
          onModelPicked(selectedModel, path, selectedDraft);
        } else if (lower.includes("mtp") || lower.includes("draft")) {
          onModelPicked(selectedModel, selectedMmproj, path);
        } else {
          onModelPicked(path, selectedMmproj, selectedDraft);
        }
        showTab("run");
        toast.push(`Asignado ${basename(path)}`, "success");
      })
      .then((fn) => {
        if (disposed) fn();
        else unlisten = fn;
      })
      .catch(() => {
        // En un navegador normal no hay webview de Tauri: se ignora.
      });
    return () => {
      disposed = true;
      unlisten?.();
    };
  }, [
    onModelPicked,
    selectedModel,
    selectedMmproj,
    selectedDraft,
    showTab,
    toast,
  ]);

  const pickModelFile = useCallback(
    async (slot: "primary" | "mmproj" | "draft") => {
      try {
        const picked = await open({
          multiple: false,
          filters: [{ name: "GGUF", extensions: ["gguf"] }],
          defaultPath: modelsDir || undefined,
          title:
            slot === "primary"
              ? "Elige el modelo principal"
              : slot === "mmproj"
                ? "Elige el proyector multimodal"
                : "Elige el bloque MTP / draft",
        });
        if (typeof picked !== "string" || !picked) return;
        if (slot === "primary") onModelPicked(picked, selectedMmproj, selectedDraft);
        else if (slot === "mmproj") onModelPicked(selectedModel, picked, selectedDraft);
        else onModelPicked(selectedModel, selectedMmproj, picked);
        toast.push("Modelo asignado", "success");
      } catch (e) {
        toast.push(`No se pudo abrir el explorador: ${String(e)}`, "danger");
      }
    },
    [modelsDir, selectedModel, selectedMmproj, selectedDraft, onModelPicked, toast],
  );

  const pickModelsFolder = useCallback(async () => {
    try {
      const picked = await open({
        directory: true,
        multiple: false,
        defaultPath: modelsDir || undefined,
        title: "Elige la carpeta de modelos",
      });
      if (typeof picked === "string" && picked) setModelsDir(picked);
    } catch (e) {
      toast.push(`No se pudo abrir el explorador: ${String(e)}`, "danger");
    }
  }, [modelsDir, toast]);

  const openConfigFolder = useCallback(async () => {
    if (!configPath) return;
    try {
      await api.openFolder(dirname(configPath));
    } catch (e) {
      toast.push(`No se pudo abrir la carpeta de configuración: ${String(e)}`, "danger");
    }
  }, [configPath, toast]);

  const openModelsFolder = useCallback(async () => {
    if (!modelsDir) return;
    try {
      await api.openFolder(modelsDir);
    } catch (e) {
      toast.push(`No se pudo abrir la carpeta de modelos: ${String(e)}`, "danger");
    }
  }, [modelsDir, toast]);

  const openLlamaFolder = useCallback(async () => {
    const dir = config?.llamaDir ?? installed[0]?.dir;
    if (!dir) return;
    try {
      await api.openFolder(dir);
    } catch (e) {
      toast.push(`No se pudo abrir la carpeta de llama.cpp: ${String(e)}`, "danger");
    }
  }, [config, installed, toast]);

  const pickLlamaFolder = useCallback(async () => {
    if (!config) return false;
    try {
      const picked = await open({
        directory: true,
        multiple: false,
        defaultPath: config.llamaDir ?? installed[0]?.dir ?? undefined,
        title: "Elige la carpeta de llama.cpp",
      });
      if (typeof picked === "string" && picked) {
        saveConfig({ ...config, llamaDir: picked });
        return true;
      }
      return false;
    } catch (e) {
      toast.push(`No se pudo abrir el explorador: ${String(e)}`, "danger");
      return false;
    }
  }, [config, installed, saveConfig, toast]);

  const useLlamaBuild = useCallback(
    (build: InstalledBuild) => {
      const current = configRef.current;
      if (!current) return;
      saveConfig({ ...current, llamaDir: build.dir });
      toast.push(`Build ${build.tag} seleccionado`, "success");
    },
    [saveConfig, toast],
  );

  const snap = tel.snapshot;
  const cpuPct = snap?.cpu.percent ?? 0;
  const ramUsed = snap?.ram.usedBytes ?? 0;
  const ramTotal = snap?.ram.totalBytes ?? hardware?.ram.totalBytes ?? 0;
  const gpus = snap?.gpus.length ? snap.gpus : hardware?.gpu ?? [];
  const primaryGpu = gpus[0];
  const dedicatedGpu = gpus.find((gpu) => gpu.kind === "discrete") ?? primaryGpu;
  const language = languageFrom(config?.language);
  setLanguage(language);
  const llamaDir = config?.llamaDir ?? null;

  // Preparación real, no una promesa: sin runtime o sin modelo, «Iniciar
  // modelo» no puede hacer lo que dice. La UI usa esto para guiar, no para
  // dejar un botón muerto.
  const hasRuntime =
    !!llamaDir || installed.length > 0 || !!hardware?.llamaServer;
  const hasModel = !!selectedModel;
  const idleLabel = !hasRuntime
    ? t("Sin motor")
    : !hasModel
      ? t("Sin modelo")
      : t("Listo para arrancar");

  // El build activo es el que contiene el binario reportado por telemetría,
  // no el primero de la lista (con varios builds se descuelcan).
  const normalizePath = (value: string) => value.replace(/\//g, "\\").toUpperCase();
  const activeServerPath = hardware?.llamaServer ?? null;
  const activeBuild = activeServerPath
    ? installed.find(
        (build) =>
          (build.llamaServer &&
            normalizePath(build.llamaServer) === normalizePath(activeServerPath)) ||
          normalizePath(activeServerPath).startsWith(
            `${normalizePath(build.dir)}\\`,
          ),
      )
    : undefined;
  const localServerHost =
    server?.host === "0.0.0.0" || server?.host === "::" || server?.host === "[::]"
      ? "127.0.0.1"
      : (server?.host ?? "127.0.0.1");
  const serverBaseUrl = server?.running
    ? `http://${localServerHost}:${server.port}`
    : null;
  const serverApiUrl = serverBaseUrl ? `${serverBaseUrl}/v1` : null;
  const vramTotalMib = dedicatedGpu?.vramTotalMib ?? 0;

  const openChat = useCallback(async () => {
    if (!serverBaseUrl) return;
    try {
      await openUrl(serverBaseUrl);
    } catch (error) {
      toast.push(`No se pudo abrir el chat: ${String(error)}`, "danger");
    }
  }, [serverBaseUrl, toast]);

  const vramUsedMib = dedicatedGpu
    ? Math.max(0, dedicatedGpu.vramTotalMib - dedicatedGpu.vramFreeMib)
    : 0;
  const ramRatio = ramTotal > 0 ? ramUsed / ramTotal : 0;
  const vramRatio = vramTotalMib > 0 ? vramUsedMib / vramTotalMib : 0;
  const cpuTone = cpuPct > 90 ? "danger" : cpuPct > 70 ? "warn" : undefined;
  const gpuPct = snap?.gpu?.percent ?? null;
  const gpuTone =
    gpuPct === null ? undefined : gpuPct > 90 ? "danger" : gpuPct > 70 ? "warn" : undefined;
  const ramSpeed = hardware?.ram.speedMhz ?? null;
  const acceleratorLabel = !hardware
    ? "—"
    : [
        hardware.accelerators.hasVulkan && "Vulkan",
        hardware.accelerators.hasCuda && "CUDA",
        hardware.accelerators.hasRocm && "ROCm",
      ]
        .filter(Boolean)
        .join(" · ") || "CPU";

  useEffect(() => {
    const id = setTimeout(() => void refreshInstalled(), 500);
    return () => clearTimeout(id);
  }, [llamaDir, refreshInstalled]);

  return (
    <div className="flex h-full flex-col">
      <a href="#main" className="skip-link">
        {t("Saltar al contenido")}
      </a>
      {/* ==================================================================
          Barra de la ventana: chrome propio de la app. La zona vacía
          arrastra la ventana y los controles imitan la jerarquía visual
          del resto de la interfaz.
          ================================================================== */}
      <header className="app-titlebar" data-tauri-drag-region>
        <div className="app-titlebar-brand" data-tauri-drag-region>
          <span
            className="pointer-events-none flex h-7 w-7 shrink-0 items-center justify-center"
            data-tauri-drag-region
            aria-hidden
          >
            <Logo size={28} />
          </span>
          <h1 className="app-titlebar-name" data-tauri-drag-region>
            EzLLM
          </h1>
        </div>

        {config && (
          <ConfigBar
            config={config}
            selectedModel={selectedModel}
            selectedMmproj={selectedMmproj}
            selectedDraft={selectedDraft}
            onSelect={onModelPicked}
            onConfigChange={saveConfig}
          />
        )}

        <div className="app-titlebar-grow" data-tauri-drag-region />

        <WindowControls />
      </header>

      <div className="flex min-h-0 flex-1">
        {/* ==================================================================
            Barra lateral: runtime, equipo y control del servidor.

            El control del servidor vive AQUÍ y en ningún otro sitio. La barra
            reúne el estado que antes estaba repartido entre las tres vistas.
            ================================================================== */}
        <aside className="app-sidebar flex w-[16.5rem] shrink-0 flex-col border-r border-base-800 bg-base-950">
          <nav
            className="sidebar-nav"
            role="tablist"
            aria-label="Espacio de trabajo"
            onKeyDown={(event) => {
              if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
              event.preventDefault();
              const current = WORKSPACE_TABS.findIndex((item) => item.id === tab);
              const nextIndex =
                event.key === "Home"
                  ? 0
                  : event.key === "End"
                    ? WORKSPACE_TABS.length - 1
                    : (current +
                        (event.key === "ArrowRight" ? 1 : -1) +
                        WORKSPACE_TABS.length) %
                      WORKSPACE_TABS.length;
              const next = WORKSPACE_TABS[nextIndex];
              setTab(next.id);
              setVisited((current) =>
                current.includes(next.id) ? current : [...current, next.id],
              );
              requestAnimationFrame(() =>
                document.getElementById(`workspace-tab-${next.id}`)?.focus(),
              );
            }}
          >
            {WORKSPACE_TABS.map((item) => {
              const Icon = item.icon;
              return (
                <button
                  key={item.id}
                  id={`workspace-tab-${item.id}`}
                  type="button"
                  role="tab"
                  aria-selected={tab === item.id}
                  aria-controls={`workspace-panel-${item.id}`}
                  tabIndex={tab === item.id ? 0 : -1}
                  onClick={() => showTab(item.id)}
                  className={clsx(
                    "sidebar-nav-item",
                    tab === item.id && "sidebar-nav-item-on",
                  )}
                >
                  <Icon size={13} />
                  {t(item.label)}
                </button>
              );
            })}
          </nav>
          {/* --- Entorno: runtime, hardware y telemetría viva --- */}
        <div className="app-sidebar-machine min-h-0 flex-1 overflow-y-auto">
          <div className="p-3">
            <div className="mb-2 flex items-center justify-between gap-2">
              <span className="flex items-center gap-1.5 text-meta font-medium text-ink-300">
                <HardDrive size={12} className="text-ink-500" />
                llama.cpp
              </span>
              <span
                className="mono truncate text-meta text-ink-200"
                title={activeServerPath ?? installed[0]?.dir}
              >
                {activeBuild?.tag ?? installed[0]?.tag ?? (hardware?.llamaServer ? "Manual" : "Sin instalar")}
              </span>
            </div>

            <div className="mt-2 flex items-baseline justify-between gap-2 text-meta">
              <span className="text-ink-400">{t("Aceleración")}</span>
              <span className="truncate text-ink-300">{acceleratorLabel}</span>
            </div>

            <div className="mt-1.5 flex items-baseline justify-between gap-2 text-meta">
              <span className="text-ink-400">{t("SO")}</span>
              <span className="truncate text-ink-300">
                {hardware ? `${hardware.os} · ${hardware.arch}` : "—"}
              </span>
            </div>
          </div>

          <div className="border-t border-base-800 p-3">
            <div className="mb-2 flex items-baseline justify-between gap-2">
              <span className="text-meta font-medium text-ink-300">{t("Equipo")}</span>
              <span className="text-meta text-ink-500">
                {hardware ? `${hardware.cpu.logicalThreads} ${t("hilos")}` : "—"}
              </span>
            </div>

            <div className="space-y-2.5">
              <div>
                <div className="flex items-baseline justify-between gap-2 text-meta">
                  <span className="flex items-center gap-1.5 text-ink-400">
                    <Cpu size={11} /> CPU
                  </span>
                  <span className="mono text-ink-200">
                    {snap ? `${cpuPct.toFixed(0)}%` : "—"}
                  </span>
                </div>
                <p
                  className="mt-0.5 truncate text-meta text-ink-500"
                  title={hardware?.cpu.model ?? undefined}
                >
                  {hardware?.cpu.model ?? "Procesador no detectado"}
                </p>
                <Sparkline
                  samples={tel.cpuSeries.values()}
                  height={20}
                  tone={cpuTone}
                  label={t("Uso de CPU")}
                  className="mt-1"
                />
              </div>

              <div>
                <div className="flex items-baseline justify-between gap-2 text-meta">
                  <span className="flex items-baseline gap-1.5 text-ink-400">
                    RAM
                    {ramSpeed !== null && (
                      <span className="text-ink-500">· {ramSpeed} MHz</span>
                    )}
                  </span>
                  <span className="mono text-ink-300">
                    {ramTotal > 0
                      ? `${formatBytes(ramUsed)} / ${formatBytes(ramTotal, 0)}`
                      : "—"}
                  </span>
                </div>
                <div
                  className="sidebar-track mt-1"
                  role="meter"
                  aria-label="RAM en uso"
                  aria-valuenow={Math.round(ramRatio * 100)}
                  aria-valuemin={0}
                  aria-valuemax={100}
                >
                  <span style={{ transform: `scaleX(${Math.min(1, ramRatio)})` }} />
                </div>
              </div>

              {dedicatedGpu && (
                <div>
                  <div className="flex items-baseline justify-between gap-2">
                    <p
                      className="flex min-w-0 items-center gap-1.5 truncate text-meta text-ink-300"
                      title={dedicatedGpu.name}
                    >
                      <Gpu size={11} className="shrink-0 text-ink-500" />
                      {dedicatedGpu.name}
                    </p>
                    <span className="mono shrink-0 text-meta text-ink-200">
                      {gpuPct !== null ? `${gpuPct.toFixed(0)}%` : "—"}
                    </span>
                  </div>
                  <Sparkline
                    samples={tel.gpuSeries.values()}
                    height={20}
                    tone={gpuTone}
                    label={t("Uso de GPU")}
                    className="mt-1"
                  />
                  {vramTotalMib > 0 && (
                    <>
                      <div className="mt-0.5 flex items-baseline justify-between gap-2 text-meta">
                        <span className="text-ink-500">VRAM</span>
                        <span className="mono text-ink-400">
                          {formatBytes(vramUsedMib * 1024 * 1024, 0)} /{" "}
                          {formatBytes(vramTotalMib * 1024 * 1024, 0)}
                        </span>
                      </div>
                      <div
                        className="sidebar-track mt-1"
                        role="meter"
                        aria-label="VRAM en uso"
                        aria-valuenow={Math.round(vramRatio * 100)}
                        aria-valuemin={0}
                        aria-valuemax={100}
                      >
                        <span style={{ transform: `scaleX(${Math.min(1, vramRatio)})` }} />
                      </div>
                    </>
                  )}
                </div>
              )}

            </div>
          </div>
        </div>

        {/* --- Control del servidor: único en toda la app --- */}
        <div className="shrink-0 space-y-2.5 border-t border-base-800 p-3">
          <div className="flex items-center justify-between gap-2">
            <span className="app-sidebar-section text-meta font-medium text-ink-300">
              {t("Servidor local")}
            </span>
            <span
              className={clsx(
                "pulse-dot",
                server?.running
                  ? server.health
                    ? "pulse-dot-ok"
                    : "pulse-dot-warn"
                  : "pulse-dot-idle",
              )}
              aria-hidden
            />
          </div>

          <div className="app-sidebar-section rounded-control border border-base-800 bg-base-900/55 px-2.5 py-2">
            <div className="flex items-center justify-between gap-2">
              <span className="text-meta text-ink-500">{t("IP local")}</span>
              <p className="mono min-w-0 flex-1 truncate text-right text-meta text-ink-200">
                {server?.running
                  ? `${localServerHost}:${server.port}`
                  : t("Servidor detenido")}
              </p>
              {server?.running && (
                <button
                  onClick={() => void tel.measureSpeed()}
                  className="btn-quiet shrink-0 cursor-pointer rounded-control p-1 text-ink-500 hover:text-ink-100"
                  title="Medir velocidad"
                  aria-label="Medir velocidad"
                >
                  <Gauge size={11} />
                </button>
              )}
            </div>
            {server?.running && serverApiUrl && (
              <div className="mt-1.5 flex items-baseline justify-between gap-2">
                <span className="text-meta text-ink-500">{t("API")}</span>
                <span
                  className="mono min-w-0 truncate text-right text-meta text-ink-300"
                  title={serverApiUrl}
                >
                  {serverApiUrl}
                </span>
              </div>
            )}
            {server?.running && server.health && serverBaseUrl && (
              <button
                type="button"
                onClick={() => void openChat()}
                className="mt-1.5 flex w-full cursor-pointer items-center justify-center gap-1.5 rounded-control border border-accent-500/30 bg-accent-500/10 px-2 py-1.5 text-label font-medium text-accent-300 hover:bg-accent-500/20"
                title="Abrir el chat web de llama-server"
              >
                <ExternalLink size={12} />
                {t("Abrir chat")}
              </button>
            )}
            <p
              className="mt-1.5 truncate text-meta text-ink-500"
              title={server?.models.join(", ") || undefined}
            >
              {server?.running
                ? server.models.length > 0
                  ? server.models.join(", ")
                  : server.health
                    ? t("Modelo desplegado")
                    : t("Cargando el modelo…")
                : idleLabel}
            </p>
            {server?.running && tel.speed && (
              <p className="mono mt-1 text-meta text-ink-400">
                {tel.speed.predictedPerSecond.toFixed(1)} tok/s
              </p>
            )}
          </div>
        </div>
        </aside>

        {/* --- Contenido: tres espacios de trabajo, una sola barra --- */}
        <main id="main" tabIndex={-1} className="flex min-h-0 min-w-0 flex-1 flex-col">
          <DownloadBar downloads={downloads} onOpen={() => showTab("models")} />
          <div className="min-h-0 flex-1 overflow-y-auto">
            {WORKSPACE_TABS.map((item) => {
              const active = tab === item.id;
              const mounted = visited.includes(item.id);
              return (
                <div
                  key={item.id}
                  id={`workspace-panel-${item.id}`}
                  role="tabpanel"
                  aria-labelledby={`workspace-tab-${item.id}`}
                  tabIndex={-1}
                  className={
                    active
                      ? clsx(
                          "app-content mx-auto max-w-[68rem] px-6 py-5 outline-none",
                          item.id === "models"
                            ? "flex h-full min-h-0 flex-col"
                            : "space-y-5",
                        )
                      : "hidden"
                  }
                >
                  {mounted && item.id === "run" && (
                    <DeployView
                      config={config}
                      server={server}
                      selectedModel={selectedModel}
                      selectedMmproj={selectedMmproj}
                      selectedDraft={selectedDraft}
                      onSelect={onModelPicked}
                      onConfigChange={saveConfig}
                      onPickModel={(slot) => void pickModelFile(slot)}
                      onStart={handleStart}
                      onStop={handleStop}
                      onRestart={handleRestart}
                      onNavigate={showTab}
                      hasRuntime={hasRuntime}
                      hasModel={hasModel}
                      vramTotalMib={vramTotalMib}
                      ramAvailableGb={hardware?.ram.availableGb ?? 0}
                      serverBusy={busy}
                    />
                  )}
                  {mounted && item.id === "models" && (
                    <ModelsView
                      modelsDir={modelsDir}
                      onUseModel={useModelForRun}
                      downloads={downloads}
                      vramTotalMib={vramTotalMib}
                    />
                  )}
                  {mounted && item.id === "runtime" && (
                    <ReleasesView
                      onInstalledChange={refreshInstalled}
                      onPickLlamaFolder={pickLlamaFolder}
                      onUseBuild={useLlamaBuild}
                      onStopServer={handleStop}
                      serverRunning={!!server?.running}
                      embedded
                    />
                  )}
                  {mounted && item.id === "settings" && (
                    <SettingsView
                      modelsDir={modelsDir}
                      llamaDir={config?.llamaDir ?? installed[0]?.dir ?? ""}
                      configPath={configPath}
                      language={language}
                      githubToken={config?.githubToken ?? ""}
                      onChangeLanguage={changeLanguage}
                      onChangeToken={(token) => {
                        const current = configRef.current;
                        if (!current) return;
                        saveConfig({ ...current, githubToken: token || null });
                        toast.push(
                          "Token de GitHub guardado. Pulsa Actualizar en Motor.",
                          "success",
                        );
                      }}
                      onPickModels={() => void pickModelsFolder()}
                      onPickLlama={() => void pickLlamaFolder()}
                      onOpenModels={() => void openModelsFolder()}
                      onOpenLlama={() => void openLlamaFolder()}
                      onOpenConfig={() => void openConfigFolder()}
                    />
                  )}
                </div>
              );
            })}
          </div>
        </main>
      </div>
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
