"""Tests for video enrichment helpers."""
import sys
from datetime import datetime, timezone, timedelta
from pathlib import Path
from unittest.mock import patch, MagicMock

sys.path.insert(0, str(Path(__file__).parent))

from yt_rss_monitor import format_relative_time, format_duration_display, enrich_video_duration


def test_relative_time_just_now():
    now = datetime.now(timezone.utc)
    ts = (now - timedelta(seconds=30)).isoformat()
    assert format_relative_time(ts) == "刚刚"

def test_relative_time_minutes():
    now = datetime.now(timezone.utc)
    ts = (now - timedelta(minutes=15)).isoformat()
    assert format_relative_time(ts) == "15分钟前"

def test_relative_time_hours():
    now = datetime.now(timezone.utc)
    ts = (now - timedelta(hours=3)).isoformat()
    assert format_relative_time(ts) == "3小时前"

def test_relative_time_days():
    now = datetime.now(timezone.utc)
    ts = (now - timedelta(days=2)).isoformat()
    assert format_relative_time(ts) == "2天前"

def test_relative_time_old():
    ts = "2026-01-01T00:00:00+00:00"
    result = format_relative_time(ts)
    assert "2026-01-01" in result

def test_relative_time_future():
    future = datetime.now(timezone.utc) + timedelta(hours=1)
    assert format_relative_time(future.isoformat()) == "刚刚"

def test_relative_time_invalid():
    assert format_relative_time("not-a-date") == "not-a-date"

def test_format_duration_display_minutes():
    assert format_duration_display(90) == "1:30"

def test_format_duration_display_hours():
    assert format_duration_display(3661) == "1:01:01"

def test_enrich_video_duration_success():
    with patch("subprocess.run") as mock_run:
        mock_run.return_value = MagicMock(returncode=0, stdout='{"duration": 930, "id": "xxx"}', stderr="")
        dur, dur_s = enrich_video_duration("xxx")
        assert dur == "15:30"
        assert dur_s == 930

def test_enrich_video_duration_failure():
    with patch("subprocess.run", side_effect=FileNotFoundError):
        dur, dur_s = enrich_video_duration("xxx")
        assert dur is None
        assert dur_s is None
