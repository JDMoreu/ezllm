import { useEffect, useState } from "react";
import { Copy, Minus, Square, X } from "lucide-react";
import { getCurrentWindow } from "@tauri-apps/api/window";

export default function WindowControls() {
  const appWindow = getCurrentWindow();
  const [maximized, setMaximized] = useState(false);

  useEffect(() => {
    let unlisten: (() => void) | undefined;
    let alive = true;

    void (async () => {
      try {
        const value = await appWindow.isMaximized();
        if (alive) setMaximized(value);
        unlisten = await appWindow.onResized(async () => {
          const next = await appWindow.isMaximized();
          if (alive) setMaximized(next);
        });
      } catch {
        // El navegador de desarrollo no expone la ventana de Tauri.
      }
    })();

    return () => {
      alive = false;
      unlisten?.();
    };
  }, [appWindow]);

  return (
    <div className="window-controls">
      <button
        type="button"
        className="window-control"
        onClick={() => void appWindow.minimize()}
        aria-label="Minimizar"
        title="Minimizar"
      >
        <Minus size={13} />
      </button>
      <button
        type="button"
        className="window-control"
        onClick={() => void appWindow.toggleMaximize()}
        aria-label={maximized ? "Restaurar" : "Maximizar"}
        title={maximized ? "Restaurar" : "Maximizar"}
      >
        {maximized ? <Copy size={11} /> : <Square size={10} />}
      </button>
      <button
        type="button"
        className="window-control window-control-close"
        onClick={() => void appWindow.close()}
        aria-label="Cerrar"
        title="Cerrar"
      >
        <X size={13} />
      </button>
    </div>
  );
}
