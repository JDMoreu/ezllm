import { useCallback, useEffect, useRef, useState } from "react";
import clsx from "clsx";
import {
  Activity,
  Boxes,
  Cpu,
  ExternalLink,
  HardDrive,
  MemoryStick,
  Play,
  Settings2,
} from "lucide-react";
import { open } from "@tauri-apps/plugin-dialog";
import { openUrl } from "@tauri-apps/plugin-opener";
import { getCurrentWebview } from "@tauri-apps/api/webview";
import { getVersion } from "@tauri-apps/api/app";

import { api } from "./lib/api";
import { Button, ToastProvider, useToast } from "./components/ui";
import { Sparkline } from "./components/Telemetry";
import GpuMemoryPanel, { GpuAdapterSelect, pickGpu } from "./components/GpuMemoryPanel";
import WindowControls from "./components/WindowControls";
import { Logo } from "./components/Logo";
import DownloadBar from "./components/DownloadBar";
import ConfigBar from "./components/ConfigBar";
import { basename, dirname, formatBytes } from "./lib/format";
import { languageFrom, setLanguage, t, type Language } from "./lib/i18n";
import { useDownloads } from "./lib/useDownloads";
import { useTelemetry } from "./lib/useTelemetry";
import type {
  AppConfig,
  DiskSpace,
  HardwareReport,
  InstalledBuild,
  ServerStatus,
} from "./types";

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
  const [gpuId, setGpuId] = useState<string>();
  const [appVersion, setAppVersion] = useState<string | null>(null);
  const [disk, setDisk] = useState<DiskSpace | null>(null);
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

  // Disco de la carpeta de modelos: lo mide Windows. Cambia despacio
  // (descargas), así que basta con leerlo cada 20 s.
  useEffect(() => {
    if (!modelsDir) return;
    let alive = true;
    const load = () =>
      api
        .telemetryDisk(modelsDir)
        .then((value) => alive && setDisk(value))
        .catch(() => alive && setDisk(null));
    void load();
    const id = window.setInterval(load, 20000);
    return () => {
      alive = false;
      window.clearInterval(id);
    };
  }, [modelsDir]);

  // La versión sale del binario, no del código: siempre coincide con la
  // build que el usuario tiene instalada.
  useEffect(() => {
    getVersion()
      .then(setAppVersion)
      .catch(() => setAppVersion(null));
  }, []);

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
  const gpuMemory = snap?.gpuMemory ?? [];
  const monitoredGpu = pickGpu(gpuMemory, gpuId);
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
  // Estado del servidor con palabra propia: el color nunca va solo.
  const serverTone: "ok" | "warn" | "idle" = server?.running
    ? server.health
      ? "ok"
      : "warn"
    : "idle";
  const serverStateLabel =
    serverTone === "ok"
      ? t("En marcha")
      : serverTone === "warn"
        ? t("Cargando")
        : t("Detenido");
  const vramTotalMib = dedicatedGpu?.vramTotalMib ?? 0;

  const openChat = useCallback(async () => {
    if (!serverBaseUrl) return;
    try {
      await openUrl(serverBaseUrl);
    } catch (error) {
      toast.push(`No se pudo abrir el chat: ${String(error)}`, "danger");
    }
  }, [serverBaseUrl, toast]);

  const ramRatio = ramTotal > 0 ? ramUsed / ramTotal : 0;
  const diskRatio =
    disk && disk.totalBytes > 0
      ? Math.min(1, (disk.totalBytes - disk.freeBytes) / disk.totalBytes)
      : 0;
  const diskTone = !disk
    ? undefined
    : disk.freeBytes / disk.totalBytes < 0.05
      ? "danger"
      : disk.freeBytes / disk.totalBytes < 0.1
        ? "warn"
        : undefined;
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
          {appVersion && (
            <span className="app-titlebar-version mono" data-tauri-drag-region>
              v{appVersion}
            </span>
          )}
        </div>

        {/* Secciones de la app: arriba, a la altura de la marca. El lateral
            queda solo para el estado del motor, el equipo y el servidor. */}
        <nav
          className="titlebar-nav"
          role="tablist"
          aria-orientation="horizontal"
          aria-label="Espacio de trabajo"
          onKeyDown={(event) => {
            if (!["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
            event.preventDefault();
            const current = WORKSPACE_TABS.findIndex((item) => item.id === tab);
            const nextIndex =
              event.key === "Home"
                ? 0
                : event.key === "End"
                  ? WORKSPACE_TABS.length - 1
                  : (current +
                      (["ArrowRight", "ArrowDown"].includes(event.key) ? 1 : -1) +
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
                title={`Ctrl+${WORKSPACE_TABS.indexOf(item) + 1}`}
                className={clsx(
                  "titlebar-nav-item",
                  tab === item.id && "titlebar-nav-item-on",
                )}
              >
                <Icon size={15} aria-hidden />
                <span>{t(item.label)}</span>
              </button>
            );
          })}
        </nav>

        <div className="app-titlebar-grow" data-tauri-drag-region />

        <WindowControls />
      </header>

      <div className="flex min-h-0 flex-1">
        {/* ==================================================================
            Barra lateral: runtime, equipo y estado del servidor.

            El control del servidor vive AQUÍ y en ningún otro sitio. La barra
            reúne el estado que antes estaba repartido entre las tres vistas.
            ================================================================== */}
        <aside className="app-sidebar flex w-[17.5rem] shrink-0 flex-col border-r border-base-800 bg-base-950">
          {/* --- Entorno: runtime, hardware y telemetría viva ---
              Los tres bloques del lateral comparten anatomía: una cabecera
              (título y dato breve) y filas etiqueta → valor. */}
          <div className="app-sidebar-machine min-h-0 flex-1 overflow-y-auto">
            <section className="sidebar-block" aria-labelledby="sidebar-machine">
              <header className="sidebar-head">
                <h3 id="sidebar-machine">{t("Equipo")}</h3>
              </header>

              <div className="telemetry-stack">
                <div className="sidebar-metric">
                  <div className="sidebar-metric-head">
                    <span className="sidebar-metric-label">
                      <Activity aria-hidden /> GPU
                    </span>
                    <span
                      className="sidebar-metric-value mono"
                      title={t("Motor más activo")}
                    >
                      {gpuPct !== null ? `${gpuPct.toFixed(0)}%` : "—"}
                    </span>
                  </div>
                  {monitoredGpu ? (
                    <GpuAdapterSelect
                      devices={gpuMemory}
                      value={monitoredGpu}
                      onChange={setGpuId}
                    />
                  ) : (
                    <p className="sidebar-metric-sub">{t("Motor más activo")}</p>
                  )}
                  <Sparkline
                    samples={tel.gpuSeries.values()}
                    height={20}
                    tone={gpuTone}
                    label={t("Uso de GPU")}
                    className="sidebar-spark"
                  />
                </div>

                <GpuMemoryPanel device={monitoredGpu} paused={tel.paused} />

                <div className="sidebar-metric">
                  <div className="sidebar-metric-head">
                    <span className="sidebar-metric-label">
                      <Cpu aria-hidden /> CPU
                    </span>
                    <span className="sidebar-metric-value mono">
                      {snap ? `${cpuPct.toFixed(0)}%` : "—"}
                    </span>
                  </div>
                  {/* Los hilos son del procesador: van con su modelo, delante
                      para que un nombre largo se recorte por el final. */}
                  <p
                    className="sidebar-metric-sub"
                    title={hardware?.cpu.model ?? undefined}
                  >
                    {hardware
                      ? `${hardware.cpu.logicalThreads} ${t("hilos")} · ${hardware.cpu.model}`
                      : t("Procesador no detectado")}
                  </p>
                  <Sparkline
                    samples={tel.cpuSeries.values()}
                    height={20}
                    tone={cpuTone}
                    label={t("Uso de CPU")}
                    className="sidebar-spark"
                  />
                </div>

                <div className="sidebar-metric">
                  <div className="sidebar-metric-head">
                    <span className="sidebar-metric-label">
                      <MemoryStick aria-hidden /> RAM
                    </span>
                    <span className="sidebar-metric-value mono">
                      {ramTotal > 0 ? formatBytes(ramUsed) : "—"}
                      {ramTotal > 0 && <small> / {formatBytes(ramTotal, 0)}</small>}
                    </span>
                  </div>
                  {ramSpeed !== null && (
                    <p className="sidebar-metric-sub">{ramSpeed} MHz</p>
                  )}
                  <div
                    className="sidebar-track"
                    data-tone={ramRatio >= 0.95 ? "danger" : ramRatio >= 0.85 ? "warn" : undefined}
                    role="meter"
                    aria-label={t("RAM en uso")}
                    aria-valuenow={Math.round(ramRatio * 100)}
                    aria-valuemin={0}
                    aria-valuemax={100}
                  >
                    <span style={{ transform: `scaleX(${Math.min(1, ramRatio)})` }} />
                  </div>
                </div>

                <div className="sidebar-metric">
                  <div className="sidebar-metric-head">
                    <span className="sidebar-metric-label">
                      <HardDrive aria-hidden /> {t("Disco")}
                    </span>
                    <span className="sidebar-metric-value mono">
                      {disk ? formatBytes(disk.totalBytes - disk.freeBytes, 0) : "—"}
                      {disk && <small> / {formatBytes(disk.totalBytes, 0)}</small>}
                    </span>
                  </div>
                  <p className="sidebar-metric-sub" title={modelsDir}>
                    {disk
                      ? `${formatBytes(disk.freeBytes, 0)} ${t("libres")} · ${disk.root}`
                      : t("Sin lectura disponible")}
                  </p>
                  <div
                    className="sidebar-track"
                    data-tone={diskTone}
                    role="meter"
                    aria-label={t("Disco de los modelos en uso")}
                    aria-valuenow={Math.round(diskRatio * 100)}
                    aria-valuemin={0}
                    aria-valuemax={100}
                  >
                    <span style={{ transform: `scaleX(${diskRatio})` }} />
                  </div>
                </div>
              </div>
            </section>

            <section className="sidebar-block" aria-labelledby="sidebar-runtime">
              <header className="sidebar-head">
                <h3 id="sidebar-runtime">{t("Motor")}</h3>
              </header>
              <dl className="sidebar-rows">
                <div>
                  <dt>llama.cpp</dt>
                  <dd className="mono" title={activeServerPath ?? installed[0]?.dir}>
                    {activeBuild?.tag ??
                      installed[0]?.tag ??
                      (hardware?.llamaServer ? "Manual" : t("Sin instalar"))}
                  </dd>
                </div>
                <div>
                  <dt>{t("Aceleración")}</dt>
                  <dd>{acceleratorLabel}</dd>
                </div>
                <div>
                  <dt>{t("SO")}</dt>
                  <dd>{hardware ? `${hardware.os} · ${hardware.arch}` : "—"}</dd>
                </div>
              </dl>
            </section>
          </div>

          {/* --- Servidor: estado y punto de acceso. El arranque vive en
              Ejecutar para que haya un solo control principal. --- */}
          <section
            className="sidebar-block sidebar-server shrink-0"
            aria-labelledby="sidebar-server"
          >
            <header className="sidebar-head">
              <h3 id="sidebar-server">{t("Servidor")}</h3>
              <span
                className="sidebar-status"
                data-tone={serverTone}
                role="status"
              >
                <span
                  className={clsx("pulse-dot", `pulse-dot-${serverTone}`)}
                  aria-hidden
                />
                <span className="sidebar-status-word">{serverStateLabel}</span>
              </span>
            </header>

            {server?.running ? (
              <>
                <dl className="sidebar-rows">
                  <div>
                    <dt>{t("Dirección")}</dt>
                    <dd className="mono">{`${localServerHost}:${server.port}`}</dd>
                  </div>
                  {serverApiUrl && (
                    <div>
                      <dt>API</dt>
                      <dd className="mono" title={serverApiUrl}>
                        {serverApiUrl}
                      </dd>
                    </div>
                  )}
                  <div>
                    <dt>{t("Modelo")}</dt>
                    <dd title={server.models.join(", ") || undefined}>
                      {server.models.length > 0
                        ? server.models.join(", ")
                        : server.health
                          ? t("Modelo desplegado")
                          : t("Cargando el modelo…")}
                    </dd>
                  </div>
                </dl>

                {server.health && serverBaseUrl && (
                  <div className="sidebar-server-actions">
                    <Button
                      size="sm"
                      variant="ghost"
                      icon={<ExternalLink size={13} />}
                      onClick={() => void openChat()}
                      title={t("Abrir el chat web de llama-server")}
                      className="flex-1"
                    >
                      {t("Abrir chat")}
                    </Button>
                  </div>
                )}
              </>
            ) : (
              <p className="sidebar-idle">{idleLabel}</p>
            )}
          </section>

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
                          "app-content mx-auto max-w-[68rem] px-6 pt-6 pb-6 outline-none",
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
                      header={
                        config
                          ? ({ actions }) => (
                              <ConfigBar
                                config={config}
                                selectedModel={selectedModel}
                                selectedMmproj={selectedMmproj}
                                selectedDraft={selectedDraft}
                                onSelect={onModelPicked}
                                onConfigChange={saveConfig}
                                actions={actions}
                              />
                            )
                          : undefined
                      }
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
