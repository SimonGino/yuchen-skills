## Why

当前 yt-monitor 技能在两种常见场景下无法正常工作：
1. **无字幕视频**：部分视频没有手动或自动字幕（尤其是非英语小频道），当前直接报错"没有找到可用字幕"，用户无法获取任何总结。
2. **超长字幕**：长视频（1-3 小时的播客、直播回放等）的字幕文本可能极长，直接传给 Claude 会超出上下文窗口或导致总结质量下降。

这两个问题在实际使用中频繁出现，需要系统性地解决。

## What Changes

- **新增音频转录回退**：当视频无字幕时，通过 yt-dlp 下载音频，优先用 Gemini API 转录，兜底用本地 mlx-whisper
- **新增字幕长度检测与分块处理**：下载字幕后检测文本长度，超过阈值时自动分块，支持 Claude 分段总结后合并
- **更新返回结构**：在 `download_subtitle` 返回值中增加文本长度、分块信息等字段
- **更新 SKILL.md**：补充无字幕回退流程和长字幕处理的说明

## Capabilities

### New Capabilities
- `audio-transcription-fallback`: 无字幕视频的音频转录回退方案（Gemini API 首选 + 本地 mlx-whisper 兜底），包括音频下载、转录、文本保存
- `subtitle-chunking`: 超长字幕的长度检测与智能分块策略，包括分块算法、分段总结提示词、合并总结流程

### Modified Capabilities

（无现有 spec 需要修改）

## Impact

- **代码**：`skills/yt-monitor/scripts/yt_subtitle_dl.py` 主要修改目标
- **依赖**：Gemini API 用于音频转录（首选）；本地 mlx-whisper（兜底，需 `pip install mlx-whisper`）
- **密钥**：新增 `GEMINI_API_KEY` 到 `$HOME/.wqq-skills/.env`（已有 `OPENAI_API_KEY` 等密钥管理机制）
- **存储**：音频文件临时存储后删除；转录文本与字幕文本格式一致，存入同一目录
- **SKILL.md**：需要更新故障处理和流程说明
