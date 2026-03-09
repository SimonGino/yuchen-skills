## Why

yt-monitor 的两个 Python 脚本当前直接用 `python3`（系统 Python 3.9）执行。mlx-whisper 需要 Python 3.10+，导致音频转录功能无法正常工作（`import mlx_whisper` 崩溃）。需要引入 uv 来管理 Python 版本和依赖，确保脚本运行在正确的 Python 环境中。

## What Changes

- 在 `skills/yt-monitor/` 下初始化 uv 项目（`pyproject.toml`），声明 Python 版本要求和依赖（mlx-whisper、yt-dlp）
- 修改两个 Python 脚本中的 subprocess 调用，使用 `uv run` 而非 `sys.executable` 来执行子进程
- 更新 SKILL.md 中所有 `python3` 命令为 `uv run python` 命令
- 更新 CLAUDE.md 中的运行脚本示例

## Capabilities

### New Capabilities

- `uv-python-env`: 使用 uv 管理 yt-monitor 的 Python 版本和依赖，确保 mlx-whisper 等包运行在兼容的 Python 版本上

### Modified Capabilities

- `audio-transcription-fallback`: mlx-whisper 调用方式从 `sys.executable -c` 改为 `uv run python -c`，确保使用正确的 Python 版本

## Impact

- **skills/yt-monitor/pyproject.toml**：新增，定义 Python 版本和依赖
- **skills/yt-monitor/scripts/yt_subtitle_dl.py**：修改 mlx-whisper 和 yt-dlp 的调用方式
- **skills/yt-monitor/SKILL.md**：所有命令示例更新为 `uv run`
- **CLAUDE.md**：运行脚本示例更新
- **前置条件**：用户需安装 uv（`curl -LsSf https://astral.sh/uv/install.sh | sh`）
