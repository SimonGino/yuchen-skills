export type ExportArgs = {
  limit: number;
  all: boolean;
  outputDir: string;
  downloadMedia: boolean;
  withSummary: boolean;
};

export type DebugArgs = {
  count: number;
  saveRaw: boolean;
};

export type BookmarkTweet = {
  id: string;
  text: string;
  username: string | null;
  url: string;
  mediaUrls: string[];
};

export type ExportSummary = {
  success: number;
  skipped: number;
  failed: number;
};

export type ExportState = {
  exportedIds: string[];
  lastCursor: string | null;
  lastRunAt: string;
};
