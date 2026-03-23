"""
Shared state management for yt-monitor.
Owns processed.json read/write, v1→v2 migration, and video status tracking.
"""
from __future__ import annotations

import json
from datetime import datetime, timezone
from pathlib import Path

STATE_VERSION = 2
DATA_DIR = Path.home() / ".wqq-skills" / "yt-monitor"
PROCESSED_PATH = DATA_DIR / "processed.json"
_STATUS_ORDER = {"downloaded": 0, "summarized": 1, "published": 2}


def load_state(path: Path | None = None) -> dict:
    if path is None:
        path = PROCESSED_PATH
    path.parent.mkdir(parents=True, exist_ok=True)
    if not path.exists():
        return {"version": STATE_VERSION, "videos": {}}
    with open(path, "r", encoding="utf-8") as f:
        data = json.load(f)
    if "processed_videos" in data and data.get("version", 1) < STATE_VERSION:
        data = migrate_v1_to_v2(data)
        save_state(data, path)
    return data


def save_state(state: dict, path: Path | None = None):
    if path is None:
        path = PROCESSED_PATH
    path.parent.mkdir(parents=True, exist_ok=True)
    with open(path, "w", encoding="utf-8") as f:
        json.dump(state, f, ensure_ascii=False, indent=2)


def mark_video(state: dict, video_id: str, *, status: str = "summarized",
               title: str | None = None, channel: str | None = None):
    now = datetime.now(timezone.utc).isoformat()
    existing = state["videos"].get(video_id, {})
    current_status = existing.get("status")
    if current_status:
        if _STATUS_ORDER.get(status, 0) < _STATUS_ORDER.get(current_status, 0):
            return
        if status == current_status:
            return
    record = {
        "title": title if title is not None else existing.get("title", ""),
        "channel": channel if channel is not None else existing.get("channel", ""),
        "status": status,
        "downloaded_at": existing.get("downloaded_at"),
        "summarized_at": existing.get("summarized_at"),
        "published_at": existing.get("published_at"),
    }
    timestamp_key = f"{status}_at"
    if record[timestamp_key] is None:
        record[timestamp_key] = now
    state["videos"][video_id] = record


def get_videos_by_status(state: dict) -> dict:
    result: dict[str, list] = {"downloaded": [], "summarized": [], "published": []}
    for video_id, info in state.get("videos", {}).items():
        status = info.get("status", "summarized")
        entry = {"video_id": video_id, **info}
        if status in result:
            result[status].append(entry)
    return result


def migrate_v1_to_v2(v1_data: dict) -> dict:
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
