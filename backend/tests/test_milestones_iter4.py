"""Iteration 4 backend tests:
- restoration_milestones config (4 entries: points/landmark/icon/coin_bonus/reward_buff_pct)
- contracts.value_score config (weights + premium_threshold + unit_time_seconds)
- state.claimed_milestones round-trip via save/load
"""
import os
import time
import pytest
import requests
from pathlib import Path

BASE_URL = os.environ.get("EXPO_PUBLIC_BACKEND_URL", "").rstrip("/")
if not BASE_URL:
    env_path = Path(__file__).resolve().parents[2] / "frontend" / ".env"
    if env_path.exists():
        for line in env_path.read_text().splitlines():
            if line.startswith("EXPO_PUBLIC_BACKEND_URL="):
                BASE_URL = line.split("=", 1)[1].strip().strip('"').rstrip("/")
API = f"{BASE_URL}/api"
PLAYER_ID = f"TEST_player_ms_{int(time.time())}"


@pytest.fixture(scope="module")
def api():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    yield s
    try:
        s.delete(f"{API}/game/{PLAYER_ID}", timeout=10)
    except Exception:
        pass


# ---- restoration_milestones ----
class TestRestorationMilestones:
    def test_config_has_milestones(self, api):
        cfg = api.get(f"{API}/config", timeout=15).json()
        assert "restoration_milestones" in cfg, "missing restoration_milestones"
        ms = cfg["restoration_milestones"]
        assert isinstance(ms, list) and len(ms) == 4, f"expected 4 milestones, got {len(ms)}"

    def test_milestone_entries_shape_and_values(self, api):
        cfg = api.get(f"{API}/config", timeout=15).json()
        ms = cfg["restoration_milestones"]
        expected = [
            (25, "Old Clock Tower", 150, 5),
            (50, "Rail Station", 350, 5),
            (75, "River Bridge", 600, 5),
            (100, "Grand Town Hall", 1000, 10),
        ]
        for entry, (pts, name, bonus, buff) in zip(ms, expected):
            for k in ("points", "landmark", "icon", "coin_bonus", "reward_buff_pct"):
                assert k in entry, f"milestone missing {k}"
            assert entry["points"] == pts
            assert entry["landmark"] == name
            assert entry["coin_bonus"] == bonus
            assert entry["reward_buff_pct"] == buff
            assert isinstance(entry["icon"], str) and len(entry["icon"]) > 0

    def test_total_buff_pct(self, api):
        cfg = api.get(f"{API}/config", timeout=15).json()
        total = sum(m["reward_buff_pct"] for m in cfg["restoration_milestones"])
        assert total == 25, f"expected +25% total, got {total}"


# ---- contracts.value_score ----
class TestValueScore:
    def test_value_score_shape(self, api):
        cfg = api.get(f"{API}/config", timeout=15).json()
        vs = cfg["contracts"]["value_score"]
        for k in ("w_coins", "w_xp", "w_restoration", "w_materials", "w_time",
                  "premium_threshold", "unit_time_seconds"):
            assert k in vs, f"value_score missing {k}"

    def test_value_score_values(self, api):
        cfg = api.get(f"{API}/config", timeout=15).json()
        vs = cfg["contracts"]["value_score"]
        assert vs["w_coins"] == 1.0
        assert vs["w_xp"] == 1.2
        assert vs["w_restoration"] == 8.0
        assert vs["w_materials"] == 1.0
        assert vs["w_time"] == 0.2
        assert vs["premium_threshold"] == 380
        uts = vs["unit_time_seconds"]
        assert uts["scrap"] == 10
        assert uts["components"] == 40
        assert uts["finished_goods"] == 110


# ---- claimed_milestones round-trip ----
class TestClaimedMilestonesRoundtrip:
    def test_put_get_claimed_milestones(self, api):
        now_ms = int(time.time() * 1000)
        state = {
            "resources": {"scrap": 5, "components": 3, "finished_goods": 1, "coins": 2000},
            "level": 4,
            "xp": 10,
            "restoration_points": 55,
            "town_hall_restored": False,
            "claimed_milestones": [25, 50],
            "buildings": {
                "scrap_yard": {"baseline_ts": now_ms, "upgrades": {"speed": 2, "storage": 2}},
                "machine_shop": {"jobs": [], "upgrades": {"speed": 2, "slots": 2}},
                "shipping_depot": {"upgrades": {"rewards": 3, "quality": 2}},
            },
            "contracts": [],
            "emergency": None,
            "emergency_next_check_ts": now_ms + 120000,
            "last_seen_ts": now_ms,
            "tutorial_seen": True,
        }
        r = api.put(f"{API}/game/{PLAYER_ID}", json={"state": state}, timeout=15)
        assert r.status_code == 200
        assert r.json()["ok"] is True

        got = api.get(f"{API}/game/{PLAYER_ID}", timeout=15).json()["state"]
        assert got["claimed_milestones"] == [25, 50]
        # Full roundtrip identity
        assert got == state

    def test_claimed_milestones_empty(self, api):
        pid = f"{PLAYER_ID}_empty"
        state = {
            "resources": {"scrap": 0, "components": 0, "finished_goods": 0, "coins": 0},
            "level": 1, "xp": 0, "restoration_points": 0, "town_hall_restored": False,
            "claimed_milestones": [],
            "buildings": {
                "scrap_yard": {"baseline_ts": 1, "upgrades": {"speed": 1, "storage": 1}},
                "machine_shop": {"jobs": [], "upgrades": {"speed": 1, "slots": 1}},
                "shipping_depot": {"upgrades": {"rewards": 1, "quality": 1}},
            },
            "contracts": [], "emergency": None, "emergency_next_check_ts": 1,
            "last_seen_ts": 1, "tutorial_seen": False,
        }
        try:
            r = api.put(f"{API}/game/{pid}", json={"state": state}, timeout=15)
            assert r.status_code == 200
            got = api.get(f"{API}/game/{pid}", timeout=15).json()["state"]
            assert got["claimed_milestones"] == []
        finally:
            api.delete(f"{API}/game/{pid}", timeout=10)

    def test_claimed_all_milestones(self, api):
        pid = f"{PLAYER_ID}_all"
        state = {
            "resources": {"scrap": 0, "components": 0, "finished_goods": 0, "coins": 9999},
            "level": 6, "xp": 0, "restoration_points": 100, "town_hall_restored": True,
            "claimed_milestones": [25, 50, 75, 100],
            "buildings": {
                "scrap_yard": {"baseline_ts": 1, "upgrades": {"speed": 1, "storage": 1}},
                "machine_shop": {"jobs": [], "upgrades": {"speed": 1, "slots": 1}},
                "shipping_depot": {"upgrades": {"rewards": 1, "quality": 1}},
            },
            "contracts": [], "emergency": None, "emergency_next_check_ts": 1,
            "last_seen_ts": 1, "tutorial_seen": True,
        }
        try:
            r = api.put(f"{API}/game/{pid}", json={"state": state}, timeout=15)
            assert r.status_code == 200
            got = api.get(f"{API}/game/{pid}", timeout=15).json()["state"]
            assert got["claimed_milestones"] == [25, 50, 75, 100]
            assert got["town_hall_restored"] is True
        finally:
            api.delete(f"{API}/game/{pid}", timeout=10)


# ---- regression: overall config still healthy ----
class TestConfigRegression:
    def test_config_root(self, api):
        r = api.get(f"{API}/config", timeout=15)
        assert r.status_code == 200
        cfg = r.json()
        for k in ("offline_cap_seconds", "scrap_yard", "machine_shop", "upgrades",
                  "contracts", "dev", "restoration_milestones"):
            assert k in cfg
        assert "value_score" in cfg["contracts"]
        assert "tiers" in cfg["contracts"]
        assert "emergency" in cfg["contracts"]
