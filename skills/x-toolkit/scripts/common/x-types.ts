export type XCookieMap = {
  [key: string]: string | undefined;
  auth_token?: string;
  ct0?: string;
  gt?: string;
  twid?: string;
};

export type PersistedCookieMap = Record<string, string>;

export type CookieFileData =
  | {
      cookies: PersistedCookieMap;
      updated_at?: number;
      source?: string;
    }
  | {
      version: 1;
      updatedAt: string;
      cookieMap: PersistedCookieMap;
      source?: string;
    };

export type CookieLike = {
  name?: string;
  value?: string;
  domain?: string;
  path?: string;
  url?: string;
};

export type ArticleQueryInfo = {
  queryId: string;
  featureSwitches: string[];
  fieldToggles: string[];
  html: string;
};

export type ArticleEntityRange = {
  key?: number;
  offset?: number;
  length?: number;
};

export type ArticleBlock = {
  type?: string;
  text?: string;
  entityRanges?: ArticleEntityRange[];
};

export type ArticleEntityMapMediaItem = {
  mediaId?: string;
  media_id?: string;
  localMediaId?: string;
};

export type ArticleEntityMapEntry = {
  key?: string;
  value?: {
    type?: string;
    mutability?: string;
    data?: {
      caption?: string;
      markdown?: string;
      mediaItems?: ArticleEntityMapMediaItem[];
      url?: string;
    };
  };
};

export type ArticleContentState = {
  blocks?: ArticleBlock[];
  entityMap?: Record<string, ArticleEntityMapEntry>;
};

export type ArticleMediaInfo = {
  __typename?: string;
  original_img_url?: string;
  preview_image?: {
    original_img_url?: string;
  };
  variants?: Array<{
    content_type?: string;
    url?: string;
    bit_rate?: number;
  }>;
};

export type ArticleMediaEntity = {
  media_id?: string;
  media_info?: ArticleMediaInfo;
};

export type ArticleEntity = {
  title?: string;
  plain_text?: string;
  preview_text?: string;
  content_state?: ArticleContentState;
  cover_media?: {
    media_info?: ArticleMediaInfo;
  };
  media_entities?: ArticleMediaEntity[];
};

export type VideoVariant = {
  url?: string;
  content_type?: string;
  bitrate?: number;
};

export type UrlEntity = {
  url?: string;
  expanded_url?: string;
  unwound_url?: string;
  display_url?: string;
};

export type MediaEntity = {
  type?: string;
  media_url_https?: string;
  media_url?: string;
  video_info?: { variants?: VideoVariant[] };
};

export type TweetLegacy = {
  id_str?: string;
  full_text?: string;
  text?: string;
  extended_entities?: { media?: MediaEntity[] };
  entities?: { media?: MediaEntity[]; urls?: UrlEntity[] };
  article?: unknown;
  article_results?: { result?: unknown };
};

export type UserLegacy = {
  screen_name?: string;
  name?: string;
};

export type TweetResult = {
  __typename?: string;
  tweet?: TweetResult;
  rest_id?: string;
  core?: { user_results?: { result?: { legacy?: UserLegacy } } };
  legacy?: TweetLegacy;
  note_tweet?: { note_tweet_results?: { result?: { text?: string } } };
  article?: unknown;
  article_results?: { result?: unknown };
};

export type TimelineInstruction = {
  entries?: unknown[];
  moduleItems?: unknown[];
};

export type BookmarkTimelineResponse = {
  data?: {
    bookmark_timeline_v2?: {
      timeline?: { instructions?: TimelineInstruction[] };
    };
    bookmark_timeline?: {
      timeline?: { instructions?: TimelineInstruction[] };
    };
    search_by_raw_query?: {
      bookmarks_search_timeline?: {
        timeline?: { instructions?: TimelineInstruction[] };
      };
    };
  };
};
