import path from "node:path";
import process from "node:process";
import { homedir } from "node:os";
import { readFileSync } from "node:fs";
import { readFile } from "node:fs/promises";

export type DotEnvRecord = Record<string, string>;

export function getWqqSkillsEnvFilePath(homeDir: string = homedir()): string {
  return path.join(homeDir, ".wqq-skills", ".env");
}

export function parseDotEnv(content: string): DotEnvRecord {
  const env: DotEnvRecord = {};

  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;

    const cleaned = line.startsWith("export ")
      ? line.slice("export ".length).trim()
      : line;
    const idx = cleaned.indexOf("=");
    if (idx === -1) continue;

    const key = cleaned.slice(0, idx).trim();
    if (!key) continue;

    let val = cleaned.slice(idx + 1).trim();
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1);
    }

    env[key] = val;
  }

  return env;
}

export async function loadDotEnvFile(filePath: string): Promise<DotEnvRecord> {
  try {
    const content = await readFile(filePath, "utf8");
    return parseDotEnv(content);
  } catch {
    return {};
  }
}

export async function loadWqqSkillsEnvFile(homeDir?: string): Promise<DotEnvRecord> {
  return loadDotEnvFile(getWqqSkillsEnvFilePath(homeDir));
}

export function applyFileOnlyKeysToEnvObject(
  target: Record<string, string | undefined>,
  fileEnv: DotEnvRecord,
  keys: readonly string[],
): void {
  for (const key of keys) {
    target[key] = fileEnv[key];
  }
}

export function applyFileOnlyKeysToProcessEnv(
  fileEnv: DotEnvRecord,
  keys: readonly string[],
): void {
  for (const key of keys) {
    delete process.env[key];
  }

  for (const key of keys) {
    const value = fileEnv[key];
    if (typeof value === "string" && value.length > 0) {
      process.env[key] = value;
    }
  }
}

export async function buildEnvWithFileOnlyKeysFromWqqSkillsEnv(
  keys: readonly string[],
  baseEnv: NodeJS.ProcessEnv = process.env,
  homeDir?: string,
): Promise<NodeJS.ProcessEnv> {
  const fileEnv = await loadWqqSkillsEnvFile(homeDir);
  const env: NodeJS.ProcessEnv = { ...baseEnv };
  applyFileOnlyKeysToEnvObject(env, fileEnv, keys);
  return env;
}

export function loadDotEnvFileSync(filePath: string): DotEnvRecord {
  try {
    const content = readFileSync(filePath, "utf8");
    return parseDotEnv(content);
  } catch {
    return {};
  }
}

export function getXOutputBaseDir(homeDir?: string): string {
  const envPath = getWqqSkillsEnvFilePath(homeDir);
  const env = loadDotEnvFileSync(envPath);
  return env.X_OUTPUT_DIR || process.cwd();
}
