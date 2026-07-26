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
    "upgrade": {"cost_base": 60, "cost_growth": 1.7, "speed_factor": 0.85, "max_level": 8},
    "xp_base": 100,
    "restoration_goal": 100,
    "contracts": {
        "board_size": 3,
        "max_requirements": 3,
        "material_unlock": {"components": 2, "finished_goods": 4},
        "resource_weight": {"scrap": 1, "components": 4, "finished_goods": 10},
        "base_qty": {"scrap": 4, "components": 2, "finished_goods": 1},
        "reward_coin_base": 3, "reward_coin_var": 2,
        "reward_xp_base": 1.5, "reward_xp_var": 1,
        "restoration_min": 4, "restoration_span": 6,
    },
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
