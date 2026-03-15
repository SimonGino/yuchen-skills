import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { mkdtemp, rm, readFile } from "node:fs/promises";
import path from "node:path";
import { tmpdir } from "node:os";
import { loadExportState, saveExportState, isExported, addExportedId } from "./state";

describe("state", () => {
  let dir: string;

  beforeEach(async () => {
    dir = await mkdtemp(path.join(tmpdir(), "state-test-"));
  });

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it("returns empty state when file does not exist", async () => {
    const state = await loadExportState(dir);
    expect(state.exportedIds).toEqual([]);
    expect(state.lastCursor).toBeNull();
  });

  it("round-trips state to JSON file", async () => {
    const state = { exportedIds: ["111", "222"], lastCursor: "abc", lastRunAt: "2026-03-06T00:00:00Z" };
    await saveExportState(dir, state);

    const loaded = await loadExportState(dir);
    expect(loaded.exportedIds).toEqual(["111", "222"]);
    expect(loaded.lastCursor).toBe("abc");
  });

  it("isExported checks set membership", async () => {
    const state = { exportedIds: ["111", "222"], lastCursor: null, lastRunAt: "" };
    expect(isExported(state, "111")).toBe(true);
    expect(isExported(state, "999")).toBe(false);
  });

  it("addExportedId appends without duplicates", () => {
    const state = { exportedIds: ["111"], lastCursor: null, lastRunAt: "" };
    addExportedId(state, "222");
    addExportedId(state, "111"); // duplicate
    expect(state.exportedIds).toEqual(["111", "222"]);
  });
});
