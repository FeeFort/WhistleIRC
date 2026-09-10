import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import { openInBrowser } from "./browser.js";
import { SysTrayInstance, SysTrayOptions } from "./types.js";

const require = createRequire(import.meta.url);
const systray2Module = require("systray2") as { default?: unknown };
const SysTray = (systray2Module.default ?? systray2Module) as new (
  options: SysTrayOptions,
) => SysTrayInstance;

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function getIconBase64(): string {
  const iconPath =
    process.platform === "win32"
      ? path.join(__dirname, "..", "icon.ico")
      : path.join(__dirname, "..", "icon.png");
  const icon = fs.readFileSync(iconPath);
  console.log(`[Tray] Loading icon: ${iconPath} (${icon.length} bytes)`);
  return icon.toString("base64");
}

interface TrayOptions {
  port: number;
  onQuit: () => void;
}

export function createTray({ port, onQuit }: TrayOptions): SysTrayInstance {
  console.log(`[Tray] Creating tray for ${process.platform}/${process.arch} on port ${port}`);
  const openItem = {
    title: "Open WhistleIRC",
    tooltip: "Open in browser",
    checked: false,
    enabled: true,
    click: () => openInBrowser(`http://localhost:${port}`),
  };

  const quitItem = {
    title: "Quit",
    tooltip: "",
    checked: false,
    enabled: true,
    click: onQuit,
  };

  const systray = new SysTray({
    menu: {
      icon: getIconBase64(),
      title: "WhistleIRC",
      tooltip: "WhistleIRC — osu! referee client",
      items: [openItem, quitItem],
    },
    debug: false,
    copyDir: true,
  });
  console.log("[Tray] SysTray instance created");

  systray.onClick((action) => {
    console.log(`[Tray] Menu item clicked: ${action.item.title}`);
    action.item.click?.();
  });
  console.log("[Tray] Click handler registered");

  systray.ready().then(() => {
    console.log("[Tray] Tray is ready");
  }).catch((error) => {
    console.error(`Tray failed to start: ${(error as Error).message}`);
  });

  return systray;
}
