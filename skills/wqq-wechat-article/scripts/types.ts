export type CliArgs = {
  sources: string[];
  workspace: string | null;
  summary: string | null;
  outline: string | null;
  outdir: string | null;
  help: boolean;
};

export type SourceMetadata = {
  title: string;
  url?: string;
  author?: string;
  date?: string;
};

export type Source = {
  metadata: SourceMetadata;
  content: string;
};

export type OutlineSection = {
  title: string;
  points: string[];
};

export type Outline = {
  summary: string;
  targetAudience: string;
  goal: string;
  sections: OutlineSection[];
};
