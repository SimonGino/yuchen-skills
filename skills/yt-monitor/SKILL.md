---
name: yt-monitor
description: "YouTube 频道监控 + 字幕下载 + AI 总结。监控关注的 YouTube 博主，自动检测新视频，下载字幕，生成结构化总结、信息图、要点提炼等。触发词：YouTube监控、频道更新、检查频道、新视频、视频总结、字幕下载。"
---

# YouTube 频道监控 + AI 总结 Skill

## 功能

监控 YouTube 频道新视频 → 通过 yt-dlp 下载字幕 → Claude 阅读字幕并生成总结/分析。

## 前置条件

1. **安装 yt-dlp**：`brew install yt-dlp` 或 `pip install yt-dlp`
2. **（可选）安装 mlx-whisper**：`pip install mlx-whisper`，用于无字幕视频的本地音频转录（仅 Apple Silicon Mac）

## 文件结构

```
skills/yt-monitor/
├── SKILL.md
├── scripts/
│   ├── yt_rss_monitor.py        ← YouTube RSS 监控（无需 API Key）
│   └── yt_subtitle_dl.py        ← 字幕下载（yt-dlp，Python 实现）
└── config/
    └── channels.example.json    ← 频道配置示例

~/.wqq-skills/yt-monitor/        ← 运行时数据（自动创建）
├── channels.json                ← 频道配置（首次运行从示例初始化）
├── processed.json               ← 已处理视频记录
└── subtitles/                   ← 下载的字幕文本
```

> 注：本 skill 使用 Python 而非 TypeScript，因为依赖 yt-dlp CLI 和可选的 mlx-whisper 本地模型。

## 使用方式

---

### 「检查频道更新」/「有什么新视频」

```bash
python3 skills/yt-monitor/scripts/yt_rss_monitor.py check --days 7
# 只查某个频道：
python3 skills/yt-monitor/scripts/yt_rss_monitor.py check --days 7 --channel 老李
```

向用户报告新视频列表（标题、链接、发布时间）。`--channel` 支持模糊匹配（子字符串，大小写不敏感）。

---

### 「总结最新视频」/「帮我看看最近的视频讲了什么」

完整流程：

**第一步：检查新视频**
```bash
python3 skills/yt-monitor/scripts/yt_rss_monitor.py check --days 7 --json
# 或只查某个频道：
python3 skills/yt-monitor/scripts/yt_rss_monitor.py check --days 7 --json --channel 老李
```

注意：`--json` 模式下日志输出到 stderr，stdout 只有纯 JSON。

**第二步：下载字幕**
将视频 URL 传给字幕下载脚本：
```bash
python3 skills/yt-monitor/scripts/yt_subtitle_dl.py download "URL1" "URL2" ...
```

字幕会保存为纯文本到 `~/.wqq-skills/yt-monitor/subtitles/{video_id}.txt`。

如果视频没有字幕，脚本会自动使用本地 mlx-whisper 进行音频转录。

如果文本超长（>15000 字符），脚本会自动分块为 `{video_id}_part1.txt`、`_part2.txt` 等。

**第三步：阅读字幕并总结**
检查返回的 JSON 结果：

- 如果 `chunked: false`：直接用 Read 工具读取 `.txt` 文件并总结
- 如果 `chunked: true`：按顺序读取各 `_partN.txt` 文件，逐块总结后合并为最终总结。注意 `[上文重叠]` 标记的段落是上一块的结尾，用于保持上下文连贯，不要重复总结

总结应包含：
- 视频标题和频道
- 核心观点（3-5 个要点）
- 关键数据或论据
- 总结（2-3 句话概括全片）

**第四步：标记已处理**
总结完成后，用 mark 命令标记视频（传入 video_id）：
```bash
python3 skills/yt-monitor/scripts/yt_rss_monitor.py mark VIDEO_ID1 VIDEO_ID2 ...
```

---

### 「下载这个视频的字幕」

直接下载指定视频的字幕：

```bash
python3 skills/yt-monitor/scripts/yt_subtitle_dl.py download "https://www.youtube.com/watch?v=xxx"
```

然后用 Read 工具读取生成的文本文件。

---

### 「添加频道」/「关注新的 YouTube 频道」

```bash
python3 skills/yt-monitor/scripts/yt_rss_monitor.py add "频道名称" "https://www.youtube.com/@handle"
```

---

### 「查看频道列表」

```bash
python3 skills/yt-monitor/scripts/yt_rss_monitor.py list
```

---

### 「标记视频为已处理」

```bash
python3 skills/yt-monitor/scripts/yt_rss_monitor.py mark VIDEO_ID1 VIDEO_ID2 ...
```

---

## 输出格式

根据用户要求，Claude 可以生成不同格式的输出：

- **文字总结**（默认）：结构化的要点总结，适合快速了解视频内容
- **详细分析**：深入分析视频观点、论据、逻辑链
- **对比分析**：当多个视频涉及同一话题时，对比不同博主的观点
- **信息图**：以 HTML 或 Markdown 格式生成可视化的要点图
- **时间线**：按视频讨论顺序梳理内容脉络

用户没有指定格式时，默认生成文字总结。

---

## 完整流程示例

当用户说「检查频道更新，帮我总结新视频」时：

1. `yt_rss_monitor.py check --json` → 获取新视频 URL 列表
2. `yt_subtitle_dl.py download URL1 URL2 ...` → 下载字幕
3. 读取字幕文本 → Claude 生成总结
4. `yt_rss_monitor.py mark VIDEO_ID1 ...` → 标记已处理，避免下次重复

## 故障处理

- **「yt-dlp 未安装」**：提示 `brew install yt-dlp` 或 `pip install yt-dlp`
- **「没有找到字幕」**：脚本会自动使用 mlx-whisper 进行音频转录。如果转录也失败，检查是否安装了 mlx-whisper（`pip install mlx-whisper`，仅 Apple Silicon Mac）
- **「音频转录失败」**：检查 stderr 输出中的具体错误信息
- **「channel_id 解析失败」**：手动在 `config/channels.json` 中填写 channel_id

## 注意事项

- 所有命令从仓库根目录运行
- 字幕优先下载中文（zh/zh-Hans/zh-CN/zh-TW/zh-Hant），没有则下载英文（en）
- 自动生成的字幕质量可能不如手动字幕，总结时注意甄别
- 音频转录（`subtitle_type: "mlx-whisper"`）的文本可能不如字幕精确，总结时注意甄别
- 字幕文件保存在 `~/.wqq-skills/yt-monitor/subtitles/`，可定期清理
- 超长文本会自动分块（阈值 15000 字符），分块文件以 `_partN.txt` 命名
