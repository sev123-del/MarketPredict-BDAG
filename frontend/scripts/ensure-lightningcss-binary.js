/* eslint-disable no-console */

const fs = require("node:fs");
const path = require("node:path");

function exists(filePath) {
  try {
    fs.accessSync(filePath, fs.constants.R_OK);
    return true;
  } catch {
    return false;
  }
}

function copyIfPresent(from, to) {
  if (!exists(from) || exists(to)) return false;

  fs.mkdirSync(path.dirname(to), { recursive: true });
  fs.copyFileSync(from, to);
  return true;
}

function main() {
  if (process.platform !== "linux") return;
  if (process.arch !== "x64") return;

  const projectRoot = path.join(__dirname, "..");

  const lightningcssDir = path.join(projectRoot, "node_modules", "lightningcss");
  const destGnu = path.join(lightningcssDir, "lightningcss.linux-x64-gnu.node");
  const destMusl = path.join(lightningcssDir, "lightningcss.linux-x64-musl.node");

  if (exists(destGnu) || exists(destMusl)) return;

  const srcGnu = path.join(
    projectRoot,
    "node_modules",
    "lightningcss-linux-x64-gnu",
    "lightningcss.linux-x64-gnu.node",
  );
  const srcMusl = path.join(
    projectRoot,
    "node_modules",
    "lightningcss-linux-x64-musl",
    "lightningcss.linux-x64-musl.node",
  );

  if (copyIfPresent(srcGnu, destGnu) || copyIfPresent(srcMusl, destMusl)) {
    console.log("ensure-lightningcss-binary: copied native binary");
    return;
  }

  // Fail early with a clear error instead of a deep Next.js/Turbopack stack trace.
  throw new Error(
    "ensure-lightningcss-binary: missing lightningcss Linux native binary. " +
      `Expected one of: ${srcGnu} or ${srcMusl}. ` +
      "This usually means optional dependencies were not installed.",
  );
}

main();
