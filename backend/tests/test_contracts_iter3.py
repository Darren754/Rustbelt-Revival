"""Iteration 3 backend tests: tiered contracts config + save/load round-trip."""
import os
import time
import pytest
import requests

BASE_URL = os.environ.get("EXPO_PUBLIC_BACKEND_URL", "https://town-rebuild-1.preview.emergentagent.com").rstrip("/")
API = f"{BASE_URL}/api"


@pytest.fixture(scope="module")
def api():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    return s


# ---- config shape ----
class TestConfigContracts:
    def test_config_root(self, api):
        r = api.get(f"{API}/config", timeout=15)
        assert r.status_code == 200
        cfg = r.json()
        assert "contracts" in cfg
        assert "upgrades" in cfg

    def test_tiers_shape(self, api):
        cfg = api.get(f"{API}/config", timeout=15).json()
        tiers = cfg["contracts"]["tiers"]
        for k, mat, ul, diff, color in [
            ("basic", "scrap", 1, "Easy", "#4A7C59"),
            ("intermediate", "components", 2, "Medium", "#4F759B"),
            ("advanced", "finished_goods", 4, "Hard", "#7A4F9B"),
        ]:
            t = tiers[k]
            assert t["material"] == mat
            assert t["unlock_level"] == ul
            assert t["difficulty"] == diff
            assert t["color"].upper() == color.upper()
            for key in ("qty_min", "qty_max", "coin_per", "xp_per", "rest_per", "label"):
                assert key in t, f"{k} missing {key}"
            assert isinstance(t["coin_per"], list) and len(t["coin_per"]) == 2
            assert isinstance(t["xp_per"], list) and len(t["xp_per"]) == 2
            assert isinstance(t["rest_per"], list) and len(t["rest_per"]) == 2

    def test_tier_weights(self, api):
        cfg = api.get(f"{API}/config", timeout=15).json()
        w = cfg["contracts"]["tier_weights"]
        assert set(w.keys()) == {"basic", "intermediate", "advanced"}
        assert all(isinstance(v, (int, float)) and v > 0 for v in w.values())

    def test_emergency_config(self, api):
        cfg = api.get(f"{API}/config", timeout=15).json()
        e = cfg["contracts"]["emergency"]
        assert e["enabled"] is True
        assert e["material"] == "finished_goods"
        assert e["duration_seconds"] == 600
        assert e["check_interval_seconds"] == 120
        assert e["spawn_chance"] == 0.3
        assert e["unlock_level"] == 4
        assert e["difficulty"] == "Rare"
        assert e["label"] == "Emergency Repair"

    def test_shipping_depot_quality(self, api):
        cfg = api.get(f"{API}/config", timeout=15).json()
        q = cfg["upgrades"]["shipping_depot"]["quality"]
        assert "qty_per_level" in q
        assert q["qty_per_level"] > 0

    def test_reward_scaling_math(self, api):
        """Advanced should pay far more per contract than basic."""
        cfg = api.get(f"{API}/config", timeout=15).json()
        b = cfg["contracts"]["tiers"]["basic"]
        a = cfg["contracts"]["tiers"]["advanced"]
        # Compare min payout basic vs advanced
        b_min = b["coin_per"][0] * b["qty_min"]
        a_min = a["coin_per"][0] * a["qty_min"]
        assert a_min > b_min * 5, f"Advanced {a_min} not >>> basic {b_min}"


# ---- save/load round-trip with new state shape ----
PLAYER_ID = f"TEST_tier_{int(time.time())}"


class TestSaveLoadRoundtrip:
    @classmethod
    def teardown_class(cls):
        try:
            requests.delete(f"{API}/game/{PLAYER_ID}", timeout=10)
        except Exception:
            pass

    def test_put_and_get_roundtrip(self, api):
        now_ms = int(time.time() * 1000)
        state = {
            "resources": {"scrap": 50, "components": 20, "finished_goods": 10, "coins": 5000},
            "level": 5,
            "xp": 12,
            "restoration_points": 15,
            "town_hall_restored": False,
            "buildings": {
                "scrap_yard": {"baseline_ts": now_ms, "upgrades": {"speed": 2, "storage": 3}},
                "machine_shop": {"jobs": [], "upgrades": {"speed": 2, "slots": 2}},
                "shipping_depot": {"upgrades": {"rewards": 3, "quality": 2}},
            },
            "contracts": [
                {"id": "c1", "tier": "basic", "label": "Local Delivery", "difficulty": "Easy",
                 "color": "#4A7C59", "requirements": [{"resource": "scrap", "qty": 10}],
                 "reward_coins": 7, "reward_xp": 4, "reward_restoration": 2, "expires_at": None},
                {"id": "c2", "tier": "intermediate", "label": "Regional Contract", "difficulty": "Medium",
                 "color": "#4F759B", "requirements": [{"resource": "components", "qty": 5}],
                 "reward_coins": 25, "reward_xp": 12, "reward_restoration": 5, "expires_at": None},
                {"id": "c3", "tier": "advanced", "label": "Industrial Contract", "difficulty": "Hard",
                 "color": "#7A4F9B", "requirements": [{"resource": "finished_goods", "qty": 3}],
                 "reward_coins": 72, "reward_xp": 36, "reward_restoration": 10, "expires_at": None},
            ],
            "emergency": None,
            "emergency_next_check_ts": now_ms + 120000,
            "last_seen_ts": now_ms,
            "tutorial_seen": True,
        }
        r = api.put(f"{API}/game/{PLAYER_ID}", json={"state": state}, timeout=15)
        assert r.status_code == 200
        assert r.json()["ok"] is True

        got = api.get(f"{API}/game/{PLAYER_ID}", timeout=15)
        assert got.status_code == 200
        remote_state = got.json()["state"]
        assert remote_state["level"] == 5
        assert remote_state["resources"]["finished_goods"] == 10
        assert len(remote_state["contracts"]) == 3
        tiers = [c["tier"] for c in remote_state["contracts"]]
        assert tiers == ["basic", "intermediate", "advanced"]
        assert remote_state["emergency"] is None
        assert remote_state["emergency_next_check_ts"] == now_ms + 120000

    def test_put_and_get_with_emergency(self, api):
        now_ms = int(time.time() * 1000)
        emergency = {
            "id": "emg1",
            "tier": "emergency",
            "label": "Emergency Repair",
            "difficulty": "Rare",
            "color": "#D9822B",
            "requirements": [{"resource": "finished_goods", "qty": 5}],
            "reward_coins": 300,
            "reward_xp": 150,
            "reward_restoration": 25,
            "expires_at": now_ms + 600000,
        }
        state = {
            "resources": {"scrap": 0, "components": 0, "finished_goods": 10, "coins": 0},
            "level": 5,
            "xp": 0,
            "restoration_points": 0,
            "town_hall_restored": False,
            "buildings": {
                "scrap_yard": {"baseline_ts": now_ms, "upgrades": {"speed": 1, "storage": 1}},
                "machine_shop": {"jobs": [], "upgrades": {"speed": 1, "slots": 1}},
                "shipping_depot": {"upgrades": {"rewards": 1, "quality": 1}},
            },
            "contracts": [
                {"id": f"c{i}", "tier": "basic", "label": "Local Delivery", "difficulty": "Easy",
                 "color": "#4A7C59", "requirements": [{"resource": "scrap", "qty": 10}],
                 "reward_coins": 7, "reward_xp": 4, "reward_restoration": 2, "expires_at": None}
                for i in range(3)
            ],
            "emergency": emergency,
            "emergency_next_check_ts": now_ms + 120000,
            "last_seen_ts": now_ms,
            "tutorial_seen": True,
        }
        r = api.put(f"{API}/game/{PLAYER_ID}", json={"state": state}, timeout=15)
        assert r.status_code == 200

        got = api.get(f"{API}/game/{PLAYER_ID}", timeout=15).json()["state"]
        assert got["emergency"] is not None
        assert got["emergency"]["tier"] == "emergency"
        assert got["emergency"]["expires_at"] == now_ms + 600000
        assert got["emergency"]["requirements"][0]["resource"] == "finished_goods"

    def test_delete(self, api):
        r = api.delete(f"{API}/game/{PLAYER_ID}", timeout=10)
        assert r.status_code == 200
        got = api.get(f"{API}/game/{PLAYER_ID}", timeout=10).json()
        assert got["state"] is None
