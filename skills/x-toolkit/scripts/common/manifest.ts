import { writeFile, mkdir } from "node:fs/promises";
import path from "node:path";
import type { ManifestFile } from "../types";

export async function writeManifest(outputDir: string, manifest: ManifestFile): Promise<string> {
  await mkdir(outputDir, { recursive: true });
  const manifestPath = path.join(outputDir, "manifest.json");
  await writeFile(manifestPath, JSON.stringify(manifest, null, 2) + "\n", "utf8");
  return manifestPath;
}
