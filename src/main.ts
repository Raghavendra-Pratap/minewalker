import { GameController } from './game/GameController'
import { bindControls } from './game/input'
import { BoardView } from './scene/BoardView'
import { createScene } from './scene/createScene'
import { mountHud } from './ui/hud'
import './ui/hud.css'

const canvas = document.getElementById('renderCanvas') as HTMLCanvasElement
const hudRoot = document.getElementById('hud') as HTMLElement

if (!canvas || !hudRoot) {
  throw new Error('Missing #renderCanvas or #hud')
}

canvas.addEventListener('contextmenu', (event) => event.preventDefault())
canvas.tabIndex = 0

const { scene, camera, shadowGenerator, hemi, shaft } = createScene(canvas)
const game = new GameController()
const boardView = new BoardView(scene, camera, game, shadowGenerator, { hemi, shaft })

const fromCastleGate =
  new URLSearchParams(location.search).get('from') === 'castle-gate'

const hud = mountHud(hudRoot, game, {
  initialCameraMode: boardView.getCameraMode(),
  onCameraMode: (mode) => boardView.setCameraMode(mode),
  fromCastleGate,
})

boardView.onCameraModeChange((mode) => hud.setCameraMode(mode))

game.subscribe(({ snapshot, opened, exploded }) => {
  hud.render(snapshot)
  if (exploded) boardView.markExplosion(exploded.row, exploded.col)
  boardView.sync(snapshot, opened)
})

bindControls(game, canvas, {
  onToggleCamera: () => boardView.toggleCameraMode(),
})
canvas.focus()
