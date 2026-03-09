## Requirements

### Requirement: uv 项目配置

skills/yt-monitor/ 下必须（SHALL）存在 `pyproject.toml`，声明 Python 版本要求和依赖。

#### Scenario: pyproject.toml 定义 Python 版本

- **WHEN** 查看 `skills/yt-monitor/pyproject.toml`
- **THEN** 必须包含 `requires-python = ">=3.10"`

#### Scenario: 核心依赖声明

- **WHEN** 查看 `pyproject.toml` 的 `[project.dependencies]`
- **THEN** 必须包含 `yt-dlp`

#### Scenario: 可选依赖声明

- **WHEN** 查看 `pyproject.toml` 的 `[project.optional-dependencies]`
- **THEN** 必须包含 `transcribe` 组，其中包含 `mlx-whisper`

### Requirement: 脚本通过 uv run 执行

所有 yt-monitor Python 脚本必须（SHALL）通过 `uv run` 执行，确保使用正确的 Python 版本和虚拟环境。

#### Scenario: 从仓库根目录执行脚本

- **WHEN** 用户或 Claude 从仓库根目录执行 yt-monitor 脚本
- **THEN** 命令格式为 `uv run --project skills/yt-monitor python skills/yt-monitor/scripts/<script>.py [args]`

#### Scenario: SKILL.md 中的命令示例

- **WHEN** 查看 SKILL.md 中的命令示例
- **THEN** 所有 `python3 skills/yt-monitor/scripts/` 命令必须替换为 `uv run --project skills/yt-monitor python skills/yt-monitor/scripts/`

### Requirement: mlx-whisper 子进程使用 uv 管理的 Python

mlx-whisper 转录子进程必须（SHALL）使用 uv 管理的 Python 环境，而非 `sys.executable`。

#### Scenario: mlx-whisper 检查使用 uv run

- **WHEN** `yt_subtitle_dl.py` 检查 mlx-whisper 是否可用
- **THEN** 必须通过 `uv run` 执行检查，而非 `sys.executable`

#### Scenario: mlx-whisper 转录使用 uv run

- **WHEN** `yt_subtitle_dl.py` 调用 mlx-whisper 转录音频
- **THEN** 必须通过 `uv run` 执行转录脚本，确保使用 Python 3.10+ 环境
