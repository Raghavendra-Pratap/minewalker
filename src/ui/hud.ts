import type { GameController } from '../game/GameController'
import { formatScoreTime, recordRun } from '../game/scores'
import { GAME_MODES, type GameModeId, type GameSnapshot } from '../game/types'
import type { CameraMode } from '../scene/BoardView'
import { trainingTipsMarkup, updateTrainingLiveTip } from './trainingTips'
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
  if (snapshot.mode === 'training') {
    return snapshot.status === 'playing'
      ? 'Walk to a wall · dig numbers · flag the three charges'
      : 'Practice yard — dig safe rock, flag charges'
  }
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
  if (modeId === 'training') return 'Training yard · 5×5 · 3 charges'
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
    onBackToDesk?: () => void
  } = {},
): HudApi {
  root.innerHTML = `
    <div class="hud-arrive" data-arrive hidden>You fell through the gallery…</div>
    <div class="hud-bar">
      <button type="button" class="hud-desk" data-desk title="Return to Shift Desk">← Desk</button>
      <div class="hud-brand">
        <strong>Minewalker</strong>
        <span data-brand-sub>${brandSubtitle(game.getMode())}</span>
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
      <div class="hud-status" data-status></div>
    </div>
    ${trainingTipsMarkup()}
    <p class="hud-help">
      WASD move · Shift+WASD fly 3rd cam · T recall drone · Space dig · F flag · V camera · R restart
    </p>
    <div class="hud-end" data-end hidden aria-hidden="true">
      <div class="hud-end-veil"></div>
      <div class="hud-end-panel" role="dialog" aria-labelledby="hud-end-title" aria-describedby="hud-end-sub">
        <p class="hud-end-eyebrow" data-end-eyebrow></p>
        <h2 class="hud-end-title" id="hud-end-title" data-end-title></h2>
        <p class="hud-end-sub" id="hud-end-sub" data-end-sub></p>
        <div class="hud-end-meta" data-end-meta hidden></div>
        <p class="hud-end-best" data-end-best hidden></p>
        <div class="hud-end-actions">
          <button type="button" class="hud-end-retry" data-end-retry>Try again</button>
          <button type="button" class="hud-end-desk" data-end-desk hidden>← Shift Desk</button>
        </div>
        <p class="hud-end-hint" data-end-hint>Press <kbd>R</kbd> to restart</p>
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

  const brandSubEl = root.querySelector('[data-brand-sub]') as HTMLElement
  const camerasEl = root.querySelector('[data-cameras]') as HTMLElement
  const clearedEl = root.querySelector('[data-cleared]') as HTMLElement
  const minesEl = root.querySelector('[data-mines]') as HTMLElement
  const timeEl = root.querySelector('[data-time]') as HTMLElement
  const statusEl = root.querySelector('[data-status]') as HTMLElement
  const trainEl = root.querySelector('[data-train]') as HTMLElement
  const deskBtn = root.querySelector('[data-desk]') as HTMLButtonElement
  const endEl = root.querySelector('[data-end]') as HTMLElement
  const endEyebrowEl = root.querySelector('[data-end-eyebrow]') as HTMLElement
  const endTitleEl = root.querySelector('[data-end-title]') as HTMLElement
  const endSubEl = root.querySelector('[data-end-sub]') as HTMLElement
  const endMetaEl = root.querySelector('[data-end-meta]') as HTMLElement
  const endBestEl = root.querySelector('[data-end-best]') as HTMLElement
  const endRetryBtn = root.querySelector('[data-end-retry]') as HTMLButtonElement
  const endDeskBtn = root.querySelector('[data-end-desk]') as HTMLButtonElement

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
    endEl.classList.remove('is-visible', 'is-won', 'is-lost', 'is-record')
    endEl.setAttribute('aria-hidden', 'true')
  }

  const applyScoreLine = (snapshot: GameSnapshot, recorded: ReturnType<typeof recordRun>) => {
    const { score, isNewBest } = recorded
    endEl.classList.toggle('is-record', isNewBest)

    if (snapshot.mode === 'endless') {
      if (score.bestCleared == null) {
        endBestEl.hidden = true
        endBestEl.textContent = ''
        return
      }
      endBestEl.hidden = false
      endBestEl.textContent = isNewBest
        ? `New best · ${score.bestCleared} cleared`
        : `Best · ${score.bestCleared} cleared`
      return
    }

    if (score.bestTimeSec == null) {
      endBestEl.hidden = true
      endBestEl.textContent = ''
      return
    }

    endBestEl.hidden = false
    if (isNewBest) {
      endBestEl.textContent = `New best time · ${formatScoreTime(score.bestTimeSec)}`
    } else {
      endBestEl.textContent = `Best time · ${formatScoreTime(score.bestTimeSec)}`
    }
  }

  const showEndOverlay = (kind: 'won' | 'lost', snapshot: GameSnapshot) => {
    const mode = GAME_MODES[snapshot.mode]
    const training = snapshot.mode === 'training'
    const endless = mode.endless
    overlayOutcome = kind
    endEl.classList.toggle('is-won', kind === 'won')
    endEl.classList.toggle('is-lost', kind === 'lost')

    const recorded = recordRun({
      mode: snapshot.mode,
      elapsedSeconds: snapshot.elapsedSeconds,
      cleared: snapshot.cleared,
      won: kind === 'won',
    })

    if (kind === 'won') {
      if (training) {
        endEyebrowEl.textContent = 'Training complete'
        endTitleEl.textContent = 'Yard cleared'
        endSubEl.textContent =
          'You can dig, read numbers, and mark charges. Take a real cut from Shift Desk when you’re ready.'
        endRetryBtn.textContent = 'Run the yard again'
        endMetaEl.hidden = false
        endMetaEl.innerHTML = `
          <div><span>Time</span><b>${formatTime(snapshot.elapsedSeconds)}</b></div>
          <div><span>Clears</span><b>${recorded.score.wins}</b></div>
          <div><span>Yard</span><b>5×5</b></div>
        `
      } else if (endless) {
        endEyebrowEl.textContent = 'Shift report'
        endTitleEl.textContent = 'Still standing'
        endSubEl.textContent =
          'The tunnel keeps going — you cleared every safe stone in reach. Dig again, or clock out at the desk.'
        endRetryBtn.textContent = 'Dig deeper'
        endMetaEl.hidden = false
        endMetaEl.innerHTML = `
          <div><span>Cleared</span><b>${snapshot.cleared}</b></div>
          <div><span>Time</span><b>${formatTime(snapshot.elapsedSeconds)}</b></div>
          <div><span>Vein</span><b>${mode.label}</b></div>
        `
      } else {
        endEyebrowEl.textContent = recorded.isNewBest ? 'New record' : 'Shift report'
        endTitleEl.textContent = 'Vein cleared'
        endSubEl.textContent =
          'Every safe stone cut. No charges left unmarked. The gallery holds — for now.'
        endRetryBtn.textContent = 'Another cut'
        endMetaEl.hidden = false
        endMetaEl.innerHTML = `
          <div><span>Level</span><b>${mode.label}</b></div>
          <div><span>Cleared</span><b>${snapshot.cleared}</b></div>
          <div><span>Time</span><b>${formatTime(snapshot.elapsedSeconds)}</b></div>
        `
      }
    } else if (training) {
      endEyebrowEl.textContent = 'Training incident'
      endTitleEl.textContent = 'Charge hit'
      endSubEl.textContent =
        'That face was charged. Read the number under your boots, flag suspects with F, dig only what the count allows.'
      endRetryBtn.textContent = 'Reset yard'
      endMetaEl.hidden = false
      endMetaEl.innerHTML = `
        <div><span>Tip</span><b>F</b> flags</div>
        <div><span>Tip</span><b>Space</b> digs</div>
        <div><span>Tip</span><b>Numbers</b> count</div>
      `
    } else if (endless) {
      endEyebrowEl.textContent = recorded.isNewBest ? 'New record' : 'Incident report'
      endTitleEl.textContent = 'Charge detonated'
      endSubEl.textContent = recorded.isNewBest
        ? `Deepest cut yet — ${snapshot.cleared} safe stones before the blast. The tunnel remembers.`
        : 'The blast took the cut. Flag what the numbers force, dig only proven-safe rock, push the tunnel again.'
      endRetryBtn.textContent = 'Re-enter the tunnel'
      endMetaEl.hidden = false
      endMetaEl.innerHTML = `
        <div><span>Cleared</span><b>${snapshot.cleared}</b></div>
        <div><span>Time</span><b>${formatTime(snapshot.elapsedSeconds)}</b></div>
        <div><span>Vein</span><b>${mode.label}</b></div>
      `
    } else {
      endEyebrowEl.textContent = 'Incident report'
      endTitleEl.textContent = 'Charge detonated'
      endSubEl.textContent =
        'The blast took the cut. Flag what the numbers force, dig only proven-safe rock, try the vein again.'
      endRetryBtn.textContent = 'Re-enter the cut'
      endMetaEl.hidden = false
      endMetaEl.innerHTML = `
        <div><span>Level</span><b>${mode.label}</b></div>
        <div><span>Cleared</span><b>${snapshot.cleared}</b></div>
        <div><span>Time</span><b>${formatTime(snapshot.elapsedSeconds)}</b></div>
      `
    }

    applyScoreLine(snapshot, recorded)

    const showDesk = Boolean(options.onBackToDesk)
    endDeskBtn.hidden = !showDesk
    endDeskBtn.textContent = training && kind === 'won' ? 'Open Shift Desk →' : '← Shift Desk'

    endEl.hidden = false
    endEl.setAttribute('aria-hidden', 'false')
    requestAnimationFrame(() => {
      endEl.classList.add('is-visible')
    })
  }

  const restart = () => game.restart()

  deskBtn.addEventListener('click', () => options.onBackToDesk?.())
  endDeskBtn.addEventListener('click', () => options.onBackToDesk?.())
  endRetryBtn.addEventListener('click', restart)

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
    const inTraining = snapshot.mode === 'training'
    const ended = snapshot.status === 'won' || snapshot.status === 'lost'
    trainEl.hidden = !inTraining || ended
    if (inTraining && !ended) updateTrainingLiveTip(root, snapshot)

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
