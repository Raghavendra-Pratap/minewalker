import type { GameController } from '../game/GameController'
import { dirsFromFacing } from '../game/input'
import {
  isTouchPlayTarget,
  loadTouchControlMode,
  saveTouchControlMode,
  type TouchControlMode,
} from './touchPlay'
import './mobileControls.css'

const STEP_MS = 130
const STICK_DEADZONE = 0.28

export interface MobileControlsHooks {
  onModeChange?: (mode: TouchControlMode) => void
  /** Called when Simple mode should prefer Head/chase cam. */
  onPreferSimpleCamera?: () => void
}

export interface MobileControlsApi {
  mode: () => TouchControlMode
  destroy: () => void
  setVisible: (visible: boolean) => void
}

type MoveAxis = 'KeyW' | 'KeyA' | 'KeyS' | 'KeyD'

export function mountMobileControls(
  parent: HTMLElement,
  game: GameController,
  hooks: MobileControlsHooks = {},
): MobileControlsApi | null {
  if (!isTouchPlayTarget()) return null

  document.body.classList.add('has-touch-play')

  let mode = loadTouchControlMode()
  const root = document.createElement('div')
  root.className = 'mw-mobile'
  root.innerHTML = `
    <div class="mw-mobile-mode" role="group" aria-label="Touch control mode">
      <button type="button" data-mode="simple">Simple</button>
      <button type="button" data-mode="immersive">Immersive</button>
    </div>
    <div class="mw-mobile-pad" data-pad>
      <div class="mw-dpad" aria-label="Move">
        <button type="button" class="n" data-axis="KeyW" aria-label="Forward">▲</button>
        <button type="button" class="w" data-axis="KeyA" aria-label="Left">◀</button>
        <button type="button" class="e" data-axis="KeyD" aria-label="Right">▶</button>
        <button type="button" class="s" data-axis="KeyS" aria-label="Back">▼</button>
      </div>
      <div class="mw-stick" data-stick aria-label="Move stick">
        <div class="mw-stick-knob" data-knob></div>
      </div>
    </div>
    <div class="mw-mobile-actions">
      <button type="button" data-act="turnL" aria-label="Turn left">Turn L</button>
      <button type="button" data-act="turnR" aria-label="Turn right">Turn R</button>
      <button type="button" class="primary" data-act="dig" aria-label="Dig">Dig</button>
      <button type="button" data-act="flag" aria-label="Flag">Flag</button>
    </div>
  `
  parent.appendChild(root)

  const padEl = root.querySelector('[data-pad]') as HTMLElement
  const stickEl = root.querySelector('[data-stick]') as HTMLElement
  const knobEl = root.querySelector('[data-knob]') as HTMLElement
  const modeBtns = Array.from(root.querySelectorAll('[data-mode]')) as HTMLButtonElement[]

  const held = new Set<MoveAxis>()
  let stepTimer = 0
  let stickPointerId: number | null = null

  const clearStepTimer = () => {
    if (stepTimer) {
      window.clearTimeout(stepTimer)
      stepTimer = 0
    }
  }

  const resolveAndMove = (axis: MoveAxis) => {
    const map = dirsFromFacing(game.getPlayer().facing)
    const dir = map[axis]
    if (dir) game.tryMove(dir)
  }

  const stepHeld = () => {
    stepTimer = 0
    for (const axis of held) {
      resolveAndMove(axis)
      break
    }
    if (held.size > 0) stepTimer = window.setTimeout(stepHeld, STEP_MS)
  }

  const holdAxis = (axis: MoveAxis) => {
    if (held.has(axis)) return
    held.add(axis)
    resolveAndMove(axis)
    if (!stepTimer) stepTimer = window.setTimeout(stepHeld, STEP_MS)
  }

  const releaseAxis = (axis: MoveAxis) => {
    held.delete(axis)
    if (held.size === 0) clearStepTimer()
  }

  const releaseAllAxes = () => {
    held.clear()
    clearStepTimer()
  }

  const setKnob = (nx: number, ny: number) => {
    const max = stickEl.clientWidth * 0.32
    knobEl.style.transform = `translate(${nx * max}px, ${ny * max}px)`
  }

  const applyStickVector = (nx: number, ny: number) => {
    releaseAllAxes()
    const mag = Math.hypot(nx, ny)
    if (mag < STICK_DEADZONE) {
      setKnob(0, 0)
      return
    }
    setKnob(nx, ny)
    // Screen up = forward (KeyW); screen right = KeyD
    if (Math.abs(ny) >= Math.abs(nx)) {
      holdAxis(ny < 0 ? 'KeyW' : 'KeyS')
    } else {
      holdAxis(nx < 0 ? 'KeyA' : 'KeyD')
    }
  }

  const syncModeUi = () => {
    padEl.classList.toggle('is-dpad', mode === 'simple')
    padEl.classList.toggle('is-stick', mode === 'immersive')
    modeBtns.forEach((btn) => {
      btn.classList.toggle('is-active', btn.dataset.mode === mode)
    })
    releaseAllAxes()
    setKnob(0, 0)
    hooks.onModeChange?.(mode)
    if (mode === 'simple') hooks.onPreferSimpleCamera?.()
  }

  modeBtns.forEach((btn) => {
    btn.addEventListener('click', () => {
      const next = btn.dataset.mode as TouchControlMode
      if (next !== 'simple' && next !== 'immersive') return
      mode = next
      saveTouchControlMode(mode)
      syncModeUi()
    })
  })

  root.querySelectorAll<HTMLButtonElement>('[data-axis]').forEach((btn) => {
    const axis = btn.dataset.axis as MoveAxis
    const down = (e: PointerEvent) => {
      e.preventDefault()
      e.stopPropagation()
      btn.classList.add('is-held')
      try {
        btn.setPointerCapture(e.pointerId)
      } catch {
        // ignore
      }
      holdAxis(axis)
    }
    const up = (e: PointerEvent) => {
      e.preventDefault()
      btn.classList.remove('is-held')
      releaseAxis(axis)
    }
    btn.addEventListener('pointerdown', down)
    btn.addEventListener('pointerup', up)
    btn.addEventListener('pointercancel', up)
    btn.addEventListener('lostpointercapture', up)
  })

  const onStickDown = (e: PointerEvent) => {
    if (mode !== 'immersive') return
    e.preventDefault()
    e.stopPropagation()
    stickPointerId = e.pointerId
    try {
      stickEl.setPointerCapture(e.pointerId)
    } catch {
      // ignore
    }
    const rect = stickEl.getBoundingClientRect()
    const nx = ((e.clientX - rect.left) / rect.width) * 2 - 1
    const ny = ((e.clientY - rect.top) / rect.height) * 2 - 1
    applyStickVector(Math.max(-1, Math.min(1, nx)), Math.max(-1, Math.min(1, ny)))
  }

  const onStickMove = (e: PointerEvent) => {
    if (stickPointerId !== e.pointerId) return
    const rect = stickEl.getBoundingClientRect()
    const nx = ((e.clientX - rect.left) / rect.width) * 2 - 1
    const ny = ((e.clientY - rect.top) / rect.height) * 2 - 1
    applyStickVector(Math.max(-1, Math.min(1, nx)), Math.max(-1, Math.min(1, ny)))
  }

  const onStickUp = (e: PointerEvent) => {
    if (stickPointerId !== e.pointerId) return
    stickPointerId = null
    releaseAllAxes()
    setKnob(0, 0)
  }

  stickEl.addEventListener('pointerdown', onStickDown)
  stickEl.addEventListener('pointermove', onStickMove)
  stickEl.addEventListener('pointerup', onStickUp)
  stickEl.addEventListener('pointercancel', onStickUp)

  root.querySelector<HTMLButtonElement>('[data-act="dig"]')?.addEventListener('click', (e) => {
    e.preventDefault()
    game.digAhead()
  })
  root.querySelector<HTMLButtonElement>('[data-act="flag"]')?.addEventListener('click', (e) => {
    e.preventDefault()
    game.flagAhead()
  })
  root.querySelector<HTMLButtonElement>('[data-act="turnL"]')?.addEventListener('click', (e) => {
    e.preventDefault()
    game.faceToward(dirsFromFacing(game.getPlayer().facing).KeyA)
  })
  root.querySelector<HTMLButtonElement>('[data-act="turnR"]')?.addEventListener('click', (e) => {
    e.preventDefault()
    game.faceToward(dirsFromFacing(game.getPlayer().facing).KeyD)
  })

  syncModeUi()

  return {
    mode: () => mode,
    setVisible: (visible) => {
      root.hidden = !visible
    },
    destroy: () => {
      releaseAllAxes()
      root.remove()
      document.body.classList.remove('has-touch-play')
    },
  }
}
