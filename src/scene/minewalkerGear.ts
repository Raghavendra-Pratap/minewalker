/**
 * Studio Minewalker props for Babylon — headlamp, dust mask, ore satchel.
 * Geometry and offsets match frontend-dev/public/characters/minewalkerGear.js
 * (final studio fit: lamp on hat brim, mask on nose/mouth/chin, pack below neck).
 *
 * Babylon Quaternius is meter-scaled already (unlike Three wardrobe bone scale ~100).
 * Props follow bones via world positions each frame — attachToBone + AbsoluteTransform
 * conversion was unreliable across the mesh/skeleton split.
 */
import { Color3, Matrix, Quaternion, Vector3, Axis } from '@babylonjs/core/Maths/math'
import { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial'
import { MeshBuilder } from '@babylonjs/core/Meshes/meshBuilder'
import { TransformNode } from '@babylonjs/core/Meshes/transformNode'
import type { Bone } from '@babylonjs/core/Bones/bone'
import type { Scene } from '@babylonjs/core/scene'
import type { AbstractMesh } from '@babylonjs/core/Meshes/abstractMesh'
import type { Observer } from '@babylonjs/core/Misc/observable'
import { tuneLitMaterial } from './lighting'

export type MinewalkerGearKit = {
  helmet: TransformNode
  mask: TransformNode
  pack: TransformNode
  dispose: () => void
}

type Socket = {
  piece: TransformNode
  bone: Bone
  /** Offset in bone-local meters (Worker faces +Z in bind). */
  offset: Vector3
  euler: Vector3 | null
  scale: number
}

function mat(
  scene: Scene,
  name: string,
  diffuse: Color3,
  opts: { emissive?: Color3; specular?: Color3; power?: number } = {},
) {
  const m = new StandardMaterial(name, scene)
  m.diffuseColor = diffuse
  m.emissiveColor = opts.emissive ?? Color3.Black()
  m.specularColor = opts.specular ?? new Color3(0.2, 0.2, 0.2)
  m.specularPower = opts.power ?? 40
  tuneLitMaterial(m)
  return m
}

function box(
  scene: Scene,
  name: string,
  size: { w: number; h: number; d: number },
  material: StandardMaterial,
  parent: TransformNode,
  pos: Vector3,
  rot?: Vector3,
) {
  const m = MeshBuilder.CreateBox(name, { width: size.w, height: size.h, depth: size.d }, scene)
  m.material = material
  m.parent = parent
  m.position.copyFrom(pos)
  if (rot) m.rotation.copyFrom(rot)
  m.isPickable = false
  m.receiveShadows = true
  return m
}

function cyl(
  scene: Scene,
  name: string,
  opts: { height: number; diameterTop: number; diameterBottom: number; tessellation?: number },
  material: StandardMaterial,
  parent: TransformNode,
  pos: Vector3,
  rot?: Vector3,
) {
  const m = MeshBuilder.CreateCylinder(
    name,
    {
      height: opts.height,
      diameterTop: opts.diameterTop,
      diameterBottom: opts.diameterBottom,
      tessellation: opts.tessellation ?? 14,
    },
    scene,
  )
  m.material = material
  m.parent = parent
  m.position.copyFrom(pos)
  if (rot) m.rotation.copyFrom(rot)
  m.isPickable = false
  m.receiveShadows = true
  return m
}

function sphere(
  scene: Scene,
  name: string,
  diameter: number,
  material: StandardMaterial,
  parent: TransformNode,
  pos: Vector3,
  rot?: Vector3,
) {
  const m = MeshBuilder.CreateSphere(name, { diameter, segments: 14 }, scene)
  m.material = material
  m.parent = parent
  m.position.copyFrom(pos)
  if (rot) m.rotation.copyFrom(rot)
  m.isPickable = false
  m.receiveShadows = true
  return m
}

function findBone(bones: Bone[], aliases: string[]) {
  const want = aliases.map((a) => a.toLowerCase().replace(/:/g, ''))
  let exact: Bone | null = null
  let loose: Bone | null = null
  for (const bone of bones) {
    const n = bone.name.toLowerCase().replace(/:/g, '')
    if (want.includes(n)) exact = exact || bone
    else if (want.some((a) => n === a || n.endsWith('.' + a) || n.endsWith('_' + a))) {
      loose = loose || bone
    }
  }
  return exact || loose
}

/** Prefer torso/head skinned mesh over feet as the bone-position mesh. */
export function pickSkinMesh(meshes: AbstractMesh[]) {
  const ranked = [...meshes].sort((a, b) => {
    const score = (m: AbstractMesh) => {
      const n = m.name.toLowerCase()
      if (n.includes('body')) return 0
      if (n.includes('head')) return 1
      if (n.includes('leg')) return 2
      return 3
    }
    return score(a) - score(b)
  })
  return ranked.find((m) => !!m.skeleton) ?? ranked[0] ?? null
}

/** World position of a bone-local offset (meters), using world axes from getDirection. */
function boneLocalToWorld(
  bone: Bone,
  skin: AbstractMesh,
  local: Vector3,
  out: Vector3,
  scale = 1,
) {
  const origin = bone.getAbsolutePosition(skin)
  const x = bone.getDirection(Axis.X, skin)
  const y = bone.getDirection(Axis.Y, skin)
  const z = bone.getDirection(Axis.Z, skin)
  out.copyFrom(origin)
  out.addInPlace(x.scale(local.x * scale))
  out.addInPlace(y.scale(local.y * scale))
  out.addInPlace(z.scale(local.z * scale))
  return out
}

export function createMinewalkerGear(scene: Scene): MinewalkerGearKit {
  const brass = mat(scene, 'mwBrass', new Color3(0.23, 0.23, 0.22), {
    specular: new Color3(0.53, 0.53, 0.5),
    power: 70,
  })
  const leather = mat(scene, 'mwLeather', new Color3(0.42, 0.27, 0.16), {
    specular: new Color3(0.07, 0.07, 0.07),
    power: 12,
  })
  const lampMat = mat(scene, 'mwLampLens', new Color3(1, 0.96, 0.82), {
    emissive: new Color3(1, 0.75, 0.25),
    specular: new Color3(1, 1, 1),
    power: 90,
  })
  const oreMat = mat(scene, 'mwOre', new Color3(0.35, 0.42, 0.47), {
    specular: new Color3(0.2, 0.27, 0.33),
    power: 40,
  })
  const rubber = mat(scene, 'mwRubber', new Color3(0.16, 0.17, 0.18), {
    specular: new Color3(0.13, 0.13, 0.13),
    power: 18,
  })
  const filterMat = mat(scene, 'mwFilter', new Color3(0.29, 0.33, 0.38), {
    specular: new Color3(0.2, 0.27, 0.33),
    power: 35,
  })

  const helmet = new TransformNode('helmetRig', scene)
  box(scene, 'helmetPlate', { w: 0.11, h: 0.06, d: 0.022 }, brass, helmet, new Vector3(0, 0.004, 0.008))
  cyl(
    scene,
    'helmetBarrel',
    { height: 0.03, diameterTop: 0.068, diameterBottom: 0.076 },
    brass,
    helmet,
    new Vector3(0, 0.004, 0.03),
    new Vector3(Math.PI / 2, 0, 0),
  )
  sphere(scene, 'helmetLens', 0.064, lampMat, helmet, new Vector3(0, 0.004, 0.052))

  const mask = new TransformNode('maskRig', scene)
  sphere(scene, 'maskCup', 0.144, rubber, mask, new Vector3(0, -0.008, 0.014), new Vector3(0.55, 0, 0))
  box(scene, 'maskBody', { w: 0.115, h: 0.09, d: 0.042 }, rubber, mask, new Vector3(0, -0.02, 0.04))
  cyl(
    scene,
    'maskFilterL',
    { height: 0.05, diameterTop: 0.052, diameterBottom: 0.056 },
    filterMat,
    mask,
    new Vector3(-0.078, -0.015, 0.05),
    new Vector3(0.2, 0, Math.PI / 2),
  )
  cyl(
    scene,
    'maskFilterR',
    { height: 0.05, diameterTop: 0.052, diameterBottom: 0.056 },
    filterMat,
    mask,
    new Vector3(0.078, -0.015, 0.05),
    new Vector3(0.2, 0, -Math.PI / 2),
  )
  const valve = MeshBuilder.CreateTorus('maskValve', { diameter: 0.056, thickness: 0.01, tessellation: 16 }, scene)
  valve.material = brass
  valve.parent = mask
  valve.position.set(0, -0.01, 0.062)
  valve.rotation.x = Math.PI / 2
  valve.isPickable = false
  box(scene, 'maskStrapL', { w: 0.018, h: 0.012, d: 0.11 }, rubber, mask, new Vector3(-0.065, 0.015, -0.02), new Vector3(0.12, 0.45, 0.1))
  box(scene, 'maskStrapR', { w: 0.018, h: 0.012, d: 0.11 }, rubber, mask, new Vector3(0.065, 0.015, -0.02), new Vector3(0.12, -0.45, -0.1))

  const pack = new TransformNode('packRig', scene)
  /*
   * Chest bone up is opposite wardrobe authoring. Inner Rz(π) keeps flap on top
   * while bag depth stays on −Z (out the back).
   */
  const packFlip = new TransformNode('packFlip', scene)
  packFlip.parent = pack
  packFlip.rotation.z = Math.PI

  box(scene, 'packBody', { w: 0.3, h: 0.36, d: 0.1 }, leather, packFlip, new Vector3(0, -0.02, -0.05))
  box(scene, 'packFlap', { w: 0.28, h: 0.06, d: 0.018 }, leather, packFlip, new Vector3(0, 0.12, -0.095), new Vector3(-0.28, 0, 0))
  box(scene, 'packBuckle', { w: 0.045, h: 0.03, d: 0.012 }, brass, packFlip, new Vector3(0, 0.07, -0.085))
  box(scene, 'packStrapL', { w: 0.036, h: 0.32, d: 0.014 }, leather, packFlip, new Vector3(-0.1, 0.06, 0.002), new Vector3(0.12, 0, 0.05))
  box(scene, 'packStrapR', { w: 0.036, h: 0.32, d: 0.014 }, leather, packFlip, new Vector3(0.1, 0.06, 0.002), new Vector3(0.12, 0, -0.05))
  const ore = MeshBuilder.CreatePolyhedron('packOre1', { type: 2, size: 0.04 }, scene)
  ore.material = oreMat
  ore.parent = packFlip
  ore.position.set(0.055, -0.06, -0.1)
  ore.rotation.set(0.4, 0.8, 0.2)
  ore.isPickable = false
  const ore2 = ore.clone('packOre2')!
  ore2.position.set(-0.05, -0.02, -0.095)
  ore2.scaling.setAll(0.85)
  const ore3 = ore.clone('packOre3')!
  ore3.position.set(0.01, 0.04, -0.1)
  ore3.scaling.setAll(0.7)

  const disposables = [brass, leather, lampMat, oreMat, rubber, filterMat]

  return {
    helmet,
    mask,
    pack,
    dispose() {
      helmet.dispose()
      mask.dispose()
      pack.dispose()
      disposables.forEach((m) => m.dispose())
    },
  }
}

/**
 * Bind studio gear to bones. Returns a disposer that removes the follow observer.
 * Lamp/mask: Head. Pack: Chest.
 * `heroScale` keeps authored meter offsets / prop size in sync with PlayerView scale.
 */
export function attachMinewalkerGear(
  scene: Scene,
  bones: Bone[],
  skinMesh: AbstractMesh,
  kit: MinewalkerGearKit,
  heroScale = 1,
): () => void {
  const head = findBone(bones, ['head'])
  const torso = findBone(bones, ['chest', 'torso', 'spine2']) || head

  kit.helmet.setParent(null)
  kit.mask.setParent(null)
  kit.pack.setParent(null)

  const sockets: Socket[] = []

  if (head) {
    /* Calibrated Worker brim seat — matches studio screenshots. */
    sockets.push({
      piece: kit.helmet,
      bone: head,
      offset: new Vector3(0, 0.17, 0.14),
      euler: new Vector3(0.08, 0, 0),
      scale: 1,
    })
    /*
     * Mask: equivalent studio seat — (0,-0.175,-0.045) from lamp plate in head space
     * ≈ (0, -0.005, 0.095) from Head. Scale ×1.2 like wardrobe.
     */
    sockets.push({
      piece: kit.mask,
      bone: head,
      offset: new Vector3(0, -0.005, 0.095),
      euler: new Vector3(0.3, 0, 0),
      scale: 1.2,
    })
  } else {
    kit.helmet.position.set(0, 1.68 * heroScale, 0.06 * heroScale)
    kit.mask.position.set(0, 1.52 * heroScale, 0.1 * heroScale)
  }

  if (torso) {
    sockets.push({
      piece: kit.pack,
      bone: torso,
      /* Slightly higher than bind so flap sits under the vest collar. */
      offset: new Vector3(0, -0.02, -0.05),
      euler: null,
      scale: 1,
    })
  } else {
    kit.pack.position.set(0, 1.2 * heroScale, -0.1 * heroScale)
  }

  const boneMat = Matrix.Identity()
  const tmpScale = new Vector3()
  const tmpQuat = new Quaternion()
  const tmpPos = new Vector3()
  const extra = new Quaternion()
  const combined = new Quaternion()
  const worldPos = new Vector3()

  const sync = () => {
    skinMesh.computeWorldMatrix(true)
    skinMesh.skeleton?.computeAbsoluteTransforms()
    for (const s of sockets) {
      boneLocalToWorld(s.bone, skinMesh, s.offset, worldPos, heroScale)
      s.piece.position.copyFrom(worldPos)
      s.piece.scaling.setAll(s.scale * heroScale)

      const x = s.bone.getDirection(Axis.X, skinMesh)
      const y = s.bone.getDirection(Axis.Y, skinMesh)
      const z = s.bone.getDirection(Axis.Z, skinMesh)
      Matrix.FromXYZAxesToRef(x, y, z, boneMat)
      boneMat.decompose(tmpScale, tmpQuat, tmpPos)
      if (s.euler) {
        Quaternion.FromEulerAnglesToRef(s.euler.x, s.euler.y, s.euler.z, extra)
        tmpQuat.multiplyToRef(extra, combined)
        if (!s.piece.rotationQuaternion) s.piece.rotationQuaternion = combined.clone()
        else s.piece.rotationQuaternion.copyFrom(combined)
      } else {
        if (!s.piece.rotationQuaternion) s.piece.rotationQuaternion = tmpQuat.clone()
        else s.piece.rotationQuaternion.copyFrom(tmpQuat)
      }
    }
  }

  sync()
  const obs: Observer<Scene> = scene.onBeforeRenderObservable.add(sync)

  return () => {
    scene.onBeforeRenderObservable.remove(obs)
  }
}

export function applyStudioColors(
  meshes: AbstractMesh[],
  colors: {
    vest: string
    pants: string
    hat: string
    skin: string
  },
) {
  const slots: { id: keyof typeof colors; keys: string[] }[] = [
    { id: 'vest', keys: ['vest', 'worker_vest', 'orange', 'jacket', 'hoodie', 'coat'] },
    { id: 'pants', keys: ['brown2', 'legs', 'pants', 'trousers'] },
    { id: 'hat', keys: ['yellow', 'worker_yellow', 'hat', 'helmet'] },
    { id: 'skin', keys: ['skin'] },
  ]

  /* Pants: match Brown / Brown2 but not LightBrown shirt */
  const pantsExact = ['brown', 'brown2']

  for (const mesh of meshes) {
    const mats = Array.isArray(mesh.material) ? mesh.material : mesh.material ? [mesh.material] : []
    for (const raw of mats) {
      if (!(raw instanceof StandardMaterial)) continue
      const matName = (raw.name || '').toLowerCase()
      const meshName = mesh.name.toLowerCase()
      const blob = `${matName} ${meshName}`

      let applied = false
      for (const slot of slots) {
        if (slot.id === 'pants') {
          if (pantsExact.includes(matName) || slot.keys.some((k) => blob.includes(k))) {
            raw.diffuseColor = Color3.FromHexString(colors.pants)
            applied = true
            break
          }
          continue
        }
        if (!slot.keys.some((k) => blob.includes(k))) continue
        raw.diffuseColor = Color3.FromHexString(colors[slot.id])
        applied = true
        break
      }
      void applied
    }
  }
}
