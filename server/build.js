import { execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const pkgJson = JSON.parse(fs.readFileSync(path.join(__dirname, "package.json"), "utf-8"));
const appVersion = pkgJson.version;
const appName = "WhistleIRC";
const baseName = pkgJson.name;

const REQUIRED_TOOLS = [
  {
    command: "appimagetool",
    installHint: 'curl -fL -o /usr/local/bin/appimagetool "https://github.com/AppImage/AppImageKit/releases/download/continuous/appimagetool-x86_64.AppImage" && chmod +x /usr/local/bin/appimagetool',
    link: "https://github.com/AppImage/AppImageKit/releases",
  },
  {
    command: "zip",
    installHint: "Install using package manager of your distribution (e.g., apt install zip / dnf install zip / pacman -S zip)",
    link: null,
  },
];

function run(cmd) {
  console.log(`\n> ${cmd}`);
  execSync(cmd, { stdio: "inherit" });
}

function commandExists(cmd) {
  try {
    execSync(`command -v ${cmd}`, { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

function checkDependencies() {
  const missing = REQUIRED_TOOLS.filter((tool) => !commandExists(tool.command));
  if (missing.length === 0) return;

  const lines = missing.map((tool) => {
    const linkLine = tool.link ? `\n    Link: ${tool.link}` : "";
    return `  - ${tool.command}: not found in PATH.\n    Installation: ${tool.installHint}${linkLine}`;
  });

  throw new Error(`Required tools not found:\n\n${lines.join("\n\n")}\n\nInstall them and run the build again.`);
}

function toFourPartVersion(version) {
  const parts = version.split(".").map((p) => parseInt(p, 10) || 0);
  while (parts.length < 4) parts.push(0);
  return parts.slice(0, 4).join(".");
}

function buildAppImage(buildDir, rawBinaryPath, arch) {
  const appDir = path.join(buildDir, `${baseName}-${arch}.AppDir`);
  fs.rmSync(appDir, { recursive: true, force: true });
  fs.mkdirSync(path.join(appDir, "usr", "bin"), { recursive: true });

  const binaryName = `${baseName}-linux-${arch}`;
  fs.copyFileSync(rawBinaryPath, path.join(appDir, "usr", "bin", binaryName));
  fs.chmodSync(path.join(appDir, "usr", "bin", binaryName), 0o755);

  fs.writeFileSync(path.join(appDir, "AppRun"), `#!/bin/sh\nHERE="$(dirname "$(readlink -f "${"$0"}")")"\nexec "$HERE/usr/bin/${binaryName}" "$@"\n`, { mode: 0o755 });

  fs.writeFileSync(path.join(appDir, `${baseName}.desktop`), `[Desktop Entry]\nType=Application\nName=${appName}\nExec=AppRun\nIcon=${baseName}\nCategories=Network;\n`);

  const iconPng = path.join(__dirname, "icon.png");
  if (fs.existsSync(iconPng)) {
    fs.copyFileSync(iconPng, path.join(appDir, `${baseName}.png`));
  } else {
    console.warn(`\nWarning: ${iconPng} not found — AppImage will be built without an icon. ` + `Generate it once from icon.ico, e.g.: convert icon.ico -resize 256x256 icon.png`);
  }

  const outputPath = path.join(buildDir, `${baseName}-linux-${arch}.AppImage`);

  run(`QT_QPA_PLATFORM=xcb appimagetool "${appDir}" "${outputPath}"`);

  fs.rmSync(appDir, { recursive: true, force: true });
  fs.rmSync(rawBinaryPath);
}

function buildMacZip(buildDir, rawBinaryPath, arch) {
  const appBundle = path.join(buildDir, `${appName}.app`);
  fs.rmSync(appBundle, { recursive: true, force: true });
  fs.mkdirSync(path.join(appBundle, "Contents", "MacOS"), { recursive: true });
  fs.mkdirSync(path.join(appBundle, "Contents", "Resources"), { recursive: true });

  const binaryName = `${baseName}-macos-${arch}`;
  fs.copyFileSync(rawBinaryPath, path.join(appBundle, "Contents", "MacOS", binaryName));
  fs.chmodSync(path.join(appBundle, "Contents", "MacOS", binaryName), 0o755);

  const iconIcns = path.join(__dirname, "icon.icns");
  const hasIcon = fs.existsSync(iconIcns);
  if (hasIcon) {
    fs.copyFileSync(iconIcns, path.join(appBundle, "Contents", "Resources", "icon.icns"));
  } else {
    console.warn(`\nWarning: ${iconIcns} not found — .app will be built without an icon.`);
  }

  fs.writeFileSync(
    path.join(appBundle, "Contents", "Info.plist"),
    `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>CFBundleName</key><string>${appName}</string>
  <key>CFBundleIdentifier</key><string>sh.feefort.whistleirc</string>
  <key>CFBundleExecutable</key><string>${binaryName}</string>
  <key>CFBundleVersion</key><string>${appVersion}</string>
  <key>CFBundlePackageType</key><string>APPL</string>
  ${hasIcon ? "<key>CFBundleIconFile</key><string>icon.icns</string>" : ""}
</dict>
</plist>
`,
  );

  const zipPath = path.join(buildDir, `${baseName}-macos-${arch}.zip`);
  run(`cd "${buildDir}" && zip -r -y "${path.basename(zipPath)}" "${appName}.app"`);

  fs.rmSync(appBundle, { recursive: true, force: true });
  fs.rmSync(rawBinaryPath);
}

async function main() {
  checkDependencies();

  const buildDir = path.join(__dirname, "build");
  const staticDir = path.join(__dirname, "static");

  if (fs.existsSync(buildDir)) {
    fs.rmSync(buildDir, { recursive: true, force: true });
  }
  if (fs.existsSync(staticDir)) {
    fs.rmSync(staticDir, { recursive: true, force: true });
  }

  const clientDir = path.join(__dirname, "..", "client");
  run(`npm run build --prefix "${clientDir}"`);

  run(`npx esbuild src/index.ts --bundle --platform=node --format=esm ` + `--define:__APP_VERSION__='"${appVersion}"' --outfile=dist/bundle.js`);

  run("npx pkg . --targets node22-win-x64,node22-win-arm64,node22-macos-x64,node22-macos-arm64,node22-linux-x64,node22-linux-arm64 " + '--no-bytecode --public-packages "*" --public --compress GZip');

  for (const arch of ["x64", "arm64"]) {
    const rawBinary = path.join(buildDir, `${baseName}-linux-${arch}`);
    if (fs.existsSync(rawBinary)) {
      buildAppImage(buildDir, rawBinary, arch);
    }
  }

  for (const arch of ["x64", "arm64"]) {
    const rawBinary = path.join(buildDir, `${baseName}-macos-${arch}`);
    if (fs.existsSync(rawBinary)) {
      buildMacZip(buildDir, rawBinary, arch);
    }
  }

  for (const file of fs.readdirSync(buildDir)) {
    if (file.startsWith(`${baseName}-`)) {
      const renamed = file.replace(`${baseName}-`, `${baseName}-${appVersion}-`);
      fs.renameSync(path.join(buildDir, file), path.join(buildDir, renamed));
    }
  }

  const fourPartVersion = toFourPartVersion(appVersion);
  for (const file of fs.readdirSync(buildDir)) {
    if (file.endsWith(".exe")) {
      const fullPath = path.join(buildDir, file);
      const tmpPath = `${fullPath}.tmp`;
      console.log(`\nSetting icon and version (${appVersion}) for ${file}...`);

      run(
        `npx resedit "${fullPath}" "${tmpPath}" ` +
          `--icon 1,"${path.join(__dirname, "icon.ico")}" ` +
          `--company-name "FeeFort" ` +
          `--product-name "${appName}" ` +
          `--file-description "${appName} osu! referee client" ` +
          `--file-version ${fourPartVersion} ` +
          `--product-version ${fourPartVersion}`,
      );

      fs.rmSync(fullPath);
      fs.renameSync(tmpPath, fullPath);
    }
  }

  console.log(`\nDone! ${appName} v${appVersion} artifacts are in /build`);
}

main().catch((err) => {
  console.error(err.message ?? err);
  process.exit(1);
});
