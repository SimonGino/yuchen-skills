## 1. 初始化 uv 项目

- [x] 1.1 在 `skills/yt-monitor/` 下创建 `pyproject.toml`，声明 `requires-python = ">=3.10"`，核心依赖 `yt-dlp`，可选依赖组 `transcribe = ["mlx-whisper"]`
- [x] 1.2 运行 `uv sync --project skills/yt-monitor --extra transcribe` 验证环境创建成功，将 `.venv` 和 `uv.lock` 加入 `.gitignore`

## 2. 修改脚本中的子进程调用

- [x] 2.1 修改 `yt_subtitle_dl.py` 中 `_check_mlx_whisper()`：将 `sys.executable -c "import mlx_whisper"` 改为 `uv run --project <skill_dir> python -c "import mlx_whisper"`
- [x] 2.2 修改 `yt_subtitle_dl.py` 中 `_transcribe_mlx_whisper()`：将 `sys.executable -c` 改为 `uv run --project <skill_dir> python -c`
- [x] 2.3 修改错误提示信息：将 `pip install mlx-whisper` 改为 `uv sync --project skills/yt-monitor --extra transcribe`

## 3. 更新文档

- [x] 3.1 更新 `SKILL.md` 中所有 `python3 skills/yt-monitor/scripts/` 命令为 `uv run --project skills/yt-monitor python skills/yt-monitor/scripts/` 格式
- [x] 3.2 更新 `SKILL.md` 前置条件：添加 uv 安装说明，mlx-whisper 改为 `uv sync --extra transcribe`
- [x] 3.3 更新 `CLAUDE.md` 中的运行脚本示例

## 4. 验证

- [x] 4.1 运行 `uv run --project skills/yt-monitor python skills/yt-monitor/scripts/yt_rss_monitor.py list` 验证基本命令正常
- [x] 4.2 运行 `uv run --project skills/yt-monitor python -c "import mlx_whisper; print('ok')"` 验证 mlx-whisper 可正常导入
