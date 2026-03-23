"""
Preflight dependency checker for yt-monitor.
Checks yt-dlp, deno, and mlx-whisper availability.
Outputs structured JSON — does NOT install anything.
"""
from __future__ import annotations

import json
import subprocess
import sys
from pathlib import Path

SKILL_DIR = Path(__file__).parent.parent


def check_dependency(name: str, cmd: list[str], *, required: bool = True, install_cmd: str = "", note: str = "") -> dict:
    try:
        result = subprocess.run(cmd, capture_output=True, text=True, timeout=10)
        if result.returncode == 0:
            version = result.stdout.strip().splitlines()[0] if result.stdout.strip() else "unknown"
            entry: dict = {"name": name, "status": "ok", "version": version, "required": required}
            if note:
                entry["note"] = note
            return entry
    except FileNotFoundError:
        pass
    except (subprocess.TimeoutExpired, subprocess.CalledProcessError):
        pass
    entry = {"name": name, "status": "missing", "required": required}
    if install_cmd:
        entry["install_cmd"] = install_cmd
    if note:
        entry["note"] = note
    return entry


def _get_all_checks() -> list[dict]:
    project = str(SKILL_DIR)
    return [
        check_dependency("yt-dlp", ["yt-dlp", "--version"], required=True, install_cmd="brew install yt-dlp"),
        check_dependency("deno", ["deno", "--version"], required=True, install_cmd="brew install deno"),
        check_dependency("mlx-whisper",
            ["uv", "run", "--project", project, "python", "-c", "import mlx_whisper"],
            required=False, install_cmd=f"uv sync --project {project} --extra transcribe",
            note="可选，仅 Apple Silicon，用于无字幕视频的语音转录"),
    ]


def run_preflight() -> dict:
    checks = _get_all_checks()
    all_ok = all(c["status"] == "ok" for c in checks if c.get("required", True))
    return {"all_ok": all_ok, "checks": checks}


def main():
    result = run_preflight()
    print(json.dumps(result, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
