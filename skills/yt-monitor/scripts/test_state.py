"""Tests for state management module."""
import json
import os
import tempfile
from pathlib import Path
import sys
sys.path.insert(0, str(Path(__file__).parent))

from state import (
    load_state, save_state, mark_video, get_videos_by_status,
    migrate_v1_to_v2, STATE_VERSION,
)

def test_load_state_creates_empty_if_missing():
    with tempfile.TemporaryDirectory() as tmp:
        path = Path(tmp) / "processed.json"
        data = load_state(path)
        assert data["version"] == STATE_VERSION
        assert data["videos"] == {}

def test_save_and_load_roundtrip():
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
    with tempfile.TemporaryDirectory() as tmp:
        path = Path(tmp) / "processed.json"
        state = load_state(path)
        mark_video(state, "vid1", status="downloaded", title="T", channel="C")
        assert state["videos"]["vid1"]["status"] == "downloaded"
        assert state["videos"]["vid1"]["downloaded_at"] is not None
        mark_video(state, "vid1", status="summarized")
        assert state["videos"]["vid1"]["status"] == "summarized"
        assert state["videos"]["vid1"]["summarized_at"] is not None
        assert state["videos"]["vid1"]["title"] == "T"
        mark_video(state, "vid1", status="published")
        assert state["videos"]["vid1"]["status"] == "published"
        assert state["videos"]["vid1"]["published_at"] is not None

def test_mark_video_no_backward():
    with tempfile.TemporaryDirectory() as tmp:
        path = Path(tmp) / "processed.json"
        state = load_state(path)
        mark_video(state, "vid1", status="summarized", title="T", channel="C")
        mark_video(state, "vid1", status="downloaded")
        assert state["videos"]["vid1"]["status"] == "summarized"

def test_get_videos_by_status():
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
    assert result["summarized"][0]["downloaded_at"] == "t1"

def test_migrate_v1_to_v2():
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
    assert v2["videos"]["old2"]["title"] == ""

def test_migrate_v1_file_auto():
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
        with open(path) as f:
            on_disk = json.load(f)
        assert on_disk["version"] == STATE_VERSION
