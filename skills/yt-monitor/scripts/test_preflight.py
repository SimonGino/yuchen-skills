"""Tests for preflight dependency checking."""
import json
import sys
from pathlib import Path
from unittest.mock import patch, MagicMock

sys.path.insert(0, str(Path(__file__).parent))

from preflight import check_dependency, run_preflight


def test_check_dependency_ok():
    with patch("subprocess.run") as mock_run:
        mock_run.return_value = MagicMock(returncode=0, stdout="2025.01.15\n", stderr="")
        result = check_dependency("yt-dlp", ["yt-dlp", "--version"], required=True)
        assert result["status"] == "ok"
        assert result["version"] == "2025.01.15"
        assert result["name"] == "yt-dlp"

def test_check_dependency_missing():
    with patch("subprocess.run", side_effect=FileNotFoundError):
        result = check_dependency("deno", ["deno", "--version"], required=True, install_cmd="brew install deno")
        assert result["status"] == "missing"
        assert result["install_cmd"] == "brew install deno"

def test_check_dependency_optional():
    with patch("subprocess.run", side_effect=FileNotFoundError):
        result = check_dependency("mlx-whisper", ["python", "-c", "import mlx_whisper"], required=False, install_cmd="uv sync --extra transcribe")
        assert result["status"] == "missing"
        assert result["required"] is False

def test_run_preflight_all_ok():
    fake_checks = [
        {"name": "yt-dlp", "status": "ok", "version": "2025.01", "required": True},
        {"name": "deno", "status": "ok", "version": "1.40", "required": True},
        {"name": "mlx-whisper", "status": "missing", "required": False, "install_cmd": "uv sync --extra transcribe"},
    ]
    with patch("preflight._get_all_checks", return_value=fake_checks):
        result = run_preflight()
        assert result["all_ok"] is True
        assert len(result["checks"]) == 3

def test_run_preflight_not_ok():
    fake_checks = [
        {"name": "yt-dlp", "status": "missing", "required": True, "install_cmd": "brew install yt-dlp"},
        {"name": "deno", "status": "ok", "version": "1.40", "required": True},
    ]
    with patch("preflight._get_all_checks", return_value=fake_checks):
        result = run_preflight()
        assert result["all_ok"] is False
