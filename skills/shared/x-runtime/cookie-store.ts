import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import type { CookieFileData, PersistedCookieMap } from "./types";

function normalizeCookieMap(raw: unknown): PersistedCookieMap {
  const cookieMap: PersistedCookieMap = {};
  if (!raw || typeof raw !== "object") {
    return cookieMap;
  }

  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    if (typeof value === "string" && value.trim()) {
      cookieMap[key] = value.trim();
    }
  }

  return cookieMap;
}

export async function readCookieFile(filePath: string): Promise<PersistedCookieMap | null> {
  try {
    const fileStat = await stat(filePath);
    if (!fileStat.isFile()) {
      return null;
    }

    const raw = await readFile(filePath, "utf8");
    const data = JSON.parse(raw) as unknown;
    if (!data || typeof data !== "object") {
      return null;
    }

    const objectData = data as Record<string, unknown>;
    const v1 = normalizeCookieMap(objectData.cookieMap);
    if (Object.keys(v1).length > 0) {
      return v1;
    }

    const legacy = normalizeCookieMap(objectData.cookies);
    if (Object.keys(legacy).length > 0) {
      return legacy;
    }

    const plain = normalizeCookieMap(objectData);
    return Object.keys(plain).length > 0 ? plain : null;
  } catch {
    return null;
  }
}

export async function writeCookieFile(
  filePath: string,
  cookieMap: PersistedCookieMap,
  source?: string
): Promise<void> {
  await mkdir(path.dirname(filePath), { recursive: true });
  const payload: CookieFileData = {
    version: 1,
    updatedAt: new Date().toISOString(),
    cookieMap,
    source,
  };
  await writeFile(filePath, JSON.stringify(payload, null, 2), "utf8");
}
