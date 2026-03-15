import os from "node:os";
import path from "node:path";

const APP_DATA_DIR = "wqq-skills";
const X_TO_MARKDOWN_DATA_DIR = "x-to-markdown";
const COOKIE_FILE_NAME = "cookies.json";
const PROFILE_DIR_NAME = "chrome-profile";

export type PathEnv = Record<string, string | undefined>;

export function resolveXRuntimeDataDir(input?: { env?: PathEnv; platform?: NodeJS.Platform; homedir?: string }): string {
  const env = input?.env ?? process.env;
  const platform = input?.platform ?? process.platform;
  const home = input?.homedir ?? os.homedir();
  const override = env.X_DATA_DIR?.trim();
  if (override) {
    return path.resolve(override);
  }

  if (platform === "darwin") {
    return path.join(home, "Library", "Application Support", APP_DATA_DIR, X_TO_MARKDOWN_DATA_DIR);
  }
  if (platform === "win32") {
    return path.join(env.APPDATA ?? path.join(home, "AppData", "Roaming"), APP_DATA_DIR, X_TO_MARKDOWN_DATA_DIR);
  }

  return path.join(env.XDG_DATA_HOME ?? path.join(home, ".local", "share"), APP_DATA_DIR, X_TO_MARKDOWN_DATA_DIR);
}

export function resolveXRuntimeCookiePath(input?: { env?: PathEnv; platform?: NodeJS.Platform; homedir?: string }): string {
  const env = input?.env ?? process.env;
  const override = env.X_COOKIE_PATH?.trim();
  if (override) {
    return path.resolve(override);
  }
  return path.join(resolveXRuntimeDataDir(input), COOKIE_FILE_NAME);
}

export function resolveXRuntimeChromeProfileDir(input?: {
  env?: PathEnv;
  platform?: NodeJS.Platform;
  homedir?: string;
}): string {
  const env = input?.env ?? process.env;
  const override = env.X_CHROME_PROFILE_DIR?.trim();
  if (override) {
    return path.resolve(override);
  }
  return path.join(resolveXRuntimeDataDir(input), PROFILE_DIR_NAME);
}
