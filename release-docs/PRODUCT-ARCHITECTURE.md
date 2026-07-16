# Product Architecture — Minewalker

## What it is / who it’s for

An atmospheric 3D take on minesweeper for short puzzle sessions — and for visitors arriving from a portfolio handoff who should be mining within seconds.

## Feature hierarchy

1. **Campaign shell** — Cover, How to Play, Shift Desk
2. **Onboarding** — Training yard (practice, not a ranked level)
3. **Levels** — Beginner, Intermediate, Expert, Endless
4. **In-mine loop** — Walk, face, dig, flag, camera scout
5. **Run report** — Win / loss overlay, retry, return to Desk
6. **Progression** — Best clear time (classic/training); deepest cleared (endless)

## User journey

```
Cover
  → How to Play (optional)
  → Shift Desk (Training or a level)
  → Walk the vein · dig · flag
  → Clear (classic) or detonate / leave (endless)
  → Report → Try again or ← Shift Desk
```

**Deep-link path:** arrive via play / Castle Gate handoff → skip cover → start a run immediately.

## Product decisions that shape the feel

- Same minesweeper logic, but **you live inside the board** — facing and movement matter
- **Training is onboarding**, not one of the four levels
- **Endless has no finish line** — depth is the score; milestones may come later
- Dig/flag hit the **rock you face**, not a mouse-picked cell
- Bests stay **on the player’s machine** for now

## Glossary (player-facing)

| Term | Meaning |
|------|---------|
| Charge | Hidden mine |
| Vein / cut / gallery | The dig site / level |
| Shift Desk | Level select |
| Training yard | Tiny practice field |
| Head / 3rd / 1st / Orbit | Camera modes |
| Fringe | Edge dig that grows Endless |
