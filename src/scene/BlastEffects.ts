import { Animation } from '@babylonjs/core/Animations/animation'
import '@babylonjs/core/Animations/animatable'
import { Color3, Vector3 } from '@babylonjs/core/Maths/math'
import { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial'
import { MeshBuilder } from '@babylonjs/core/Meshes/meshBuilder'
import { Mesh } from '@babylonjs/core/Meshes/mesh'
import { PointLight } from '@babylonjs/core/Lights/pointLight'
import type { Camera } from '@babylonjs/core/Cameras/camera'
import type { Scene } from '@babylonjs/core/scene'

interface Debris {
  mesh: Mesh
  vx: number
  vy: number
  vz: number
  life: number
  maxLife: number
}

/**
 * Mine-blast VFX: flash, shockwave, debris, camera shake.
 */
export class BlastEffects {
  private particleObs: { remove: () => void } | null = null
  private shakeObs: { remove: () => void } | null = null

  private debrisPieces: Debris[] = []

  constructor(private scene: Scene) {}

  play(center: Vector3, camera: Camera | null) {
    this.stop()
    this.spawnFlash(center)
    this.spawnShockwave(center)
    this.spawnDebris(center)
    if (camera) this.shakeCamera(camera)
  }

  /** Cancel shake / debris leftover from a prior blast (e.g. New run). */
  stop() {
    if (this.shakeObs) {
      this.shakeObs.remove()
      this.shakeObs = null
    }
    if (this.particleObs) {
      this.particleObs.remove()
      this.particleObs = null
    }
    for (const p of this.debrisPieces) {
      p.mesh.material?.dispose()
      p.mesh.dispose()
    }
    this.debrisPieces = []
  }

  private spawnFlash(center: Vector3) {
    const mat = new StandardMaterial(`blastFlash_${Math.random()}`, this.scene)
    mat.diffuseColor = new Color3(1, 0.75, 0.35)
    mat.emissiveColor = new Color3(1, 0.55, 0.15)
    mat.disableLighting = true

    const core = MeshBuilder.CreateSphere(
      `blastCore_${Math.random()}`,
      { diameter: 0.35, segments: 10 },
      this.scene,
    )
    core.position.copyFrom(center)
    core.position.y += 0.35
    core.material = mat

    const light = new PointLight(`blastLight_${Math.random()}`, core.position.clone(), this.scene)
    light.diffuse = new Color3(1, 0.65, 0.25)
    light.intensity = 3.2
    light.range = 14

    const scaleAnim = new Animation(
      `blastScale_${Math.random()}`,
      'scaling',
      60,
      Animation.ANIMATIONTYPE_VECTOR3,
      Animation.ANIMATIONLOOPMODE_CONSTANT,
    )
    scaleAnim.setKeys([
      { frame: 0, value: new Vector3(0.4, 0.4, 0.4) },
      { frame: 6, value: new Vector3(2.8, 2.8, 2.8) },
      { frame: 18, value: new Vector3(4.5, 4.5, 4.5) },
    ])

    const lightAnim = new Animation(
      `blastLight_${Math.random()}`,
      'intensity',
      60,
      Animation.ANIMATIONTYPE_FLOAT,
      Animation.ANIMATIONLOOPMODE_CONSTANT,
    )
    lightAnim.setKeys([
      { frame: 0, value: 3.2 },
      { frame: 8, value: 1.4 },
      { frame: 22, value: 0 },
    ])

    core.animations = [scaleAnim]
    light.animations = [lightAnim]
    this.scene.beginAnimation(core, 0, 18, false)
    this.scene.beginAnimation(light, 0, 22, false, 1, () => {
      core.dispose()
      mat.dispose()
      light.dispose()
    })
  }

  private spawnShockwave(center: Vector3) {
    const mat = new StandardMaterial(`blastWave_${Math.random()}`, this.scene)
    mat.diffuseColor = new Color3(0.95, 0.45, 0.12)
    mat.emissiveColor = new Color3(0.85, 0.35, 0.08)
    mat.alpha = 0.55
    mat.disableLighting = true

    const ring = MeshBuilder.CreateTorus(
      `blastRing_${Math.random()}`,
      { diameter: 0.6, thickness: 0.12, tessellation: 24 },
      this.scene,
    )
    ring.rotation.x = Math.PI / 2
    ring.position.copyFrom(center)
    ring.position.y = 0.12
    ring.material = mat

    const smokeMat = new StandardMaterial(`blastSmoke_${Math.random()}`, this.scene)
    smokeMat.diffuseColor = new Color3(0.25, 0.2, 0.16)
    smokeMat.emissiveColor = new Color3(0.12, 0.08, 0.05)
    smokeMat.alpha = 0.35
    smokeMat.disableLighting = true

    const smoke = MeshBuilder.CreateSphere(
      `blastSmoke_${Math.random()}`,
      { diameter: 0.5, segments: 8 },
      this.scene,
    )
    smoke.position.copyFrom(center)
    smoke.position.y = 0.5
    smoke.material = smokeMat

    const ringScale = new Animation(
      `ringScale_${Math.random()}`,
      'scaling',
      60,
      Animation.ANIMATIONTYPE_VECTOR3,
      Animation.ANIMATIONLOOPMODE_CONSTANT,
    )
    ringScale.setKeys([
      { frame: 0, value: new Vector3(0.5, 0.5, 0.5) },
      { frame: 10, value: new Vector3(4.5, 4.5, 4.5) },
      { frame: 24, value: new Vector3(7, 7, 7) },
    ])

    const smokeScale = new Animation(
      `smokeScale_${Math.random()}`,
      'scaling',
      60,
      Animation.ANIMATIONTYPE_VECTOR3,
      Animation.ANIMATIONLOOPMODE_CONSTANT,
    )
    smokeScale.setKeys([
      { frame: 0, value: new Vector3(0.3, 0.3, 0.3) },
      { frame: 14, value: new Vector3(3.5, 2.2, 3.5) },
      { frame: 28, value: new Vector3(5, 3, 5) },
    ])

    ring.animations = [ringScale]
    smoke.animations = [smokeScale]
    this.scene.beginAnimation(ring, 0, 24, false)
    this.scene.beginAnimation(smoke, 0, 28, false, 1, () => {
      ring.dispose()
      smoke.dispose()
      mat.dispose()
      smokeMat.dispose()
    })
  }

  private spawnDebris(center: Vector3) {
    this.debrisPieces = []
    const count = 18

    for (let i = 0; i < count; i++) {
      const s = 0.12 + Math.random() * 0.22
      const mat = new StandardMaterial(`debris_${i}_${Math.random()}`, this.scene)
      mat.diffuseColor = new Color3(0.35 + Math.random() * 0.2, 0.28, 0.2)
      mat.emissiveColor = new Color3(0.4, 0.15, 0.05)

      const mesh = MeshBuilder.CreateBox(
        `debris_${i}_${Math.random()}`,
        { width: s, height: s * 0.7, depth: s * 0.9 },
        this.scene,
      )
      mesh.position.copyFrom(center)
      mesh.position.y = 0.25 + Math.random() * 0.35
      mesh.material = mat

      const ang = Math.random() * Math.PI * 2
      const speed = 2.5 + Math.random() * 4.5
      this.debrisPieces.push({
        mesh,
        vx: Math.cos(ang) * speed,
        vy: 2.5 + Math.random() * 3.5,
        vz: Math.sin(ang) * speed,
        life: 0.55 + Math.random() * 0.35,
        maxLife: 0.9,
      })
    }

    if (this.particleObs) {
      this.particleObs.remove()
      this.particleObs = null
    }

    const obs = this.scene.onBeforeRenderObservable.add(() => {
      const dt = Math.min(0.05, this.scene.getEngine().getDeltaTime() / 1000)
      let alive = 0

      for (const p of this.debrisPieces) {
        if (p.life <= 0) continue
        alive++
        p.life -= dt
        p.vy -= 9.5 * dt
        p.mesh.position.x += p.vx * dt
        p.mesh.position.y += p.vy * dt
        p.mesh.position.z += p.vz * dt
        p.mesh.rotation.x += p.vx * dt * 2
        p.mesh.rotation.y += p.vz * dt * 2
        const t = Math.max(0, p.life / p.maxLife)
        p.mesh.scaling.setAll(0.4 + t * 0.6)
        if (p.life <= 0) {
          p.mesh.material?.dispose()
          p.mesh.dispose()
        }
      }

      if (alive === 0) {
        this.scene.onBeforeRenderObservable.remove(obs)
        this.particleObs = null
        this.debrisPieces = []
      }
    })
    this.particleObs = obs
  }

  private shakeCamera(camera: Camera) {
    if (this.shakeObs) {
      this.shakeObs.remove()
      this.shakeObs = null
    }

    const base = camera.position.clone()
    const start = performance.now()
    const duration = 0.55
    const intensity = 0.14

    const obs = this.scene.onBeforeRenderObservable.add(() => {
      const t = (performance.now() - start) / 1000
      if (t >= duration) {
        camera.position.copyFrom(base)
        this.scene.onBeforeRenderObservable.remove(obs)
        this.shakeObs = null
        return
      }
      const falloff = 1 - t / duration
      const shake = intensity * falloff * falloff
      camera.position.x = base.x + (Math.random() - 0.5) * shake
      camera.position.y = base.y + (Math.random() - 0.5) * shake * 0.6
      camera.position.z = base.z + (Math.random() - 0.5) * shake
    })
    this.shakeObs = obs
  }
}
