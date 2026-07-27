from fastapi import FastAPI, APIRouter, HTTPException
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
import os
import logging
from pathlib import Path
from pydantic import BaseModel, Field
from typing import Any, Dict, Optional
from datetime import datetime, timezone


ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

mongo_url = os.environ['MONGO_URL']
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ['DB_NAME']]

app = FastAPI()
api_router = APIRouter(prefix="/api")


def utcnow_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


# ---- Configurable game config (adjustable without touching game logic) ----
GAME_CONFIG: Dict[str, Any] = {
    "offline_cap_seconds": 8 * 3600,   # 8 hour offline cap (configurable)
    "min_offline_seconds": 60,          # below this, no offline summary
    "scrap_yard": {"base_interval": 10, "produce": 1},
    "machine_shop": {
        "component": {"cost": {"scrap": 2}, "out": "components", "out_qty": 1, "base_duration": 20},
        "finished": {"cost": {"components": 2}, "out": "finished_goods", "out_qty": 1, "base_duration": 30},
    },
    "xp_base": 100,
    "restoration_goal": 100,
    "restoration_milestones": [
        {"points": 25, "landmark": "Old Clock Tower", "icon": "clock-time-four", "coin_bonus": 150, "reward_buff_pct": 5},
        {"points": 50, "landmark": "Rail Station", "icon": "train-variant", "coin_bonus": 350, "reward_buff_pct": 5},
        {"points": 75, "landmark": "River Bridge", "icon": "bridge", "coin_bonus": 600, "reward_buff_pct": 5},
        {"points": 100, "landmark": "Grand Town Hall", "icon": "city-variant", "coin_bonus": 1000, "reward_buff_pct": 10},
    ],
    "upgrades": {
        "scrap_yard": {
            "speed": {"max_level": 8, "cost_base": 60, "cost_growth": 1.7, "factor": 0.85},
            "storage": {"max_level": 8, "cost_base": 80, "cost_growth": 1.8, "base_capacity": 20, "per_level": 15},
        },
        "machine_shop": {
            "speed": {"max_level": 8, "cost_base": 75, "cost_growth": 1.7, "factor": 0.85},
            "slots": {"max_level": 3, "cost_base": 600, "cost_growth": 3.0},
        },
        "shipping_depot": {
            "rewards": {"max_level": 8, "cost_base": 120, "cost_growth": 1.8, "mult_per_level": 0.15},
            "quality": {"max_level": 6, "cost_base": 180, "cost_growth": 2.0, "qty_per_level": 0.2},
        },
    },
    "contracts": {
        "board_size": 3,
        "tier_weights": {"basic": 3, "intermediate": 2, "advanced": 2},
        "tiers": {
            "basic": {
                "material": "scrap", "unlock_level": 1,
                "qty_min": 8, "qty_max": 20,
                "coin_per": [0.6, 1.0], "xp_per": [0.3, 0.5], "rest_per": [0.1, 0.2],
                "label": "Local Delivery", "difficulty": "Easy", "color": "#4A7C59",
            },
            "intermediate": {
                "material": "components", "unlock_level": 2,
                "qty_min": 4, "qty_max": 10,
                "coin_per": [4, 6], "xp_per": [2, 3], "rest_per": [0.7, 1.2],
                "label": "Regional Contract", "difficulty": "Medium", "color": "#4F759B",
            },
            "advanced": {
                "material": "finished_goods", "unlock_level": 4,
                "qty_min": 2, "qty_max": 6,
                "coin_per": [18, 28], "xp_per": [9, 14], "rest_per": [2.5, 4],
                "label": "Industrial Contract", "difficulty": "Hard", "color": "#7A4F9B",
            },
        },
        "emergency": {
            "enabled": True,
            "material": "finished_goods", "unlock_level": 4,
            "qty_min": 4, "qty_max": 8,
            "coin_per": [40, 60], "xp_per": [20, 30], "rest_per": [4, 6],
            "duration_seconds": 600, "check_interval_seconds": 120, "spawn_chance": 0.3,
            "label": "Emergency Repair", "difficulty": "Rare", "color": "#D9822B",
        },
        "value_score": {
            "w_coins": 1.0, "w_xp": 1.0, "w_restoration": 6.0,
            "w_materials": 1.0, "w_time": 0.25,
            "premium_threshold": 340,
            "unit_time_seconds": {"scrap": 10, "components": 40, "finished_goods": 110},
        },
    },
    "dev": {"grant_coins_amount": 1000},
}


class GameStatePayload(BaseModel):
    state: Dict[str, Any]


@api_router.get("/")
async def root():
    return {"message": "Rustbelt Revival API", "time": utcnow_iso()}


@api_router.get("/config")
async def get_config():
    """Serve tunable game config. Offline cap etc. can be changed here without
    editing game logic on the client."""
    doc = await db.game_config.find_one({"_id": "default"})
    if doc:
        doc.pop("_id", None)
        return doc
    return GAME_CONFIG


@api_router.get("/game/{player_id}")
async def load_game(player_id: str):
    doc = await db.game_saves.find_one({"player_id": player_id})
    if not doc:
        return {"player_id": player_id, "state": None}
    return {
        "player_id": player_id,
        "state": doc.get("state"),
        "updated_at": doc.get("updated_at"),
    }


@api_router.put("/game/{player_id}")
async def save_game(player_id: str, payload: GameStatePayload):
    now = utcnow_iso()
    await db.game_saves.update_one(
        {"player_id": player_id},
        {
            "$set": {"player_id": player_id, "state": payload.state, "updated_at": now},
            "$setOnInsert": {"created_at": now},
        },
        upsert=True,
    )
    return {"ok": True, "player_id": player_id, "updated_at": now}


@api_router.delete("/game/{player_id}")
async def delete_game(player_id: str):
    await db.game_saves.delete_one({"player_id": player_id})
    return {"ok": True}


app.include_router(api_router)

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

logging.basicConfig(level=logging.INFO,
                    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)


@app.on_event("shutdown")
async def shutdown_db_client():
    client.close()
