import { Animation } from '@babylonjs/core/Animations/animation'
import '@babylonjs/core/Animations/animatable'
import type { ArcRotateCamera } from '@babylonjs/core/Cameras/arcRotateCamera'
import { FreeCamera } from '@babylonjs/core/Cameras/freeCamera'
import { Color3, Vector3 } from '@babylonjs/core/Maths/math'
import { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial'
import { DynamicTexture } from '@babylonjs/core/Materials/Textures/dynamicTexture'
import { MeshBuilder } from '@babylonjs/core/Meshes/meshBuilder'
import { Mesh } from '@babylonjs/core/Meshes/mesh'
import type { Scene } from '@babylonjs/core/scene'
import type { ShadowGenerator } from '@babylonjs/core/Lights/Shadows/shadowGenerator'
import type { HemisphericLight } from '@babylonjs/core/Lights/hemisphericLight'
import type { DirectionalLight } from '@babylonjs/core/Lights/directionalLight'
import { PointLight } from '@babylonjs/core/Lights/pointLight'
import type { GameController } from '../game/GameController'
import type { Cell, BoardLayout, GameSnapshot } from '../game/types'
import { CaveEnvironment } from './CaveEnvironment'
import type { CaveInteriorBounds } from './CaveEnvironment'
import { BlastEffects } from './BlastEffects'
import { PlayerView } from './PlayerView'
import {
  CRATE_HEIGHT,
  FLOOR_THICKNESS,
  STEP,
  TILE,
  boardCenter,
  cellToWorld,
} from './world'
import { tuneLitMaterial } from './lighting'

/** Deterministic [0, 1) for per-tile stone variation. */
function hash01(n: number) {
  const x = Math.sin(n * 12.9898) * 43758.5453
  return x - Math.floor(x)
}

export type CameraMode = 'first' | 'third' | 'chase' | 'orbit'

const CAMERA_CYCLE: CameraMode[] = ['chase', 'third', 'first', 'orbit']

const ORBIT_DEFAULT_RADIUS = 32
const DRONE_WALL_SLACK = 0.2
const DRONE_LOOK_SENS = 0.0045
const DRONE_PAN_SENS = 0.028
const DRONE_FLY_SENS = 0.022
const DRONE_KEY_SPEED = 0.11
const DRONE_PITCH_MIN = -0.95
const DRONE_PITCH_MAX = 0.85
const DRONE_START_HEIGHT = 1.85
/** How far behind the miner’s head the drone sits on spawn / reset. */
const DRONE_BEHIND_DISTANCE = 3.8
/** Legacy fixed home used only if follow offset is unset. */
const DRONE_START_OFFSET = new Vector3(-3.6, 0, 0.15)
/** Player must move this far (world units) to reawaken drone tracking (tunnel only). */
const DRONE_RETRACK_DISTANCE = 0.18

/** Over-head chase cam — locked to miner facing. */
const CHASE_HEIGHT = 2.05
const CHASE_BEHIND = 1.75
const CHASE_LOOK_AHEAD = 4.2
const CHASE_LOOK_Y = 0.75
const CHASE_FOV = 1.05
const CHASE_LOOK_SENS = 0.0042
const CHASE_YAW_LIMIT = 1.15
const CHASE_PITCH_MIN = -0.55
const CHASE_PITCH_MAX = 0.85

const FP_LOOK_SENS = 0.0038
const FP_PITCH_MIN = -0.95
const FP_PITCH_MAX = 0.72
/** Slight default look-down so floor numbers stay in frame. */
const FP_DEFAULT_PITCH = 0.14
const FP_EYE_HEIGHT = 1.08
const FP_EYE_FORWARD = 0.12
/** Wider than Babylon’s default (~0.8) so more of the shaft/field is in view. */
const FP_FOV = 1.42


const NUMBER_NEON: Record<number, { hex: string; color: Color3 }> = {
  1: { hex: '#5b9dff', color: new Color3(0.35, 0.62, 1.0) },
  2: { hex: '#4ade80', color: new Color3(0.28, 0.9, 0.5) },
  3: { hex: '#ff5a7a', color: new Color3(1.0, 0.35, 0.48) },
  4: { hex: '#c4b5fd', color: new Color3(0.75, 0.68, 1.0) },
  5: { hex: '#fbbf24', color: new Color3(1.0, 0.75, 0.15) },
  6: { hex: '#67e8f9', color: new Color3(0.4, 0.9, 1.0) },
  7: { hex: '#f8fafc', color: new Color3(0.95, 0.96, 1.0) },
  8: { hex: '#fb923c', color: new Color3(1.0, 0.55, 0.25) },
}

/** Large floating neon numerals with a round (spherical) hue aura. */
const DIGIT_SIZE = TILE * 0.92
const DIGIT_HOVER_Y = 0.48
const DIGIT_BOB = 0.035
const DIGIT_HUE_DIAMETER = TILE * 0.95

interface TileHandle {
  floor: Mesh
  crate: Mesh
  chips: Mesh[]
  flagPole: Mesh
  digit: Mesh
  digitHue: Mesh
  digitMat: StandardMaterial
  digitHueMat: StandardMaterial
  floorMat: StandardMaterial
  crateMat: StandardMaterial
  /** Isolated single-stone rest pose. */
  stoneScale: Vector3
  stoneY: number
  /** Base grid-centered world X/Z (no jitter). */
  cellX: number
  cellZ: number
  /** Extra tilt/offset only used when the stone stands alone. */
  isolateOffsetX: number
  isolateOffsetZ: number
  isolateRotY: number
  isolateRotX: number
  isolateRotZ: number
  row: number
  col: number
  digitValue: number
}

/** Covered or flagged rock still fills the ore — dig chisels these out of the mass. */
function isSolidRock(cell: Cell | undefined | null) {
  if (!cell) return false
  return cell.status === 'covered' || cell.status === 'flagged'
}

export class BoardView {
  private tiles: TileHandle[][] = []
  private root: Mesh
  private ground: Mesh | null = null
  private cave: CaveEnvironment
  private digitTextures = new Map<number, DynamicTexture>()
  private coveredMat!: StandardMaterial
  private flaggedMat!: StandardMaterial
  private floorMat!: StandardMaterial
  private mineMat!: StandardMaterial
  private explodedMat!: StandardMaterial
  private hoverT = 0
  private exploded: { row: number; col: number } | null = null
  private mineRevealPlayed = false
  private lastRunId = -1
  private activeLayout: BoardLayout = 'plane'
  private blastEffects: BlastEffects
  readonly playerView: PlayerView
  private cameraMode: CameraMode = 'chase'
  private firstPerson: FreeCamera
  private thirdPerson: FreeCamera
  private chaseCam: FreeCamera
  private canvas: HTMLCanvasElement
  private orbitRadius = ORBIT_DEFAULT_RADIUS
  private onModeChange: ((mode: CameraMode) => void) | null = null
  private caveBounds: CaveInteriorBounds | null = null
  private droneDragging: 'look' | 'pan' | null = null
  private droneLastPointerX = 0
  private droneLastPointerY = 0
  private dronePlaced = false
  /** Soft-follow miner home. Mouse / Shift-fly free it as a scout. */
  private droneTracking = true
  private droneWatchPlayer = new Vector3(0, 0, 0)
  private droneLookAt = new Vector3(0, 0.75, 0)
  /** World offset from player kept while tracking (captured on snap behind the head). */
  private droneFollowOffset = DRONE_START_OFFSET.clone()
  private droneHeldKeys = new Set<string>()
  private chaseLookAt = new Vector3(0, 0.55, 0)
  /** Extra orbit angles on Head cam — mouse drag; base still follows facing. */
  private chaseYawOffset = 0
  private chasePitchOffset = 0
  private chaseDragging = false
  /** First-person: free mouse look; dig uses this yaw. */
  private firstPersonDragging = false
  private firstPersonReady = false
  private hemi: HemisphericLight
  private shaft: DirectionalLight
  private orbitFill: PointLight

  constructor(
    private scene: Scene,
    private camera: ArcRotateCamera,
    game: GameController,
    private shadowGenerator: ShadowGenerator,
    lights: { hemi: HemisphericLight; shaft: DirectionalLight },
  ) {
    this.hemi = lights.hemi
    this.shaft = lights.shaft
    this.root = new Mesh('boardRoot', scene)
    this.cave = new CaveEnvironment(scene, shadowGenerator)
    this.buildMaterials()
    this.blastEffects = new BlastEffects(scene)
    this.playerView = new PlayerView(scene, shadowGenerator)
    this.canvas = scene.getEngine().getRenderingCanvas() as HTMLCanvasElement

    this.orbitFill = new PointLight('orbitFill', new Vector3(0, 8, 0), scene)
    this.orbitFill.diffuse = new Color3(0.85, 0.78, 0.65)
    this.orbitFill.specular = new Color3(0.15, 0.12, 0.08)
    this.orbitFill.intensity = 0
    this.orbitFill.range = 55
    this.orbitFill.setEnabled(false)

    this.firstPerson = new FreeCamera('firstPerson', new Vector3(0, 1.05, 0), scene)
    this.firstPerson.minZ = 0.05
    this.firstPerson.maxZ = 200
    this.firstPerson.fov = FP_FOV
    this.firstPerson.inertia = 0
    this.firstPerson.speed = 0
    this.firstPerson.inputs.clear()

    this.thirdPerson = new FreeCamera('thirdPerson', new Vector3(0, DRONE_START_HEIGHT, -8), scene)
    this.thirdPerson.minZ = 0.1
    this.thirdPerson.maxZ = 200
    this.thirdPerson.inertia = 0
    this.thirdPerson.speed = 0
    this.thirdPerson.angularSensibility = 0
    this.thirdPerson.inputs.clear()

    this.chaseCam = new FreeCamera('chaseCam', new Vector3(0, CHASE_HEIGHT, -2), scene)
    this.chaseCam.minZ = 0.08
    this.chaseCam.maxZ = 200
    this.chaseCam.fov = CHASE_FOV
    this.chaseCam.inertia = 0
    this.chaseCam.speed = 0
    this.chaseCam.inputs.clear()

    this.bindPointerLookControls()
    this.bindDroneFlightKeys()
    const initial = game.getSnapshot()
    this.lastRunId = initial.runId
    this.rebuildFromSnapshot(initial)
    this.setCameraMode('chase', true)
    this.scene.onBeforeRenderObservable.add(() => {
      this.updateCamera()
      this.updateDigitHover()
    })
  }

  private bindPointerLookControls() {
    const onPointerDown = (event: PointerEvent) => {
      if (this.cameraMode === 'first') {
        if (event.button !== 0) return
        this.firstPersonDragging = true
        this.droneLastPointerX = event.clientX
        this.droneLastPointerY = event.clientY
        this.canvas.setPointerCapture?.(event.pointerId)
        return
      }

      if (this.cameraMode === 'chase') {
        if (event.button !== 0) return
        this.chaseDragging = true
        this.droneLastPointerX = event.clientX
        this.droneLastPointerY = event.clientY
        this.canvas.setPointerCapture?.(event.pointerId)
        return
      }

      if (this.cameraMode !== 'third') return
      if (event.button === 0) this.droneDragging = 'look'
      else if (event.button === 2 || event.button === 1) this.droneDragging = 'pan'
      else return
      this.droneLastPointerX = event.clientX
      this.droneLastPointerY = event.clientY
      this.canvas.setPointerCapture?.(event.pointerId)
    }

    const onPointerMove = (event: PointerEvent) => {
      const dx = event.clientX - this.droneLastPointerX
      const dy = event.clientY - this.droneLastPointerY

      if (this.cameraMode === 'first' && this.firstPersonDragging) {
        this.droneLastPointerX = event.clientX
        this.droneLastPointerY = event.clientY
        this.firstPerson.rotation.y -= dx * FP_LOOK_SENS
        this.firstPerson.rotation.x = Math.min(
          FP_PITCH_MAX,
          Math.max(FP_PITCH_MIN, this.firstPerson.rotation.x + dy * FP_LOOK_SENS),
        )
        return
      }

      if (this.cameraMode === 'chase' && this.chaseDragging) {
        this.droneLastPointerX = event.clientX
        this.droneLastPointerY = event.clientY
        this.chaseYawOffset = Math.min(
          CHASE_YAW_LIMIT,
          Math.max(-CHASE_YAW_LIMIT, this.chaseYawOffset - dx * CHASE_LOOK_SENS),
        )
        this.chasePitchOffset = Math.min(
          CHASE_PITCH_MAX,
          Math.max(CHASE_PITCH_MIN, this.chasePitchOffset + dy * CHASE_LOOK_SENS),
        )
        return
      }

      if (this.cameraMode !== 'third' || !this.droneDragging) return
      this.droneLastPointerX = event.clientX
      this.droneLastPointerY = event.clientY

      if (this.droneDragging === 'look') {
        this.releaseDroneTracking()
        this.thirdPerson.rotation.y -= dx * DRONE_LOOK_SENS
        this.thirdPerson.rotation.x = Math.min(
          DRONE_PITCH_MAX,
          Math.max(DRONE_PITCH_MIN, this.thirdPerson.rotation.x + dy * DRONE_LOOK_SENS),
        )
        return
      }

      // Pan: slide through the cave — XZ strafe + vertical
      this.releaseDroneTracking()
      const yaw = this.thirdPerson.rotation.y
      const rightX = Math.cos(yaw)
      const rightZ = -Math.sin(yaw)
      this.thirdPerson.position.x -= dx * rightX * DRONE_PAN_SENS
      this.thirdPerson.position.z -= dx * rightZ * DRONE_PAN_SENS
      this.thirdPerson.position.y += dy * DRONE_PAN_SENS
      this.clampDronePosition(this.thirdPerson.position)
    }

    const onPointerUp = (event: PointerEvent) => {
      if (this.firstPersonDragging) this.firstPersonDragging = false
      if (this.chaseDragging) this.chaseDragging = false
      if (!this.droneDragging) return
      this.droneDragging = null
      try {
        this.canvas.releasePointerCapture?.(event.pointerId)
      } catch {
        // ignore
      }
    }

    const onWheel = (event: WheelEvent) => {
      if (this.cameraMode !== 'third') return
      event.preventDefault()
      this.releaseDroneTracking()
      const forward = this.thirdPerson.getDirection(Vector3.Forward())
      const step = -event.deltaY * DRONE_FLY_SENS
      this.thirdPerson.position.x += forward.x * step
      this.thirdPerson.position.y += forward.y * step
      this.thirdPerson.position.z += forward.z * step
      this.clampDronePosition(this.thirdPerson.position)
    }

    this.canvas.addEventListener('pointerdown', onPointerDown)
    window.addEventListener('pointermove', onPointerMove)
    window.addEventListener('pointerup', onPointerUp)
    window.addEventListener('pointercancel', onPointerUp)
    this.canvas.addEventListener('wheel', onWheel, { passive: false })
  }

  /**
   * 3rd-view scout flight: hold Shift + WASD/arrows to park the drone
   * anywhere in the cavern (classic levels keep it parked after you let go).
   * T recalls the drone behind the miner.
   */
  private bindDroneFlightKeys() {
    const droneCodes = new Set([
      'KeyW',
      'KeyA',
      'KeyS',
      'KeyD',
      'ArrowUp',
      'ArrowDown',
      'ArrowLeft',
      'ArrowRight',
      'KeyQ',
      'KeyE',
    ])

    const onKeyDown = (event: KeyboardEvent) => {
      if (this.cameraMode !== 'third') return

      if (event.code === 'KeyT') {
        event.preventDefault()
        this.snapThirdPerson()
        return
      }

      if (!event.shiftKey || !droneCodes.has(event.code)) return
      event.preventDefault()
      event.stopPropagation()
      this.releaseDroneTracking()
      this.droneHeldKeys.add(event.code)
    }

    const onKeyUp = (event: KeyboardEvent) => {
      this.droneHeldKeys.delete(event.code)
      if (!event.shiftKey) this.droneHeldKeys.clear()
    }

    const onBlur = () => this.droneHeldKeys.clear()

    window.addEventListener('keydown', onKeyDown, true)
    window.addEventListener('keyup', onKeyUp, true)
    window.addEventListener('blur', onBlur)
  }

  getCameraMode() {
    return this.cameraMode
  }

  /** Yaw of the active view camera (look / orbit). Not used for WASD. */
  getControlYaw() {
    if (this.cameraMode === 'first') {
      const f = this.firstPerson.getDirection(Vector3.Forward())
      return Math.atan2(f.x, f.z)
    }
    if (this.cameraMode === 'chase') {
      return this.playerView.getYaw()
    }
    if (this.cameraMode === 'third') {
      const f = this.thirdPerson.getDirection(Vector3.Forward())
      return Math.atan2(f.x, f.z)
    }
    // Orbit: walk along the view direction from camera toward the target
    const target = this.camera.getTarget()
    const pos = this.camera.position
    return Math.atan2(target.x - pos.x, target.z - pos.z)
  }

  /** Horizontal look vector for dig/flag — ignores pitch so side walls aim correctly. */
  getDigLookXZ(): { x: number; z: number } {
    if (this.cameraMode === 'first') {
      const f = this.firstPerson.getDirection(Vector3.Forward())
      return { x: f.x, z: f.z }
    }
    if (this.cameraMode === 'chase') {
      const yaw = this.playerView.getYaw()
      return { x: Math.sin(yaw), z: Math.cos(yaw) }
    }
    if (this.cameraMode === 'third') {
      const f = this.thirdPerson.getDirection(Vector3.Forward())
      return { x: f.x, z: f.z }
    }
    const target = this.camera.getTarget()
    const pos = this.camera.position
    return { x: target.x - pos.x, z: target.z - pos.z }
  }

  onCameraModeChange(cb: (mode: CameraMode) => void) {
    this.onModeChange = cb
  }

  setCameraMode(mode: CameraMode, force = false) {
    if (!force && this.cameraMode === mode) return
    this.cameraMode = mode

    this.camera.detachControl()
    this.playerView.setBodyVisible(mode !== 'first')
    this.applyModeLighting(mode)

    if (mode === 'first') {
      this.scene.activeCamera = this.firstPerson
      this.firstPersonReady = false
      this.snapFirstPerson()
    } else if (mode === 'chase') {
      this.scene.activeCamera = this.chaseCam
      this.chaseYawOffset = 0
      this.chasePitchOffset = 0
      this.snapChaseCamera()
    } else if (mode === 'third') {
      this.scene.activeCamera = this.thirdPerson
      this.snapThirdPerson()
    } else {
      this.scene.activeCamera = this.camera
      this.camera.radius = this.orbitRadius
      this.camera.alpha = -Math.PI / 2
      this.camera.beta = Math.min(Math.PI / 3.1, this.camera.upperBetaLimit)
      this.camera.setTarget(this.playerView.getWorldPosition())
      this.camera.attachControl(this.canvas, true)
      const pointers = this.camera.inputs.attached.pointers as { buttons?: number[] } | undefined
      if (pointers) pointers.buttons = [0]
      this.placeOrbitFill()
    }

    this.onModeChange?.(mode)
  }

  /** Bright overview lighting for orbit; keep the mine dark in 1st/3rd. */
  private applyModeLighting(mode: CameraMode) {
    const orbit = mode === 'orbit'
    this.scene.fogDensity = orbit ? 0.012 : 0.038
    this.scene.ambientColor = orbit
      ? new Color3(0.18, 0.16, 0.13)
      : new Color3(0.06, 0.05, 0.04)
    this.hemi.intensity = orbit ? 0.72 : 0.22
    this.hemi.diffuse = orbit
      ? new Color3(0.75, 0.72, 0.65)
      : new Color3(0.45, 0.48, 0.52)
    this.shaft.intensity = orbit ? 0.65 : 0.28
    this.orbitFill.setEnabled(orbit)
    this.orbitFill.intensity = orbit ? 2.4 : 0
    if (orbit) this.placeOrbitFill()
  }

  private placeOrbitFill() {
    const p = this.playerView.getWorldPosition()
    this.orbitFill.position.set(p.x + 4, 9, p.z)
  }

  toggleCameraMode() {
    const idx = CAMERA_CYCLE.indexOf(this.cameraMode)
    const next = CAMERA_CYCLE[(idx + 1) % CAMERA_CYCLE.length]
    this.setCameraMode(next)
  }

  dispose() {
    this.clearTiles()
    this.ground?.dispose()
    this.cave.dispose()
    this.root.dispose()
    for (const tex of this.digitTextures.values()) tex.dispose()
    this.digitTextures.clear()
  }

  sync(snapshot: GameSnapshot, animateOpened: Cell[] = []) {
    const needRebuild =
      snapshot.runId !== this.lastRunId ||
      this.tiles.length !== snapshot.rows ||
      (this.tiles[0]?.length ?? 0) !== snapshot.cols

    if (needRebuild) {
      this.lastRunId = snapshot.runId
      this.exploded = null
      this.mineRevealPlayed = false
      this.blastEffects.stop()
      this.rebuildFromSnapshot(snapshot)
      return
    }

    for (let row = 0; row < snapshot.rows; row++) {
      for (let col = 0; col < snapshot.cols; col++) {
        this.applyCell(this.tiles[row][col], snapshot.cells[row][col])
      }
    }

    this.refreshStoneConnections(snapshot)

    for (const cell of animateOpened) {
      const handle = this.tiles[cell.row]?.[cell.col]
      if (handle) this.playCrateVanish(handle)
    }

    if (snapshot.status === 'lost' && this.exploded && !this.mineRevealPlayed) {
      this.mineRevealPlayed = true
      this.playStaggeredMineReveal(snapshot)
    }

    this.playerView.sync(snapshot.player)
  }

  markExplosion(row: number, col: number) {
    this.exploded = { row, col }
    const handle = this.tiles[row]?.[col]
    if (!handle) return

    const world = cellToWorld(row, col)
    const center = new Vector3(world.x, 0, world.z)

    handle.crate.isVisible = true
    handle.crate.material = this.explodedMat
    handle.crate.scaling.copyFrom(handle.stoneScale)
    handle.crate.position.y = handle.stoneY
    this.setChipsVisible(handle, false)
    this.playCrateExplosion(handle)

    this.blastEffects.play(center, this.scene.activeCamera)
    this.playerView.playBlast(center)
    this.flashScreen()
  }

  private flashScreen() {
    const overlay = document.createElement('div')
    overlay.style.cssText =
      'position:fixed;inset:0;pointer-events:none;background:radial-gradient(circle,rgba(255,120,40,0.55) 0%,rgba(80,20,5,0.35) 45%,transparent 70%);opacity:1;transition:opacity 0.65s ease-out;z-index:9999'
    document.body.appendChild(overlay)
    requestAnimationFrame(() => {
      overlay.style.opacity = '0'
    })
    setTimeout(() => overlay.remove(), 700)
  }

  private playStaggeredMineReveal(snapshot: GameSnapshot) {
    const mines: TileHandle[] = []
    for (let r = 0; r < snapshot.rows; r++) {
      for (let c = 0; c < snapshot.cols; c++) {
        const cell = snapshot.cells[r][c]
        if (!cell.isMine || cell.status !== 'revealed') continue
        if (this.exploded?.row === r && this.exploded?.col === c) continue
        const handle = this.tiles[r]?.[c]
        if (handle) mines.push(handle)
      }
    }

    mines.forEach((handle, i) => {
      setTimeout(() => this.playMinePulse(handle), 40 + i * 55)
    })
  }

  private playMinePulse(handle: TileHandle) {
    const mesh = handle.crate
    mesh.isVisible = true
    mesh.material = this.mineMat
    this.setChipsVisible(handle, false)
    const start = new Vector3(
      handle.stoneScale.x * 0.35,
      handle.stoneScale.y * 0.35,
      handle.stoneScale.z * 0.35,
    )
    const mid = new Vector3(
      handle.stoneScale.x * 0.65,
      handle.stoneScale.y * 0.55,
      handle.stoneScale.z * 0.65,
    )
    const end = new Vector3(
      handle.stoneScale.x * 0.45,
      handle.stoneScale.y * 0.45,
      handle.stoneScale.z * 0.45,
    )
    mesh.scaling.copyFrom(start)

    const anim = new Animation(
      `minePulse_${handle.row}_${handle.col}_${Math.random()}`,
      'scaling',
      60,
      Animation.ANIMATIONTYPE_VECTOR3,
      Animation.ANIMATIONLOOPMODE_CONSTANT,
    )
    anim.setKeys([
      { frame: 0, value: start },
      { frame: 6, value: mid },
      { frame: 14, value: end },
    ])
    mesh.animations = [anim]
    this.scene.beginAnimation(mesh, 0, 14, false)
  }

  private playCrateExplosion(handle: TileHandle) {
    const mesh = handle.crate
    handle.crateMat.emissiveColor = new Color3(1, 0.7, 0.2)
    this.setChipsVisible(handle, false)

    const emissiveAnim = new Animation(
      `crateFlash_${handle.row}_${handle.col}_${Math.random()}`,
      'emissiveColor',
      60,
      Animation.ANIMATIONTYPE_COLOR3,
      Animation.ANIMATIONLOOPMODE_CONSTANT,
    )
    emissiveAnim.setKeys([
      { frame: 0, value: new Color3(1, 0.7, 0.2) },
      { frame: 8, value: new Color3(0.65, 0.18, 0.02) },
    ])

    const base = handle.stoneScale
    const scaleAnim = new Animation(
      `crateBurst_${handle.row}_${handle.col}_${Math.random()}`,
      'scaling',
      60,
      Animation.ANIMATIONTYPE_VECTOR3,
      Animation.ANIMATIONLOOPMODE_CONSTANT,
    )
    scaleAnim.setKeys([
      { frame: 0, value: base.clone() },
      { frame: 4, value: new Vector3(base.x * 1.35, base.y * 1.5, base.z * 1.35) },
      { frame: 10, value: new Vector3(base.x * 0.45, base.y * 0.35, base.z * 0.45) },
      { frame: 16, value: new Vector3(base.x * 0.45, base.y * 0.45, base.z * 0.45) },
    ])

    mesh.animations = [scaleAnim]
    handle.crateMat.animations = [emissiveAnim]
    this.scene.beginAnimation(mesh, 0, 16, false)
    this.scene.beginAnimation(handle.crateMat, 0, 8, false)
  }

  private rebuildFromSnapshot(snapshot: GameSnapshot) {
    this.clearTiles()
    this.tiles = []
    this.ground?.dispose()
    for (const tex of this.digitTextures.values()) tex.dispose()
    this.digitTextures.clear()

    const width = snapshot.cols * STEP + 0.2
    const depth = snapshot.rows * STEP + 0.2
    const center = boardCenter(snapshot.rows, snapshot.cols)

    this.cave.rebuild(snapshot.rows, snapshot.cols, snapshot.layout)
    this.caveBounds = this.cave.getInteriorBounds()
    this.dronePlaced = false
    this.activeLayout = snapshot.layout

    this.ground = MeshBuilder.CreateBox(
      'mineFloor',
      { width, height: FLOOR_THICKNESS, depth },
      this.scene,
    )
    this.ground.position = new Vector3(center.x, -FLOOR_THICKNESS / 2 - 0.001, center.z)
    const groundMat = new StandardMaterial('mineFloorMat', this.scene)
    groundMat.diffuseColor = new Color3(0.04, 0.035, 0.03)
    groundMat.specularColor = new Color3(0.02, 0.02, 0.02)
    groundMat.emissiveColor = new Color3(0.015, 0.012, 0.01)
    tuneLitMaterial(groundMat)
    this.ground.material = groundMat
    this.ground.receiveShadows = true
    this.ground.parent = this.root

    for (let row = 0; row < snapshot.rows; row++) {
      const line: TileHandle[] = []
      for (let col = 0; col < snapshot.cols; col++) {
        const world = cellToWorld(row, col)

        const floor = MeshBuilder.CreateBox(
          `floor_${row}_${col}`,
          { width: TILE * 0.94, height: 0.07, depth: TILE * 0.94 },
          this.scene,
        )
        floor.position = new Vector3(
          world.x + (hash01(row * 17 + col) - 0.5) * 0.04,
          0.035,
          world.z + (hash01(row + col * 19) - 0.5) * 0.04,
        )
        floor.rotation.y = (hash01(row * 5 + col * 11) - 0.5) * 0.08
        floor.parent = this.root
        floor.receiveShadows = true
        const floorMat = this.floorMat.clone(`floorMat_${row}_${col}`)
        // Slight per-tile dirt tint
        const dirt = 0.9 + hash01(row * 3 + col * 7) * 0.2
        floorMat.diffuseColor = new Color3(0.11 * dirt, 0.1 * dirt, 0.09 * dirt)
        floor.material = floorMat

        const built = this.createStoneBlock(row, col, world)

        const flagPole = MeshBuilder.CreateCylinder(
          `marker_${row}_${col}`,
          { height: 0.55, diameter: 0.08 },
          this.scene,
        )
        flagPole.position = new Vector3(world.x, built.stoneY + CRATE_HEIGHT * 0.55, world.z)
        flagPole.parent = this.root
        const flagMat = new StandardMaterial(`markerMat_${row}_${col}`, this.scene)
        flagMat.diffuseColor = new Color3(1, 0.16, 0.12)
        flagMat.emissiveColor = new Color3(0.7, 0.1, 0.08)
        flagPole.material = flagMat
        flagPole.isVisible = false

        const digitHue = MeshBuilder.CreateSphere(
          `digitHue_${row}_${col}`,
          { diameter: DIGIT_HUE_DIAMETER, segments: 12 },
          this.scene,
        )
        digitHue.position = new Vector3(world.x, DIGIT_HOVER_Y, world.z)
        digitHue.parent = this.root
        digitHue.isVisible = false
        digitHue.isPickable = false
        const digitHueMat = new StandardMaterial(`digitHueMat_${row}_${col}`, this.scene)
        digitHueMat.disableLighting = true
        digitHueMat.alpha = 0.28
        digitHueMat.transparencyMode = StandardMaterial.MATERIAL_ALPHABLEND
        digitHueMat.backFaceCulling = false
        digitHue.material = digitHueMat

        const digit = MeshBuilder.CreatePlane(
          `digit_${row}_${col}`,
          { width: DIGIT_SIZE, height: DIGIT_SIZE },
          this.scene,
        )
        digit.position = new Vector3(world.x, DIGIT_HOVER_Y, world.z)
        // Full billboard keeps the numeral facing the camera (round look from every angle)
        digit.billboardMode = Mesh.BILLBOARDMODE_ALL
        digit.parent = this.root
        digit.isVisible = false
        digit.isPickable = false
        const digitMat = new StandardMaterial(`digitGlowMat_${row}_${col}`, this.scene)
        digitMat.backFaceCulling = false
        digitMat.disableLighting = true
        digitMat.useAlphaFromDiffuseTexture = true
        digitMat.transparencyMode = StandardMaterial.MATERIAL_ALPHABLEND
        digit.material = digitMat

        const handle: TileHandle = {
          floor,
          crate: built.stone,
          chips: built.chips,
          flagPole,
          digit,
          digitHue,
          digitMat,
          digitHueMat,
          floorMat,
          crateMat: built.crateMat,
          stoneScale: built.stoneScale,
          stoneY: built.stoneY,
          cellX: world.x,
          cellZ: world.z,
          isolateOffsetX: built.isolateOffsetX,
          isolateOffsetZ: built.isolateOffsetZ,
          isolateRotY: built.isolateRotY,
          isolateRotX: built.isolateRotX,
          isolateRotZ: built.isolateRotZ,
          row,
          col,
          digitValue: 0,
        }
        this.applyCell(handle, snapshot.cells[row][col])
        line.push(handle)
      }
      this.tiles.push(line)
    }

    this.refreshStoneConnections(snapshot)

    this.playerView.snap(snapshot.player)
    this.orbitRadius = Math.max(ORBIT_DEFAULT_RADIUS, snapshot.cols * 0.85 + 10)
    if (this.cameraMode === 'orbit') {
      this.camera.setTarget(this.playerView.getWorldPosition())
      this.camera.radius = this.orbitRadius
    } else if (this.cameraMode === 'chase') {
      this.snapChaseCamera()
    } else if (this.cameraMode === 'third') {
      this.snapThirdPerson()
    } else {
      // Keep current look when board expands mid-dig — don't whip the camera around
      this.snapFirstPerson(true)
    }
  }

  private clearTiles() {
    for (const line of this.tiles) {
      for (const handle of line) {
        handle.floor.dispose()
        // chips are parented to the stone — disposing the stone removes them
        handle.crate.dispose()
        handle.flagPole.dispose()
        handle.digit.dispose()
        handle.digitHue.dispose()
        handle.digitMat.dispose()
        handle.digitHueMat.dispose()
        handle.floorMat.dispose()
        handle.crateMat.dispose()
      }
    }
    this.tiles = []
  }

  /**
   * Unit rock fills one STEP cell. Connected neighbors sit flush so adjacent
   * covered tiles read as one cuttable stone mass; lone stones stay chunky.
   */
  private createStoneBlock(row: number, col: number, world: { x: number; z: number }) {
    const seed = row * 97 + col * 53
    const sx = 0.78 + hash01(seed) * 0.14
    const sy = 0.88 + hash01(seed + 1) * 0.18
    const sz = 0.78 + hash01(seed + 2) * 0.14
    const stoneScale = new Vector3(sx, sy, sz)
    const stoneY = CRATE_HEIGHT / 2
    const isolateOffsetX = (hash01(seed + 3) - 0.5) * 0.08
    const isolateOffsetZ = (hash01(seed + 4) - 0.5) * 0.08
    const isolateRotY = (hash01(seed + 5) - 0.5) * 0.4
    const isolateRotX = (hash01(seed + 6) - 0.5) * 0.08
    const isolateRotZ = (hash01(seed + 7) - 0.5) * 0.08

    const stone = MeshBuilder.CreateBox(
      `oreStone_${row}_${col}`,
      { width: STEP, height: CRATE_HEIGHT, depth: STEP },
      this.scene,
    )
    stone.position = new Vector3(world.x, stoneY, world.z)
    stone.scaling.copyFrom(stoneScale)
    stone.parent = this.root
    stone.receiveShadows = true
    this.shadowGenerator.addShadowCaster(stone)

    const crateMat = this.coveredMat.clone(`oreMat_${row}_${col}`)
    crateMat.diffuseTexture = this.coveredMat.diffuseTexture
    crateMat.backFaceCulling = true
    const tone = hash01(seed + 8)
    if (tone < 0.34) {
      crateMat.diffuseColor = new Color3(0.12 + hash01(seed + 9) * 0.06, 0.11, 0.1)
    } else if (tone < 0.68) {
      crateMat.diffuseColor = new Color3(0.16, 0.14 + hash01(seed + 9) * 0.05, 0.12)
    } else {
      crateMat.diffuseColor = new Color3(0.1, 0.1, 0.11 + hash01(seed + 9) * 0.05)
    }
    crateMat.emissiveColor = new Color3(0.03, 0.028, 0.025)
    stone.material = crateMat
    stone.isVisible = true
    stone.setEnabled(true)

    const chips: Mesh[] = []
    const chipCount = 1 + Math.floor(hash01(seed + 10) * 2)
    for (let i = 0; i < chipCount; i++) {
      const cs = 0.16 + hash01(seed + 20 + i) * 0.18
      const chip = MeshBuilder.CreateBox(
        `oreChip_${row}_${col}_${i}`,
        { width: cs, height: cs * 0.5, depth: cs * 0.8 },
        this.scene,
      )
      chip.position = new Vector3(
        (hash01(seed + 30 + i) - 0.5) * 0.35,
        0.42 + hash01(seed + 40 + i) * 0.06,
        (hash01(seed + 50 + i) - 0.5) * 0.35,
      )
      chip.rotation.y = hash01(seed + 60 + i) * Math.PI
      chip.rotation.x = (hash01(seed + 70 + i) - 0.5) * 0.45
      chip.parent = stone
      chip.material = crateMat
      chip.receiveShadows = true
      this.shadowGenerator.addShadowCaster(chip)
      chips.push(chip)
    }

    return {
      stone,
      chips,
      stoneScale,
      stoneY,
      crateMat,
      isolateOffsetX,
      isolateOffsetZ,
      isolateRotY,
      isolateRotX,
      isolateRotZ,
    }
  }

  /**
   * Fuse adjacent covered/flagged cells into a continuous rock mass.
   * Digging reveals one cell — that stone vanishes and neighbors reseal around the hole.
   */
  private refreshStoneConnections(snapshot: GameSnapshot) {
    const solid = (r: number, c: number) => isSolidRock(snapshot.cells[r]?.[c])

    for (let row = 0; row < snapshot.rows; row++) {
      for (let col = 0; col < snapshot.cols; col++) {
        const handle = this.tiles[row]?.[col]
        const cell = snapshot.cells[row][col]
        if (!handle || !isSolidRock(cell)) continue

        const north = solid(row - 1, col)
        const south = solid(row + 1, col)
        const west = solid(row, col - 1)
        const east = solid(row, col + 1)
        const connected = north || south || west || east

        if (connected) {
          // Slight overlap kills z-fighting seams between neighbors
          const join = 1.04
          const height = 0.96 + hash01(row * 13 + col * 7) * 0.06
          handle.crate.scaling.set(join, height, join)
          handle.crate.position.set(handle.cellX, (CRATE_HEIGHT * height) / 2, handle.cellZ)
          handle.crate.rotation.set(0, 0, 0)
          // Shared mass tint — avoid checkerboard brick colors
          if (cell.status === 'covered') {
            const wobble = 0.96 + hash01(row * 3 + col * 5) * 0.08
            handle.crateMat.diffuseColor = new Color3(0.14 * wobble, 0.13 * wobble, 0.12 * wobble)
            handle.crateMat.emissiveColor = new Color3(0.03, 0.028, 0.025)
          }
          // Surface chips only on the mass rim
          const edge = !(north && south && west && east)
          this.setChipsVisible(handle, edge)
        } else {
          handle.crate.scaling.copyFrom(handle.stoneScale)
          handle.crate.position.set(
            handle.cellX + handle.isolateOffsetX,
            (CRATE_HEIGHT * handle.stoneScale.y) / 2,
            handle.cellZ + handle.isolateOffsetZ,
          )
          handle.crate.rotation.set(
            handle.isolateRotX,
            handle.isolateRotY,
            handle.isolateRotZ,
          )
          this.setChipsVisible(handle, true)
        }
      }
    }
  }

  private buildMaterials() {
    this.coveredMat = new StandardMaterial('coveredOre', this.scene)
    this.coveredMat.diffuseColor = new Color3(0.14, 0.13, 0.12)
    this.coveredMat.specularColor = new Color3(0.04, 0.04, 0.04)
    this.coveredMat.emissiveColor = new Color3(0.03, 0.028, 0.025)
    tuneLitMaterial(this.coveredMat)
    const stoneTex = this.makeStoneTexture('coveredStoneTex', 0.14, 0.13, 0.12)
    stoneTex.hasAlpha = false
    this.coveredMat.diffuseTexture = stoneTex

    this.flaggedMat = new StandardMaterial('flaggedOre', this.scene)
    this.flaggedMat.diffuseColor = new Color3(0.28, 0.18, 0.08)
    this.flaggedMat.emissiveColor = new Color3(0.12, 0.06, 0.02)
    this.flaggedMat.specularColor = new Color3(0.06, 0.05, 0.03)
    tuneLitMaterial(this.flaggedMat)

    this.floorMat = new StandardMaterial('openTunnelFloor', this.scene)
    this.floorMat.diffuseColor = new Color3(0.12, 0.1, 0.09)
    this.floorMat.specularColor = new Color3(0.03, 0.03, 0.03)
    this.floorMat.emissiveColor = new Color3(0.025, 0.02, 0.018)
    tuneLitMaterial(this.floorMat)
    const floorTex = this.makeStoneTexture('floorStoneTex', 0.12, 0.1, 0.09)
    floorTex.hasAlpha = false
    this.floorMat.diffuseTexture = floorTex

    this.mineMat = new StandardMaterial('buriedCharge', this.scene)
    this.mineMat.diffuseColor = new Color3(0.1, 0.08, 0.07)
    this.mineMat.emissiveColor = new Color3(0.28, 0.08, 0.03)
    this.mineMat.specularColor = new Color3(0.08, 0.04, 0.02)
    tuneLitMaterial(this.mineMat)

    this.explodedMat = new StandardMaterial('explodedCharge', this.scene)
    this.explodedMat.diffuseColor = new Color3(0.95, 0.35, 0.1)
    this.explodedMat.emissiveColor = new Color3(0.65, 0.18, 0.02)
    tuneLitMaterial(this.explodedMat)
  }

  private makeStoneTexture(name: string, r: number, g: number, b: number) {
    const size = 64
    const tex = new DynamicTexture(name, size, this.scene, false)
    const ctx = tex.getContext()
    ctx.fillStyle = `rgb(${Math.floor(r * 255)},${Math.floor(g * 255)},${Math.floor(b * 255)})`
    ctx.fillRect(0, 0, size, size)
    for (let i = 0; i < 180; i++) {
      const x = Math.floor(hash01(i * 3.1) * size)
      const y = Math.floor(hash01(i * 7.3 + 1) * size)
      const s = 1 + Math.floor(hash01(i * 2.2) * 4)
      const shade = 0.72 + hash01(i * 5.5) * 0.45
      const cr = Math.min(255, Math.floor(r * 255 * shade))
      const cg = Math.min(255, Math.floor(g * 255 * shade))
      const cb = Math.min(255, Math.floor(b * 255 * shade))
      ctx.fillStyle = `rgb(${cr},${cg},${cb})`
      ctx.fillRect(x, y, s, s)
    }
    ctx.strokeStyle = `rgba(0,0,0,0.28)`
    ctx.lineWidth = 1
    for (let i = 0; i < 8; i++) {
      ctx.beginPath()
      ctx.moveTo(hash01(i * 9) * size, hash01(i * 11 + 2) * size)
      ctx.lineTo(hash01(i * 13 + 4) * size, hash01(i * 17 + 6) * size)
      ctx.stroke()
    }
    tex.update()
    return tex
  }

  private neonMaterial(n: number): { texture: DynamicTexture; glow: Color3 } {
    const neon = NUMBER_NEON[n] ?? NUMBER_NEON[8]
    let tex = this.digitTextures.get(n)
    if (!tex) {
      tex = new DynamicTexture(`neonDigitRound_${n}`, { width: 256, height: 256 }, this.scene, false)
      tex.hasAlpha = true
      const ctx = tex.getContext() as unknown as CanvasRenderingContext2D
      const { r, g, b } = neon.color
      const rr = Math.round(r * 255)
      const gg = Math.round(g * 255)
      const bb = Math.round(b * 255)

      ctx.clearRect(0, 0, 256, 256)

      // Soft circular glow behind the numeral (sphere mesh carries the bulk of the round hue)
      const bloom = ctx.createRadialGradient(128, 128, 6, 128, 128, 110)
      bloom.addColorStop(0, `rgba(${rr},${gg},${bb},0.55)`)
      bloom.addColorStop(0.4, `rgba(${rr},${gg},${bb},0.22)`)
      bloom.addColorStop(0.75, `rgba(${rr},${gg},${bb},0.06)`)
      bloom.addColorStop(1, `rgba(${rr},${gg},${bb},0)`)
      ctx.fillStyle = bloom
      ctx.fillRect(0, 0, 256, 256)

      // Large neon numeral
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      ctx.font = 'bold 168px "Segoe UI", system-ui, sans-serif'
      ctx.shadowColor = neon.hex
      ctx.shadowBlur = 36
      ctx.fillStyle = neon.hex
      ctx.fillText(String(n), 128, 138)
      ctx.shadowBlur = 14
      ctx.fillStyle = neon.hex
      ctx.fillText(String(n), 128, 138)
      ctx.shadowBlur = 0
      ctx.fillStyle = '#ffffff'
      ctx.fillText(String(n), 128, 138)
      tex.update()
      this.digitTextures.set(n, tex)
    }
    return { texture: tex, glow: neon.color }
  }

  private setDigit(handle: TileHandle, value: number) {
    handle.digitValue = value
    if (value <= 0) {
      handle.digit.isVisible = false
      handle.digit.setEnabled(false)
      handle.digitHue.isVisible = false
      handle.digitHue.setEnabled(false)
      return
    }
    const { texture, glow } = this.neonMaterial(value)
    handle.digitMat.diffuseTexture = texture
    handle.digitMat.emissiveTexture = texture
    handle.digitMat.opacityTexture = texture
    handle.digitMat.diffuseColor = Color3.White()
    handle.digitMat.emissiveColor = new Color3(glow.r * 1.2, glow.g * 1.2, glow.b * 1.2)

    handle.digitHueMat.emissiveColor = new Color3(glow.r * 0.95, glow.g * 0.95, glow.b * 0.95)
    handle.digitHueMat.diffuseColor = new Color3(glow.r * 0.35, glow.g * 0.35, glow.b * 0.35)
    handle.digitHueMat.alpha = 0.32

    handle.digit.position.set(handle.cellX, DIGIT_HOVER_Y, handle.cellZ)
    handle.digitHue.position.set(handle.cellX, DIGIT_HOVER_Y, handle.cellZ)
    handle.digit.scaling.set(1, 1, 1)
    handle.digitHue.scaling.set(1, 1, 1)
    handle.digit.isVisible = true
    handle.digit.setEnabled(true)
    handle.digitHue.isVisible = true
    handle.digitHue.setEnabled(true)
  }

  private applyCell(handle: TileHandle, cell: Cell) {
    handle.flagPole.isVisible = false
    handle.crate.scaling.copyFrom(handle.stoneScale)
    handle.crate.position.set(handle.cellX, handle.stoneY, handle.cellZ)
    handle.crate.rotation.set(0, 0, 0)
    this.setChipsVisible(handle, true)
    this.setDigit(handle, 0)

    if (cell.status === 'covered') {
      handle.crate.isVisible = true
      handle.crate.setEnabled(true)
      handle.crate.material = handle.crateMat
      const seed = handle.row * 97 + handle.col * 53
      const tone = hash01(seed + 8)
      if (tone < 0.34) {
        handle.crateMat.diffuseColor = new Color3(0.12 + hash01(seed + 9) * 0.06, 0.11, 0.1)
      } else if (tone < 0.68) {
        handle.crateMat.diffuseColor = new Color3(0.16, 0.14 + hash01(seed + 9) * 0.05, 0.12)
      } else {
        handle.crateMat.diffuseColor = new Color3(0.1, 0.1, 0.11 + hash01(seed + 9) * 0.05)
      }
      handle.crateMat.emissiveColor = new Color3(0.03, 0.028, 0.025)
      return
    }

    if (cell.status === 'flagged') {
      handle.crate.isVisible = true
      handle.crate.setEnabled(true)
      handle.crate.material = handle.crateMat
      handle.crateMat.diffuseColor = this.flaggedMat.diffuseColor.clone()
      handle.crateMat.emissiveColor = this.flaggedMat.emissiveColor.clone()
      handle.flagPole.isVisible = true
      handle.flagPole.position.y = handle.stoneY + CRATE_HEIGHT * 0.55
      return
    }

    // revealed — chiselled out of the mass
    handle.crate.isVisible = false
    handle.crate.rotation.set(0, 0, 0)
    this.setChipsVisible(handle, false)
    if (cell.isMine) {
      const isBoom =
        this.exploded?.row === cell.row && this.exploded?.col === cell.col
      handle.crate.isVisible = true
      handle.crate.material = isBoom ? this.explodedMat : this.mineMat
      handle.crate.scaling.set(0.7, 0.45, 0.7)
      handle.crate.position.set(handle.cellX, (CRATE_HEIGHT * 0.45) / 2, handle.cellZ)
      return
    }

    if (cell.adjacent > 0) {
      this.setDigit(handle, cell.adjacent)
    }
  }

  private setChipsVisible(handle: TileHandle, visible: boolean) {
    for (const chip of handle.chips) {
      chip.isVisible = visible
      chip.setEnabled(visible)
    }
  }

  private updateDigitHover() {
    const dt = this.scene.getEngine().getDeltaTime() / 1000
    this.hoverT += dt
    for (const line of this.tiles) {
      for (const handle of line) {
        if (!handle.digit.isVisible) continue
        const phase = this.hoverT * 2.2 + handle.row * 0.37 + handle.col * 0.51
        const y = DIGIT_HOVER_Y + Math.sin(phase) * DIGIT_BOB
        handle.digit.position.y = y
        handle.digitHue.position.y = y
        if (handle.digitValue > 0) {
          const neon = NUMBER_NEON[handle.digitValue]?.color ?? NUMBER_NEON[8].color
          const pulse = 1.05 + 0.35 * (0.5 + 0.5 * Math.sin(phase * 1.35))
          handle.digitMat.emissiveColor = new Color3(
            neon.r * pulse,
            neon.g * pulse,
            neon.b * pulse,
          )
          const huePulse = 0.26 + 0.1 * (0.5 + 0.5 * Math.sin(phase * 1.1))
          handle.digitHueMat.alpha = huePulse
          handle.digitHueMat.emissiveColor = new Color3(
            neon.r * (0.75 + 0.25 * pulse),
            neon.g * (0.75 + 0.25 * pulse),
            neon.b * (0.75 + 0.25 * pulse),
          )
          const scale = 0.95 + 0.08 * Math.sin(phase * 1.1)
          handle.digitHue.scaling.set(scale, scale, scale)
        }
      }
    }
  }

  private playCrateVanish(handle: TileHandle, keepVisible = false) {
    const mesh = handle.crate
    if (!keepVisible) mesh.isVisible = true
    this.setChipsVisible(handle, false)
    mesh.position.set(handle.cellX, handle.stoneY, handle.cellZ)
    mesh.rotation.set(0, 0, 0)
    // Chisel a cell out of the joined mass
    const start = new Vector3(1.04, 1, 1.04)
    mesh.scaling.copyFrom(start)
    const scaleAnim = new Animation(
      `chisel_${handle.row}_${handle.col}_${Math.random()}`,
      'scaling',
      60,
      Animation.ANIMATIONTYPE_VECTOR3,
      Animation.ANIMATIONLOOPMODE_CONSTANT,
    )
    scaleAnim.setKeys([
      { frame: 0, value: start.clone() },
      { frame: 5, value: new Vector3(0.9, 1.15, 0.9) },
      { frame: 12, value: keepVisible ? new Vector3(0.55, 0.4, 0.55) : new Vector3(0.01, 0.01, 0.01) },
    ])
    mesh.animations = [scaleAnim]
    this.scene.beginAnimation(mesh, 0, 12, false, 1, () => {
      if (!keepVisible) {
        mesh.isVisible = false
        mesh.scaling.copyFrom(handle.stoneScale)
      }
    })
  }

  private updateCamera() {
    if (this.cameraMode === 'first') {
      this.updateFirstPerson()
      return
    }

    if (this.cameraMode === 'chase') {
      this.updateChaseCamera()
      return
    }

    if (this.cameraMode === 'third') {
      this.updateThirdPersonDrone()
      return
    }

    // Orbit: free drag on ArcRotate, softly keep the player in frame
    const target = this.playerView.getWorldPosition()
    // Aim a bit above the floor so a low pitch never stares into the slab edge
    target.y = Math.max(target.y, 0.85)
    const current = this.camera.getTarget()
    const blend = 0.08
    current.x += (target.x - current.x) * blend
    current.y += (target.y - current.y) * blend
    current.z += (target.z - current.z) * blend
    this.camera.setTarget(current)
    // Hard clamp — prevents drag inertia from sitting below the playable view
    if (this.camera.beta > this.camera.upperBetaLimit) {
      this.camera.beta = this.camera.upperBetaLimit
    }
    if (this.camera.beta < this.camera.lowerBetaLimit) {
      this.camera.beta = this.camera.lowerBetaLimit
    }
    this.orbitRadius = this.camera.radius
    this.orbitFill.position.set(current.x + 4, 9, current.z)
  }

  /** Place / hard-snap the over-head chase cam behind the miner, looking along facing. */
  private snapChaseCamera() {
    const desired = this.chaseDesiredPose()
    this.chaseCam.position.copyFrom(desired.pos)
    this.chaseLookAt.copyFrom(desired.look)
    this.chaseCam.setTarget(this.chaseLookAt)
  }

  private chaseDesiredPose() {
    const eye = this.playerView.getEyePosition()
    const yaw = this.playerView.getYaw() + this.chaseYawOffset
    const fx = Math.sin(yaw)
    const fz = Math.cos(yaw)
    const pitch = this.chasePitchOffset
    const height = CHASE_HEIGHT + pitch * 1.4
    const behind = CHASE_BEHIND + Math.max(0, -pitch) * 0.6
    const pos = new Vector3(
      eye.x - fx * behind,
      height,
      eye.z - fz * behind,
    )
    this.clampDronePosition(pos)
    const look = new Vector3(
      eye.x + fx * CHASE_LOOK_AHEAD,
      CHASE_LOOK_Y + pitch * 0.85,
      eye.z + fz * CHASE_LOOK_AHEAD,
    )
    return { pos, look }
  }

  /** Soft follow: always sits over the head and matches miner facing. */
  private updateChaseCamera() {
    const desired = this.chaseDesiredPose()
    const dt = Math.min(0.05, this.scene.getEngine().getDeltaTime() / 1000)
    const follow = 1 - Math.pow(0.0015, dt)
    this.chaseCam.position.x += (desired.pos.x - this.chaseCam.position.x) * follow
    this.chaseCam.position.y += (desired.pos.y - this.chaseCam.position.y) * follow
    this.chaseCam.position.z += (desired.pos.z - this.chaseCam.position.z) * follow
    this.clampDronePosition(this.chaseCam.position)

    const lookFollow = 1 - Math.pow(0.0008, dt)
    this.chaseLookAt.x += (desired.look.x - this.chaseLookAt.x) * lookFollow
    this.chaseLookAt.y += (desired.look.y - this.chaseLookAt.y) * lookFollow
    this.chaseLookAt.z += (desired.look.z - this.chaseLookAt.z) * lookFollow
    this.chaseCam.setTarget(this.chaseLookAt)
  }

  private releaseDroneTracking() {
    if (this.droneTracking) {
      const player = this.playerView.getWorldPosition()
      this.droneWatchPlayer.set(player.x, player.y, player.z)
    }
    this.droneTracking = false
  }

  private updateThirdPersonDrone() {
    if (!this.dronePlaced) this.snapThirdPerson()

    this.applyDroneKeyFlight()

    const player = this.playerView.getWorldPosition()
    const moved = Math.hypot(
      player.x - this.droneWatchPlayer.x,
      player.z - this.droneWatchPlayer.z,
    )

    // Tunnel: walking reawakens follow. Plane classic boards: stay parked after scout.
    if (
      this.activeLayout === 'tunnel' &&
      !this.droneTracking &&
      moved >= DRONE_RETRACK_DISTANCE
    ) {
      this.droneTracking = true
    }

    if (this.droneTracking) {
      this.droneWatchPlayer.set(player.x, player.y, player.z)
      const dt = Math.min(0.05, this.scene.getEngine().getDeltaTime() / 1000)
      const desired = new Vector3(
        player.x + this.droneFollowOffset.x,
        this.droneFollowOffset.y,
        player.z + this.droneFollowOffset.z,
      )
      this.clampDronePosition(desired)

      const follow = 1 - Math.pow(0.04, dt)
      this.thirdPerson.position.x += (desired.x - this.thirdPerson.position.x) * follow
      this.thirdPerson.position.y += (desired.y - this.thirdPerson.position.y) * follow
      this.thirdPerson.position.z += (desired.z - this.thirdPerson.position.z) * follow
      this.clampDronePosition(this.thirdPerson.position)

      this.droneLookAt.set(player.x, 0.7, player.z)
      const lookFollow = 1 - Math.pow(0.06, dt)
      const cur = this.thirdPerson.getTarget()
      cur.x += (this.droneLookAt.x - cur.x) * lookFollow
      cur.y += (this.droneLookAt.y - cur.y) * lookFollow
      cur.z += (this.droneLookAt.z - cur.z) * lookFollow
      this.thirdPerson.setTarget(cur)
      return
    }

    this.clampDronePosition(this.thirdPerson.position)
  }

  private applyDroneKeyFlight() {
    if (this.droneHeldKeys.size === 0) return
    this.releaseDroneTracking()

    const yaw = this.thirdPerson.rotation.y
    const forwardX = Math.sin(yaw)
    const forwardZ = Math.cos(yaw)
    const rightX = Math.cos(yaw)
    const rightZ = -Math.sin(yaw)
    let dx = 0
    let dz = 0
    let dy = 0

    if (this.droneHeldKeys.has('KeyW') || this.droneHeldKeys.has('ArrowUp')) {
      dx += forwardX
      dz += forwardZ
    }
    if (this.droneHeldKeys.has('KeyS') || this.droneHeldKeys.has('ArrowDown')) {
      dx -= forwardX
      dz -= forwardZ
    }
    if (this.droneHeldKeys.has('KeyD') || this.droneHeldKeys.has('ArrowRight')) {
      dx += rightX
      dz += rightZ
    }
    if (this.droneHeldKeys.has('KeyA') || this.droneHeldKeys.has('ArrowLeft')) {
      dx -= rightX
      dz -= rightZ
    }
    if (this.droneHeldKeys.has('KeyE')) dy += 1
    if (this.droneHeldKeys.has('KeyQ')) dy -= 1

    const len = Math.hypot(dx, dz)
    if (len > 0.001) {
      dx = (dx / len) * DRONE_KEY_SPEED
      dz = (dz / len) * DRONE_KEY_SPEED
    }
    this.thirdPerson.position.x += dx
    this.thirdPerson.position.z += dz
    this.thirdPerson.position.y += dy * DRONE_KEY_SPEED
    this.clampDronePosition(this.thirdPerson.position)
  }

  private clampDronePosition(pos: Vector3) {
    const bounds = this.caveBounds
    if (!bounds) return
    pos.x = Math.min(bounds.maxX - DRONE_WALL_SLACK, Math.max(bounds.minX + DRONE_WALL_SLACK, pos.x))
    pos.y = Math.min(bounds.maxY, Math.max(bounds.minY, pos.y))
    pos.z = Math.min(bounds.maxZ - DRONE_WALL_SLACK, Math.max(bounds.minZ + DRONE_WALL_SLACK, pos.z))
  }

  /** Place the drone behind the miner’s head, then resume normal follow/free-look. */
  private snapThirdPerson() {
    const player = this.playerView.getWorldPosition()
    const eye = this.playerView.getEyePosition()
    const yaw = this.playerView.getYaw()
    const fx = Math.sin(yaw)
    const fz = Math.cos(yaw)

    const start = new Vector3(
      eye.x - fx * DRONE_BEHIND_DISTANCE,
      DRONE_START_HEIGHT,
      eye.z - fz * DRONE_BEHIND_DISTANCE,
    )
    this.clampDronePosition(start)
    this.thirdPerson.position.copyFrom(start)

    // Look past the head toward where the miner faces
    this.droneLookAt.set(eye.x + fx * 2.2, 0.65, eye.z + fz * 2.2)
    this.thirdPerson.setTarget(this.droneLookAt)

    this.droneFollowOffset.set(start.x - player.x, start.y, start.z - player.z)
    this.droneWatchPlayer.set(player.x, player.y, player.z)
    this.droneTracking = true
    this.dronePlaced = true
  }

  private snapFirstPerson(preserveLook = false) {
    const keepLook = preserveLook && this.firstPersonReady
    if (!keepLook) {
      this.firstPerson.rotation.y = this.playerView.getYaw()
      this.firstPerson.rotation.x = FP_DEFAULT_PITCH
    }
    this.firstPersonReady = true
    this.firstPerson.position.copyFrom(this.getFirstPersonEye())
    this.aimFirstPersonLamp()
  }

  private getFirstPersonEye() {
    const base = this.playerView.getEyePosition()
    const yaw = this.firstPersonReady
      ? this.getControlYaw()
      : this.playerView.getYaw()
    const fx = Math.sin(yaw)
    const fz = Math.cos(yaw)
    return new Vector3(
      base.x + fx * FP_EYE_FORWARD,
      FP_EYE_HEIGHT,
      base.z + fz * FP_EYE_FORWARD,
    )
  }

  private aimFirstPersonLamp() {
    const f = this.firstPerson.getDirection(Vector3.Forward())
    const yaw = Math.atan2(f.x, f.z)
    const pitch = Math.atan2(-f.y, Math.hypot(f.x, f.z))
    this.playerView.aimHeadlamp(yaw, pitch)
  }

  private updateFirstPerson() {
    if (!this.firstPersonReady) this.snapFirstPerson()

    const eye = this.getFirstPersonEye()
    const blend = 0.35
    this.firstPerson.position.x += (eye.x - this.firstPerson.position.x) * blend
    this.firstPerson.position.y += (eye.y - this.firstPerson.position.y) * blend
    this.firstPerson.position.z += (eye.z - this.firstPerson.position.z) * blend

    this.firstPerson.rotation.x = Math.min(
      FP_PITCH_MAX,
      Math.max(FP_PITCH_MIN, this.firstPerson.rotation.x),
    )

    this.aimFirstPersonLamp()
  }
}
