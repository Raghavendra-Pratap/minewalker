import type { GameController } from './GameController'
import type { Direction } from './types'

/**
 * Player-facing-relative controls — independent of camera look.
 *
 *   W / ↑  forward     S / ↓  back
 *   A / ←  strafe left D / →  strafe right
 *   Q      turn left   E      turn right  (on the spot)
 *   Space              dig faced tile
 *   F                  flag faced tile
 *   V / C              cycle camera
 *   R                  restart
 */

export interface ControlHooks {
  onToggleCamera?: () => void
}

const CARDINALS: Direction[] = ['north', 'east', 'south', 'west']

function opposite(facing: Direction): Direction {
  return CARDINALS[(CARDINALS.indexOf(facing) + 2) % 4]
}

/** Counter-clockwise from facing (player's left). */
export function leftOf(facing: Direction): Direction {
  // N←W←S←E←N — left when looking along facing in Babylon LH (+Y up)
  return CARDINALS[(CARDINALS.indexOf(facing) + 3) % 4]
}

/** Clockwise from facing (player's right). */
export function rightOf(facing: Direction): Direction {
  return CARDINALS[(CARDINALS.indexOf(facing) + 1) % 4]
}

/**
 * Map move keys to world cardinals from the player's current facing.
 * Screen-right / player-right must match chase/1st look direction.
 */
export function dirsFromFacing(facing: Direction): Record<string, Direction> {
  const forward = facing
  const back = opposite(facing)
  // Swap A/D vs literal leftOf/rightOf: with camera behind looking along facing,
  // world "clockwise right" appears mirrored for south/east facings in LH view.
  const left = rightOf(facing)
  const right = leftOf(facing)
  return {
    KeyW: forward,
    ArrowUp: forward,
    KeyS: back,
    ArrowDown: back,
    KeyA: left,
    ArrowLeft: left,
    KeyD: right,
    ArrowRight: right,
  }
}

const MOVE_CODES = new Set([
  'KeyW',
  'KeyA',
  'KeyS',
  'KeyD',
  'ArrowUp',
  'ArrowDown',
  'ArrowLeft',
  'ArrowRight',
])

export function bindControls(
  game: GameController,
  canvas: HTMLCanvasElement,
  hooks: ControlHooks = {},
) {
  const held = new Set<string>()
  let stepTimer = 0

  const resolveDir = (code: string): Direction | null => {
    if (!MOVE_CODES.has(code)) return null
    const map = dirsFromFacing(game.getPlayer().facing)
    return map[code] ?? null
  }

  const clearStepTimer = () => {
    if (stepTimer) {
      window.clearTimeout(stepTimer)
      stepTimer = 0
    }
  }

  const stepHeld = () => {
    stepTimer = 0
    for (const code of held) {
      const dir = resolveDir(code)
      if (dir) {
        game.tryMove(dir)
        break
      }
    }
    if (held.size > 0) {
      stepTimer = window.setTimeout(stepHeld, 130)
    }
  }

  const onKeyDown = (event: KeyboardEvent) => {
    if (event.repeat) return
    // Shift+WASD is reserved for 3rd-view drone flight (BoardView capture handler).
    if (event.shiftKey && MOVE_CODES.has(event.code)) return

    const moveDir = resolveDir(event.code)
    if (moveDir) {
      event.preventDefault()
      held.add(event.code)
      game.tryMove(moveDir)
      if (!stepTimer) stepTimer = window.setTimeout(stepHeld, 130)
      return
    }

    if (event.code === 'KeyQ') {
      if (event.shiftKey) return
      event.preventDefault()
      // Screen-left matches mirrored LH view (same as ArrowLeft / A)
      game.faceToward(dirsFromFacing(game.getPlayer().facing).KeyA)
      return
    }

    if (event.code === 'KeyE') {
      if (event.shiftKey) return
      event.preventDefault()
      game.faceToward(dirsFromFacing(game.getPlayer().facing).KeyD)
      return
    }

    if (event.code === 'Space') {
      event.preventDefault()
      game.digAhead()
      return
    }

    if (event.code === 'KeyF') {
      event.preventDefault()
      game.flagAhead()
      return
    }

    if (event.code === 'KeyV' || event.code === 'KeyC') {
      event.preventDefault()
      hooks.onToggleCamera?.()
      return
    }

    if (event.code === 'KeyR') {
      event.preventDefault()
      game.restart()
    }
  }

  const onKeyUp = (event: KeyboardEvent) => {
    held.delete(event.code)
    if (held.size === 0) clearStepTimer()
  }

  const onBlur = () => {
    held.clear()
    clearStepTimer()
  }

  window.addEventListener('keydown', onKeyDown)
  window.addEventListener('keyup', onKeyUp)
  window.addEventListener('blur', onBlur)
  canvas.addEventListener('click', () => canvas.focus())

  return () => {
    window.removeEventListener('keydown', onKeyDown)
    window.removeEventListener('keyup', onKeyUp)
    window.removeEventListener('blur', onBlur)
    clearStepTimer()
  }
}
