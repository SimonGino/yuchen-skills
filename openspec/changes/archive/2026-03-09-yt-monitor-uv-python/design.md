## Context

yt-monitor skill 包含两个 Python 脚本（`yt_rss_monitor.py` 和 `yt_subtitle_dl.py`），当前直接用系统 `python3`（macOS 自带 3.9）执行。`yt_subtitle_dl.py` 中的 mlx-whisper 转录功能通过 `sys.executable -c` 调用子进程，继承了系统 Python 3.9，而 mlx-whisper 需要 Python 3.10+，导致 import 即崩溃。

用户已安装 uv 0.10.0，可以用它管理 Python 版本和依赖。

## Goals / Non-Goals

**Goals:**

- 用 uv 管理 yt-monitor 的 Python 环境，确保使用 Python 3.10+
- 通过 `pyproject.toml` 声明依赖（mlx-whisper、yt-dlp），一次 `uv sync` 即可就绪
- 修复 mlx-whisper 在子进程中使用错误 Python 版本的问题

**Non-Goals:**

- 不为其他 skill（x-bookmarks、x-to-md 等 TypeScript skill）引入 uv
- 不修改 `yt_rss_monitor.py` 的执行方式（它只用标准库，不需要 uv 管理的依赖）
- 不改变脚本的功能逻辑

## Decisions

### 决策 1：在 skills/yt-monitor/ 下初始化 uv 项目

**选择**：在 `skills/yt-monitor/` 创建 `pyproject.toml`，声明 `requires-python = ">=3.10"` 和依赖。

**理由**：每个 skill 自包含，uv 项目放在 skill 目录下最自然。`yt_rss_monitor.py` 只用标准库，但统一用 `uv run` 执行更简洁一致。

**替代方案**：在仓库根目录统一管理 → 违反 skill 自包含原则，且其他 skill 是 TypeScript。

### 决策 2：mlx-whisper 作为可选依赖

**选择**：将 mlx-whisper 声明为可选依赖组 `[project.optional-dependencies]` 中的 `transcribe`，yt-dlp 作为核心依赖。

**理由**：mlx-whisper 仅 Apple Silicon Mac 可用，且模型较大（~1.5GB）。不强制安装，用户按需 `uv sync --extra transcribe`。

### 决策 3：SKILL.md 和 CLAUDE.md 中的命令格式

**选择**：所有 Python 脚本命令改为 `uv run --project skills/yt-monitor python skills/yt-monitor/scripts/xxx.py`。

**理由**：从仓库根目录执行时需要 `--project` 指定项目位置，uv 会自动使用正确的 Python 版本和虚拟环境。

## Risks / Trade-offs

- **[用户需要额外安装 uv]** → uv 安装极简（一行 curl），且用户已安装
- **[命令变长]** → 通过 SKILL.md 定义，Claude 自动执行，用户无感知
- **[首次 uv sync 需要下载 Python]** → 只需一次，uv 会自动管理 Python 版本缓存
