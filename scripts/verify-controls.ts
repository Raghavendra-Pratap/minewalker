/**
 * Verify player-facing-relative move + dig.
 * Run: node (after esbuild) or npx tsx scripts/verify-controls.ts
 */
import { dirsFromFacing, leftOf, rightOf } from '../src/game/input'
import { GameController } from '../src/game/GameController'
import { DIRECTION_DELTA, type Direction } from '../src/game/types'

const g = globalThis as typeof globalThis & {
  window: typeof globalThis
  performance: { now: () => number }
}
g.window = globalThis
g.performance = { now: () => Date.now() }

const DIRS: Direction[] = ['north', 'south', 'east', 'west']

function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error(msg)
}

async function sleep(ms: number) {
  await new Promise((r) => setTimeout(r, ms))
}

function verifyRelativeMap() {
  // A/D / arrows are screen-relative for the Head cam (LH view):
  // screen-right uses leftOf(), screen-left uses rightOf().
  assert(dirsFromFacing('east').KeyW === 'east', 'east: W')
  assert(dirsFromFacing('east').KeyS === 'west', 'east: S')
  assert(dirsFromFacing('east').KeyA === 'south', 'east: A (screen left)')
  assert(dirsFromFacing('east').KeyD === 'north', 'east: D (screen right)')

  assert(dirsFromFacing('north').KeyW === 'north', 'north: W')
  assert(dirsFromFacing('north').KeyA === 'east', 'north: A')
  assert(dirsFromFacing('north').KeyD === 'west', 'north: D')

  assert(dirsFromFacing('west').KeyW === 'west', 'west: W')
  assert(dirsFromFacing('west').KeyA === 'north', 'west: A')
  assert(dirsFromFacing('west').KeyD === 'south', 'west: D')

  assert(dirsFromFacing('south').KeyW === 'south', 'south: W')
  assert(dirsFromFacing('south').KeyA === 'west', 'south: A')
  assert(dirsFromFacing('south').KeyD === 'east', 'south: D')

  console.log('✓ relative map for all facings')
}

async function verifyStrafeMoveAndDig() {
  const game = new GameController('beginner')

  for (const facing of DIRS) {
    game.restart()
    await sleep(0)
    game.faceToward(facing)

    const map = dirsFromFacing(facing)
    for (const [label, code] of [
      ['W', 'KeyW'],
      ['S', 'KeyS'],
      ['A', 'KeyA'],
      ['D', 'KeyD'],
    ] as const) {
      game.restart()
      await sleep(0)
      game.faceToward(facing)
      const worldDir = map[code]
      const before = game.getPlayer()
      assert(game.tryMove(worldDir), `${facing}+${label}: move ${worldDir}`)
      await sleep(140)
      const after = game.getPlayer()
      assert(after.facing === worldDir, `${facing}+${label}: face ${worldDir}`)
      assert(
        after.row === before.row + DIRECTION_DELTA[worldDir].row &&
          after.col === before.col + DIRECTION_DELTA[worldDir].col,
        `${facing}+${label}: stepped ${worldDir}`,
      )
    }

    // Face each way, step forward, dig ahead (fringe outside pad)
    game.restart()
    await sleep(0)
    game.faceToward(facing)
    const origin = game.getPlayer()
    assert(game.tryMove(facing), `step forward ${facing}`)
    await sleep(140)
    const result = game.digAhead()
    assert(game.getPlayer().facing === facing, `dig ahead facing ${facing}`)
    if (!result.hitMine) {
      const target = game.getCell(
        origin.row + DIRECTION_DELTA[facing].row * 2,
        origin.col + DIRECTION_DELTA[facing].col * 2,
      )
      assert(target?.status === 'revealed', `dug fringe while facing ${facing}`)
    }
  }

  console.log('✓ W/A/S/D relative moves + dig ahead for all facings')
}

async function verifyTurnOnSpot() {
  const game = new GameController('beginner')
  game.faceToward('east')
  const start = game.getPlayer()

  // Q / E follow screen left/right (same as A / D)
  const qDir = dirsFromFacing('east').KeyA
  game.faceToward(qDir)
  assert(game.getPlayer().facing === qDir, `Q from east → ${qDir}`)
  assert(game.getPlayer().row === start.row && game.getPlayer().col === start.col, 'Q stays put')

  const eDir = dirsFromFacing(qDir).KeyD
  game.faceToward(eDir)
  assert(game.getPlayer().facing === eDir, `E → ${eDir}`)
  assert(game.getPlayer().row === start.row && game.getPlayer().col === start.col, 'E stays put')

  let facing: Direction = 'east'
  game.faceToward(facing)
  for (let i = 0; i < 4; i++) {
    facing = dirsFromFacing(facing).KeyA
    game.faceToward(facing)
  }
  assert(game.getPlayer().facing === 'east', 'four Q turns return to east')
  assert(game.getPlayer().row === start.row && game.getPlayer().col === start.col, 'spin stays put')

  // Cardinal helpers still rotate consistently
  assert(leftOf('east') === 'north', 'leftOf east')
  assert(rightOf('east') === 'south', 'rightOf east')

  console.log('✓ Q/E turn on the spot')
}

async function main() {
  verifyRelativeMap()
  await verifyStrafeMoveAndDig()
  await verifyTurnOnSpot()
  console.log('\nAll facing-relative control checks passed.')
}

main().catch((err) => {
  console.error('\nControl verification FAILED:', err.message)
  process.exit(1)
})
