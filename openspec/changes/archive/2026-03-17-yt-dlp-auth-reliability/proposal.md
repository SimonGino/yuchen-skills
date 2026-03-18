## Why

yt-monitor 技能在实际使用中暴露出多个可靠性问题，导致**所有 yt-dlp 请求失败**。2026 年 YouTube 已强制要求 cookie 认证 + JS challenge 验证，但代码中所有 `yt-dlp` 调用均缺少必要的认证参数。此外，错误信息被 `capture_output=True` 吞掉，排查困难；mlx-whisper 被标记为"可选"但对中文频道是必需品且调用方式不对；`_check_mlx_whisper` 存在时序 bug；SKILL.md 前置条件文档过时。

## What Changes

- 所有 `yt-dlp` 调用统一添加 `--cookies-from-browser chrome` 和 `--remote-components ejs:github` 参数，解决 YouTube bot 检测拦截
- yt-dlp 在下载字幕前先用 `--list-subs` 检测字幕可用性，避免盲目尝试下载后静默失败
- `_download_audio`、`_try_download_sub`、`get_video_info` 在 yt-dlp 失败时将 stderr 输出到日志，而非静默丢弃
- mlx-whisper 改为**自动检测+自动安装**：启动时检查是否已装，未装则自动执行 `uv sync --extra transcribe` 安装，下次运行直接可用
- mlx-whisper 调用方式从 Python import（`python -c "import mlx_whisper; ..."`）改为 **CLI 模式**：`uv run --project $HOME/.claude/skills/yt-monitor mlx_whisper "file.mp3" --model mlx-community/whisper-large-v3-turbo --language zh --output-format srt`
- 修复 `_check_mlx_whisper` 的时序 bug：首次创建 uv 虚拟环境后立即 import 检查可能误报 False
- 更新 SKILL.md 前置条件：明确 Chrome 浏览器需登录 YouTube、`deno` 运行时为必需项

## Capabilities

### New Capabilities

- `yt-dlp-auth`: 统一管理 yt-dlp 认证参数（`--cookies-from-browser chrome`、`--remote-components ejs:github`），确保所有调用都携带正确的认证配置
- `subtitle-detection`: 下载前先检测字幕可用性（`--list-subs`），根据结果决定走字幕下载还是音频转录路径，避免盲目尝试

### Modified Capabilities

- `audio-transcription-fallback`: 三项变更——(1) mlx-whisper 自动检测+缺失时自动安装；(2) 调用方式从 Python import 改为 CLI 模式（`mlx_whisper` 命令 + `--language zh --output-format srt`）；(3) 修复时序 bug

## Impact

- **代码**：`skills/yt-monitor/scripts/yt_subtitle_dl.py` — 所有 `subprocess.run(["yt-dlp", ...])` 调用点 + mlx-whisper 调用重构
- **依赖**：需要 `deno` 运行时支持 `--remote-components ejs:github`（JS challenge）
- **文档**：`skills/yt-monitor/SKILL.md` 前置条件章节需全面更新
- **路径**：mlx-whisper 项目路径从 `SKILL_DIR`（代码仓库内）改为 `$HOME/.claude/skills/yt-monitor`（运行时路径）
