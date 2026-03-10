import { describe, expect, it } from "bun:test";
import path from "node:path";
import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import {
  buildAutoSummary,
  normalizeSource,
  scanWorkspaceSources,
} from "./workspace-ingest";

describe("scanWorkspaceSources", () => {
  it("recursively scans only .md/.txt files", async () => {
    const workspace = await mkdtemp(path.join(tmpdir(), "workspace-ingest-"));
    await mkdir(path.join(workspace, "nested"), { recursive: true });

    const mdFile = path.join(workspace, "a.md");
    const txtFile = path.join(workspace, "b.txt");
    const jsonFile = path.join(workspace, "c.json");
    const nestedMd = path.join(workspace, "nested", "note.md");

    await writeFile(mdFile, "# a", "utf8");
    await writeFile(txtFile, "b", "utf8");
    await writeFile(jsonFile, "{}", "utf8");
    await writeFile(nestedMd, "# nested", "utf8");

    const files = await scanWorkspaceSources(workspace);

    expect(files).toEqual([mdFile, txtFile, nestedMd].sort());
  });

  it("excludes .git node_modules wechat-article directories", async () => {
    const workspace = await mkdtemp(path.join(tmpdir(), "workspace-ingest-"));
    await mkdir(path.join(workspace, ".git"), { recursive: true });
    await mkdir(path.join(workspace, "node_modules"), { recursive: true });
    await mkdir(path.join(workspace, "wechat-article"), { recursive: true });
    await mkdir(path.join(workspace, "normal"), { recursive: true });

    const gitFile = path.join(workspace, ".git", "a.md");
    const nodeModulesFile = path.join(workspace, "node_modules", "b.txt");
    const outputFile = path.join(workspace, "wechat-article", "c.md");
    const validFile = path.join(workspace, "normal", "d.md");

    await writeFile(gitFile, "# git", "utf8");
    await writeFile(nodeModulesFile, "module", "utf8");
    await writeFile(outputFile, "# generated", "utf8");
    await writeFile(validFile, "# valid", "utf8");

    const files = await scanWorkspaceSources(workspace);

    expect(files).toEqual([validFile]);
  });
});

describe("normalizeSource", () => {
  it("fills minimal front matter when missing", () => {
    const rawPath = path.join("/tmp", "文件名回退标题.md");
    const nowIso = "2026-02-16T10:00:00.000Z";
    const normalized = normalizeSource(rawPath, "纯文本正文", nowIso);

    expect(normalized.metadata.title).toBe("文件名回退标题");
    expect(normalized.metadata.source_path).toBe(rawPath);
    expect(normalized.metadata.ingested_at).toBe(nowIso);
    expect(normalized.metadata.tags).toEqual([]);
    expect(normalized.body).toBe("纯文本正文");
  });

  it("resolves title by yaml > h1 > filename", () => {
    const nowIso = "2026-02-16T10:00:00.000Z";

    const yamlTitlePath = path.join("/tmp", "yaml.md");
    const yamlTitleSource = normalizeSource(
      yamlTitlePath,
      "---\ntitle: 来自YAML\n---\n# 标题1\n正文",
      nowIso,
    );
    expect(yamlTitleSource.metadata.title).toBe("来自YAML");

    const h1Path = path.join("/tmp", "h1.md");
    const h1Source = normalizeSource(h1Path, "# 来自H1\n正文", nowIso);
    expect(h1Source.metadata.title).toBe("来自H1");

    const fallbackPath = path.join("/tmp", "来自文件名.md");
    const fallbackSource = normalizeSource(fallbackPath, "无标题正文", nowIso);
    expect(fallbackSource.metadata.title).toBe("来自文件名");
  });
});

describe("buildAutoSummary", () => {
  it("builds auto summary and 3-5 outline points", () => {
    const summary = buildAutoSummary([
      { metadata: { title: "A" } },
      { metadata: { title: "B" } },
    ]);

    expect(summary.oneLiner.length).toBeGreaterThan(0);
    expect(summary.outline.length).toBeGreaterThanOrEqual(3);
    expect(summary.outline.length).toBeLessThanOrEqual(5);
  });
});
