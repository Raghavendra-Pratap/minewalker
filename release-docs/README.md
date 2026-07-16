# Minewalker

**3D minesweeper you walk through** — dig solid rock, read the vein, and clear the gallery with a headlamp on.

## The Problem

Classic minesweeper is a flat grid under a mouse cursor. The logic is sharp, but the space feels abstract. Minewalker asks what happens when the same deduction has to live in a cavern you actually walk.

## What It Does

- Opens on a **cover → Shift Desk → play** campaign flow
- **Training yard** teaches numbers and facing before real cuts
- **Beginner / Intermediate / Expert** clear-to-win cavern fields
- **Endless** tunnel that expands as you dig — deepest run is the score
- Four cameras: Head, free scout drone, first-person, and Orbit overview
- End-of-run reports with local best times and deepest clears
- Optional deep-link / portfolio handoff that drops you straight into a run

## Architecture Overview

Minewalker separates **mine rules** from **presentation**: a single game-state owner publishes run snapshots; the 3D scene and HUD only mirror them. Campaign shell, mine logic, scene, and HUD stay as clear layers. See [ARCHITECTURE.md](./ARCHITECTURE.md) for the hub and deeper docs.

## Tech Stack

- TypeScript
- Vite
- Babylon.js
- Vanilla DOM / CSS
- Browser local storage (bests)

## Download

*[Placeholder — add build / play URL when hosted]*

## Status

Playable browser game. Public host URL pending. Classic clears and endless deepest-run scoring are live; optional endless milestones are deferred.

→ [See Architecture](./ARCHITECTURE.md)
