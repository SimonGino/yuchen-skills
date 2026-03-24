export type ExportMode = "bookmarks" | "tweets";

type BaseExportArgs = {
  outputDir: string;
  downloadMedia: boolean;
};

export type BookmarkExportArgs = BaseExportArgs & {
  mode: "bookmarks";
  limit: number;
  all: boolean;
  since?: string;
};

export type TweetExportArgs = BaseExportArgs & {
  mode: "tweets";
  urls: string[];
};

export type ExportArgs = BookmarkExportArgs | TweetExportArgs;

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

export type ExportSource = "bookmarks" | "urls";

export type ManifestEntry = {
  tweetId: string;
  path: string;
  author: string;
};

export type ManifestFile = {
  exportedAt: string;
  source: ExportSource;
  newFiles: ManifestEntry[];
  skipped: string[];
  failed: string[];
};
