//! Catálogo de argumentos de `llama-server` para la app.
//!
//! La fuente es el propio binario instalado: `llama-server --help`. Así el
//! catálogo cambia con la versión y nunca queda desfasado respecto a las flags
//! que el proceso acepta de verdad.

use serde::Serialize;
use std::process::Command;

use crate::config::AppConfig;
use crate::models;

const HELP_COLUMN: usize = 40;

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct HelpOption {
    /// Identificador estable: el flag largo preferido sin guiones.
    pub key: String,
    /// Flag que se escribe al añadirlo desde la biblioteca.
    pub canonical: String,
    /// Todos los alias, incluidos los negativos.
    pub flags: Vec<String>,
    /// Placeholder cuando la opción lleva valor.
    pub value_hint: Option<String>,
    /// Valor por defecto publicado por llama.cpp.
    pub default_value: Option<String>,
    /// Sección original del `--help`, sin traducir.
    pub section: String,
    /// Descripción oficial. La UI añade texto en español para las flags comunes.
    pub description: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct HelpCatalog {
    pub source: String,
    pub version: Option<String>,
    pub options: Vec<HelpOption>,
}

/// Ejecuta `llama-server --help` con el runtime configurado.
pub fn read(cfg: &AppConfig) -> Result<HelpCatalog, String> {
    let dir = cfg
        .llama_dir
        .clone()
        .map(std::path::PathBuf::from)
        .unwrap_or_else(crate::config::llama_dir);
    let exe = models::find_llama_server(&dir).ok_or_else(|| {
        format!(
            "No se encuentra llama-server en {}. Instala un runtime para leer su catálogo de argumentos.",
            dir.display()
        )
    })?;

    let mut help_cmd = Command::new(&exe);
    help_cmd.arg("--help");
    hide_console(&mut help_cmd);
    let output = help_cmd
        .output()
        .map_err(|e| format!("No se pudo ejecutar {} --help: {e}", exe.display()))?;
    let text = String::from_utf8_lossy(&output.stdout);
    let text = if text.trim().is_empty() {
        String::from_utf8_lossy(&output.stderr).into_owned()
    } else {
        text.into_owned()
    };

    let mut version_cmd = Command::new(&exe);
    version_cmd.arg("--version");
    hide_console(&mut version_cmd);
    let version = version_cmd
        .output()
        .ok()
        .map(|out| {
            String::from_utf8_lossy(&out.stdout)
                .lines()
                .chain(String::from_utf8_lossy(&out.stderr).lines())
                .find(|line| !line.trim().is_empty())
                .map(|line| line.trim().to_string())
        })
        .flatten();

    Ok(HelpCatalog {
        source: exe.to_string_lossy().into_owned(),
        version,
        options: parse(&text),
    })
}

/// Parser del formato estable de `llama.cpp --help`.
///
/// Las descripciones empiezan en la columna 40. Cuando el bloque de flags es
/// más largo, la descripción continúa en la línea siguiente con la misma
/// sangría. Las líneas de continuación con opciones (`- none: ...`) empiezan
/// con un espacio extra y no se confunden con flags nuevas.
pub fn parse(text: &str) -> Vec<HelpOption> {
    let mut options = Vec::new();
    let mut section = "common params".to_string();
    let mut current: Option<PendingOption> = None;

    for raw in text.lines() {
        let line = raw.trim_end_matches('\r');
        if line.trim().is_empty() {
            continue;
        }

        if line.starts_with("-----") && line.ends_with("-----") {
            flush(&mut current, &mut options);
            section = line
                .trim_matches('-')
                .trim()
                .trim_end_matches(" params")
                .trim()
                .to_string();
            continue;
        }

        if line.starts_with('-') {
            flush(&mut current, &mut options);
            current = Some(parse_header(line, &section));
            continue;
        }

        if let Some(option) = current.as_mut() {
            let trimmed = line.trim();
            if trimmed.is_empty() {
                continue;
            }
            if !trimmed.starts_with("(env:") {
                option.description.push(' ');
                option.description.push_str(trimmed);
            }
        }
    }

    flush(&mut current, &mut options);
    options
}

#[derive(Debug)]
struct PendingOption {
    flags: Vec<String>,
    value_hint: Option<String>,
    section: String,
    description: String,
}

fn parse_header(line: &str, section: &str) -> PendingOption {
    let (left, inline_description) = if line.len() > HELP_COLUMN {
        let before = &line[..HELP_COLUMN];
        let padding = before.chars().rev().take_while(|c| *c == ' ').count();
        if padding >= 2 {
            (before.trim_end(), line[HELP_COLUMN..].trim_start())
        } else {
            (line.trim(), "")
        }
    } else {
        (line.trim(), "")
    };

    let mut flags = Vec::new();
    let mut value_parts = Vec::new();
    let mut in_value = false;

    for raw in left.split_whitespace() {
        let token = raw.trim_end_matches(',');
        if !token.is_empty() && token.starts_with('-') && !in_value {
            flags.push(token.to_string());
        } else {
            in_value = true;
            value_parts.push(raw);
        }
    }

    PendingOption {
        flags,
        value_hint: (!value_parts.is_empty()).then(|| value_parts.join(" ")),
        section: section.to_string(),
        description: inline_description.trim().to_string(),
    }
}

fn flush(current: &mut Option<PendingOption>, options: &mut Vec<HelpOption>) {
    let Some(pending) = current.take() else {
        return;
    };
    if pending.flags.is_empty() {
        return;
    }

    let canonical = pending
        .flags
        .iter()
        .find(|flag| flag.starts_with("--") && !flag.starts_with("--no-"))
        .or_else(|| pending.flags.iter().find(|flag| flag.starts_with("--")))
        .or_else(|| pending.flags.first())
        .cloned()
        .unwrap_or_default();
    if canonical.is_empty() {
        return;
    }

    let key = canonical.trim_start_matches('-').to_string();
    let description = clean_description(&pending.description);
    let default_value = default_value(&description);

    options.push(HelpOption {
        key,
        canonical,
        flags: pending.flags,
        value_hint: pending.value_hint,
        default_value,
        section: pending.section,
        description,
    });
}

fn clean_description(text: &str) -> String {
    let mut out = text.split_whitespace().collect::<Vec<_>>().join(" ");
    for marker in ["[(more info)]", "(more info)"] {
        if let Some(index) = out.find(marker) {
            out.truncate(index);
        }
    }
    out.trim().to_string()
}

fn default_value(description: &str) -> Option<String> {
    let lower = description.to_ascii_lowercase();
    let start = lower.find("default:")? + "default:".len();
    let rest = description[start..].trim_start();
    let end = rest.find(')').unwrap_or(rest.len());
    let value = rest[..end].trim().trim_end_matches(',').trim();
    (!value.is_empty()).then(|| value.to_string())
}

#[cfg(target_os = "windows")]
fn hide_console(command: &mut Command) {
    use std::os::windows::process::CommandExt;
    const CREATE_NO_WINDOW: u32 = 0x0800_0000;
    command.creation_flags(CREATE_NO_WINDOW);
}

#[cfg(not(target_os = "windows"))]
fn hide_console(_command: &mut Command) {}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_short_long_and_value_options() {
        let text = "\
----- common params -----

-t,    --threads N                      number of CPU threads (default: -1)
                                        (env: LLAMA_ARG_THREADS)
--rope-scaling {none,linear,yarn}       RoPE scaling method
--flash-attn [on|off|auto]              set Flash Attention (default: auto)
-kvo,  --kv-offload, -nkvo, --no-kv-offload
                                        whether to enable KV cache offloading (default: enabled)
";
        let options = parse(text);
        assert_eq!(options.len(), 4);
        assert_eq!(options[0].key, "threads");
        assert_eq!(options[0].value_hint.as_deref(), Some("N"));
        assert_eq!(options[0].default_value.as_deref(), Some("-1"));
        assert_eq!(options[1].value_hint.as_deref(), Some("{none,linear,yarn}"));
        assert_eq!(options[2].default_value.as_deref(), Some("auto"));
        assert!(options[3].flags.iter().any(|flag| flag == "--no-kv-offload"));
    }

    #[test]
    fn keeps_section_and_joins_continuation_lines() {
        let text = "\
----- example-specific params -----

--reasoning-preserve, --no-reasoning-preserve
                                        preserve reasoning trace in the full history,
                                        not just the last message (default: enabled)
";
        let options = parse(text);
        assert_eq!(options[0].section, "example-specific");
        assert!(options[0].description.contains("full history"));
        assert_eq!(options[0].default_value.as_deref(), Some("enabled"));
    }
}
