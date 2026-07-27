"""Iteration 5 regression: config balance pass + save/load round-trip."""
import os
import time
import pytest
import requests

BASE_URL = os.environ.get("EXPO_PUBLIC_BACKEND_URL", "").rstrip("/") or \
           os.environ.get("EXPO_BACKEND_URL", "").rstrip("/")

# Fallback: read frontend/.env
if not BASE_URL:
    with open("/app/frontend/.env") as f:
        for line in f:
            if line.startswith("EXPO_PUBLIC_BACKEND_URL="):
                BASE_URL = line.split("=", 1)[1].strip().rstrip("/")
                break

API = f"{BASE_URL}/api"


@pytest.fixture
def api_client():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    return s


# ---- config balance pass ----
class TestConfigBalance:
    def test_config_reachable(self, api_client):
        r = api_client.get(f"{API}/config", timeout=15)
        assert r.status_code == 200
        cfg = r.json()
        assert "contracts" in cfg

    def test_value_score_weights(self, api_client):
        cfg = api_client.get(f"{API}/config", timeout=15).json()
        vs = cfg["contracts"]["value_score"]
        assert vs["w_restoration"] == 6.0, f"w_restoration expected 6, got {vs['w_restoration']}"
        assert vs["w_time"] == 0.25, f"w_time expected 0.25, got {vs['w_time']}"
        assert vs["premium_threshold"] == 340, f"premium_threshold expected 340, got {vs['premium_threshold']}"

    def test_basic_coin_per_range(self, api_client):
        cfg = api_client.get(f"{API}/config", timeout=15).json()
        basic = cfg["contracts"]["tiers"]["basic"]
        assert basic["coin_per"] == [0.6, 1.0], f"basic.coin_per expected [0.6,1.0], got {basic['coin_per']}"

    def test_restoration_milestones_intact(self, api_client):
        cfg = api_client.get(f"{API}/config", timeout=15).json()
        ms = cfg["restoration_milestones"]
        assert len(ms) == 4
        assert [m["points"] for m in ms] == [25, 50, 75, 100]
        assert ms[3]["landmark"] == "Grand Town Hall"

    def test_unit_time_seconds_preserved(self, api_client):
        vs = api_client.get(f"{API}/config", timeout=15).json()["contracts"]["value_score"]
        uts = vs["unit_time_seconds"]
        assert uts["scrap"] == 10 and uts["components"] == 40 and uts["finished_goods"] == 110


# ---- save/load round-trip (claimed_milestones) ----
class TestSaveLoadRoundTrip:
    PID = f"TEST_iter5_{int(time.time())}"

    def teardown_method(self, _):
        try:
            requests.delete(f"{API}/game/{self.PID}", timeout=10)
        except Exception:
            pass

    def test_roundtrip_with_claimed_milestones(self, api_client):
        pid = self.PID
        payload = {
            "state": {
                "resources": {"scrap": 5, "components": 2, "finished_goods": 1, "coins": 500},
                "level": 3, "xp": 10,
                "restoration_points": 55,
                "town_hall_restored": False,
                "claimed_milestones": [25, 50],
                "buildings": {
                    "scrap_yard": {"baseline_ts": 0, "upgrades": {"speed": 1, "storage": 1}},
                    "machine_shop": {"jobs": [], "upgrades": {"speed": 1, "slots": 1}},
                    "shipping_depot": {"upgrades": {"rewards": 1, "quality": 1}},
                },
                "contracts": [],
                "emergency": None,
                "emergency_next_check_ts": 0,
                "last_seen_ts": int(time.time() * 1000),
                "tutorial_seen": True,
            }
        }
        put = api_client.put(f"{API}/game/{pid}", json=payload, timeout=15)
        assert put.status_code == 200
        assert put.json()["ok"] is True

        got = api_client.get(f"{API}/game/{pid}", timeout=15).json()
        assert got["state"] is not None
        assert got["state"]["claimed_milestones"] == [25, 50]
        assert got["state"]["restoration_points"] == 55
        assert got["state"]["level"] == 3

    def test_roundtrip_all_milestones_claimed(self, api_client):
        pid = self.PID + "_full"
        payload = {"state": {"claimed_milestones": [25, 50, 75, 100], "restoration_points": 100,
                             "town_hall_restored": True, "level": 5,
                             "last_seen_ts": int(time.time() * 1000)}}
        api_client.put(f"{API}/game/{pid}", json=payload, timeout=15)
        got = api_client.get(f"{API}/game/{pid}", timeout=15).json()
        assert got["state"]["claimed_milestones"] == [25, 50, 75, 100]
        assert got["state"]["town_hall_restored"] is True
        api_client.delete(f"{API}/game/{pid}", timeout=10)
