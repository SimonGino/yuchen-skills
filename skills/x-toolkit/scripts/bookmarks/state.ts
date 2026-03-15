import { readFile, writeFile, mkdir } from "node:fs/promises";
import path from "node:path";
import type { ExportState } from "../types";

const STATE_FILENAME = "exported-ids.json";

function emptyState(): ExportState {
  return { exportedIds: [], lastCursor: null, lastRunAt: "" };
}

export async function loadExportState(outputDir: string): Promise<ExportState> {
  try {
    const raw = await readFile(path.join(outputDir, STATE_FILENAME), "utf8");
    const parsed = JSON.parse(raw);
    return {
      exportedIds: Array.isArray(parsed.exportedIds) ? parsed.exportedIds : [],
      lastCursor: typeof parsed.lastCursor === "string" ? parsed.lastCursor : null,
      lastRunAt: typeof parsed.lastRunAt === "string" ? parsed.lastRunAt : "",
    };
  } catch {
    return emptyState();
  }
}

export async function saveExportState(outputDir: string, state: ExportState): Promise<void> {
  await mkdir(outputDir, { recursive: true });
  const filePath = path.join(outputDir, STATE_FILENAME);
  await writeFile(filePath, JSON.stringify(state, null, 2) + "\n", "utf8");
}

export function isExported(state: ExportState, tweetId: string): boolean {
  return state.exportedIds.includes(tweetId);
}

export function addExportedId(state: ExportState, tweetId: string): void {
  if (!state.exportedIds.includes(tweetId)) {
    state.exportedIds.push(tweetId);
  }
}
