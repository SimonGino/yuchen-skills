# yt-monitor 优化设计

日期：2026-03-23
状态：待实施

## 概述

对 yt-monitor skill 进行 4 项优化，提升依赖管理、信息展示、状态跟踪和摘要质量。采用**职责分层**方案：确定性操作放入 Python 脚本，非确定性逻辑（摘要生成、用户交互）由 SKILL.md 编排。

## 变更范围

| 优化项 | 变更位置 | 类型 |
|--------|---------|------|
| 前置依赖检查 | `yt_rss_monitor.py` + SKILL.md | 新增子命令 + 流程变更 |
| 丰富视频信息 | `yt_rss_monitor.py` | 增强输出格式 |
| 多状态跟踪 | `yt_rss_monitor.py` + `yt_subtitle_dl.py` | 数据结构升级 |
| 摘要维度增强 | SKILL.md | 模板更新 |

---

## 1. 前置统一依赖检查

### 1.1 新增 `preflight` 子命令

位置：`yt_rss_monitor.py`

```bash
uv run --project skills/yt-monitor python skills/yt-monitor/scripts/yt_rss_monitor.py preflight
```

输出结构化 JSON：

```json
{
  "all_ok": false,
  "checks": [
    {"name": "yt-dlp", "status": "ok", "version": "2025.01.15"},
    {"name": "deno", "status": "missing", "install_cmd": "brew install deno"},
    {"name": "mlx-whisper", "status": "not_installed", "install_cmd": "uv sync --project skills/yt-monitor --extra transcribe", "required": false, "note": "可选，仅 Apple Silicon，用于无字幕视频的语音转录"}
  ]
}
```

### 1.2 检查项

| 依赖 | 检查方式 | 必需 | 安装命令 |
|------|---------|------|---------|
| yt-dlp | `yt-dlp --version` | 是 | `brew install yt-dlp` |
| deno | `deno --version` | 是 | `brew install deno` |
| mlx-whisper | `python -c "import mlx_whisper"` | 否 | `uv sync --project skills/yt-monitor --extra transcribe` |

### 1.3 设计要点

- `preflight` 只做检查和报告，不执行安装
- uv 存在性隐含验证（命令本身通过 `uv run` 执行）
- `all_ok` 只看必需依赖（mlx-whisper 缺失不影响 `all_ok`）
- SKILL.md 要求：所有工作流开始前先跑 preflight；缺失时通过 AskUserQuestion 询问用户是否安装

---

## 2. 丰富视频信息输出

### 2.1 `check` 子命令增加 `--enrich` 参数

```bash
uv run --project skills/yt-monitor python skills/yt-monitor/scripts/yt_rss_monitor.py check --enrich
```

### 2.2 增强后的输出格式

```json
{
  "channel": "频道名",
  "new_videos": [
    {
      "video_id": "xxx",
      "title": "视频标题",
      "url": "https://www.youtube.com/watch?v=xxx",
      "published": "2026-03-22T10:00:00+00:00",
      "published_relative": "1天前",
      "description_snippet": "前200字的描述摘要...",
      "duration": "15:30",
      "duration_seconds": 930
    }
  ]
}
```

### 2.3 新增字段说明

| 字段 | 来源 | 说明 |
|------|------|------|
| `published_relative` | 纯 Python datetime 计算 | 中文相对时间（"刚刚"/"3小时前"/"2天前"） |
| `description_snippet` | RSS `<media:description>` 截取前 200 字符 | 与现有 `fetch_channel_feed` 的 200 字符截断一致 |
| `duration` | `yt-dlp --dump-json` | 格式化时长（MM:SS 或 H:MM:SS） |
| `duration_seconds` | `yt-dlp --dump-json` | 秒数，方便程序处理 |

`published_relative` 规则：<1分钟="刚刚"，<1小时="N分钟前"，<24小时="N小时前"，<7天="N天前"，否则显示日期。纯 stdlib 实现，不引入外部依赖。未来时间戳（时钟偏差）视为"刚刚"。

### 2.4 不加 `--enrich` 时

只使用 RSS 数据（速度快），`duration` 和 `duration_seconds` 为 `null`，其余字段正常返回。

### 2.5 yt-dlp 调用方式

对每个新视频执行：
```bash
yt-dlp --dump-json --no-download "https://www.youtube.com/watch?v=VIDEO_ID"
```
从返回 JSON 提取 `duration` 字段。使用与现有代码相同的认证参数（`YT_DLP_AUTH_ARGS`）。

**错误隔离**：单个视频的 `--dump-json` 失败（超时、地区限制等）不影响其他视频。失败时 `duration` 和 `duration_seconds` 回退为 `null`，日志记录到 stderr。

**性能**：使用 `concurrent.futures.ThreadPoolExecutor` 并行获取，`max_workers=4`。每个调用复用现有 `yt_subtitle_dl.py` 中的 30 秒超时（`timeout=30`）。

### 2.6 SKILL.md 配合

默认使用 `--enrich` 版本。Claude 展示视频列表时包含时长、发布时间、描述摘要。

---

## 3. 多状态跟踪

### 3.1 数据结构升级

`processed.json` 升级为：

```json
{
  "version": 2,
  "videos": {
    "VIDEO_ID_1": {
      "title": "视频标题",
      "channel": "频道名",
      "status": "summarized",
      "downloaded_at": "2026-03-22T10:00:00+00:00",
      "summarized_at": "2026-03-22T10:30:00+00:00",
      "published_at": null
    }
  }
}
```

### 3.2 三个状态

| 状态 | 含义 | 设置时机 |
|------|------|---------|
| `downloaded` | 字幕已下载，等待总结 | `yt_subtitle_dl.py` 下载成功后自动设置 |
| `summarized` | 总结已完成 | Claude 完成总结后调用 `mark --status summarized` |
| `published` | 已发布到外部平台 | 可选，用户或 Claude 手动标记 |

### 3.3 命令变更

**`mark` 子命令升级：**
```bash
uv run --project skills/yt-monitor python skills/yt-monitor/scripts/yt_rss_monitor.py mark VIDEO_ID --status downloaded|summarized|published --title "标题" --channel "频道名"
```

- 默认 status 为 `summarized`（向后兼容旧调用方式 `mark VIDEO_ID`）
- `--title` 和 `--channel` 可选。如果视频已有记录，复用已有的 title/channel；如果是新记录且未提供，则存空字符串
- 状态只能前进（downloaded→summarized→published），不能回退

**新增 `status` 子命令：**
```bash
uv run --project skills/yt-monitor python skills/yt-monitor/scripts/yt_rss_monitor.py status
```

输出每个视频包含所有已有的时间戳：
```json
{
  "downloaded": [{"video_id": "xxx", "title": "...", "channel": "...", "downloaded_at": "..."}],
  "summarized": [{"video_id": "yyy", "title": "...", "channel": "...", "downloaded_at": "...", "summarized_at": "..."}],
  "published": [{"video_id": "zzz", "title": "...", "channel": "...", "downloaded_at": "...", "summarized_at": "...", "published_at": "..."}]
}
```

注意：`status` 和 `check --resume` 存在功能重叠。`check --resume` 的价值在于它集成在 check 工作流中（可结合 `--enrich` 获取时长），而 `status` 是全局视图。两者保留。

**`check` 子命令增加 `--resume` 参数：**
```bash
uv run --project skills/yt-monitor python skills/yt-monitor/scripts/yt_rss_monitor.py check --resume
```
列出 status=downloaded 但未 summarized 的视频，方便断点续做。可与 `--enrich` 组合使用。

### 3.4 去重逻辑

- `check_new_videos` 跳过所有在 `videos` 中存在的 ID（无论状态）
- 不再使用旧的 `processed_videos` 键名

### 3.5 向后兼容

读取 `processed.json` 时检测格式：
- 无 `version` 字段或 `version: 1`：旧格式，自动迁移
- 迁移逻辑：`processed_videos` 中所有记录转为 `videos`，状态设为 `summarized`，`imported_at` 映射为 `summarized_at`
- 迁移后写入新格式并设置 `version: 2`
- 已知数据质量限制：旧 `mark` 命令写入的记录 title/channel 为空字符串，迁移后保持原样（不尝试回填）

### 3.6 yt_subtitle_dl.py 变更与 state.py 模块设计

**state.py 模块边界：**

新建 `scripts/state.py`，从 `yt_rss_monitor.py` 提取以下职责：
- 常量：`DATA_DIR`、`PROCESSED_PATH`（两个脚本共用，不再各自定义）
- 函数：`load_state()`、`save_state()`、`mark_video()`、`get_videos_by_status()`、`migrate_v1_to_v2()`
- `yt_subtitle_dl.py` 保留自己的 `SUBTITLE_DIR = DATA_DIR / "subtitles"`，但从 `state` 导入 `DATA_DIR`

**导入机制：**

两个脚本均通过 `uv run` 从项目根目录执行，Python 的工作目录为项目根。使用 `sys.path` 插入脚本目录：
```python
import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).parent))
from state import load_state, mark_video, DATA_DIR
```

**yt_subtitle_dl.py 自动标记：**

下载成功后（`download` 函数返回 `success: true`），调用 `state.mark_video()`：
```python
from state import mark_video
# 下载成功后
mark_video(video_id, status="downloaded", title=title, channel=channel)
```
此时 title 和 channel 信息可从 yt-dlp 返回的元数据中获取。

---

## 4. 摘要维度增强

### 4.1 默认摘要模板（SKILL.md 变更）

```markdown
## 视频摘要：{标题}
频道：{频道名} | 时长：{时长} | 发布：{相对时间}

### 核心观点
- （3-5 个要点）

### 关键数据/论据
- （重要数字、引用、实验结果等）

### 行动项
- （可执行的建议、操作步骤）
- 如果视频教学了某个操作，列出关键步骤
- 仅在视频确实给出可执行建议时填写，否则省略此 section

### 提到的工具/资源
- 工具名 — 简要说明 — 链接（如有）
- 仅在视频提到了具体工具、产品或资源时填写

### 标签
#标签1 #标签2 #标签3（3-5个中文分类标签，聚焦主题领域）

### 总结
（2-3 句话概括核心内容和价值）
```

### 4.2 语言约束

摘要始终使用**简体中文**，与项目 `openspec/config.yaml` 的语言要求一致。无论视频原始语言是中文还是英文，输出的摘要、标签、行动项均用中文撰写。

### 4.3 变更要点

| 新增维度 | 说明 |
|---------|------|
| 行动项 | 可执行建议，有则写无则省略 |
| 工具/资源 | 视频中提到的工具、产品、链接 |
| 标签 | 3-5个中文标签，方便后续检索和分类 |

### 4.4 暂不实现

- **相关度评分**：需要先定义用户兴趣 profile，增加配置负担。用户通过标签和核心观点即可自行判断。后续有需求再加。

---

## 文件变更清单

### Python 代码变更

| 文件 | 变更类型 | 内容 |
|------|---------|------|
| `scripts/yt_rss_monitor.py` | 修改 | 新增 preflight/status 子命令；增强 check 输出；升级 mark 命令；多状态数据结构 |
| `scripts/yt_subtitle_dl.py` | 修改 | 下载成功后自动标记 downloaded 状态 |
| `scripts/state.py` | 新增 | 状态管理共享模块（读写 processed.json、状态迁移、格式兼容） |

### Skill 定义变更

| 文件 | 变更类型 | 内容 |
|------|---------|------|
| `SKILL.md` | 修改 | 新增 preflight 流程；更新命令示例；更新摘要模板；新增 --enrich/--resume 说明 |

### 不变更

- `pyproject.toml`：无新依赖
- `config/channels.example.json`：格式不变
- `uv.lock`：无新依赖
