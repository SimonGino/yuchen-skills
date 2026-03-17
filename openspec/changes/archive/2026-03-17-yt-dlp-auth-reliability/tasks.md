## 1. yt-dlp 认证参数统一

- [x] 1.1 在 `yt_subtitle_dl.py` 顶部添加 `YT_DLP_AUTH_ARGS = ["--cookies-from-browser", "chrome", "--remote-components", "ejs:github"]` 常量
- [x] 1.2 `_download_audio` 的 yt-dlp 命令拼接 `YT_DLP_AUTH_ARGS`
- [x] 1.3 `_try_download_sub` 的 yt-dlp 命令拼接 `YT_DLP_AUTH_ARGS`
- [x] 1.4 `get_video_info` 的 yt-dlp 命令拼接 `YT_DLP_AUTH_ARGS`
- [x] 1.5 `ensure_yt_dlp()` 增加 `deno --version` 检查，失败时打印安装提示

## 2. 错误信息透明化

- [x] 2.1 `_download_audio` 在 `result.returncode != 0` 时打印 `result.stderr[:500]` 到 sys.stderr
- [x] 2.2 `_try_download_sub` 在 `result.returncode != 0` 时打印 `result.stderr[:500]` 到 sys.stderr
- [x] 2.3 `get_video_info` 在 `result.returncode != 0` 时打印 `result.stderr[:500]` 到 sys.stderr

## 3. 字幕可用性预检

- [x] 3.1 新增 `_check_subtitles(url)` 函数，用 yt-dlp `--list-subs --skip-download` + `YT_DLP_AUTH_ARGS` 检测字幕可用性，返回 `("manual" | "auto" | None)`
- [x] 3.2 在 `download_subtitle()` 主流程开头调用 `_check_subtitles()`，根据结果分流：有手动字幕→下载手动、仅有自动→下载自动、无字幕→直接进入音频转录
- [x] 3.3 检测失败时回退到现有逐步尝试逻辑，并打印 stderr 日志

## 4. mlx-whisper 自动检测与安装

- [x] 4.1 添加 `MLX_PROJECT_DIR = Path.home() / ".claude" / "skills" / "yt-monitor"` 常量
- [x] 4.2 将 `_check_mlx_whisper()` 重构为 `_ensure_mlx_whisper()`：检测失败→自动 `uv sync --project $MLX_PROJECT_DIR --extra transcribe`→安装后再次检测确认
- [x] 4.3 `_ensure_mlx_whisper()` 在安装过程中打印进度提示，安装失败时打印 stderr

## 5. mlx-whisper CLI 模式调用

- [x] 5.1 重写 `_transcribe_mlx_whisper()`：改为 `uv run --project $MLX_PROJECT_DIR mlx_whisper "{audio_path}" --model mlx-community/whisper-large-v3-turbo --language zh --output-format srt`
- [x] 5.2 解析 srt 输出（文件或 stdout），提取纯文本内容，复用现有字幕清洗逻辑
- [x] 5.3 保留 600 秒超时和失败时的 stderr 输出

## 6. 文档更新

- [x] 6.1 更新 SKILL.md 前置条件：添加 Chrome 浏览器需登录 YouTube、deno 运行时要求
- [x] 6.2 更新 SKILL.md 中 mlx-whisper 的描述：从"可选"改为"中文频道必需，首次使用时自动安装"
- [x] 6.3 更新 CLAUDE.md 中 yt-monitor 相关的命令示例（如有需要）
