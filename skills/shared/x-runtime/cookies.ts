import { X_COOKIE_NAMES, X_REQUIRED_COOKIES } from "./constants";
import { readCookieFile, writeCookieFile } from "./cookie-store";
import { loadXCookiesFromBrowserLogin } from "./chrome-login";
import { resolveXRuntimeCookiePath } from "./paths";
import type { PersistedCookieMap, XCookieMap } from "./types";

export type LoadXCookiesOptions = {
  loadFromBrowser?: () => Promise<XCookieMap>;
  readFromFile?: (filePath: string) => Promise<PersistedCookieMap | null>;
  cookiePath?: string;
};

export type RefreshXCookiesOptions = {
  refreshFromBrowser?: () => Promise<XCookieMap>;
  writeToFile?: (filePath: string, cookieMap: PersistedCookieMap, source?: string) => Promise<void>;
  cookiePath?: string;
};

function parseCookieHeader(header: string | undefined): XCookieMap {
  const cookieMap: XCookieMap = {};
  if (!header?.trim()) {
    return cookieMap;
  }

  for (const pair of header.split(";")) {
    const trimmed = pair.trim();
    if (!trimmed) continue;
    const index = trimmed.indexOf("=");
    if (index <= 0) continue;
    const key = trimmed.slice(0, index).trim();
    const value = trimmed.slice(index + 1).trim();
    if (!key || !value) continue;
    cookieMap[key] = value;
  }

  return cookieMap;
}

function normalizeCookieMap(raw: unknown): XCookieMap {
  const cookieMap: XCookieMap = {};
  if (!raw || typeof raw !== "object") {
    return cookieMap;
  }

  for (const name of X_COOKIE_NAMES) {
    const value = (raw as Record<string, unknown>)[name];
    if (typeof value === "string" && value.trim()) {
      cookieMap[name] = value.trim();
    }
  }
  return cookieMap;
}

function toPersistedCookieMap(cookieMap: XCookieMap): PersistedCookieMap {
  const out: PersistedCookieMap = {};
  for (const [key, value] of Object.entries(cookieMap)) {
    if (typeof value === "string" && value.trim()) {
      out[key] = value.trim();
    }
  }
  return out;
}

function buildEnvCookieMap(): XCookieMap {
  const cookieHeader = process.env.X_COOKIE_HEADER?.trim() || process.env.X_COOKIES?.trim();
  const cookieMap = parseCookieHeader(cookieHeader);

  const authToken = process.env.X_AUTH_TOKEN?.trim() || process.env.AUTH_TOKEN?.trim();
  const ct0 = process.env.X_CT0?.trim() || process.env.CT0?.trim();
  if (authToken) {
    cookieMap.auth_token = authToken;
  }
  if (ct0) {
    cookieMap.ct0 = ct0;
  }

  return cookieMap;
}

function logLoadedCookieKeys(log: ((message: string) => void) | undefined, cookieMap: XCookieMap): void {
  log?.(
    `[x-cookies] loaded keys: ${Object.keys(cookieMap)
      .sort()
      .join(", ") || "none"}`
  );
}

export function hasRequiredXCookies(cookieMap: XCookieMap): boolean {
  return X_REQUIRED_COOKIES.every((key) => Boolean(cookieMap[key]));
}

export function buildCookieHeader(cookieMap: XCookieMap): string {
  return Object.entries(cookieMap)
    .filter(([, value]) => Boolean(value))
    .map(([key, value]) => `${key}=${value}`)
    .join("; ");
}

export async function loadXCookies(
  log?: (message: string) => void,
  options: LoadXCookiesOptions = {}
): Promise<XCookieMap> {
  // Priority 1: Chrome browser extraction
  const loadFromBrowser = options.loadFromBrowser ?? (() => loadXCookiesFromBrowserLogin(log));
  const browserCookieMap = normalizeCookieMap(await loadFromBrowser());
  if (hasRequiredXCookies(browserCookieMap)) {
    logLoadedCookieKeys(log, browserCookieMap);
    return browserCookieMap;
  }

  // Priority 2: Cookie file
  const cookiePath = options.cookiePath ?? resolveXRuntimeCookiePath();
  const readFromFile = options.readFromFile ?? readCookieFile;
  const fileCookieMap = normalizeCookieMap(await readFromFile(cookiePath));
  const fileAndBrowserCookieMap = { ...browserCookieMap, ...fileCookieMap };
  if (hasRequiredXCookies(fileAndBrowserCookieMap)) {
    logLoadedCookieKeys(log, fileAndBrowserCookieMap);
    return fileAndBrowserCookieMap;
  }

  // Priority 3: Environment variables
  const envCookieMap = buildEnvCookieMap();
  const combined = { ...browserCookieMap, ...fileCookieMap, ...envCookieMap };
  logLoadedCookieKeys(log, combined);
  return combined;
}

export async function refreshXCookies(
  log?: (message: string) => void,
  options: RefreshXCookiesOptions = {}
): Promise<XCookieMap> {
  const refreshFromBrowser = options.refreshFromBrowser ?? (() => loadXCookiesFromBrowserLogin(log));
  const cookiePath = options.cookiePath ?? resolveXRuntimeCookiePath();
  const writeToFile = options.writeToFile ?? writeCookieFile;
  const refreshedCookieMap = normalizeCookieMap(await refreshFromBrowser());

  const persistedCookieMap = toPersistedCookieMap(refreshedCookieMap);
  if (Object.keys(persistedCookieMap).length > 0) {
    try {
      await writeToFile(cookiePath, persistedCookieMap, "browser-refresh");
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      log?.(`[x-cookies] failed to persist cookie file: ${message}`);
    }
  }

  logLoadedCookieKeys(log, refreshedCookieMap);
  return refreshedCookieMap;
}
