const fs = require("fs");
const path = require("path");

function parseEnvLine(line) {
  const trimmed = line.trim();

  if (!trimmed || trimmed.startsWith("#")) return null;

  const equalIndex = trimmed.indexOf("=");
  if (equalIndex === -1) return null;

  const key = trimmed.slice(0, equalIndex).trim();
  let value = trimmed.slice(equalIndex + 1).trim();

  if (!key) return null;

  if (
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    value = value.slice(1, -1);
  }

  return { key, value };
}

function loadEnv(rootDir) {
  const projectRoot = rootDir || path.join(__dirname, "..");
  const envPath = path.join(projectRoot, ".env");

  const status = {
    envPath,
    envFileFound: false,
    loadedKeys: []
  };

  if (!fs.existsSync(envPath)) {
    global.__FE_ENV_STATUS__ = status;
    return status;
  }

  const stat = fs.statSync(envPath);
  if (!stat.isFile()) {
    status.error = ".env exists but is not a file.";
    global.__FE_ENV_STATUS__ = status;
    return status;
  }

  const content = fs.readFileSync(envPath, "utf8");
  const lines = content.split(/\r?\n/);

  for (const line of lines) {
    const parsed = parseEnvLine(line);
    if (!parsed) continue;

    if (typeof process.env[parsed.key] === "undefined") {
      process.env[parsed.key] = parsed.value;
    }

    status.loadedKeys.push(parsed.key);
  }

  status.envFileFound = true;
  global.__FE_ENV_STATUS__ = status;
  return status;
}

function getEnvStatus() {
  return global.__FE_ENV_STATUS__ || {
    envPath: path.join(__dirname, "..", ".env"),
    envFileFound: false,
    loadedKeys: []
  };
}

module.exports = {
  loadEnv,
  getEnvStatus
};
