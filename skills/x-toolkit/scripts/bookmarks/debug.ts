import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { hasRequiredXCookies, loadXCookies } from "../common/cookies";
import { createArgParser, takeOne, parsePositiveInt } from "../common/arg-parser";
import { fetchBookmarksPage, HttpStatusError } from "./bookmarks-api";
import { extractBookmarkPage } from "./bookmarks-parser";
import type { DebugArgs } from "../types";

function buildRawFilePath(): string {
  const now = new Date();
  const pad2 = (value: number) => String(value).padStart(2, "0");
  const stamp = `${now.getFullYear()}${pad2(now.getMonth() + 1)}${pad2(now.getDate())}-${pad2(now.getHours())}${pad2(
    now.getMinutes(),
  )}${pad2(now.getSeconds())}`;
  return path.resolve(process.cwd(), "wqq-x-bookmarks-output", `debug-bookmarks-raw-${stamp}.json`);
}

const USAGE = `Usage:
  npx -y bun skills/x-toolkit/scripts/bookmarks/debug.ts [--count <n>] [--save-raw]`;

export const parseDebugArgs = createArgParser<DebugArgs>(
  {
    count: 20,
    saveRaw: false,
  },
  new Map([
    ["--count", (args, argv, i) => {
      args.count = parsePositiveInt(takeOne(argv, i, "--count"), "--count");
      return { nextIndex: i + 1 };
    }],
    ["--save-raw", (args, _argv, i) => {
      args.saveRaw = true;
      return { nextIndex: i };
    }],
  ]),
  { usage: USAGE },
);

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
