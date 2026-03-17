## Context

`yt_subtitle_dl.py` 中共有 4 处 `subprocess.run(["yt-dlp", ...])` 调用（`ensure_yt_dlp`、`get_video_info`、`_download_audio`、`_try_download_sub`）和 2 处 `uv run` 调用（`_check_mlx_whisper`、`_transcribe_mlx_whisper`）。当前所有 yt-dlp 调用缺少认证参数，stderr 被静默丢弃，mlx-whisper 通过 Python import 而非 CLI 调用。

## Goals / Non-Goals

**Goals:**

- 所有 yt-dlp 调用统一携带 `--cookies-from-browser chrome --remote-components ejs:github`
- yt-dlp 失败时 stderr 可见，方便排查
- 下载字幕前先检测可用性，避免盲目尝试
- mlx-whisper 缺失时自动安装，安装后立即可用
- mlx-whisper 使用 CLI 模式调用，指定 `--language zh --output-format srt`
- SKILL.md 前置条件反映真实需求

**Non-Goals:**

- 不重构整体架构，只修改现有函数
- 不支持 Chrome 以外的浏览器 cookie 来源
- 不引入 yt-dlp Python API（保持 subprocess 调用方式）

## Decisions

### D1: yt-dlp 认证参数通过公共常量注入

提取公共参数列表 `YT_DLP_AUTH_ARGS = ["--cookies-from-browser", "chrome", "--remote-components", "ejs:github"]`，所有 yt-dlp 调用拼接此列表。

**备选方案**：每处调用硬编码 → 维护成本高，容易遗漏。
**备选方案**：封装 `run_yt_dlp()` 函数 → 过度抽象，各调用参数差异大，不值得。
**选择理由**：常量拼接最简单，改动最小。

### D2: 字幕可用性通过 `--list-subs --print "%(subtitles)j"` 预检

在 `download_subtitle()` 主流程开头增加一步：用 yt-dlp `--list-subs` 检测该视频是否有手动/自动字幕。根据检测结果决定走字幕下载还是直接走音频转录。

**备选方案**：保持现有的先尝试下载再看文件是否存在 → 当前正是这种方式导致静默失败。
**选择理由**：预检可以提前给出明确的日志输出，告知用户"该视频无字幕，将使用音频转录"。

### D3: stderr 在失败时直接打印

在 `_download_audio`、`_try_download_sub`、`get_video_info` 中，当 `result.returncode != 0` 时，将 `result.stderr` 的前 500 字符打印到 `sys.stderr`。

**备选方案**：写入日志文件 → MVP 阶段无日志框架，print 到 stderr 即可。
**选择理由**：最小改动，与现有 print 风格一致。

### D4: mlx-whisper 自动检测+自动安装

`_check_mlx_whisper()` 改为 `_ensure_mlx_whisper()`：
1. 先检查：`uv run --project $HOME/.claude/skills/yt-monitor python -c "import mlx_whisper"`
2. 若失败：自动执行 `uv sync --project $HOME/.claude/skills/yt-monitor --extra transcribe`
3. 安装后再次检查确认

**备选方案**：仅提示用户手动安装 → 用户体验差，每次都要手动操作。
**选择理由**：自动安装一次后后续直接可用，符合"检测→缺失则安装→下次直接用"的用户预期。

### D5: mlx-whisper 改用 CLI 模式调用

从 `python -c "import mlx_whisper; ..."` 改为 `uv run --project $HOME/.claude/skills/yt-monitor mlx_whisper "file.mp3" --model mlx-community/whisper-large-v3-turbo --language zh --output-format srt`。

**备选方案**：保持 Python import 方式 → 无法指定 `--language zh`，对中文内容识别效果差。
**选择理由**：CLI 模式支持 `--language`、`--output-format` 参数，与用户实际使用方式一致，且输出 srt 格式可直接复用现有字幕解析逻辑。

### D6: 项目路径使用 $HOME/.claude/skills/yt-monitor

mlx-whisper 相关的 `uv run --project` 路径从 `SKILL_DIR`（代码仓库 `Path(__file__).parent.parent`）改为 `Path.home() / ".claude" / "skills" / "yt-monitor"`。

**选择理由**：与用户实际运行环境一致，skill 安装到 `~/.claude/skills/` 下。

## Risks / Trade-offs

- **`--cookies-from-browser chrome` 要求 Chrome 进程未锁定 cookie 数据库** → 如果 Chrome 正在运行，某些 OS 上可能锁定数据库。macOS 上 yt-dlp 使用 Keychain 解密通常无问题。
- **`--remote-components ejs:github` 依赖 deno 运行时** → 如果 deno 未安装，yt-dlp 会报错。缓解：在 `ensure_yt_dlp()` 中增加 deno 检查。
- **自动安装 mlx-whisper 首次耗时较长**（~1.5GB 模型下载）→ 缓解：安装时打印进度提示。
- **srt 输出格式需要调整解析逻辑** → `_transcribe_mlx_whisper` 返回的不再是纯文本，而是 srt 文件路径，需要复用现有字幕清洗逻辑。
