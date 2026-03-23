# yt-monitor Optimization Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Optimize the yt-monitor skill with preflight dependency checks, enriched video output, multi-state tracking, and enhanced summary dimensions.

**Architecture:** Extract state management into a shared `state.py` module imported by both `yt_rss_monitor.py` and `yt_subtitle_dl.py`. Add `preflight`, `status`, and enhanced `check`/`mark` subcommands to the CLI. Update SKILL.md with new workflows and summary template.

**Tech Stack:** Python 3.10+ (stdlib only, no new dependencies), uv, yt-dlp, concurrent.futures for parallel enrichment.

**Spec:** `docs/superpowers/specs/2026-03-23-yt-monitor-optimization-design.md`

---

## File Structure

| File | Action | Responsibility |
|------|--------|----------------|
| `skills/yt-monitor/scripts/state.py` | Create | State management: load/save processed.json, mark videos, v1→v2 migration, status queries |
| `skills/yt-monitor/scripts/test_state.py` | Create | Tests for state.py |
| `skills/yt-monitor/scripts/preflight.py` | Create | Dependency checking: yt-dlp, deno, mlx-whisper version/presence detection |
| `skills/yt-monitor/scripts/test_preflight.py` | Create | Tests for preflight.py |
| `skills/yt-monitor/scripts/yt_rss_monitor.py` | Modify | Import state.py, add preflight/status/resume CLI, enrich output with published_relative/description_snippet/duration |
| `skills/yt-monitor/scripts/test_enrich.py` | Create | Tests for published_relative and duration enrichment |
| `skills/yt-monitor/scripts/yt_subtitle_dl.py` | Modify | Import state.py, auto-mark downloaded after successful subtitle download |
| `skills/yt-monitor/SKILL.md` | Modify | Add preflight flow, update commands, new summary template |

---

### Task 1: Create `state.py` — core state management module

**Files:**
- Create: `skills/yt-monitor/scripts/state.py`
- Create: `skills/yt-monitor/scripts/test_state.py`

- [ ] **Step 1: Write tests for v2 state load/save and mark_video**

```python
# skills/yt-monitor/scripts/test_state.py
"""Tests for state management module."""
import json
import os
import tempfile
from pathlib import Path

# Allow sibling imports
import sys
sys.path.insert(0, str(Path(__file__).parent))

from state import (
    load_state, save_state, mark_video, get_videos_by_status,
    migrate_v1_to_v2, STATE_VERSION,
)


def test_load_state_creates_empty_if_missing():
    """load_state returns empty v2 structure when file doesn't exist."""
    with tempfile.TemporaryDirectory() as tmp:
        path = Path(tmp) / "processed.json"
        data = load_state(path)
        assert data["version"] == STATE_VERSION
        assert data["videos"] == {}


def test_save_and_load_roundtrip():
    """save_state then load_state preserves data."""
    with tempfile.TemporaryDirectory() as tmp:
        path = Path(tmp) / "processed.json"
        state = {"version": 2, "videos": {"abc123": {
            "title": "Test", "channel": "Ch", "status": "downloaded",
            "downloaded_at": "2026-03-23T00:00:00+00:00",
            "summarized_at": None, "published_at": None,
        }}}
        save_state(state, path)
        loaded = load_state(path)
        assert loaded == state


def test_mark_video_downloaded():
    """mark_video sets status to downloaded with timestamp."""
    with tempfile.TemporaryDirectory() as tmp:
        path = Path(tmp) / "processed.json"
        state = load_state(path)
        mark_video(state, "vid1", status="downloaded", title="Title1", channel="Ch1")
        save_state(state, path)

        loaded = load_state(path)
        vid = loaded["videos"]["vid1"]
        assert vid["status"] == "downloaded"
        assert vid["title"] == "Title1"
        assert vid["channel"] == "Ch1"
        assert vid["downloaded_at"] is not None
        assert vid["summarized_at"] is None


def test_mark_video_status_progression():
    """mark_video advances status: downloaded → summarized → published."""
    with tempfile.TemporaryDirectory() as tmp:
        path = Path(tmp) / "processed.json"
        state = load_state(path)

        mark_video(state, "vid1", status="downloaded", title="T", channel="C")
        assert state["videos"]["vid1"]["status"] == "downloaded"
        assert state["videos"]["vid1"]["downloaded_at"] is not None

        mark_video(state, "vid1", status="summarized")
        assert state["videos"]["vid1"]["status"] == "summarized"
        assert state["videos"]["vid1"]["summarized_at"] is not None
        # title/channel preserved from initial mark
        assert state["videos"]["vid1"]["title"] == "T"

        mark_video(state, "vid1", status="published")
        assert state["videos"]["vid1"]["status"] == "published"
        assert state["videos"]["vid1"]["published_at"] is not None


def test_mark_video_no_backward():
    """mark_video refuses to go backward (summarized → downloaded)."""
    with tempfile.TemporaryDirectory() as tmp:
        path = Path(tmp) / "processed.json"
        state = load_state(path)
        mark_video(state, "vid1", status="summarized", title="T", channel="C")
        mark_video(state, "vid1", status="downloaded")
        # status should remain summarized
        assert state["videos"]["vid1"]["status"] == "summarized"


def test_get_videos_by_status():
    """get_videos_by_status groups videos correctly."""
    state = {"version": 2, "videos": {
        "a": {"title": "A", "channel": "C", "status": "downloaded",
               "downloaded_at": "t1", "summarized_at": None, "published_at": None},
        "b": {"title": "B", "channel": "C", "status": "summarized",
               "downloaded_at": "t1", "summarized_at": "t2", "published_at": None},
        "c": {"title": "C", "channel": "C", "status": "published",
               "downloaded_at": "t1", "summarized_at": "t2", "published_at": "t3"},
    }}
    result = get_videos_by_status(state)
    assert len(result["downloaded"]) == 1
    assert result["downloaded"][0]["video_id"] == "a"
    assert len(result["summarized"]) == 1
    assert len(result["published"]) == 1
    # summarized entry should include downloaded_at
    assert result["summarized"][0]["downloaded_at"] == "t1"


def test_migrate_v1_to_v2():
    """migrate_v1_to_v2 converts old format correctly."""
    v1 = {"processed_videos": {
        "old1": {"title": "Old Vid", "channel": "OldCh", "imported_at": "2026-01-01T00:00:00+00:00"},
        "old2": {"title": "", "channel": "", "imported_at": "2026-02-01T00:00:00+00:00"},
    }}
    v2 = migrate_v1_to_v2(v1)
    assert v2["version"] == STATE_VERSION
    assert "old1" in v2["videos"]
    assert v2["videos"]["old1"]["status"] == "summarized"
    assert v2["videos"]["old1"]["summarized_at"] == "2026-01-01T00:00:00+00:00"
    assert v2["videos"]["old1"]["downloaded_at"] is None
    # Empty title/channel preserved as-is
    assert v2["videos"]["old2"]["title"] == ""


def test_migrate_v1_file_auto():
    """load_state auto-migrates v1 file and writes v2."""
    with tempfile.TemporaryDirectory() as tmp:
        path = Path(tmp) / "processed.json"
        v1 = {"processed_videos": {
            "x": {"title": "X", "channel": "C", "imported_at": "2026-01-01T00:00:00+00:00"},
        }}
        with open(path, "w") as f:
            json.dump(v1, f)

        state = load_state(path)
        assert state["version"] == STATE_VERSION
        assert state["videos"]["x"]["status"] == "summarized"

        # File should now be v2 on disk
        with open(path) as f:
            on_disk = json.load(f)
        assert on_disk["version"] == STATE_VERSION
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `uv run --project skills/yt-monitor python -m pytest skills/yt-monitor/scripts/test_state.py -v`
Expected: FAIL with `ModuleNotFoundError: No module named 'state'`

- [ ] **Step 3: Implement `state.py`**

```python
# skills/yt-monitor/scripts/state.py
"""
Shared state management for yt-monitor.
Owns processed.json read/write, v1→v2 migration, and video status tracking.
"""
from __future__ import annotations

import json
from datetime import datetime, timezone
from pathlib import Path

STATE_VERSION = 2

# Runtime data directory — shared by yt_rss_monitor.py and yt_subtitle_dl.py
DATA_DIR = Path.home() / ".wqq-skills" / "yt-monitor"
PROCESSED_PATH = DATA_DIR / "processed.json"

# Status progression order (forward only)
_STATUS_ORDER = {"downloaded": 0, "summarized": 1, "published": 2}


def load_state(path: Path | None = None) -> dict:
    """
    Load processed.json, auto-migrating v1 → v2 if needed.
    Returns a v2 state dict. Creates empty state if file missing.
    """
    if path is None:
        path = PROCESSED_PATH
    path.parent.mkdir(parents=True, exist_ok=True)

    if not path.exists():
        return {"version": STATE_VERSION, "videos": {}}

    with open(path, "r", encoding="utf-8") as f:
        data = json.load(f)

    # Detect v1 format: has "processed_videos" key and no "version"
    if "processed_videos" in data and data.get("version", 1) < STATE_VERSION:
        data = migrate_v1_to_v2(data)
        save_state(data, path)

    return data


def save_state(state: dict, path: Path | None = None):
    """Write state dict to processed.json."""
    if path is None:
        path = PROCESSED_PATH
    path.parent.mkdir(parents=True, exist_ok=True)
    with open(path, "w", encoding="utf-8") as f:
        json.dump(state, f, ensure_ascii=False, indent=2)


def mark_video(
    state: dict,
    video_id: str,
    *,
    status: str = "summarized",
    title: str | None = None,
    channel: str | None = None,
):
    """
    Mark a video with the given status. Status can only move forward:
    downloaded → summarized → published.
    Title/channel are preserved from existing records if not provided.
    """
    now = datetime.now(timezone.utc).isoformat()
    existing = state["videos"].get(video_id, {})

    # Refuse backward status changes (same status is a no-op)
    current_status = existing.get("status")
    if current_status:
        if _STATUS_ORDER.get(status, 0) < _STATUS_ORDER.get(current_status, 0):
            return  # Backward — silently ignore
        if status == current_status:
            return  # Same status — no-op

    record = {
        "title": title if title is not None else existing.get("title", ""),
        "channel": channel if channel is not None else existing.get("channel", ""),
        "status": status,
        "downloaded_at": existing.get("downloaded_at"),
        "summarized_at": existing.get("summarized_at"),
        "published_at": existing.get("published_at"),
    }

    # Set the timestamp for the current status
    timestamp_key = f"{status}_at"
    if record[timestamp_key] is None:
        record[timestamp_key] = now

    state["videos"][video_id] = record


def get_videos_by_status(state: dict) -> dict:
    """
    Group videos by status. Each entry includes video_id and all available timestamps.
    Returns: {"downloaded": [...], "summarized": [...], "published": [...]}
    """
    result: dict[str, list] = {"downloaded": [], "summarized": [], "published": []}
    for video_id, info in state.get("videos", {}).items():
        status = info.get("status", "summarized")
        entry = {"video_id": video_id, **info}
        if status in result:
            result[status].append(entry)
    return result


def migrate_v1_to_v2(v1_data: dict) -> dict:
    """
    Migrate v1 processed.json to v2 format.
    v1: {"processed_videos": {"id": {"title": "", "channel": "", "imported_at": "..."}}}
    v2: {"version": 2, "videos": {"id": {"status": "summarized", ...timestamps...}}}
    """
    videos = {}
    for video_id, info in v1_data.get("processed_videos", {}).items():
        videos[video_id] = {
            "title": info.get("title", ""),
            "channel": info.get("channel", ""),
            "status": "summarized",
            "downloaded_at": None,
            "summarized_at": info.get("imported_at"),
            "published_at": None,
        }
    return {"version": STATE_VERSION, "videos": videos}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `uv run --project skills/yt-monitor python -m pytest skills/yt-monitor/scripts/test_state.py -v`
Expected: All 8 tests PASS

- [ ] **Step 5: Commit**

```bash
git add skills/yt-monitor/scripts/state.py skills/yt-monitor/scripts/test_state.py
git commit -m "feat(yt-monitor): add state.py shared module with v1→v2 migration"
```

---

### Task 2: Create `preflight.py` — dependency checking module

**Files:**
- Create: `skills/yt-monitor/scripts/preflight.py`
- Create: `skills/yt-monitor/scripts/test_preflight.py`

- [ ] **Step 1: Write tests for preflight checks**

```python
# skills/yt-monitor/scripts/test_preflight.py
"""Tests for preflight dependency checking."""
import json
import sys
from pathlib import Path
from unittest.mock import patch, MagicMock

sys.path.insert(0, str(Path(__file__).parent))

from preflight import check_dependency, run_preflight


def test_check_dependency_ok():
    """check_dependency returns ok when command succeeds with version."""
    with patch("subprocess.run") as mock_run:
        mock_run.return_value = MagicMock(
            returncode=0, stdout="2025.01.15\n", stderr=""
        )
        result = check_dependency("yt-dlp", ["yt-dlp", "--version"], required=True)
        assert result["status"] == "ok"
        assert result["version"] == "2025.01.15"
        assert result["name"] == "yt-dlp"


def test_check_dependency_missing():
    """check_dependency returns missing when command not found."""
    with patch("subprocess.run", side_effect=FileNotFoundError):
        result = check_dependency(
            "deno", ["deno", "--version"],
            required=True, install_cmd="brew install deno"
        )
        assert result["status"] == "missing"
        assert result["install_cmd"] == "brew install deno"


def test_check_dependency_optional():
    """Optional dependency missing doesn't affect all_ok."""
    with patch("subprocess.run", side_effect=FileNotFoundError):
        result = check_dependency(
            "mlx-whisper",
            ["python", "-c", "import mlx_whisper"],
            required=False,
            install_cmd="uv sync --extra transcribe",
        )
        assert result["status"] == "missing"
        assert result["required"] is False


def test_run_preflight_all_ok():
    """run_preflight returns all_ok=True when all required deps present."""
    fake_checks = [
        {"name": "yt-dlp", "status": "ok", "version": "2025.01", "required": True},
        {"name": "deno", "status": "ok", "version": "1.40", "required": True},
        {"name": "mlx-whisper", "status": "missing", "required": False,
         "install_cmd": "uv sync --extra transcribe"},
    ]
    with patch("preflight._get_all_checks", return_value=fake_checks):
        result = run_preflight()
        assert result["all_ok"] is True  # mlx-whisper missing but optional
        assert len(result["checks"]) == 3


def test_run_preflight_not_ok():
    """run_preflight returns all_ok=False when required dep missing."""
    fake_checks = [
        {"name": "yt-dlp", "status": "missing", "required": True,
         "install_cmd": "brew install yt-dlp"},
        {"name": "deno", "status": "ok", "version": "1.40", "required": True},
    ]
    with patch("preflight._get_all_checks", return_value=fake_checks):
        result = run_preflight()
        assert result["all_ok"] is False
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `uv run --project skills/yt-monitor python -m pytest skills/yt-monitor/scripts/test_preflight.py -v`
Expected: FAIL with `ModuleNotFoundError: No module named 'preflight'`

- [ ] **Step 3: Implement `preflight.py`**

```python
# skills/yt-monitor/scripts/preflight.py
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


def check_dependency(
    name: str,
    cmd: list[str],
    *,
    required: bool = True,
    install_cmd: str = "",
    note: str = "",
) -> dict:
    """
    Check if a dependency is available by running a command.
    Returns a dict with name, status, version (if ok), install_cmd, required, note.
    """
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
    """Run all dependency checks and return results list."""
    project = str(SKILL_DIR)
    return [
        check_dependency(
            "yt-dlp", ["yt-dlp", "--version"],
            required=True, install_cmd="brew install yt-dlp",
        ),
        check_dependency(
            "deno", ["deno", "--version"],
            required=True, install_cmd="brew install deno",
        ),
        check_dependency(
            "mlx-whisper",
            ["uv", "run", "--project", project, "python", "-c", "import mlx_whisper"],
            required=False,
            install_cmd=f"uv sync --project {project} --extra transcribe",
            note="可选，仅 Apple Silicon，用于无字幕视频的语音转录",
        ),
    ]


def run_preflight() -> dict:
    """
    Run all preflight checks.
    Returns: {"all_ok": bool, "checks": [...]}
    all_ok is True only when all *required* deps are present.
    """
    checks = _get_all_checks()
    all_ok = all(
        c["status"] == "ok"
        for c in checks
        if c.get("required", True)
    )
    return {"all_ok": all_ok, "checks": checks}


def main():
    result = run_preflight()
    print(json.dumps(result, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `uv run --project skills/yt-monitor python -m pytest skills/yt-monitor/scripts/test_preflight.py -v`
Expected: All 5 tests PASS

- [ ] **Step 5: Commit**

```bash
git add skills/yt-monitor/scripts/preflight.py skills/yt-monitor/scripts/test_preflight.py
git commit -m "feat(yt-monitor): add preflight dependency checker"
```

---

### Task 3: Add `published_relative` helper and duration enrichment

**Files:**
- Create: `skills/yt-monitor/scripts/test_enrich.py`
- Modify: `skills/yt-monitor/scripts/yt_rss_monitor.py` (add helper functions, not yet CLI wiring)

- [ ] **Step 1: Write tests for `published_relative` and `enrich_video_duration`**

```python
# skills/yt-monitor/scripts/test_enrich.py
"""Tests for video enrichment helpers."""
import sys
from datetime import datetime, timezone, timedelta
from pathlib import Path
from unittest.mock import patch, MagicMock

sys.path.insert(0, str(Path(__file__).parent))

from yt_rss_monitor import format_relative_time, format_duration_display, enrich_video_duration


def test_relative_time_just_now():
    """Timestamps less than 1 minute ago show '刚刚'."""
    now = datetime.now(timezone.utc)
    ts = (now - timedelta(seconds=30)).isoformat()
    assert format_relative_time(ts) == "刚刚"


def test_relative_time_minutes():
    """Timestamps a few minutes ago show 'N分钟前'."""
    now = datetime.now(timezone.utc)
    ts = (now - timedelta(minutes=15)).isoformat()
    assert format_relative_time(ts) == "15分钟前"


def test_relative_time_hours():
    """Timestamps a few hours ago show 'N小时前'."""
    now = datetime.now(timezone.utc)
    ts = (now - timedelta(hours=3)).isoformat()
    assert format_relative_time(ts) == "3小时前"


def test_relative_time_days():
    """Timestamps a few days ago show 'N天前'."""
    now = datetime.now(timezone.utc)
    ts = (now - timedelta(days=2)).isoformat()
    assert format_relative_time(ts) == "2天前"


def test_relative_time_old():
    """Timestamps older than 7 days show date string."""
    ts = "2026-01-01T00:00:00+00:00"
    result = format_relative_time(ts)
    assert "2026-01-01" in result


def test_relative_time_future():
    """Future timestamps (clock skew) show '刚刚'."""
    future = datetime.now(timezone.utc) + timedelta(hours=1)
    assert format_relative_time(future.isoformat()) == "刚刚"


def test_relative_time_invalid():
    """Invalid timestamp returns the original string."""
    assert format_relative_time("not-a-date") == "not-a-date"


def test_format_duration_display_minutes():
    """Seconds get formatted as MM:SS."""
    assert format_duration_display(90) == "1:30"


def test_format_duration_display_hours():
    """Large values get formatted as H:MM:SS."""
    assert format_duration_display(3661) == "1:01:01"


def test_enrich_video_duration_success():
    """enrich_video_duration extracts duration from yt-dlp --dump-json."""
    with patch("subprocess.run") as mock_run:
        mock_run.return_value = MagicMock(
            returncode=0,
            stdout='{"duration": 930, "id": "xxx"}',
            stderr="",
        )
        dur, dur_s = enrich_video_duration("xxx")
        assert dur == "15:30"
        assert dur_s == 930


def test_enrich_video_duration_failure():
    """enrich_video_duration returns None on failure."""
    with patch("subprocess.run", side_effect=FileNotFoundError):
        dur, dur_s = enrich_video_duration("xxx")
        assert dur is None
        assert dur_s is None
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `uv run --project skills/yt-monitor python -m pytest skills/yt-monitor/scripts/test_enrich.py -v`
Expected: FAIL with `ImportError: cannot import name 'format_relative_time'`

- [ ] **Step 3: Add helper functions to `yt_rss_monitor.py`**

Add these functions after the existing imports in `yt_rss_monitor.py` (before `_ensure_config`), and add `import subprocess` and `import concurrent.futures` to the imports section:

```python
# Add to imports at top of file:
import subprocess
import concurrent.futures

# ── Enrichment helpers ────────────────────────────────────────────────────

# yt-dlp auth args (same as yt_subtitle_dl.py)
YT_DLP_AUTH_ARGS = ["--cookies-from-browser", "chrome", "--remote-components", "ejs:github"]


def format_relative_time(timestamp: str) -> str:
    """
    Convert ISO timestamp to Chinese relative time string.
    Rules: <1min='刚刚', <1h='N分钟前', <24h='N小时前', <7d='N天前', else date.
    Future timestamps (clock skew) treated as '刚刚'.
    """
    try:
        dt = datetime.fromisoformat(timestamp.replace("Z", "+00:00"))
        now = datetime.now(timezone.utc)
        diff = now - dt

        seconds = diff.total_seconds()
        if seconds < 0 or seconds < 60:
            return "刚刚"
        minutes = int(seconds // 60)
        if minutes < 60:
            return f"{minutes}分钟前"
        hours = int(seconds // 3600)
        if hours < 24:
            return f"{hours}小时前"
        days = int(seconds // 86400)
        if days < 7:
            return f"{days}天前"
        return dt.strftime("%Y-%m-%d")
    except (ValueError, AttributeError):
        return timestamp


def format_duration_display(seconds: int) -> str:
    """Format seconds as M:SS or H:MM:SS."""
    if not seconds:
        return "未知"
    h, r = divmod(seconds, 3600)
    m, s = divmod(r, 60)
    if h > 0:
        return f"{h}:{m:02d}:{s:02d}"
    return f"{m}:{s:02d}"


def enrich_video_duration(video_id: str) -> tuple[str | None, int | None]:
    """
    Fetch video duration via yt-dlp --dump-json.
    Returns (formatted_duration, duration_seconds) or (None, None) on failure.
    """
    url = f"https://www.youtube.com/watch?v={video_id}"
    try:
        result = subprocess.run(
            ["yt-dlp", "--dump-json", "--no-download", *YT_DLP_AUTH_ARGS, url],
            capture_output=True, text=True, timeout=30,
        )
        if result.returncode == 0:
            info = json.loads(result.stdout)
            dur = info.get("duration")
            if dur:
                return format_duration_display(int(dur)), int(dur)
    except Exception as e:
        print(f"  ⚠️ 获取视频时长失败 ({video_id}): {e}", file=sys.stderr)
    return None, None
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `uv run --project skills/yt-monitor python -m pytest skills/yt-monitor/scripts/test_enrich.py -v`
Expected: All 12 tests PASS

- [ ] **Step 5: Commit**

```bash
git add skills/yt-monitor/scripts/yt_rss_monitor.py skills/yt-monitor/scripts/test_enrich.py
git commit -m "feat(yt-monitor): add published_relative and duration enrichment helpers"
```

---

### Task 4: Wire `yt_rss_monitor.py` to use `state.py` and enhance `check` output

**Files:**
- Modify: `skills/yt-monitor/scripts/yt_rss_monitor.py`

This task replaces the inline state management in `yt_rss_monitor.py` with imports from `state.py`, enhances `check_new_videos` output, and adds the `--enrich` and `--resume` flags.

- [ ] **Step 1: Replace inline state functions with state.py imports**

At the top of `yt_rss_monitor.py`, add the sys.path insert and imports from state.py. Then remove the now-redundant `DATA_DIR`, `PROCESSED_PATH`, `load_processed`, `save_processed`, and `mark_as_processed` definitions. Keep `CONFIG_PATH` derived from the imported `DATA_DIR`:

```python
# Add after existing imports (sys and Path are already imported), before SKILL_DIR:
sys.path.insert(0, str(Path(__file__).parent))
from state import load_state, save_state, mark_video, get_videos_by_status, DATA_DIR
from preflight import run_preflight

# Replace the old DATA_DIR / PROCESSED_PATH / CONFIG_PATH lines with:
SKILL_DIR = Path(__file__).parent.parent
CONFIG_PATH = DATA_DIR / "channels.json"
EXAMPLE_CONFIG_PATH = SKILL_DIR / "config" / "channels.example.json"
```

Remove these functions entirely (they now live in state.py):
- `load_processed()` (lines 71-77)
- `save_processed()` (lines 80-83)
- `mark_as_processed()` (lines 297-306)

- [ ] **Step 2: Enhance `check_new_videos` to add `published_relative` and `description_snippet`**

Update the `check_new_videos` function to accept `enrich` and `resume` params, and add the new fields to each video dict. Replace the `check_new_videos` function:

```python
def check_new_videos(days: int = 7, channel_filter: str | None = None,
                     enrich: bool = False, resume: bool = False) -> list[dict]:
    """
    Check all channels for new videos.

    Args:
        days: Check videos from last N days (default 7)
        channel_filter: Filter by channel name (case-insensitive substring)
        enrich: If True, fetch duration via yt-dlp --dump-json (slower)
        resume: If True, return downloaded-but-not-summarized videos instead

    Returns:
        Flat list of video dicts with enriched fields.
        Note: spec shows per-channel grouping but existing code and SKILL.md
        use flat list with channel_name in each video dict. Keeping flat list
        for backward compatibility.
    """
    config = load_config()
    state = load_state()
    known_ids = set(state.get("videos", {}).keys())

    # Resume mode: return downloaded but not summarized
    if resume:
        by_status = get_videos_by_status(state)
        videos = by_status.get("downloaded", [])
        # Normalize shape: add fields that normal check output has
        for v in videos:
            v.setdefault("url", f"https://www.youtube.com/watch?v={v['video_id']}")
            v.setdefault("published", v.get("downloaded_at", ""))
            v.setdefault("published_relative", format_relative_time(v.get("downloaded_at", "")))
            v.setdefault("description_snippet", "")
            v.setdefault("duration", None)
            v.setdefault("duration_seconds", None)
        if enrich:
            videos = _enrich_durations(videos)
        return videos

    all_new_videos = []

    channels = config.get("channels", [])
    if channel_filter:
        filter_lower = channel_filter.lower()
        channels = [ch for ch in channels if filter_lower in ch.get("name", "").lower()]
        if not channels:
            print(f"  ⚠️ 没有匹配 \"{channel_filter}\" 的频道", file=sys.stderr)
            return []

    for channel in channels:
        name = channel.get("name", "未知频道")
        channel_id = channel.get("channel_id", "")

        print(f"\n📺 检查频道: {name}", file=sys.stderr)

        if not channel_id:
            url = channel.get("url", "")
            if not url:
                print(f"  [跳过] 没有频道 URL", file=sys.stderr)
                continue
            print(f"  正在解析 channel_id...", file=sys.stderr)
            channel_id = resolve_channel_id(url)
            if channel_id:
                channel["channel_id"] = channel_id
                save_config(config)
                print(f"  ✅ channel_id: {channel_id}", file=sys.stderr)
            else:
                print(f"  [错误] 无法解析 channel_id", file=sys.stderr)
                continue

        videos = fetch_channel_feed(channel_id)
        print(f"  获取到 {len(videos)} 个视频", file=sys.stderr)

        cutoff = datetime.now(timezone.utc).timestamp() - (days * 86400)
        new_videos = []
        for v in videos:
            if v["video_id"] in known_ids:
                continue
            try:
                pub_dt = datetime.fromisoformat(v["published"].replace("Z", "+00:00"))
                if pub_dt.timestamp() < cutoff:
                    continue
            except (ValueError, AttributeError):
                pass
            # Add enriched fields
            v["published_relative"] = format_relative_time(v.get("published", ""))
            v["description_snippet"] = v.pop("description", "")  # rename description → description_snippet
            v["duration"] = None
            v["duration_seconds"] = None
            new_videos.append(v)

        if new_videos:
            print(f"  🆕 发现 {len(new_videos)} 个新视频:", file=sys.stderr)
            for v in new_videos:
                print(f"     - {v['title']}", file=sys.stderr)
                print(f"       {v['url']}", file=sys.stderr)
                print(f"       发布时间: {v.get('published_relative', v['published'])}", file=sys.stderr)
        else:
            print(f"  没有新视频", file=sys.stderr)

        all_new_videos.extend(new_videos)

    if enrich and all_new_videos:
        all_new_videos = _enrich_durations(all_new_videos)

    return all_new_videos


def _enrich_durations(videos: list[dict]) -> list[dict]:
    """Fetch durations in parallel for a list of video dicts."""
    if not videos:
        return videos
    print(f"  ⏱️ 正在获取视频时长 ({len(videos)} 个)...", file=sys.stderr)
    with concurrent.futures.ThreadPoolExecutor(max_workers=4) as executor:
        futures = {
            executor.submit(enrich_video_duration, v["video_id"]): v
            for v in videos
        }
        for future in concurrent.futures.as_completed(futures):
            v = futures[future]
            try:
                dur, dur_s = future.result()
                v["duration"] = dur
                v["duration_seconds"] = dur_s
            except Exception:
                pass  # Already None from initialization
    return videos
```

- [ ] **Step 3: Update the CLI `main()` function**

Replace the entire `main()` function to add preflight, status, --enrich, --resume, and upgraded mark:

```python
def main():
    import argparse
    # preflight and state imports are at module level

    parser = argparse.ArgumentParser(description="YouTube 频道 RSS 监控")
    subparsers = parser.add_subparsers(dest="command", help="可用命令")

    # preflight
    subparsers.add_parser("preflight", help="检查依赖是否就绪")

    # check
    check_parser = subparsers.add_parser("check", help="检查频道新视频")
    check_parser.add_argument("--days", type=int, default=7, help="检查最近几天（默认7天）")
    check_parser.add_argument("--json", action="store_true", help="以 JSON 格式输出")
    check_parser.add_argument("--channel", type=str, default=None, help="按频道名称过滤")
    check_parser.add_argument("--enrich", action="store_true", help="获取视频时长（较慢）")
    check_parser.add_argument("--resume", action="store_true", help="列出已下载但未总结的视频")

    # add
    add_parser = subparsers.add_parser("add", help="添加监控频道")
    add_parser.add_argument("name", help="频道名称")
    add_parser.add_argument("url", help="频道 URL")

    # list
    subparsers.add_parser("list", help="列出所有监控频道")

    # mark (upgraded)
    mark_parser = subparsers.add_parser("mark", help="标记视频状态")
    mark_parser.add_argument("video_ids", nargs="+", help="视频 ID 列表")
    mark_parser.add_argument("--status", default="summarized",
                             choices=["downloaded", "summarized", "published"],
                             help="目标状态（默认 summarized）")
    mark_parser.add_argument("--title", default=None, help="视频标题")
    mark_parser.add_argument("--channel", default=None, help="频道名称")

    # status
    subparsers.add_parser("status", help="查看视频处理状态")

    args = parser.parse_args()

    if args.command == "preflight":
        result = run_preflight()
        print(json.dumps(result, ensure_ascii=False, indent=2))

    elif args.command == "check":
        new_videos = check_new_videos(
            days=args.days, channel_filter=args.channel,
            enrich=args.enrich, resume=args.resume,
        )
        if args.json:
            print(json.dumps(new_videos, ensure_ascii=False, indent=2))
        elif not new_videos:
            if args.resume:
                print(f"\n✅ 没有待总结的视频")
            else:
                print(f"\n✅ 所有频道均无新视频更新")
        else:
            if args.resume:
                print(f"\n📋 有 {len(new_videos)} 个视频待总结")
            else:
                print(f"\n📊 共发现 {len(new_videos)} 个新视频")

    elif args.command == "add":
        add_channel(args.name, args.url)

    elif args.command == "list":
        list_channels()

    elif args.command == "mark":
        state = load_state()
        for vid in args.video_ids:
            mark_video(state, vid, status=args.status,
                       title=args.title, channel=args.channel)
        save_state(state)
        status_label = {"downloaded": "已下载", "summarized": "已总结", "published": "已发布"}
        print(f"✅ 已标记 {len(args.video_ids)} 个视频为{status_label.get(args.status, args.status)}")

    elif args.command == "status":
        state = load_state()
        result = get_videos_by_status(state)
        print(json.dumps(result, ensure_ascii=False, indent=2))

    else:
        new_videos = check_new_videos()
        if not new_videos:
            print(f"\n✅ 所有频道均无新视频更新")
        else:
            print(f"\n📊 共发现 {len(new_videos)} 个新视频")
```

- [ ] **Step 4: Run all existing tests to ensure nothing is broken**

Run: `uv run --project skills/yt-monitor python -m pytest skills/yt-monitor/scripts/test_state.py skills/yt-monitor/scripts/test_preflight.py skills/yt-monitor/scripts/test_enrich.py -v`
Expected: All tests PASS

- [ ] **Step 5: Smoke test the CLI commands**

Run: `uv run --project skills/yt-monitor python skills/yt-monitor/scripts/yt_rss_monitor.py preflight`
Expected: JSON output with checks array

Run: `uv run --project skills/yt-monitor python skills/yt-monitor/scripts/yt_rss_monitor.py status`
Expected: JSON output with downloaded/summarized/published arrays

Run: `uv run --project skills/yt-monitor python skills/yt-monitor/scripts/yt_rss_monitor.py check --help`
Expected: Shows --enrich and --resume flags

- [ ] **Step 6: Commit**

```bash
git add skills/yt-monitor/scripts/yt_rss_monitor.py
git commit -m "feat(yt-monitor): wire state.py, add preflight/status/enrich/resume to CLI"
```

---

### Task 5: Update `yt_subtitle_dl.py` to auto-mark downloaded

**Files:**
- Modify: `skills/yt-monitor/scripts/yt_subtitle_dl.py`

- [ ] **Step 1: Add state.py import and auto-mark logic**

Add at the top of `yt_subtitle_dl.py`, after the existing imports:

```python
# Sibling import for shared state (sys and Path are already imported)
sys.path.insert(0, str(Path(__file__).parent))
from state import load_state, save_state, mark_video, DATA_DIR
```

Remove the existing `DATA_DIR` definition (line 22) — it's now imported from state.py.

Then in the `download_subtitle` function, after the successful return dict is built (just before the final `return` at line 422-435), add auto-marking:

```python
    # Auto-mark as downloaded in state
    try:
        _state = load_state()
        mark_video(_state, video_id, status="downloaded", title=title, channel=channel)
        save_state(_state)
    except Exception as e:
        print(f"     ⚠️ 状态标记失败: {e}", file=sys.stderr)
```

Similarly in `_transcribe_with_fallback`, after the successful return dict is built (around line 251-257), add the same auto-mark block.

- [ ] **Step 2: Also remove the old `ensure_yt_dlp` from yt_subtitle_dl.py's CLI path**

The `ensure_yt_dlp` function (lines 77-89) stays for now as it's called at CLI entry (line 681). The preflight check is an *additional* layer in SKILL.md, not a replacement for the per-script check. No change needed here.

- [ ] **Step 3: Run all tests**

Run: `uv run --project skills/yt-monitor python -m pytest skills/yt-monitor/scripts/ -v`
Expected: All tests PASS

- [ ] **Step 4: Commit**

```bash
git add skills/yt-monitor/scripts/yt_subtitle_dl.py
git commit -m "feat(yt-monitor): auto-mark downloaded state after subtitle download"
```

---

### Task 6: Update SKILL.md with new workflows and summary template

**Files:**
- Modify: `skills/yt-monitor/SKILL.md`

- [ ] **Step 1: Update file structure section**

Add `state.py` and `preflight.py` to the file structure listing:

```markdown
skills/yt-monitor/
├── SKILL.md
├── scripts/
│   ├── yt_rss_monitor.py        ← YouTube RSS 监控（无需 API Key）
│   ├── yt_subtitle_dl.py        ← 字幕下载（yt-dlp，Python 实现）
│   ├── state.py                 ← 状态管理共享模块（processed.json 读写）
│   └── preflight.py             ← 依赖检查模块
└── config/
    └── channels.example.json    ← 频道配置示例
```

- [ ] **Step 2: Add preflight step to all workflows**

Add a new section after "## 前置条件", before "## 使用方式":

```markdown
## 依赖检查（所有工作流的第零步）

每次执行任何工作流之前，先运行依赖检查：

```bash
uv run --project skills/yt-monitor python skills/yt-monitor/scripts/yt_rss_monitor.py preflight
```

- 如果 `all_ok: true`：继续执行工作流
- 如果 `all_ok: false`：使用 **AskUserQuestion** 列出缺失的依赖和安装命令，询问用户是否自动安装。用户确认后执行对应的 `install_cmd`
- mlx-whisper 标记为可选（`required: false`），缺失不阻塞主流程
```

- [ ] **Step 3: Update check commands to use --enrich**

In the "检查频道更新" and "总结最新视频" sections, update the check commands:

```bash
# 检查全部频道（含时长）：
uv run --project skills/yt-monitor python skills/yt-monitor/scripts/yt_rss_monitor.py check --days 7 --enrich
# 检查指定频道：
uv run --project skills/yt-monitor python skills/yt-monitor/scripts/yt_rss_monitor.py check --days 7 --enrich --channel 老李
```

Add note: 展示视频列表时包含时长、发布相对时间、描述摘要。

- [ ] **Step 4: Update mark command and add status/resume commands**

Update the mark section:

```markdown
### 「标记视频状态」

```bash
# 标记为已总结（默认）：
uv run --project skills/yt-monitor python skills/yt-monitor/scripts/yt_rss_monitor.py mark VIDEO_ID1 VIDEO_ID2 ...
# 指定状态：
uv run --project skills/yt-monitor python skills/yt-monitor/scripts/yt_rss_monitor.py mark VIDEO_ID --status published
```

注意：字幕下载成功后会自动标记为 `downloaded`，Claude 完成总结后应调用 `mark --status summarized`。

### 「查看处理状态」

```bash
uv run --project skills/yt-monitor python skills/yt-monitor/scripts/yt_rss_monitor.py status
```

### 「继续未完成的总结」

```bash
uv run --project skills/yt-monitor python skills/yt-monitor/scripts/yt_rss_monitor.py check --resume --enrich
```
列出已下载字幕但尚未总结的视频，方便断点续做。
```

- [ ] **Step 5: Update summary template**

Replace the "总结应包含" section (lines 112-116) with the enhanced template:

```markdown
总结应使用以下模板（**始终使用简体中文**）：

## 视频摘要：{标题}
频道：{频道名} | 时长：{时长} | 发布：{相对时间}

### 核心观点
- （3-5 个要点）

### 关键数据/论据
- （重要数字、引用、实验结果等）

### 行动项
- （可执行的建议、操作步骤）
- 仅在视频确实给出可执行建议时填写，否则省略此 section

### 提到的工具/资源
- 工具名 — 简要说明 — 链接（如有）
- 仅在视频提到了具体工具、产品或资源时填写

### 标签
#标签1 #标签2 #标签3（3-5个中文分类标签，聚焦主题领域）

### 总结
（2-3 句话概括核心内容和价值）
```

- [ ] **Step 6: Update the "第四步" mark command in the workflow**

Change the mark step in "总结最新视频" from:

```bash
uv run --project skills/yt-monitor python skills/yt-monitor/scripts/yt_rss_monitor.py mark VIDEO_ID1 VIDEO_ID2 ...
```

To:

```bash
uv run --project skills/yt-monitor python skills/yt-monitor/scripts/yt_rss_monitor.py mark VIDEO_ID1 VIDEO_ID2 ... --status summarized
```

And add note: 字幕下载时已自动标记为 `downloaded`，总结完成后标记为 `summarized`。

- [ ] **Step 7: Commit**

```bash
git add skills/yt-monitor/SKILL.md
git commit -m "docs(yt-monitor): update SKILL.md with preflight, enrich, multi-state, enhanced summary"
```

---

### Task 7: Final integration test and cleanup

**Files:**
- All modified files

- [ ] **Step 1: Run all tests**

Run: `uv run --project skills/yt-monitor python -m pytest skills/yt-monitor/scripts/ -v`
Expected: All tests PASS (state: 8, preflight: 5, enrich: 12 = 25 total)

- [ ] **Step 2: Verify CLI help shows all subcommands**

Run: `uv run --project skills/yt-monitor python skills/yt-monitor/scripts/yt_rss_monitor.py --help`
Expected: Shows preflight, check, add, list, mark, status subcommands

- [ ] **Step 3: Verify preflight output**

Run: `uv run --project skills/yt-monitor python skills/yt-monitor/scripts/yt_rss_monitor.py preflight`
Expected: Structured JSON with all_ok and checks array

- [ ] **Step 4: Verify status output**

Run: `uv run --project skills/yt-monitor python skills/yt-monitor/scripts/yt_rss_monitor.py status`
Expected: JSON with downloaded/summarized/published arrays (may have migrated v1 data)

- [ ] **Step 5: Verify mark with --status works**

Run: `uv run --project skills/yt-monitor python skills/yt-monitor/scripts/yt_rss_monitor.py mark test123 --status downloaded --title "Test" --channel "TestCh"`
Then: `uv run --project skills/yt-monitor python skills/yt-monitor/scripts/yt_rss_monitor.py status`
Expected: test123 appears in "downloaded" array with title "Test"

Clean up: Remove the test entry from `~/.wqq-skills/yt-monitor/processed.json` manually if desired.

- [ ] **Step 6: Final commit if any cleanup was needed**

```bash
git add -A
git commit -m "chore(yt-monitor): integration test cleanup"
```
