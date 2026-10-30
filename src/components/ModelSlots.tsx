import { FolderOpen, X } from "lucide-react";

import { basename } from "../lib/format";
import { t } from "../lib/i18n";
import type { ModelRole } from "../types";
import Hint from "./Hint";

const ROLES: ModelRole[] = ["primary", "mmproj", "draft"];

/**
 * Los tres archivos del servidor en una sola tira: etiqueta, nombre y dos
 * iconos. El nombre y la carpeta abren el explorador, que arranca en la
 * carpeta de modelos; no hay lista intermedia.
 */
export default function ModelSlots({
  primary,
  mmproj,
  draft,
  onChange,
  onBrowse,
}: {
  primary: string | null;
  mmproj: string | null;
  draft: string | null;
  onChange: (slot: ModelRole, path: string | null) => void;
  onBrowse: (slot: ModelRole) => void;
}) {
  const paths: Record<ModelRole, string | null> = { primary, mmproj, draft };
  const labels: Record<ModelRole, string> = {
    primary: t("Principal"),
    mmproj: t("Multimodal"),
    draft: t("MTP"),
  };
  const empty: Record<ModelRole, string> = {
    primary: t("Elegir modelo…"),
    mmproj: t("Ninguno"),
    draft: t("Ninguno"),
  };

  return (
    <div className="execution-models">
      {ROLES.map((role) => {
        const path = paths[role];
        const name = path ? basename(path) : empty[role];
        return (
          <div className="execution-model" key={role}>
            <span className="execution-model-label">{labels[role]}</span>
            <button
              type="button"
              className="execution-model-value"
              data-empty={path ? undefined : "true"}
              onClick={() => onBrowse(role)}
              aria-label={`${labels[role]}: ${name}`}
              title={path ?? undefined}
            >
              {name}
            </button>
            {path && (
              <Hint label={`${t("Quitar")} ${labels[role]}`}>
                <button
                  type="button"
                  className="execution-model-action"
                  onClick={() => onChange(role, null)}
                  aria-label={`${t("Quitar")} ${labels[role]}`}
                >
                  <X size={12} aria-hidden />
                </button>
              </Hint>
            )}
            <Hint label={t("Buscar archivo…")}>
              <button
                type="button"
                className="execution-model-action"
                onClick={() => onBrowse(role)}
                aria-label={`${t("Buscar archivo…")}: ${labels[role]}`}
              >
                <FolderOpen size={13} aria-hidden />
              </button>
            </Hint>
          </div>
        );
      })}
    </div>
  );
}
