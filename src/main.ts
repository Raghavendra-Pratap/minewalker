import { GameController } from './game/GameController'
import { bindControls } from './game/input'
import { GAME_MODES, type GameModeId } from './game/types'
import { BoardView } from './scene/BoardView'
import { createScene } from './scene/createScene'
import { mountCampaignShell } from './campaign/CampaignShell'
import { mountHud } from './ui/hud'
import './ui/hud.css'

const canvas = document.getElementById('renderCanvas') as HTMLCanvasElement
const hudRoot = document.getElementById('hud') as HTMLElement
const campaignRoot = document.getElementById('campaign') as HTMLElement

if (!canvas || !hudRoot || !campaignRoot) {
  throw new Error('Missing #renderCanvas, #hud, or #campaign')
}

canvas.addEventListener('contextmenu', (event) => event.preventDefault())
canvas.tabIndex = 0

const { scene, camera, shadowGenerator, hemi, shaft } = createScene(canvas)
const game = new GameController()
const boardView = new BoardView(scene, camera, game, shadowGenerator, { hemi, shaft })

const params = new URLSearchParams(location.search)
const fromCastleGate = params.get('from') === 'castle-gate'
const modeParam = params.get('mode')
const startMode: GameModeId =
  modeParam && modeParam in GAME_MODES
    ? (modeParam as GameModeId)
    : fromCastleGate
      ? 'endless'
      : game.getMode()
const skipCover =
  fromCastleGate || params.get('play') === '1' || Boolean(modeParam && modeParam in GAME_MODES)

let inMine = false

const enterMine = (mode: GameModeId) => {
  inMine = true
  campaign.hide()
  hudRoot.hidden = false
  canvas.classList.add('is-play')
  game.setMode(mode)
  canvas.focus()
}

const leaveMine = () => {
  inMine = false
  hudRoot.hidden = true
  canvas.classList.remove('is-play')
  campaign.show()
  campaign.goHub()
}

const campaign = mountCampaignShell(campaignRoot, enterMine)

const hud = mountHud(hudRoot, game, {
  initialCameraMode: boardView.getCameraMode(),
  onCameraMode: (mode) => boardView.setCameraMode(mode),
  fromCastleGate,
  onBackToDesk: leaveMine,
})

boardView.onCameraModeChange((mode) => hud.setCameraMode(mode))

game.subscribe(({ snapshot, opened, exploded }) => {
  if (!inMine) return
  hud.render(snapshot)
  if (exploded) boardView.markExplosion(exploded.row, exploded.col)
  boardView.sync(snapshot, opened)
})

bindControls(game, canvas, {
  onToggleCamera: () => boardView.toggleCameraMode(),
})

hudRoot.hidden = true
canvas.classList.remove('is-play')

if (skipCover) {
  enterMine(startMode)
} else {
  campaign.goCover()
}
