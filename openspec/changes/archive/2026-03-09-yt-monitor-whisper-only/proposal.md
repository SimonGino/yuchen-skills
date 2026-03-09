## Why

Gemini API 转录增加了外部依赖和 API 密钥管理复杂度，而 mlx-whisper 本地模型已经足够稳定可靠。简化转录流程为单一 mlx-whisper 路径，同时修复潜在的 MP3 重复下载问题。

## What Changes

- **BREAKING**: 移除 Gemini API 音频转录功能（`_transcribe_gemini_inline`、`_transcribe_gemini_upload`、`_transcribe_gemini`）
- 无字幕时直接使用 mlx-whisper 本地模型转录，不再有 Gemini → mlx-whisper 的 fallback 链
- 移除 `GEMINI_API_KEY` / `GEMINI_BASE_URL` 相关配置读取
- 添加 MP3 文件存在性检查，避免对同一视频重复下载音频
- `subtitle_type` 返回值简化：不再返回 `"gemini"`，仅返回 `"mlx-whisper"`

## Capabilities

### New Capabilities

_None_

### Modified Capabilities

- `audio-transcription-fallback`: 移除 Gemini API 转录路径，mlx-whisper 从 fallback 变为唯一转录方式；添加 MP3 下载去重逻辑

## Impact

- **代码**: `skills/yt-monitor/scripts/yt_subtitle_dl.py` — 删除 Gemini 相关函数，简化 `_transcribe_with_fallback`
- **配置**: 不再需要 `GEMINI_API_KEY` 和 `GEMINI_BASE_URL`
- **依赖**: mlx-whisper 从可选 fallback 变为必需依赖（无字幕场景）
- **行为变更**: 如果 mlx-whisper 未安装且无字幕，将直接报错而非尝试 Gemini
