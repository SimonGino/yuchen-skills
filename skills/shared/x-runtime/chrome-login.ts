import type { XCookieMap } from "./types";

type SpawnSyncResult = {
  exitCode: number;
  stdout: Uint8Array;
  stderr: Uint8Array;
};

type SpawnSyncFn = (cmd: string[], options: { stdout: "pipe"; stderr: "pipe" }) => SpawnSyncResult;

const decoder = new TextDecoder();
const COOKIE_KEYS = ["auth_token", "ct0", "gt", "twid"] as const;

export function normalizeBrowserCookiePayload(raw: unknown): XCookieMap {
  const cookieMap: XCookieMap = {};
  if (!raw || typeof raw !== "object") {
    return cookieMap;
  }

  for (const key of COOKIE_KEYS) {
    const value = (raw as Record<string, unknown>)[key];
    if (typeof value === "string" && value.trim()) {
      cookieMap[key] = value.trim();
    }
  }

  return cookieMap;
}

function defaultSpawnSync(cmd: string[], options: { stdout: "pipe"; stderr: "pipe" }): SpawnSyncResult {
  const result = Bun.spawnSync(cmd, options);
  return {
    exitCode: result.exitCode,
    stdout: result.stdout,
    stderr: result.stderr,
  };
}

export async function loadXCookiesFromBrowserLogin(
  log?: (message: string) => void,
  options: { spawnSync?: SpawnSyncFn } = {}
): Promise<XCookieMap> {
  const pythonScript = `
import json
values = {}
try:
    import browser_cookie3
except Exception:
    print("{}")
    raise SystemExit(0)

for domain in ("x.com", ".x.com", "twitter.com", ".twitter.com"):
    try:
        for cookie in browser_cookie3.chrome(domain_name=domain):
            if cookie.name in ("auth_token", "ct0", "gt", "twid") and cookie.value:
                values[cookie.name] = cookie.value
    except Exception:
        pass

print(json.dumps(values))
`;

  const spawnSync = options.spawnSync ?? defaultSpawnSync;
  try {
    const result = spawnSync(["python3", "-c", pythonScript], { stdout: "pipe", stderr: "pipe" });
    if (result.exitCode !== 0) {
      const stderr = decoder.decode(result.stderr).trim();
      log?.(`[x-cookies] browser login failed: ${stderr || `exit code ${result.exitCode}`}`);
      return {};
    }

    const stdout = decoder.decode(result.stdout).trim();
    if (!stdout) {
      return {};
    }

    return normalizeBrowserCookiePayload(JSON.parse(stdout));
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    log?.(`[x-cookies] browser login unavailable: ${message}`);
    return {};
  }
}
