import { Animation } from '@babylonjs/core/Animations/animation'
import '@babylonjs/core/Animations/animatable'
import { Vector3 } from '@babylonjs/core/Maths/math'
import { MeshBuilder } from '@babylonjs/core/Meshes/meshBuilder'
import { Mesh } from '@babylonjs/core/Meshes/mesh'
import { TransformNode } from '@babylonjs/core/Meshes/transformNode'
import { PointLight } from '@babylonjs/core/Lights/pointLight'
import { SpotLight } from '@babylonjs/core/Lights/spotLight'
import { SceneLoader, RegisterSceneLoaderPlugin } from '@babylonjs/core/Loading/sceneLoader'
import type { AnimationGroup } from '@babylonjs/core/Animations/animationGroup'
import type { AbstractMesh } from '@babylonjs/core/Meshes/abstractMesh'
import type { Skeleton } from '@babylonjs/core/Bones/skeleton'
import type { Scene } from '@babylonjs/core/scene'
import type { ShadowGenerator } from '@babylonjs/core/Lights/Shadows/shadowGenerator'
import { GLTFFileLoader } from '@babylonjs/loaders/glTF/glTFFileLoader'
import '@babylonjs/loaders/glTF/2.0'

/* Register on this app's SceneLoader instance (Vite can duplicate @babylonjs/core). */
if (!SceneLoader.IsPluginForExtensionAvailable('.glb')) {
  RegisterSceneLoaderPlugin(new GLTFFileLoader())
}
import { DIRECTION_YAW, type PlayerState } from '../game/types'
import {
  HEADLAMP_BEAM_ANGLE,
  HEADLAMP_BEAM_EXPONENT,
  HEADLAMP_BEAM_INTENSITY,
  HEADLAMP_FILL_INTENSITY,
  HEADLAMP_LOOK_DOWN,
  tuneHeadlampLights,
} from './lighting'
import { FLOOR_Y, cellToWorld } from './world'
import { smoothWorkerMeshes } from './smoothWorker'
import {
  applyStudioColors,
  attachMinewalkerGear,
  createMinewalkerGear,
  pickSkinMesh,
  type MinewalkerGearKit,
} from './minewalkerGear'

/** Slightly smaller than full Quaternius height so the miner fits tile scale. */
const HERO_SCALE = 0.75
const EYE_Y = 1.55 * HERO_SCALE
const LAMP_Y = 1.72 * HERO_SCALE

const STUDIO_COLORS = {
  vest: '#e85d04',
  pants: '#5c4033',
  hat: '#f4c430',
  skin: '#c4a484',
}

const CLIP = {
  idle: /idle_neutral/i,
  idleFallback: /\|idle$/i,
  walk: /\|walk$/i,
  run: /\|run$/i,
}

/**
 * Minewalker hero — Quaternius Worker + studio props (headlamp, dust mask, ore satchel).
 * Matches the wardrobe studio look saved for this game.
 */
export class PlayerView {
  readonly root: Mesh
  /** Movable body root (GLB or placeholder). Bob / blast animate this. */
  private body: TransformNode
  private modelRoot: TransformNode | null = null
  private lampRig: TransformNode
  private lampLight: PointLight
  private spotLight: SpotLight
  private worldX = 0
  private worldZ = 0
  private targetX = 0
  private targetZ = 0
  private targetYaw = 0
  private currentYaw = 0
  private bob = 0
  private alive = true
  private bodyVisible = true
  private blasting = false
  private gear: MinewalkerGearKit | null = null
  private gearUnbind: (() => void) | null = null
  private skeleton: Skeleton | null = null
  private anims: { idle?: AnimationGroup; walk?: AnimationGroup; run?: AnimationGroup } = {}
  private activeAnim: AnimationGroup | null = null
  private ready = false
  private restingBodyY = 0

  constructor(
    private scene: Scene,
    private shadowGenerator: ShadowGenerator,
  ) {
    this.root = new Mesh('playerRoot', scene)

    /* Invisible stand-in so sync works before GLB resolves. */
    this.body = new TransformNode('playerBody', scene)
    this.body.parent = this.root

    const stub = MeshBuilder.CreateBox('playerStub', { width: 0.4, height: 1.6, depth: 0.35 }, scene)
    stub.parent = this.body
    stub.position.y = 0.8
    stub.isVisible = false
    stub.isPickable = false

    this.lampRig = new TransformNode('lampRig', scene)
    this.lampRig.parent = this.root
    this.lampRig.position.y = LAMP_Y

    const brimForward = 0.34 * HERO_SCALE
    this.lampLight = new PointLight('minerLamp', new Vector3(0, 0, brimForward), scene)
    this.lampLight.parent = this.lampRig

    this.spotLight = new SpotLight(
      'minerSpot',
      new Vector3(0, 0, brimForward * 0.88),
      new Vector3(0, -0.15, 1),
      HEADLAMP_BEAM_ANGLE,
      HEADLAMP_BEAM_EXPONENT,
      scene,
    )
    this.spotLight.parent = this.lampRig
    tuneHeadlampLights(this.lampLight, this.spotLight)
    this.syncLampPose()

    scene.onBeforeRenderObservable.add(() => this.tick())
    void this.loadStudioHero()
  }

  private async loadStudioHero() {
    try {
      const result = await SceneLoader.ImportMeshAsync('', '/models/', 'Worker.glb', this.scene)
      const meshes = result.meshes.filter((m) => m.name !== '__root__') as Mesh[]
      const rootNode = result.meshes[0]
      if (!rootNode) throw new Error('Worker.glb empty')

      this.modelRoot = new TransformNode('workerModel', this.scene)
      this.modelRoot.parent = this.body
      this.modelRoot.scaling.setAll(HERO_SCALE)

      /* Normalize so feet sit on FLOOR_Y (after scale). */
      rootNode.parent = this.modelRoot
      this.modelRoot.computeWorldMatrix(true)
      for (const m of result.meshes) m.computeWorldMatrix(true)

      let minY = Infinity
      let maxY = -Infinity
      for (const m of result.meshes) {
        if (!m.getBoundingInfo) continue
        const bi = m.getBoundingInfo()
        const mn = bi.boundingBox.minimumWorld
        const mx = bi.boundingBox.maximumWorld
        minY = Math.min(minY, mn.y)
        maxY = Math.max(maxY, mx.y)
      }
      if (Number.isFinite(minY)) this.modelRoot.position.y = -minY
      this.restingBodyY = 0

      this.skeleton = result.skeletons[0] ?? null
      const skin =
        (this.skeleton ? pickSkinMesh(meshes as AbstractMesh[]) : null) ??
        (meshes.find((m) => m.skeleton === this.skeleton) as AbstractMesh | undefined) ??
        meshes[0]

      smoothWorkerMeshes(meshes)
      applyStudioColors(result.meshes, STUDIO_COLORS)

      for (const m of meshes) {
        m.isPickable = false
        m.receiveShadows = true
        this.shadowGenerator.addShadowCaster(m)
        /* Headlamp must not wash the wearer's own back/neck. */
        this.lampLight.excludedMeshes.push(m)
        this.spotLight.excludedMeshes.push(m)
      }

      this.gearUnbind?.()
      this.gear?.dispose()
      this.gear = createMinewalkerGear(this.scene)
      if (this.skeleton && skin && this.modelRoot) {
        this.skeleton.prepare()
        this.skeleton.computeAbsoluteTransforms()
        skin.computeWorldMatrix(true)

        this.gearUnbind = attachMinewalkerGear(
          this.scene,
          this.skeleton.bones,
          skin,
          this.gear,
          HERO_SCALE,
        )

        for (const node of [this.gear.helmet, this.gear.mask, this.gear.pack]) {
          node.getChildMeshes().forEach((m) => {
            this.shadowGenerator.addShadowCaster(m)
            this.lampLight.excludedMeshes.push(m)
            this.spotLight.excludedMeshes.push(m)
          })
        }
      }

      this.bindAnims(result.animationGroups)
      this.ready = true
      this.playLocomotion(false)
      console.info('[PlayerView] studio Worker loaded', {
        meshes: meshes.length,
        bones: this.skeleton?.bones.length,
        scale: HERO_SCALE,
      })
    } catch (err) {
      console.error('[PlayerView] failed to load Worker.glb', err)
    }
  }

  private bindAnims(groups: AnimationGroup[]) {
    for (const g of groups) {
      g.stop()
      g.loopAnimation = true
      if (CLIP.idle.test(g.name)) this.anims.idle = g
      else if (CLIP.walk.test(g.name)) this.anims.walk = g
      else if (CLIP.run.test(g.name)) this.anims.run = g
    }
    /* Prefer Idle_Neutral; fall back to bare |Idle if missing. */
    if (!this.anims.idle) {
      for (const g of groups) {
        if (CLIP.idleFallback.test(g.name)) {
          this.anims.idle = g
          break
        }
      }
    }
    console.info('[PlayerView] clips', {
      idle: this.anims.idle?.name,
      walk: this.anims.walk?.name,
      run: this.anims.run?.name,
    })
  }

  private playLocomotion(moving: boolean) {
    const next = moving ? this.anims.walk ?? this.anims.run ?? this.anims.idle : this.anims.idle
    if (!next || next === this.activeAnim) return
    if (this.activeAnim) {
      this.activeAnim.stop()
    }
    next.start(true, moving ? 1.15 : 1.0)
    this.activeAnim = next
  }

  sync(player: PlayerState) {
    const world = cellToWorld(player.row, player.col)
    this.targetX = world.x
    this.targetZ = world.z
    this.targetYaw = DIRECTION_YAW[player.facing]
    this.alive = player.alive
    if (!this.blasting) this.applyVisibility()
  }

  snap(player: PlayerState) {
    this.scene.stopAnimation(this.body)
    this.blasting = false
    this.body.scaling.setAll(1)
    this.body.rotation.z = 0
    this.body.position.y = this.restingBodyY
    this.restoreLamps()

    const world = cellToWorld(player.row, player.col)
    this.worldX = world.x
    this.worldZ = world.z
    this.targetX = world.x
    this.targetZ = world.z
    this.currentYaw = DIRECTION_YAW[player.facing]
    this.targetYaw = this.currentYaw
    this.root.position.set(this.worldX, FLOOR_Y, this.worldZ)
    this.root.rotation.y = this.currentYaw
    this.alive = player.alive
    this.applyVisibility()
    this.syncLampPose()
    this.playLocomotion(false)
  }

  getWorldPosition() {
    return new Vector3(this.worldX, 0.6 * HERO_SCALE, this.worldZ)
  }

  getEyePosition() {
    return new Vector3(this.worldX, EYE_Y, this.worldZ)
  }

  getYaw() {
    return this.currentYaw
  }

  /** Forward look point a short distance ahead of the eye. */
  getLookTarget(distance = 2) {
    const eye = this.getEyePosition()
    const fx = Math.sin(this.currentYaw)
    const fz = Math.cos(this.currentYaw)
    return new Vector3(eye.x + fx * distance, eye.y, eye.z + fz * distance)
  }

  setBodyVisible(visible: boolean) {
    this.bodyVisible = visible
    this.applyVisibility()
  }

  private restoreLamps() {
    tuneHeadlampLights(this.lampLight, this.spotLight)
  }

  private applyVisibility() {
    const on = this.bodyVisible && (this.alive || this.blasting)
    this.root.setEnabled(on)
    const lampsOn = this.alive
    this.lampLight.setEnabled(lampsOn)
    this.spotLight.setEnabled(lampsOn)
  }

  /** Body-facing lamp (chase / third / orbit). */
  aimLampWithBody() {
    this.syncLampPose()
    this.updateSpotDirectionFromRig()
  }

  private syncLampPose() {
    this.lampRig.rotation.y = 0
    this.lampRig.rotation.x = HEADLAMP_LOOK_DOWN
  }

  /** Spot direction is world-space in Babylon — must follow the lamp rig each frame. */
  private updateSpotDirectionFromRig() {
    this.lampRig.computeWorldMatrix(true)
    // Babylon's "forward" differs by coordinate conventions; use -Z so the beam
    // actually projects out of the lamp lens.
    this.spotLight.direction.copyFrom(this.lampRig.getDirection(new Vector3(0, 0, -1)))
  }

  /** Aim the helmet lamp with camera look (first-person). */
  aimHeadlamp(yaw: number, pitch = 0) {
    let dyaw = yaw - this.currentYaw
    while (dyaw > Math.PI) dyaw -= Math.PI * 2
    while (dyaw < -Math.PI) dyaw += Math.PI * 2
    this.lampRig.rotation.y = dyaw
    this.lampRig.rotation.x = pitch
    this.updateSpotDirectionFromRig()
  }

  private tick() {
    const dt = this.scene.getEngine().getDeltaTime() / 1000
    const follow = 1 - Math.pow(0.001, dt)
    const moving =
      Math.abs(this.targetX - this.worldX) > 0.01 || Math.abs(this.targetZ - this.worldZ) > 0.01

    this.worldX += (this.targetX - this.worldX) * Math.min(1, follow * 18)
    this.worldZ += (this.targetZ - this.worldZ) * Math.min(1, follow * 18)

    let dyaw = this.targetYaw - this.currentYaw
    while (dyaw > Math.PI) dyaw -= Math.PI * 2
    while (dyaw < -Math.PI) dyaw += Math.PI * 2
    this.currentYaw += dyaw * Math.min(1, follow * 16)

    this.root.position.set(this.worldX, FLOOR_Y, this.worldZ)
    this.root.rotation.y = this.currentYaw
    this.updateSpotDirectionFromRig()

    if (this.blasting) return

    if (this.ready) this.playLocomotion(moving)

    if (moving) {
      this.bob += dt * 14
      this.body.position.y = this.restingBodyY + Math.abs(Math.sin(this.bob)) * 0.04
    } else {
      this.body.position.y +=
        (this.restingBodyY - this.body.position.y) * Math.min(1, follow * 10)
    }
  }

  playBlast(fromWorld?: Vector3) {
    this.blasting = true
    this.body.rotation.z = 0
    this.body.scaling.setAll(1)
    this.applyVisibility()
    this.activeAnim?.stop()

    const baseY = this.restingBodyY
    const animPos = new Animation(
      `blastPos_${Math.random()}`,
      'position.y',
      60,
      Animation.ANIMATIONTYPE_FLOAT,
      Animation.ANIMATIONLOOPMODE_CONSTANT,
    )
    animPos.setKeys([
      { frame: 0, value: baseY },
      { frame: 4, value: baseY + 0.5 },
      { frame: 14, value: baseY - 0.5 },
    ])

    const animRot = new Animation(
      `blastRot_${Math.random()}`,
      'rotation.z',
      60,
      Animation.ANIMATIONTYPE_FLOAT,
      Animation.ANIMATIONLOOPMODE_CONSTANT,
    )
    animRot.setKeys([
      { frame: 0, value: 0 },
      { frame: 6, value: 0.35 },
      { frame: 16, value: 0.9 },
    ])

    const animScale = new Animation(
      `blastScale_${Math.random()}`,
      'scaling',
      60,
      Animation.ANIMATIONTYPE_VECTOR3,
      Animation.ANIMATIONLOOPMODE_CONSTANT,
    )
    animScale.setKeys([
      { frame: 0, value: new Vector3(1, 1, 1) },
      { frame: 5, value: new Vector3(1.08, 1.08, 1.08) },
      { frame: 18, value: new Vector3(0.01, 0.01, 0.01) },
    ])

    this.body.animations = [animPos, animRot, animScale]

    if (fromWorld) {
      const dx = this.worldX - fromWorld.x
      const dz = this.worldZ - fromWorld.z
      const len = Math.hypot(dx, dz) || 1
      this.targetX = this.worldX + (dx / len) * 0.55
      this.targetZ = this.worldZ + (dz / len) * 0.55
    }

    this.lampLight.intensity = HEADLAMP_FILL_INTENSITY * 2.4
    this.spotLight.intensity = HEADLAMP_BEAM_INTENSITY * 2.4
    this.lampLight.setEnabled(true)
    this.spotLight.setEnabled(true)
    this.scene.beginAnimation(this.body, 0, 18, false, 1, () => {
      this.blasting = false
      this.restoreLamps()
      this.applyVisibility()
    })
  }

  playBump() {
    const baseY = this.restingBodyY
    const anim = new Animation(
      `bump_${Math.random()}`,
      'position.y',
      60,
      Animation.ANIMATIONTYPE_FLOAT,
      Animation.ANIMATIONLOOPMODE_CONSTANT,
    )
    anim.setKeys([
      { frame: 0, value: baseY },
      { frame: 4, value: baseY + 0.07 },
      { frame: 10, value: baseY },
    ])
    this.body.animations = [anim]
    this.scene.beginAnimation(this.body, 0, 10, false)
  }
}
