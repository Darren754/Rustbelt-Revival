"""Rustbelt Revival backend API tests."""
import os
import time
import pytest
import requests

BASE_URL = os.environ.get("EXPO_PUBLIC_BACKEND_URL", "").rstrip("/")
if not BASE_URL:
    # fallback to frontend env
    from pathlib import Path
    env_path = Path(__file__).resolve().parents[2] / "frontend" / ".env"
    if env_path.exists():
        for line in env_path.read_text().splitlines():
            if line.startswith("EXPO_PUBLIC_BACKEND_URL="):
                BASE_URL = line.split("=", 1)[1].strip().strip('"').rstrip("/")
API = f"{BASE_URL}/api"

PLAYER_ID = f"TEST_player_{int(time.time())}"


@pytest.fixture(scope="module")
def api_client():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    yield s
    # cleanup
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
def test_get_config_returns_offline_cap(api_client):
    r = api_client.get(f"{API}/config", timeout=10)
    assert r.status_code == 200
    data = r.json()
    assert data.get("offline_cap_seconds") == 28800
    assert "scrap_yard" in data
    assert "machine_shop" in data
    assert "upgrade" in data


# ---- Cloud save CRUD ----
def test_get_new_player_returns_state_null(api_client):
    r = api_client.get(f"{API}/game/{PLAYER_ID}", timeout=10)
    assert r.status_code == 200
    data = r.json()
    assert data["player_id"] == PLAYER_ID
    assert data["state"] is None


def test_put_upserts_and_persists(api_client):
    state = {
        "player_id": PLAYER_ID,
        "level": 1,
        "xp": 5,
        "resources": {"scrap": 3, "components": 0, "finished_goods": 0, "coins": 100},
        "restoration": 0,
        "buildings": {"scrap_yard": {"level": 1}},
        "job": None,
        "contracts": [],
        "last_seen": 1_700_000_000_000,
    }
    r = api_client.put(f"{API}/game/{PLAYER_ID}", json={"state": state}, timeout=10)
    assert r.status_code == 200
    body = r.json()
    assert body["ok"] is True
    assert body["player_id"] == PLAYER_ID
    assert "updated_at" in body

    # verify persistence
    r2 = api_client.get(f"{API}/game/{PLAYER_ID}", timeout=10)
    assert r2.status_code == 200
    d2 = r2.json()
    assert d2["state"] is not None
    assert d2["state"]["level"] == 1
    assert d2["state"]["resources"]["scrap"] == 3
    assert d2["state"]["resources"]["coins"] == 100


def test_put_updates_existing(api_client):
    state = {
        "player_id": PLAYER_ID,
        "level": 2,
        "xp": 10,
        "resources": {"scrap": 10, "components": 1, "finished_goods": 0, "coins": 200},
        "restoration": 15,
        "buildings": {"scrap_yard": {"level": 2}},
        "job": None,
        "contracts": [],
        "last_seen": 1_700_000_100_000,
    }
    r = api_client.put(f"{API}/game/{PLAYER_ID}", json={"state": state}, timeout=10)
    assert r.status_code == 200
    r2 = api_client.get(f"{API}/game/{PLAYER_ID}", timeout=10)
    d2 = r2.json()
    assert d2["state"]["level"] == 2
    assert d2["state"]["resources"]["scrap"] == 10
    assert d2["state"]["restoration"] == 15


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
