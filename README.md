# Minewalker — Babylon.js Minesweeper

Bomberman-style **3D Minesweeper**: walk a miner through diggable rock. Classic **Beginner / Intermediate / Expert** play on an open cavern plane; **Endless** is a growing tunnel gallery.

Built with **Vite**, **TypeScript**, and **Babylon.js** (no React / Three.js).

## Campaign shell (like Signal Break)

The app opens on a **Minewalker** cover → **Shift Desk** hub (levels) → play. Parallel to Signal Break’s cover → Field Ops → disciplines.

| Screen | Role |
| --- | --- |
| Cover | Stamp, title, four-level brief, enter / how-to |
| Shift Desk | Training yard + Beginner / Intermediate / Expert / Endless |
| How to Play | Controls, mine logic, cameras, tradeoffs |
| Play | 3D mine + HUD (`← Desk` returns to hub) |

Skip the cover with `?play=1` or `?from=castle-gate` (Castle Gate handoff).

## Quick start

```bash
npm install
npm run dev
```

Default port: `5174`.

| Script | Purpose |
| --- | --- |
| `npm run dev` | Local development |
| `npm run build` | Typecheck + production bundle |
| `npm run preview` | Serve production build |

## How to play

You start in a small open courtyard. Covered cells are **solid rock** — dig them open to walk further. Pick a level from **Shift Desk**; the HUD shows the selected level only.

| Mode | Board | Mines | Layout |
| --- | --- | --- | --- |
| Beginner | 9×9 | 10 | Open plane cavern |
| Intermediate | 16×16 | 40 | Open plane cavern |
| Expert | 30×16 | 99 | Open plane cavern |
| Endless | grows | density | Eastward tunnel |

Classic modes: clear every safe stone to win. Endless: dig the fringe to expand forever.

| Input | Action |
| --- | --- |
| `W` / `↑` | Face & move **forward** |
| `S` / `↓` | Face & move **back** |
| `A` / `←` | Face & move **left** (strafe) |
| `D` / `→` | Face & move **right** (strafe) |
| `Q` | Turn **left** on the spot |
| `E` | Turn **right** on the spot |
| `Space` | Dig the rock you face |
| `F` | Flag / unflag the rock you face |
| `R` | Restart run |
| `V` | Cycle camera (Head / 3rd drone / 1st / Orbit) |
| Drag | Orbit Head angle / look (1st) / free drone (3rd) / orbit |
| `Shift` + `WASD` | Fly the **3rd** drone around the cavern |
| `Shift` + `Q` / `E` | Raise / lower the 3rd drone |
| `T` | Recall 3rd drone behind the miner |

**Head** cam sits over the miner, follows their facing, and can be angled with mouse drag. **3rd** is a free drone — on Beginner / Intermediate / Expert it stays parked where you leave it after scouting.

Hit a charge while digging and the run ends. Press **R** or use the end-screen retry to restart; **← Desk** returns to Shift Desk.

## Architecture

```
src/
  main.ts
  campaign/
    CampaignShell.ts   Cover → Shift Desk → guide
    assignments.ts     Mode blurbs for hub cards
    minewalker.css     Shift-log theme
  game/
    types.ts           Grid, player, Beginner/Intermediate/Expert/Endless
    board.ts           Pure minesweeper rules + expand
    GameController.ts  Player step, dig/flag, timer
    input.ts           Keyboard bindings
  scene/
    createScene.ts     Engine, lights, shadows, camera
    world.ts           Tile size / world positions
    CaveEnvironment.ts Cave shell around the dig
    BoardView.ts       Rock, floors, neon digits, cameras
    PlayerView.ts      Miner character
  ui/
    hud.ts / hud.css
```

Logic stays Babylon-free in `board.ts`. The scene only mirrors state.

## Stack

- `@babylonjs/core` — scene, shadows, materials, cameras
- HTML campaign shell + HUD overlay
- Free drone (3rd), first-person, and orbit cameras
