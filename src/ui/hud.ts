import type { GameController } from '../game/GameController'
import { GAME_MODES, type GameModeId, type GameSnapshot } from '../game/types'
import type { CameraMode } from '../scene/BoardView'
import './hud.css'

const LOSS_OVERLAY_DELAY_MS = 750

function formatTime(seconds: number) {
  const m = Math.floor(seconds / 60)
  const s = seconds % 60
  return `${m}:${s.toString().padStart(2, '0')}`
}

function statusText(snapshot: GameSnapshot) {
  const mode = GAME_MODES[snapshot.mode]
  if (snapshot.status === 'lost' || snapshot.status === 'won') return ''
  if (snapshot.status === 'playing') {
    return mode.endless
      ? 'Keep digging the endless vein…'
      : `Clear every safe stone · ${mode.label}`
  }
  return mode.endless
    ? 'Walk, then dig deeper into the mine'
    : `Clear the ${mode.label} field`
}

function brandSubtitle(modeId: GameModeId) {
  const mode = GAME_MODES[modeId]
  if (mode.endless) return 'Endless mine · dig forever'
  return `${mode.label} · ${mode.startCols}×${mode.startRows} · ${mode.mines} mines`
}

export interface HudApi {
  render: (snapshot: GameSnapshot) => void
  setCameraMode: (mode: CameraMode) => void
}

export function mountHud(
  root: HTMLElement,
  game: GameController,
  options: {
    onCameraMode?: (mode: CameraMode) => void
    initialCameraMode?: CameraMode
    fromCastleGate?: boolean
  } = {},
): HudApi {
  const modeButtons = (Object.keys(GAME_MODES) as GameModeId[])
    .map(
      (id) =>
        `<button type="button" data-mode="${id}">${GAME_MODES[id].label}</button>`,
    )
    .join('')

  root.innerHTML = `
    <div class="hud-arrive" data-arrive hidden>You fell through the gallery…</div>
    <div class="hud-bar">
      <div class="hud-brand">
        <strong>Minewalker</strong>
        <span data-brand-sub>${brandSubtitle(game.getMode())}</span>
      </div>
      <div class="hud-difficulties" data-modes>
        ${modeButtons}
      </div>
      <div class="hud-stats">
        <span>Cleared <b data-cleared>0</b></span>
        <span>Marks <b data-mines>0</b></span>
        <span>Time <b data-time>0:00</b></span>
      </div>
      <div class="hud-cameras" data-cameras>
        <button type="button" data-cam="chase">Head</button>
        <button type="button" data-cam="third">3rd</button>
        <button type="button" data-cam="first">1st</button>
        <button type="button" data-cam="orbit">Orbit</button>
      </div>
      <button type="button" class="hud-restart" data-restart>New run</button>
      <div class="hud-status" data-status></div>
    </div>
    <p class="hud-help">
      WASD move · Shift+WASD fly 3rd cam · T recall drone · Space dig · F flag · V camera · R restart
    </p>
    <div class="hud-end" data-end hidden aria-hidden="true">
      <div class="hud-end-veil"></div>
      <div class="hud-end-panel" role="dialog" aria-labelledby="hud-end-title">
        <h2 class="hud-end-title" id="hud-end-title" data-end-title></h2>
        <p class="hud-end-sub" data-end-sub></p>
        <button type="button" class="hud-end-retry" data-end-retry>Try again</button>
        <p class="hud-end-hint">or press R</p>
      </div>
    </div>
  `

  const arriveEl = root.querySelector('[data-arrive]') as HTMLElement
  if (options.fromCastleGate) {
    arriveEl.hidden = false
    arriveEl.classList.add('is-visible')
    window.setTimeout(() => {
      arriveEl.classList.remove('is-visible')
      window.setTimeout(() => {
        arriveEl.hidden = true
      }, 500)
    }, 3200)
  }

  const modesEl = root.querySelector('[data-modes]') as HTMLElement
  const brandSubEl = root.querySelector('[data-brand-sub]') as HTMLElement
  const camerasEl = root.querySelector('[data-cameras]') as HTMLElement
  const clearedEl = root.querySelector('[data-cleared]') as HTMLElement
  const minesEl = root.querySelector('[data-mines]') as HTMLElement
  const timeEl = root.querySelector('[data-time]') as HTMLElement
  const statusEl = root.querySelector('[data-status]') as HTMLElement
  const restartBtn = root.querySelector('[data-restart]') as HTMLButtonElement
  const endEl = root.querySelector('[data-end]') as HTMLElement
  const endTitleEl = root.querySelector('[data-end-title]') as HTMLElement
  const endSubEl = root.querySelector('[data-end-sub]') as HTMLElement
  const endRetryBtn = root.querySelector('[data-end-retry]') as HTMLButtonElement

  let lossShowTimer: number | null = null
  let overlayOutcome: 'won' | 'lost' | null = null

  const clearLossTimer = () => {
    if (lossShowTimer !== null) {
      window.clearTimeout(lossShowTimer)
      lossShowTimer = null
    }
  }

  const hideEndOverlay = () => {
    clearLossTimer()
    overlayOutcome = null
    endEl.hidden = true
    endEl.classList.remove('is-visible', 'is-won', 'is-lost')
    endEl.setAttribute('aria-hidden', 'true')
  }

  const showEndOverlay = (kind: 'won' | 'lost', snapshot: GameSnapshot) => {
    const mode = GAME_MODES[snapshot.mode]
    overlayOutcome = kind
    endEl.classList.toggle('is-won', kind === 'won')
    endEl.classList.toggle('is-lost', kind === 'lost')

    if (kind === 'won') {
      endTitleEl.textContent = 'Vein cleared'
      endSubEl.textContent = `${mode.label} · ${snapshot.cleared} stones · ${formatTime(snapshot.elapsedSeconds)}`
      endRetryBtn.textContent = 'Play again'
    } else {
      endTitleEl.textContent = 'Charge detonated'
      endSubEl.textContent = 'The blast got you — dig smarter next run.'
      endRetryBtn.textContent = 'Try again'
    }

    endEl.hidden = false
    endEl.setAttribute('aria-hidden', 'false')
    // Next frame so CSS transition can run after display flips
    requestAnimationFrame(() => {
      endEl.classList.add('is-visible')
    })
  }

  const restart = () => game.restart()

  restartBtn.addEventListener('click', restart)
  endRetryBtn.addEventListener('click', restart)

  modesEl.querySelectorAll('button').forEach((btn) => {
    btn.addEventListener('click', () => {
      const mode = btn.getAttribute('data-mode') as GameModeId
      game.setMode(mode)
    })
  })

  camerasEl.querySelectorAll('button').forEach((btn) => {
    btn.addEventListener('click', () => {
      const mode = btn.getAttribute('data-cam') as CameraMode
      options.onCameraMode?.(mode)
    })
  })

  const setCameraMode = (mode: CameraMode) => {
    camerasEl.querySelectorAll('button').forEach((btn) => {
      btn.classList.toggle('is-active', btn.getAttribute('data-cam') === mode)
    })
  }

  setCameraMode(options.initialCameraMode ?? 'third')

  const render = (snapshot: GameSnapshot) => {
    clearedEl.textContent = String(snapshot.cleared)
    minesEl.textContent = String(Math.max(0, snapshot.flagsRemaining))
    timeEl.textContent = formatTime(snapshot.elapsedSeconds)
    statusEl.textContent = statusText(snapshot)
    statusEl.classList.toggle('is-lost', false)
    statusEl.classList.toggle('is-won', false)
    brandSubEl.textContent = brandSubtitle(snapshot.mode)
    modesEl.querySelectorAll('button').forEach((btn) => {
      btn.classList.toggle('is-active', btn.getAttribute('data-mode') === snapshot.mode)
    })

    if (snapshot.status === 'won') {
      clearLossTimer()
      if (overlayOutcome !== 'won') showEndOverlay('won', snapshot)
      return
    }

    if (snapshot.status === 'lost') {
      if (overlayOutcome === 'lost') return
      if (lossShowTimer !== null) return
      lossShowTimer = window.setTimeout(() => {
        lossShowTimer = null
        showEndOverlay('lost', snapshot)
      }, LOSS_OVERLAY_DELAY_MS)
      return
    }

    hideEndOverlay()
  }

  return {
    render,
    setCameraMode,
  }
}
