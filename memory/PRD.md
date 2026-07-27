# Rustbelt Revival — PRD

## Original Problem Statement
Mobile-first management/idle game prototype. Player inherits an abandoned industrial town and rebuilds it by collecting materials, manufacturing goods, completing contracts, upgrading buildings, and restoring town landmarks. Warm, slightly humorous weathered-industrial style with original placeholder art. No real-money/ads/multiplayer/social yet.

## User Choices
- Persistence: BOTH local (AsyncStorage cache) + backend cloud save
- Anonymous guest `player_id` now (accounts-ready)
- Palette: agent-designed friendly-industrial (rust/steel/safety-yellow)
- Scope: start minimal (inventory + Scrap Yard) then expand → full loop delivered
- Offline cap: 8h, configurable server-side via `/api/config`

## Architecture
- **Client-owned game engine** (`src/game/engine.ts`): timestamp-based accrual, single Machine Shop job, upgrades, contracts, XP/level, offline calc. 500ms tick loop in `GameContext`.
- **Backend** (FastAPI + MongoDB): cloud save (`game_saves` keyed by `player_id`) + tunable config source (`/api/config`). Local storage is primary cache; remote save debounced + on app-background.
- **Timestamps**: UTC epoch ms (`last_seen_ts`). Offline capped by `offline_cap_seconds`.

## Database
`game_saves`: `{ player_id, state{resources, level, xp, restoration_points, town_hall_restored, buildings{scrap_yard, machine_shop}, contracts[], last_seen_ts, tutorial_seen}, created_at, updated_at }`. `game_config` (optional override of defaults). Flat `state` blob → user accounts slot in later.

## Screens
Town HUD (`/town`), Contracts / Shipping Depot (`/contracts`), Town Hall / Restoration (`/hall`), Building bottom-sheet (Scrap Yard / Machine Shop), Welcome-Back modal, Celebration modal, first-time tutorial banner. Bottom-tab navigation.

## Implemented (2026-06)
- Resource inventory header + level/XP bar + restoration meter (sticky)
- Scrap Yard production loop (1 scrap/10s) with progress + Collect button
- Machine Shop conversions (2 Scrap→Component 20s; 2 Components→Finished Good 30s)
- Shipping Depot: 3 random contracts, fulfil (coins+XP+restoration), refresh, auto-replace
- XP → level progression; 100 restoration → Town Hall restored + celebration
- Offline production (8h cap, configurable) + Welcome-Back summary
- Cloud save + local cache; anonymous player_id; reset/new-town flow
- **Configurable multi-track upgrade system** (all values in config/`/api/config`):
  - Scrap Yard: `speed` (rate) + `storage` (capacity cap on ready scrap)
  - Machine Shop: `speed` (time) + `slots` (unlock concurrent production slots, max 3)
  - Shipping Depot (now a building): `rewards` (+% coins/XP) + `quality` (bigger orders + restoration)
  - Upgrade UI shows current level, current & next benefit, and Coin cost (growth formula)
  - Safe migration of legacy single-`level`/`job` saves to Level-1 tracks
- **Dev tools** (Town Hall): grant coins, grant materials, level up, force emergency, reset upgrades
- **Strategic tiered contracts**: Basic "Local Delivery" (Scrap), Intermediate "Regional Contract" (Components), Advanced "Industrial Contract" (Finished Goods) — single-material per tier, per-unit rewards × quantity so higher tiers pay dramatically more; tier gating by unlock level; weighted random board. Rare limited-time "Emergency Repair" contract with countdown + huge reward. Depot `quality` track = bigger orders. All tiers/quantities/rewards/probabilities configurable.
- Haptics, tooltips, toasts; testIDs throughout. Verified by testing agent (backend 9/9) + visual e2e.
- **Restoration milestones & landmarks**: config-driven milestones (25/50/75/100) each unlock a named landmark (Old Clock Tower → Rail Station → River Bridge → Grand Town Hall), pay a one-time Coin bonus, and grant a permanent +% reward buff (coins & XP). Town Hall shows a skyline strip + landmark list. `claimed_milestones` prevents double-paying bonuses.
- **Value-Score contract badges**: configurable weighted score (coins/xp/restoration vs materials + estimated production time) assigns varied, distinct badges — ⭐ Best Value, 💎 Premium, ⚡ Quick Cash, 🏗 Best Restoration, 📈 Best XP — one per contract, each type once; Emergency contracts never badged (keep unique orange limited-time treatment).

## Backlog
- P1: Auth + real accounts (Google/JWT) on top of player_id; multi-device sync conflict UI
- P1: More buildings/landmarks + tiered restoration milestones; storage caps
- P2: Sound, richer Skia illustrations, achievements, daily contracts
- P2: Surface toast when tapping a recipe while shop is busy; migrate deprecated shadow* → boxShadow

## Next Tasks
- Expand building roster + restoration milestones; add server-side config editing UI.
