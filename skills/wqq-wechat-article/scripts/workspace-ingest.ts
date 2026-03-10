import path from "node:path";
import { readFile, readdir } from "node:fs/promises";

type ParsedYaml = {
  title?: string;
  tags?: string[];
  url?: string;
  author?: string;
  date?: string;
};

export type NormalizedMetadata = {
  title: string;
  source_path: string;
  ingested_at: string;
  tags: string[];
  url?: string;
  author?: string;
  date?: string;
};

export type NormalizedSource = {
  metadata: NormalizedMetadata;
  body: string;
};

export type AutoSummary = {
  oneLiner: string;
  outline: string[];
};

export async function scanWorkspaceSources(workspace: string): Promise<string[]> {
  const files: string[] = [];
  const excluded = new Set([".git", "node_modules", "wechat-article"]);

  async function walk(dir: string): Promise<void> {
    const entries = await readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);

      if (entry.isDirectory()) {
        if (excluded.has(entry.name)) continue;
        await walk(fullPath);
        continue;
      }

      if (!entry.isFile()) continue;
      const ext = path.extname(entry.name).toLowerCase();
      if (ext === ".md" || ext === ".txt") {
        files.push(fullPath);
      }
    }
  }

  await walk(workspace);
  files.sort();
  return files;
}

function stripQuotes(value: string): string {
  if (
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    return value.slice(1, -1);
  }
  return value;
}

function parseTags(value: string): string[] {
  const trimmed = value.trim();
  if (!trimmed) return [];

  if (trimmed.startsWith("[") && trimmed.endsWith("]")) {
    return trimmed
      .slice(1, -1)
      .split(",")
      .map((tag) => stripQuotes(tag.trim()))
      .filter((tag) => tag.length > 0);
  }

  return trimmed
    .split(",")
    .map((tag) => stripQuotes(tag.trim()))
    .filter((tag) => tag.length > 0);
}

function parseSimpleYaml(content: string): ParsedYaml {
  const yaml: ParsedYaml = {};
  for (const rawLine of content.split("\n")) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const index = line.indexOf(":");
    if (index === -1) continue;

    const key = line.slice(0, index).trim();
    const rawValue = line.slice(index + 1).trim();

    if (key === "tags") {
      yaml.tags = parseTags(rawValue);
      continue;
    }

    const value = stripQuotes(rawValue);
    if (key === "title") yaml.title = value;
    if (key === "url") yaml.url = value;
    if (key === "author") yaml.author = value;
    if (key === "date") yaml.date = value;
  }
  return yaml;
}

function splitFrontmatter(content: string): { yaml: ParsedYaml; body: string } {
  const match = content.match(/^---\n([\s\S]*?)\n---\n?/);
  if (!match) {
    return { yaml: {}, body: content };
  }

  const yamlContent = match[1] || "";
  const yaml = parseSimpleYaml(yamlContent);
  const body = content.slice(match[0].length);
  return { yaml, body };
}

export function resolveTitle(
  parsedYamlTitle: string | null,
  body: string,
  filePath: string,
): string {
  if (parsedYamlTitle?.trim()) return parsedYamlTitle.trim();
  const h1 = body.match(/^#\s+(.+)$/m)?.[1]?.trim();
  if (h1) return h1;
  return path.basename(filePath, path.extname(filePath));
}

export function normalizeSource(
  filePath: string,
  content: string,
  nowIso: string,
): NormalizedSource {
  const { yaml, body } = splitFrontmatter(content);
  const title = resolveTitle(yaml.title ?? null, body, filePath);

  return {
    metadata: {
      title,
      source_path: filePath,
      ingested_at: nowIso,
      tags: Array.isArray(yaml.tags) ? yaml.tags : [],
      url: yaml.url,
      author: yaml.author,
      date: yaml.date,
    },
    body: body.trim(),
  };
}

export function buildAutoSummary(
  sources: Array<{ metadata: { title: string } }>,
): AutoSummary {
  const topic = sources
    .slice(0, 3)
    .map((source) => source.metadata.title)
    .join("、");

  const oneLiner = topic
    ? `这篇文章将基于 ${topic}，给出可直接落地的操作指南。`
    : "这篇文章将提供一套可直接落地的实战操作指南。";

  return {
    oneLiner,
    outline: [
      "背景与问题定义",
      "安装与初始化",
      "核心配置与执行步骤",
      "常见错误与排查",
      "落地清单与下一步",
    ],
  };
}

export type WorkspaceIngestResult = {
  sources: NormalizedSource[];
  summary: AutoSummary;
};

export async function ingestWorkspace(
  workspace: string,
): Promise<WorkspaceIngestResult> {
  const sourcePaths = await scanWorkspaceSources(workspace);
  if (sourcePaths.length === 0) {
    throw new Error(`No markdown/text sources found in workspace: ${workspace}`);
  }

  const nowIso = new Date().toISOString();
  const sources: NormalizedSource[] = [];

  for (const sourcePath of sourcePaths) {
    const raw = await readFile(sourcePath, "utf8");
    const normalized = normalizeSource(sourcePath, raw, nowIso);
    sources.push(normalized);
  }

  if (sources.length === 0) {
    throw new Error(`No valid sources found in workspace: ${workspace}`);
  }

  return {
    sources,
    summary: buildAutoSummary(sources),
  };
}
