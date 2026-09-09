import serverPackage from "../../../server/package.json";

const SCHEMA_VERSION = 1;

export function normalizeShortcutName(name) {
  return String(name ?? "").trim().toLowerCase();
}

function normalizeShortcut(shortcut) {
  return {
    label: String(shortcut.name ?? shortcut.label ?? "").trim(),
    command: String(shortcut.command ?? "").trim(),
    description: String(shortcut.description ?? ""),
    icon: shortcut.icon ? String(shortcut.icon).trim() : "",
    color: shortcut.color ? String(shortcut.color).trim() : "",
    warning: Boolean(shortcut.confirmBeforeSending ?? shortcut.warning ?? false),
  };
}

export function exportShortcuts(shortcuts) {
  const payload = {
    schemaVersion: SCHEMA_VERSION,
    exportedAt: new Date().toISOString(),
    exportedFrom: `WhistleIRC v${serverPackage.version}`,
    shortcuts: shortcuts.map((shortcut) => ({
      name: shortcut.label ?? shortcut.name ?? "",
      command: shortcut.command ?? "",
      description: shortcut.description || "",
      icon: shortcut.icon || null,
      color: shortcut.color || null,
      confirmBeforeSending: Boolean(shortcut.warning ?? shortcut.confirmBeforeSending),
    })),
  };
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `whistleirc-shortcuts-${new Date().toISOString().slice(0, 10)}.json`;
  link.click();
  URL.revokeObjectURL(url);
}

export async function parseShortcutsFile(file) {
  try {
    const parsed = JSON.parse(await file.text());
    if (parsed?.schemaVersion !== SCHEMA_VERSION) return { valid: false, errors: ["Unsupported file version"] };
    if (!Array.isArray(parsed.shortcuts)) return { valid: false, errors: ["Shortcuts must be an array"] };
    const errors = [];
    const shortcuts = parsed.shortcuts.map((shortcut, index) => {
      const normalized = normalizeShortcut(shortcut || {});
      if (!normalized.label || !normalized.command) errors.push(`Shortcut ${index + 1} must have a name and command`);
      return normalized;
    });
    if (errors.length) return { valid: false, errors };
    const names = new Set();
    if (shortcuts.some((shortcut) => {
      const normalizedName = normalizeShortcutName(shortcut.label);
      if (names.has(normalizedName)) return true;
      names.add(normalizedName);
      return false;
    })) {
      return { valid: false, errors: ["Duplicate names found in import file"] };
    }
    return { valid: true, shortcuts };
  } catch {
    return { valid: false, errors: ["Invalid JSON file"] };
  }
}

export function detectConflicts(importedShortcuts, existingShortcuts) {
  return importedShortcuts.map((imported) => ({
    imported,
    conflictsWith: existingShortcuts.find(
      (existing) => normalizeShortcutName(existing.label ?? existing.name) === normalizeShortcutName(imported.label),
    ) || null,
  }));
}
