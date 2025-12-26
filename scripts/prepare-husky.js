const { spawnSync } = require('node:child_process');

function shouldSkip() {
  // Vercel/CI/prod installs often omit devDependencies; Husky won't be present.
  if (process.env.CI) return true;
  if (process.env.HUSKY === '0') return true;
  if (process.env.NODE_ENV === 'production') return true;

  // npm sets this during production installs (e.g., `npm install --omit=dev`).
  if (process.env.npm_config_production === 'true') return true;
  if (process.env.npm_config_omit && process.env.npm_config_omit.includes('dev')) return true;

  return false;
}

function main() {
  if (shouldSkip()) return;

  // `npx --no-install` ensures we only use the locally installed husky.
  // If husky isn't installed, we silently skip so builds don't fail.
  const result = spawnSync('npx', ['--no-install', 'husky', 'install'], {
    stdio: 'inherit',
    shell: true,
  });

  if (result.status && result.status !== 0) {
    // Intentionally do not fail installs/builds on missing husky.
    process.exitCode = 0;
  }
}

main();
