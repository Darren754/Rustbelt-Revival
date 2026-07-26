"""Rustbelt Revival backend API tests (iteration 2: multi-track upgrades + depot building)."""
import os
import time
import pytest
import requests

BASE_URL = os.environ.get("EXPO_PUBLIC_BACKEND_URL", "").rstrip("/")
if not BASE_URL:
    from pathlib import Path
    env_path = Path(__file__).resolve().parents[2] / "frontend" / ".env"
    if env_path.exists():
        for line in env_path.read_text().splitlines():
            if line.startswith("EXPO_PUBLIC_BACKEND_URL="):
                BASE_URL = line.split("=", 1)[1].strip().strip('"').rstrip("/")
API = f"{BASE_URL}/api"

PLAYER_ID = f"TEST_player_upg_{int(time.time())}"


@pytest.fixture(scope="module")
def api_client():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    yield s
    try:
        s.delete(f"{API}/game/{PLAYER_ID}", timeout=10)
    except Exception:
        pass


# ---- Health ----
def test_root(api_client):
    r = api_client.get(f"{API}/", timeout=10)
    assert r.status_code == 200
    assert "message" in r.json()


# ---- Config ----
def test_get_config_top_level(api_client):
    r = api_client.get(f"{API}/config", timeout=10)
    assert r.status_code == 200
    data = r.json()
    assert data.get("offline_cap_seconds") == 28800
    assert "scrap_yard" in data
    assert "machine_shop" in data
    assert "upgrades" in data
    assert "contracts" in data
    assert "dev" in data


def test_get_config_upgrades_structure(api_client):
    data = api_client.get(f"{API}/config", timeout=10).json()
    up = data["upgrades"]
    # scrap_yard.speed / storage
    sy = up["scrap_yard"]
    for track in ("speed", "storage"):
        assert track in sy
        for k in ("cost_base", "cost_growth", "max_level"):
            assert k in sy[track], f"scrap_yard.{track} missing {k}"
    assert sy["storage"]["base_capacity"] > 0
    assert sy["storage"]["per_level"] > 0
    assert 0 < sy["speed"]["factor"] < 1

    # machine_shop.speed / slots
    ms = up["machine_shop"]
    for track in ("speed", "slots"):
        assert track in ms
        for k in ("cost_base", "cost_growth", "max_level"):
            assert k in ms[track], f"machine_shop.{track} missing {k}"
    assert ms["slots"]["max_level"] >= 3

    # shipping_depot.rewards / quality
    sd = up["shipping_depot"]
    for track in ("rewards", "quality"):
        assert track in sd
        for k in ("cost_base", "cost_growth", "max_level"):
            assert k in sd[track], f"shipping_depot.{track} missing {k}"
    assert sd["rewards"]["mult_per_level"] > 0
    assert sd["quality"]["restoration_per_level"] > 0


def test_get_config_dev_grant_amount(api_client):
    data = api_client.get(f"{API}/config", timeout=10).json()
    assert data["dev"]["grant_coins_amount"] == 1000


# ---- Cloud save CRUD ----
def test_get_new_player_returns_state_null(api_client):
    r = api_client.get(f"{API}/game/{PLAYER_ID}", timeout=10)
    assert r.status_code == 200
    data = r.json()
    assert data["player_id"] == PLAYER_ID
    assert data["state"] is None


def test_put_and_get_roundtrip_new_shape(api_client):
    """Save with new multi-track shape and verify identical roundtrip."""
    now_ms = int(time.time() * 1000)
    state = {
        "level": 3,
        "xp": 42,
        "restoration_points": 12,
        "town_hall_restored": False,
        "resources": {"scrap": 8, "components": 2, "finished_goods": 1, "coins": 1500},
        "buildings": {
            "scrap_yard": {"baseline_ts": now_ms, "upgrades": {"speed": 2, "storage": 3}},
            "machine_shop": {"jobs": [], "upgrades": {"speed": 1, "slots": 2}},
            "shipping_depot": {"upgrades": {"rewards": 4, "quality": 2}},
        },
        "contracts": [],
        "last_seen_ts": now_ms,
        "tutorial_seen": True,
    }
    r = api_client.put(f"{API}/game/{PLAYER_ID}", json={"state": state}, timeout=10)
    assert r.status_code == 200
    body = r.json()
    assert body["ok"] is True

    # verify identical roundtrip
    got = api_client.get(f"{API}/game/{PLAYER_ID}", timeout=10).json()["state"]
    assert got == state, f"roundtrip mismatch: {got}"


def test_put_updates_existing(api_client):
    state = {
        "level": 5,
        "xp": 0,
        "resources": {"scrap": 20, "components": 5, "finished_goods": 2, "coins": 5000},
        "restoration_points": 40,
        "buildings": {
            "scrap_yard": {"baseline_ts": 1_700_000_000_000, "upgrades": {"speed": 4, "storage": 5}},
            "machine_shop": {"jobs": [], "upgrades": {"speed": 3, "slots": 3}},
            "shipping_depot": {"upgrades": {"rewards": 6, "quality": 4}},
        },
        "contracts": [],
        "last_seen_ts": 1_700_000_100_000,
        "tutorial_seen": True,
    }
    r = api_client.put(f"{API}/game/{PLAYER_ID}", json={"state": state}, timeout=10)
    assert r.status_code == 200
    got = api_client.get(f"{API}/game/{PLAYER_ID}", timeout=10).json()["state"]
    assert got["level"] == 5
    assert got["buildings"]["machine_shop"]["upgrades"]["slots"] == 3
    assert got["buildings"]["shipping_depot"]["upgrades"]["rewards"] == 6


def test_put_legacy_shape_still_saves(api_client):
    """Legacy single-'level' + single 'job' shape must persist verbatim so client can migrate."""
    legacy_pid = f"{PLAYER_ID}_legacy"
    legacy_state = {
        "level": 1, "xp": 5,
        "resources": {"scrap": 3, "components": 0, "finished_goods": 0, "coins": 100},
        "restoration": 0,
        "buildings": {
            "scrap_yard": {"level": 2, "baseline_ts": 1_700_000_000_000},
            "machine_shop": {"level": 1, "job": {"type": "component", "start_ts": 1, "duration_ms": 20000}},
        },
        "last_seen": 1_700_000_000_000,
    }
    try:
        r = api_client.put(f"{API}/game/{legacy_pid}", json={"state": legacy_state}, timeout=10)
        assert r.status_code == 200
        got = api_client.get(f"{API}/game/{legacy_pid}", timeout=10).json()["state"]
        # backend must not mutate, it just stores. Client-side normalizeState does the migration.
        assert got["buildings"]["scrap_yard"]["level"] == 2
        assert got["buildings"]["machine_shop"]["job"]["type"] == "component"
    finally:
        api_client.delete(f"{API}/game/{legacy_pid}", timeout=10)


def test_delete_removes_save(api_client):
    r = api_client.delete(f"{API}/game/{PLAYER_ID}", timeout=10)
    assert r.status_code == 200
    assert r.json().get("ok") is True
    r2 = api_client.get(f"{API}/game/{PLAYER_ID}", timeout=10)
    assert r2.status_code == 200
    assert r2.json()["state"] is None


def test_put_invalid_payload(api_client):
    r = api_client.put(f"{API}/game/{PLAYER_ID}", json={"not_state": {}}, timeout=10)
    assert r.status_code in (400, 422)
