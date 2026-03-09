---
name: yt-monitor
description: "YouTube 频道监控 + 字幕下载 + AI 总结。监控关注的 YouTube 博主，自动检测新视频，下载字幕，生成结构化总结、信息图、要点提炼等。触发词：YouTube监控、频道更新、检查频道、新视频、视频总结、字幕下载。"
---

# YouTube 频道监控 + AI 总结 Skill

## 功能

监控 YouTube 频道新视频 → 通过 yt-dlp 下载字幕 → Claude 阅读字幕并生成总结/分析。

## 前置条件

1. **安装 uv**：`curl -LsSf https://astral.sh/uv/install.sh | sh`
2. **初始化环境**：`uv sync --project skills/yt-monitor`（自动安装 Python 3.10+ 和 yt-dlp）
3. **（可选）安装 mlx-whisper**：`uv sync --project skills/yt-monitor --extra transcribe`，用于无字幕视频的本地音频转录（仅 Apple Silicon Mac）

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

根据用户是否指定了频道，决定是否需要频道选择交互：

**第零步：确定要检查的频道**

- **用户已指定频道**（如「检查老李的更新」）→ 跳过选择，直接用 `--channel` 执行
- **用户未指定频道** → 先获取频道列表：
  ```bash
  uv run --project skills/yt-monitor python skills/yt-monitor/scripts/yt_rss_monitor.py list
  ```
  - **列表只有 1 个频道** → 跳过选择，直接检查该频道
  - **列表有 2 个以上频道** → 使用 **AskUserQuestion** 展示频道列表，提供「全部频道」和各频道名选项，让用户选择要检查的频道

**第一步：执行检查**

```bash
# 检查全部频道：
uv run --project skills/yt-monitor python skills/yt-monitor/scripts/yt_rss_monitor.py check --days 7
# 检查指定频道：
uv run --project skills/yt-monitor python skills/yt-monitor/scripts/yt_rss_monitor.py check --days 7 --channel 老李
```

向用户报告新视频列表（标题、链接、发布时间）。`--channel` 支持模糊匹配（子字符串，大小写不敏感）。

---

### 「总结最新视频」/「帮我看看最近的视频讲了什么」

完整流程：

**第一步：检查新视频**
```bash
uv run --project skills/yt-monitor python skills/yt-monitor/scripts/yt_rss_monitor.py check --days 7 --json
# 或只查某个频道：
uv run --project skills/yt-monitor python skills/yt-monitor/scripts/yt_rss_monitor.py check --days 7 --json --channel 老李
```

注意：`--json` 模式下日志输出到 stderr，stdout 只有纯 JSON。

> 频道选择逻辑同上「检查频道更新」章节：用户未指定频道且有多个频道时，先用 AskUserQuestion 让用户选择。

**第一步半：选择要总结的视频**

根据检查结果决定是否需要视频选择交互：

- **没有新视频** → 直接告知用户「没有新视频」，流程结束
- **只有 1 个新视频** → 跳过选择，直接进入第二步
- **用户明确要求全部总结**（如「全部总结」「都看看」）→ 跳过选择，处理全部视频
- **有 2 个以上新视频** → 使用 **AskUserQuestion** 展示视频列表（编号 + 标题 + 发布时间），提供「全部总结」和各视频的选项，让用户选择要总结的视频（支持多选）

**第二步：下载字幕**
将用户选择的视频 URL 传给字幕下载脚本：
```bash
uv run --project skills/yt-monitor python skills/yt-monitor/scripts/yt_subtitle_dl.py download "URL1" "URL2" ...
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
uv run --project skills/yt-monitor python skills/yt-monitor/scripts/yt_rss_monitor.py mark VIDEO_ID1 VIDEO_ID2 ...
```

---

### 「下载这个视频的字幕」

直接下载指定视频的字幕：

```bash
uv run --project skills/yt-monitor python skills/yt-monitor/scripts/yt_subtitle_dl.py download "https://www.youtube.com/watch?v=xxx"
```

然后用 Read 工具读取生成的文本文件。

---

### 「添加频道」/「关注新的 YouTube 频道」

根据用户提供的信息量，决定是否需要交互确认：

**场景 A：用户提供了频道 URL（但未提供频道名）**

1. 先从 URL 中解析频道 handle，向用户展示解析结果（频道名 + handle）
2. 使用 **AskUserQuestion** 询问用户：「即将添加频道 XXX（@handle），确认添加？」，提供「确认」「取消」选项
3. 用户确认后执行：
```bash
uv run --project skills/yt-monitor python skills/yt-monitor/scripts/yt_rss_monitor.py add "频道名称" "https://www.youtube.com/@handle"
```

**场景 B：用户只提供了频道名，没有 URL**

1. 使用 **AskUserQuestion** 请求用户补充频道 URL 或 handle：「请提供该频道的 YouTube URL 或 @handle，例如 https://www.youtube.com/@xxx」
2. 用户提供后，按场景 A 的流程执行

**场景 C：用户同时提供了频道名和 URL，信息完整**

直接执行添加，无需额外确认：
```bash
uv run --project skills/yt-monitor python skills/yt-monitor/scripts/yt_rss_monitor.py add "频道名称" "https://www.youtube.com/@handle"
```

---

### 「查看频道列表」

```bash
uv run --project skills/yt-monitor python skills/yt-monitor/scripts/yt_rss_monitor.py list
```

---

### 「标记视频为已处理」

```bash
uv run --project skills/yt-monitor python skills/yt-monitor/scripts/yt_rss_monitor.py mark VIDEO_ID1 VIDEO_ID2 ...
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

1. `yt_rss_monitor.py list` → 获取频道列表；若多频道且用户未指定 → AskUserQuestion 选择频道
2. `yt_rss_monitor.py check --json` → 获取新视频列表；若多个新视频 → AskUserQuestion 选择要总结的视频
3. `yt_subtitle_dl.py download URL1 URL2 ...` → 下载用户选择的视频字幕
4. 读取字幕文本 → Claude 生成总结
5. `yt_rss_monitor.py mark VIDEO_ID1 ...` → 标记已处理，避免下次重复

## 故障处理

- **「yt-dlp 未安装」**：提示 `brew install yt-dlp` 或 `pip install yt-dlp`
- **「没有找到字幕」**：脚本会自动使用 mlx-whisper 进行音频转录。如果转录也失败，检查是否安装了 mlx-whisper（`uv sync --project skills/yt-monitor --extra transcribe`，仅 Apple Silicon Mac）
- **「音频转录失败」**：检查 stderr 输出中的具体错误信息
- **「channel_id 解析失败」**：手动在 `config/channels.json` 中填写 channel_id

## 注意事项

- 所有命令从仓库根目录运行
- 字幕优先下载中文（zh/zh-Hans/zh-CN/zh-TW/zh-Hant），没有则下载英文（en）
- 自动生成的字幕质量可能不如手动字幕，总结时注意甄别
- 音频转录（`subtitle_type: "mlx-whisper"`）的文本可能不如字幕精确，总结时注意甄别
- 字幕文件保存在 `~/.wqq-skills/yt-monitor/subtitles/`，可定期清理
- 超长文本会自动分块（阈值 15000 字符），分块文件以 `_partN.txt` 命名
