import { DEFAULT_CONFIG, GameConfig } from "./config";
import { GameState } from "./types";

const BASE = `${process.env.EXPO_PUBLIC_BACKEND_URL}/api`;

export async function fetchConfig(): Promise<GameConfig> {
  try {
    const res = await fetch(`${BASE}/config`, { method: "GET" });
    if (!res.ok) throw new Error("bad status");
    const data = await res.json();
    return { ...DEFAULT_CONFIG, ...data };
  } catch {
    return DEFAULT_CONFIG;
  }
}

export async function loadRemote(playerId: string): Promise<{ state: any | null } | null> {
  try {
    const res = await fetch(`${BASE}/game/${playerId}`, { method: "GET" });
    if (!res.ok) throw new Error("bad status");
    return await res.json();
  } catch {
    return null;
  }
}

export async function saveRemote(playerId: string, state: GameState): Promise<boolean> {
  try {
    const res = await fetch(`${BASE}/game/${playerId}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ state }),
    });
    return res.ok;
  } catch {
    return false;
  }
}
