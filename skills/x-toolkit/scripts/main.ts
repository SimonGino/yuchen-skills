import path from "node:path";
import { stdin as input, stdout as output } from "node:process";
import { createInterface } from "node:readline/promises";
import { fileURLToPath } from "node:url";
import { runDebugBookmarks } from "./bookmarks/debug";
import { runBookmarksExport } from "./bookmarks/main";
import { runTweetExport } from "./export/main";
import type { ExportMode, ExportSummary } from "./types";

type InteractiveMode = "bookmarks" | "debug";
type ToolkitMode = ExportMode | InteractiveMode;

export type ParsedMainArgs = {
  mode?: ToolkitMode;
  argv: string[];
};

export type MainDeps = {
  askMode?: () => Promise<InteractiveMode>;
  runBookmarksExportImpl?: typeof runBookmarksExport;
  runDebugImpl?: typeof runDebugBookmarks;
  runTweetExportImpl?: typeof runTweetExport;
};

function isToolkitMode(value: string): value is ToolkitMode {
  return value === "bookmarks" || value === "debug" || value === "tweets";
}

function hasUrlsFlag(argv: string[]): boolean {
  return argv.includes("--urls");
}

export function parseMainArgs(argv: string[]): ParsedMainArgs {
  const forwarded: string[] = [];
  let mode: ToolkitMode | undefined;

  for (let index = 0; index < argv.length; index++) {
    const arg = argv[index];
    if (arg === "--mode") {
      const value = argv[index + 1];
      if (!value || !isToolkitMode(value)) {
        throw new Error("--mode must be one of: bookmarks, debug, tweets");
      }
      mode = value;
      index += 1;
      continue;
    }
    forwarded.push(arg!);
  }

  if (hasUrlsFlag(forwarded)) {
    return { mode: "tweets", argv: forwarded };
  }

  return { mode, argv: forwarded };
}

function parseInteractiveSelection(answer: string): InteractiveMode | null {
  const normalized = answer.trim().toLowerCase();
  if (normalized === "1" || normalized === "bookmarks") {
    return "bookmarks";
  }
  if (normalized === "2" || normalized === "debug") {
    return "debug";
  }
  return null;
}

async function askModeFromCli(): Promise<InteractiveMode> {
  const rl = createInterface({ input, output });
  try {
    while (true) {
      const answer = await rl.question("选择操作: 1) 导出书签  2) Debug 认证\n> ");
      const mode = parseInteractiveSelection(answer);
      if (mode) {
        return mode;
      }
      console.log("无效选择，请输入 1 或 2。");
    }
  } finally {
    rl.close();
  }
}

export async function runMain(argv: string[], deps: MainDeps = {}): Promise<ExportSummary | void> {
  const parsed = parseMainArgs(argv);

  if (parsed.mode === "tweets") {
    return (deps.runTweetExportImpl ?? runTweetExport)(parsed.argv);
  }

  const mode = parsed.mode ?? (await (deps.askMode ?? askModeFromCli)());
  if (mode === "bookmarks") {
    return (deps.runBookmarksExportImpl ?? runBookmarksExport)(parsed.argv);
  }
  return (deps.runDebugImpl ?? runDebugBookmarks)(parsed.argv);
}

const isCliExecution = process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);

if (isCliExecution) {
  runMain(process.argv.slice(2)).catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  });
}
