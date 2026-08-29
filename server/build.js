const { execSync } = require("child_process");
const fs = require("fs");
const path = require("path");

const pkgJson = JSON.parse(fs.readFileSync(path.join(__dirname, "package.json"), "utf-8"));
const appVersion = pkgJson.version;
const appName = "WhistleIRC";

function run(cmd) {
  console.log(`\n> ${cmd}`);
  execSync(cmd, { stdio: "inherit" });
}

// resedit's --file-version/--product-version require strict n.n.n.n format;
// pad a semver like "1.2.0" out to "1.2.0.0".
function toFourPartVersion(version) {
  const parts = version.split(".").map((p) => parseInt(p, 10) || 0);
  while (parts.length < 4) parts.push(0);
  return parts.slice(0, 4).join(".");
}

async function main() {
  const buildDir = path.join(__dirname, "build");

  // Wipe leftovers from previous runs so stale files never mix in with fresh output.
  if (fs.existsSync(buildDir)) {
    fs.rmSync(buildDir, { recursive: true, force: true });
  }

  const clientDir = path.join(__dirname, "..", "client");
  run(`npm run build --prefix "${clientDir}`);

  run("npx esbuild src/index.js --bundle --platform=node --outfile=dist/bundle.js");

  // Native target: bytecode generation works fine, host can execute this binary directly.
  run(`npx pkg . --targets node22-win-x64 --output build/${pkgJson.name}-win-x64.exe --compress GZip`);

  // Cross-platform/cross-arch targets: the host can't execute these binaries to
  // generate V8 bytecode, so we skip that step to avoid "spawn UNKNOWN".
  run("npx pkg . --targets node22-win-arm64,node22-macos-x64,node22-macos-arm64,node22-linux-x64,node22-linux-arm64 " + '--no-bytecode --public-packages "*" --public --compress GZip');

  const baseName = pkgJson.name;

  // pkg names outputs like "whistleirc-server-win-x64.exe" — insert the
  // version right after the base name so it's visible in the filename.
  for (const file of fs.readdirSync(buildDir)) {
    if (file.startsWith(`${baseName}-`)) {
      const renamed = file.replace(`${baseName}-`, `${baseName}-${appVersion}-`);
      fs.renameSync(path.join(buildDir, file), path.join(buildDir, renamed));
    }
  }

  const fourPartVersion = toFourPartVersion(appVersion);
  const files = fs.readdirSync(buildDir);

  for (const file of files) {
    if (file.endsWith(".exe")) {
      const fullPath = path.join(buildDir, file);
      const tmpPath = `${fullPath}.tmp`;
      console.log(`\nSetting icon and version (${appVersion}) for ${file}...`);

      // IMPORTANT: use resedit-cli here cause of proper size calculation
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

  console.log(`\nDone! ${appName} v${appVersion} binaries are in /build`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
