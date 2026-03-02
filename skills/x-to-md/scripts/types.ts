export type ExportArgs = {
  urls: string[];
  outputDir: string;
  downloadMedia: boolean;
};

export type ExportSummary = {
  success: number;
  skipped: number;
  failed: number;
};
