import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { hasRequiredXCookies, loadXCookies } from "../../shared/x-runtime/cookies";
import { fetchBookmarksPage, HttpStatusError } from "./bookmarks-api";
import { extractBookmarkPage } from "./bookmarks-parser";
import type { DebugArgs } from "./types";

function parsePositiveInt(input: string, flagName: string): number {
  const value = Number.parseInt(input, 10);
  if (!Number.isFinite(value) || value <= 0) {
    throw new Error(`${flagName} must be a positive integer`);
  }
  return value;
}

function buildRawFilePath(): string {
  const now = new Date();
  const pad2 = (value: number) => String(value).padStart(2, "0");
  const stamp = `${now.getFullYear()}${pad2(now.getMonth() + 1)}${pad2(now.getDate())}-${pad2(now.getHours())}${pad2(
    now.getMinutes()
  )}${pad2(now.getSeconds())}`;
  return path.resolve(process.cwd(), "wqq-x-bookmarks-output", `debug-bookmarks-raw-${stamp}.json`);
}

function printUsage(): void {
  console.log("Usage:");
  console.log("  npx -y bun skills/wqq-x-bookmarks/scripts/debug.ts [--count <n>] [--save-raw]");
}

export function parseDebugArgs(argv: string[]): DebugArgs {
  const args: DebugArgs = {
    count: 20,
    saveRaw: false,
  };

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--count") {
      const value = argv[++i];
      if (!value) {
        throw new Error("Missing value for --count");
      }
      args.count = parsePositiveInt(value, "--count");
      continue;
    }

    if (arg === "--save-raw") {
      args.saveRaw = true;
      continue;
    }

    if (arg === "--help" || arg === "-h") {
      printUsage();
      process.exit(0);
    }

    throw new Error(`Unknown option: ${arg}`);
  }

  return args;
}

async function saveRawPayload(payload: unknown): Promise<string> {
  const rawPath = buildRawFilePath();
  await mkdir(path.dirname(rawPath), { recursive: true });
  await writeFile(rawPath, JSON.stringify(payload, null, 2), "utf8");
  return rawPath;
}

export async function runDebugBookmarks(argv: string[]): Promise<void> {
  const args = parseDebugArgs(argv);
  const log = console.log;

  log("[debug-bookmarks] loading cookies");
  const cookieMap = await loadXCookies(log);
  if (!hasRequiredXCookies(cookieMap)) {
    throw new Error("Missing auth cookies. Provide X_AUTH_TOKEN and X_CT0.");
  }

  log(`[debug-bookmarks] fetching bookmarks page, count=${args.count}`);
  const payload = await fetchBookmarksPage({
    cookieMap,
    count: args.count,
  });
  const page = extractBookmarkPage(payload);

  log(`[debug-bookmarks] tweetIds (${page.tweetIds.length}): ${page.tweetIds.join(", ")}`);
  log(`[debug-bookmarks] nextCursor: ${page.nextCursor ?? "null"}`);

  if (args.saveRaw) {
    const rawPath = await saveRawPayload(payload);
    log(`[debug-bookmarks] raw payload saved: ${rawPath}`);
  }
}

const isCliExecution = process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);

if (isCliExecution) {
  runDebugBookmarks(process.argv.slice(2)).catch((error) => {
    if (error instanceof HttpStatusError && (error.status === 401 || error.status === 403)) {
      console.error(`[debug-bookmarks] authentication failed (${error.status}). Cookie may be expired.`);
      process.exit(1);
    }

    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  });
}
