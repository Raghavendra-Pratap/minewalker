import { Color3, Matrix, Quaternion, Vector3 } from '@babylonjs/core/Maths/math'
import { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial'
import { MeshBuilder } from '@babylonjs/core/Meshes/meshBuilder'
import { Mesh } from '@babylonjs/core/Meshes/mesh'
import { PointLight } from '@babylonjs/core/Lights/pointLight'
import type { Scene } from '@babylonjs/core/scene'
import type { ShadowGenerator } from '@babylonjs/core/Lights/Shadows/shadowGenerator'
import { STEP, boardCenter } from './world'
import { tuneLitMaterial } from './lighting'

export interface CaveInteriorBounds {
  minX: number
  maxX: number
  minZ: number
  maxZ: number
  minY: number
  maxY: number
}

/** Deterministic pseudo-random in [0, 1) from a seed. */
function hash01(n: number) {
  const x = Math.sin(n * 12.9898) * 43758.5453
  return x - Math.floor(x)
}

/**
 * Narrow mine gallery: tight side walls, open mouth on the west,
 * and a dark unexcavated mass continuing east beyond the diggable face.
 */
export class CaveEnvironment {
  private root: Mesh
  private torchLights: PointLight[] = []
  private rockMat!: StandardMaterial
  private darkRockMat!: StandardMaterial
  private timberMat!: StandardMaterial
  private oreMat!: StandardMaterial
  private floorMat!: StandardMaterial
  private interior: CaveInteriorBounds = {
    minX: -8,
    maxX: 8,
    minZ: -8,
    maxZ: 8,
    minY: 1.2,
    maxY: 3.8,
  }

  constructor(
    private scene: Scene,
    private shadowGenerator: ShadowGenerator,
  ) {
    this.root = new Mesh('caveRoot', scene)
    this.buildMaterials()
  }

  dispose() {
    this.clear()
    this.root.dispose()
  }

  getInteriorBounds(): CaveInteriorBounds {
    return { ...this.interior }
  }

  rebuild(rows: number, cols: number, layout: 'plane' | 'tunnel' = 'tunnel') {
    this.clear()
    if (layout === 'plane') this.rebuildPlane(rows, cols)
    else this.rebuildTunnel(rows, cols)
  }

  private rebuildTunnel(rows: number, cols: number) {
    const center = boardCenter(rows, cols)
    const digW = cols * STEP
    const digD = rows * STEP
    const mouthX = center.x - digW / 2
    const faceX = center.x + digW / 2

    // Roomier gallery + long hidden stretch ahead of the dig face
    const sidePad = 2.4
    const mouthPad = 4.2
    const hiddenDepth = Math.max(22, digW * 0.85)
    const floorW = digW + mouthPad + hiddenDepth
    const floorD = digD + sidePad * 2
    const floorCenterX = mouthX - mouthPad + floorW / 2
    const floorCenter = { x: floorCenterX, z: center.z }

    const wallH = 4.8
    const outerW = floorW + 1.2
    const outerD = floorD + 1.8

    this.interior = {
      minX: mouthX - mouthPad + 1.0,
      maxX: faceX + hiddenDepth * 0.35,
      minZ: center.z - floorD / 2 + 0.9,
      maxZ: center.z + floorD / 2 - 0.9,
      minY: 1.3,
      maxY: Math.min(3.7, wallH * 0.72),
    }

    this.buildBedrock(floorCenter, floorW, floorD, digW, digD, center)
    this.buildGalleryWalls(center, digW, digD, wallH, sidePad, mouthPad, hiddenDepth)
    this.buildUnexcavatedMass(faceX, center.z, digD, hiddenDepth, wallH)
    this.buildMouthPortal(mouthX, center.z, digD, wallH)
    this.buildTimberFrames(center, digW, digD, wallH * 0.78)
    this.buildVault(floorCenter, outerW, outerD, wallH, rows * cols)
    this.buildTorches(center, digW, digD, wallH * 0.78, mouthX)
  }

  private rebuildPlane(rows: number, cols: number) {
    const center = boardCenter(rows, cols)
    const innerW = cols * STEP
    const innerD = rows * STEP

    // Broad cavern: large apron around the diggable grid (original flat-field layout)
    const padX = Math.max(7.5, innerW * 0.55)
    const padZ = Math.max(6.5, innerD * 0.55)
    const floorW = innerW + padX * 2
    const floorD = innerD + padZ * 2
    const wallInset = 0.4
    const outerW = floorW + 1.6
    const outerD = floorD + 1.6
    const wallH = 5.2

    this.interior = {
      minX: center.x - floorW / 2 + 0.4,
      maxX: center.x + floorW / 2 - 0.4,
      minZ: center.z - floorD / 2 + 0.4,
      maxZ: center.z + floorD / 2 - 0.4,
      minY: 1.2,
      maxY: Math.min(5.6, wallH * 0.88),
    }

    this.planeBuildBedrock(center, floorW, floorD, innerW, innerD)
    this.planeBuildWallRing(center, outerW, outerD, wallH, wallInset)
    this.planeBuildBoulders(center, floorW, floorD, innerW, innerD)
    this.planeBuildTimberFrames(center, floorW, floorD, wallH * 0.72)
    this.planeBuildVault(center, outerW, outerD, wallH, rows * cols)
    this.planeBuildTorches(center, floorW, floorD, wallH * 0.72)
  }

  private clear() {
    for (const light of this.torchLights) light.dispose()
    this.torchLights = []
    for (const child of [...this.root.getChildMeshes(true)]) {
      child.dispose()
    }
  }

  /** Timber beam aligned from point A to point B. */
  private placeTimberBeam(
    name: string,
    from: Vector3,
    to: Vector3,
    width = 0.14,
    height = 0.14,
  ) {
    const delta = to.subtract(from)
    const len = delta.length()
    if (len < 0.06) return null

    const beam = MeshBuilder.CreateBox(
      name,
      { width, height, depth: len },
      this.scene,
    )
    beam.position = Vector3.Center(from, to)

    const z = delta.normalize()
    const refUp = Math.abs(z.y) > 0.92 ? Vector3.Right() : Vector3.Up()
    const x = Vector3.Cross(refUp, z).normalize()
    const y = Vector3.Cross(z, x).normalize()
    const rotMat = Matrix.Identity()
    Matrix.FromXYZAxesToRef(x, y, z, rotMat)
    beam.rotationQuaternion = Quaternion.FromRotationMatrix(rotMat)

    beam.material = this.timberMat
    beam.parent = this.root
    this.shadowGenerator.addShadowCaster(beam)
    return beam
  }

  private placeRockChunk(
    name: string,
    position: Vector3,
    size: { w: number; h: number; d: number },
    rotation: { x?: number; y?: number; z?: number },
    material: StandardMaterial,
  ) {
    const rock = MeshBuilder.CreateBox(
      name,
      { width: size.w, height: size.h, depth: size.d },
      this.scene,
    )
    rock.position = position
    rock.rotation.x = rotation.x ?? 0
    rock.rotation.y = rotation.y ?? 0
    rock.rotation.z = rotation.z ?? 0
    rock.material = material
    rock.parent = this.root
    rock.receiveShadows = true
    this.shadowGenerator.addShadowCaster(rock)
    return rock
  }

  private buildMaterials() {
    this.rockMat = new StandardMaterial('caveRock', this.scene)
    this.rockMat.diffuseColor = new Color3(0.14, 0.13, 0.12)
    this.rockMat.specularColor = new Color3(0.02, 0.02, 0.02)
    tuneLitMaterial(this.rockMat)

    this.darkRockMat = new StandardMaterial('caveDarkRock', this.scene)
    this.darkRockMat.diffuseColor = new Color3(0.07, 0.065, 0.06)
    this.darkRockMat.specularColor = new Color3(0.01, 0.01, 0.01)
    tuneLitMaterial(this.darkRockMat)

    this.timberMat = new StandardMaterial('caveTimber', this.scene)
    this.timberMat.diffuseColor = new Color3(0.22, 0.14, 0.07)
    this.timberMat.specularColor = new Color3(0.04, 0.03, 0.02)
    tuneLitMaterial(this.timberMat)

    this.oreMat = new StandardMaterial('caveOre', this.scene)
    this.oreMat.diffuseColor = new Color3(0.22, 0.28, 0.24)
    this.oreMat.emissiveColor = new Color3(0.03, 0.05, 0.03)
    this.oreMat.specularColor = new Color3(0.1, 0.12, 0.1)
    tuneLitMaterial(this.oreMat)

    this.floorMat = new StandardMaterial('caveBedrock', this.scene)
    this.floorMat.diffuseColor = new Color3(0.06, 0.05, 0.045)
    this.floorMat.specularColor = new Color3(0.02, 0.02, 0.02)
    tuneLitMaterial(this.floorMat)
  }

  private buildBedrock(
    floorCenter: { x: number; z: number },
    floorW: number,
    floorD: number,
    digW: number,
    digD: number,
    digCenter: { x: number; z: number },
  ) {
    const floor = MeshBuilder.CreateBox(
      'caveBedrock',
      { width: floorW, height: 0.4, depth: floorD },
      this.scene,
    )
    floor.position = new Vector3(floorCenter.x, -0.3, floorCenter.z)
    floor.material = this.floorMat
    floor.receiveShadows = true
    floor.parent = this.root

    // Mouth rubble only — keep the gallery floor walkable-looking
    const mouthX = digCenter.x - digW / 2
    for (let i = 0; i < 18; i++) {
      const x = mouthX - 0.8 - hash01(i) * 2.8
      const z = digCenter.z + (hash01(i * 3) - 0.5) * (digD + 1.2)
      const s = 0.3 + hash01(i * 2) * 0.55
      const rock = MeshBuilder.CreateBox(
        `mouthRubble_${i}`,
        { width: s, height: s * (0.4 + hash01(i + 4) * 0.7), depth: s * 0.8 },
        this.scene,
      )
      rock.position = new Vector3(x, s * 0.22, z)
      rock.rotation.y = hash01(i + 8) * Math.PI
      rock.material = this.darkRockMat
      rock.parent = this.root
      rock.receiveShadows = true
    }
  }

  /** Irregular rock walls — piled, bulging inward, not flat corridor slabs. */
  private buildGalleryWalls(
    digCenter: { x: number; z: number },
    digW: number,
    digD: number,
    wallH: number,
    sidePad: number,
    mouthPad: number,
    hiddenDepth: number,
  ) {
    const mouthX = digCenter.x - digW / 2
    const totalLen = digW + mouthPad + hiddenDepth
    const startX = mouthX - mouthPad
    const stations = Math.max(28, Math.floor(totalLen / 0.65))
    const corridorHalf = digD / 2 + 0.15

    for (let i = 0; i < stations; i++) {
      const t = (i + 0.5) / stations
      const x = startX + t * totalLen
      const wave = Math.sin(t * Math.PI * 5.5 + hash01(i) * 2) * 0.35

      for (const [side, outward] of [
        ['N', -1],
        ['S', 1],
      ] as const) {
        const seed = i * 41 + (side === 'N' ? 3 : 17)
        const baseZ = digCenter.z + outward * (corridorHalf + sidePad * 0.25 + wave * 0.2)
        const bulge = 0.55 + hash01(seed) * 1.35 + Math.abs(wave) * 0.25
        const inwardZ = digCenter.z + outward * (corridorHalf - bulge * 0.35)

        // Anchor boulder — main inward bulge
        const anchorW = 0.9 + hash01(seed + 1) * 1.4
        const anchorH = wallH * (0.45 + hash01(seed + 2) * 0.55)
        const anchorD = 0.85 + hash01(seed + 3) * 1.5
        this.placeRockChunk(
          `anchor${side}_${i}`,
          new Vector3(
            x + (hash01(seed + 4) - 0.5) * 0.8,
            anchorH * 0.48,
            inwardZ + outward * (0.25 + hash01(seed + 5) * 0.55),
          ),
          { w: anchorW, h: anchorH, d: anchorD },
          {
            x: (hash01(seed + 6) - 0.5) * 0.28,
            y: (hash01(seed + 7) - 0.5) * 0.9,
            z: (hash01(seed + 8) - 0.5) * 0.22,
          },
          hash01(seed + 9) > 0.82 ? this.oreMat : this.rockMat,
        )

        // Satellite rubble — break up the straight silhouette
        const satellites = 2 + Math.floor(hash01(seed + 10) * 3)
        for (let p = 0; p < satellites; p++) {
          const s = seed + p * 13
          const w = 0.35 + hash01(s) * 0.95
          const h = wallH * (0.18 + hash01(s + 1) * 0.42)
          const d = 0.4 + hash01(s + 2) * 0.9
          const stackY = h * 0.5 + hash01(s + 3) * (wallH * 0.35)
          this.placeRockChunk(
            `sat${side}_${i}_${p}`,
            new Vector3(
              x + (hash01(s + 4) - 0.5) * 1.1,
              stackY,
              baseZ + outward * (hash01(s + 5) * 1.4),
            ),
            { w, h, d },
            {
              x: (hash01(s + 6) - 0.5) * 0.35,
              y: hash01(s + 7) * Math.PI,
              z: (hash01(s + 8) - 0.5) * 0.3,
            },
            hash01(s + 9) > 0.9 ? this.oreMat : hash01(s + 11) > 0.5 ? this.darkRockMat : this.rockMat,
          )
        }

        // Low rubble bank at the toe
        if (hash01(seed + 12) > 0.25) {
          this.placeRockChunk(
            `toe${side}_${i}`,
            new Vector3(
              x + (hash01(seed + 13) - 0.5) * 0.7,
              0.28 + hash01(seed + 14) * 0.35,
              baseZ + outward * (0.7 + hash01(seed + 15) * 0.9),
            ),
            {
              w: 0.7 + hash01(seed + 16) * 1.3,
              h: 0.35 + hash01(seed + 17) * 0.75,
              d: 0.8 + hash01(seed + 18) * 1.2,
            },
            { y: (hash01(seed + 19) - 0.5) * 0.7 },
            this.darkRockMat,
          )
        }

        // Occasional overhang chunk reaching toward the center
        if (hash01(seed + 20) > 0.62) {
          const hangH = 0.5 + hash01(seed + 21) * 0.9
          this.placeRockChunk(
            `hang${side}_${i}`,
            new Vector3(
              x + (hash01(seed + 22) - 0.5) * 0.5,
              wallH * (0.72 + hash01(seed + 23) * 0.18),
              digCenter.z + outward * (corridorHalf - hangH * 0.55),
            ),
            {
              w: 0.8 + hash01(seed + 24) * 1.1,
              h: hangH,
              d: 0.55 + hash01(seed + 25) * 0.7,
            },
            { x: outward * 0.35, y: (hash01(seed + 26) - 0.5) * 0.5 },
            this.darkRockMat,
          )
        }
      }
    }
  }

  /** Solid stone beyond the dig face — rough excavated-looking mass. */
  private buildUnexcavatedMass(
    faceX: number,
    midZ: number,
    digD: number,
    hiddenDepth: number,
    wallH: number,
  ) {
    const chunks = Math.max(22, Math.floor(hiddenDepth * digD * 0.35))
    for (let i = 0; i < chunks; i++) {
      const seed = i * 19
      const depth = 0.7 + hash01(seed) * (hiddenDepth * 0.85)
      const span = 0.8 + hash01(seed + 1) * (digD * 0.45)
      const h = wallH * (0.35 + hash01(seed + 2) * 0.75)
      const w = 0.6 + hash01(seed + 3) * 1.4

      this.placeRockChunk(
        `digMass_${i}`,
        new Vector3(
          faceX + depth,
          h * 0.5 + hash01(seed + 4) * 0.4,
          midZ + (hash01(seed + 5) - 0.5) * (digD + 2),
        ),
        { w, h, d: span },
        {
          x: (hash01(seed + 6) - 0.5) * 0.3,
          y: (hash01(seed + 7) - 0.5) * 0.8,
          z: (hash01(seed + 8) - 0.5) * 0.25,
        },
        hash01(seed + 9) > 0.82 ? this.oreMat : hash01(seed + 10) > 0.45 ? this.darkRockMat : this.rockMat,
      )
    }

    // Jagged dig face rubble right at the fringe
    const faceChunks = Math.max(14, Math.floor(digD * 2.8))
    for (let i = 0; i < faceChunks; i++) {
      const s = 0.45 + hash01(i * 2) * 1.0
      this.placeRockChunk(
        `digFace_${i}`,
        new Vector3(
          faceX + 0.15 + hash01(i + 7) * 1.2,
          s * 0.45 + hash01(i + 3) * 0.5,
          midZ + (hash01(i + 9) - 0.5) * (digD + 1.5),
        ),
        {
          w: s * (0.7 + hash01(i) * 0.8),
          h: s * (0.8 + hash01(i + 3) * 1.1),
          d: s * (0.6 + hash01(i + 5) * 0.7),
        },
        { y: (hash01(i + 11) - 0.5) * 0.6 },
        hash01(i + 13) > 0.8 ? this.oreMat : this.rockMat,
      )
    }
  }

  /** Timbered mine mouth at the west end. */
  private buildMouthPortal(
    mouthX: number,
    midZ: number,
    digD: number,
    wallH: number,
  ) {
    const footY = 0.07
    const legH = wallH * 0.86
    const legTop = footY + legH
    const headerY = legTop + 0.11
    const zN = midZ - digD / 2 - 0.28
    const zS = midZ + digD / 2 + 0.28
    const postXs = [mouthX - 0.38, mouthX - 0.14]

    for (const x of postXs) {
      for (const z of [zN, zS]) {
        const foot = MeshBuilder.CreateBox(
          `mouthFoot_${x}_${z}`,
          { width: 0.4, height: 0.14, depth: 0.4 },
          this.scene,
        )
        foot.position = new Vector3(x, footY, z)
        foot.material = this.timberMat
        foot.parent = this.root

        this.placeTimberBeam(
          `mouthLeg_${x}_${z}`,
          new Vector3(x, footY + 0.07, z),
          new Vector3(x, legTop, z),
          0.28,
          0.28,
        )
      }
    }

    this.placeTimberBeam(
      'mouthLintelN',
      new Vector3(postXs[0], headerY, zN),
      new Vector3(postXs[1], headerY, zN),
      0.3,
      0.24,
    )
    this.placeTimberBeam(
      'mouthLintelS',
      new Vector3(postXs[0], headerY, zS),
      new Vector3(postXs[1], headerY, zS),
      0.3,
      0.24,
    )
    this.placeTimberBeam(
      'mouthHeaderFront',
      new Vector3(postXs[0], headerY, zN),
      new Vector3(postXs[0], headerY, zS),
      0.24,
      0.3,
    )
    this.placeTimberBeam(
      'mouthHeaderBack',
      new Vector3(postXs[1], headerY, zN),
      new Vector3(postXs[1], headerY, zS),
      0.24,
      0.3,
    )

    this.placeTimberBeam(
      'mouthSill',
      new Vector3(postXs[0], 0.08, zN),
      new Vector3(postXs[0], 0.08, zS),
      0.2,
      0.16,
    )
  }

  /**
   * Classic mine timber sets with connected props, headers, braces, and lagging.
   */
  private buildTimberFrames(
    digCenter: { x: number; z: number },
    digW: number,
    digD: number,
    wallH: number,
  ) {
    const mouthX = digCenter.x - digW / 2
    const faceX = digCenter.x + digW / 2
    const zN = digCenter.z - digD / 2 + 0.28
    const zS = digCenter.z + digD / 2 - 0.28
    const spacing = 2.35
    const sets = Math.max(5, Math.floor((faceX - mouthX - 1.2) / spacing))
    const footY = 0.07

    for (let i = 0; i <= sets; i++) {
      const x = mouthX + 0.9 + i * spacing
      if (x > faceX - 0.5) break

      const legH = wallH * (0.76 + hash01(i * 3) * 0.08)
      const legTop = footY + legH
      const headerY = legTop + 0.11

      for (const [zi, tag] of [
        [zN, 'n'],
        [zS, 's'],
      ] as const) {
        const foot = MeshBuilder.CreateBox(
          `setFoot_${tag}_${i}`,
          { width: 0.4, height: 0.14, depth: 0.4 },
          this.scene,
        )
        foot.position = new Vector3(x, footY, zi)
        foot.material = this.timberMat
        foot.parent = this.root

        this.placeTimberBeam(
          `setLeg_${tag}_${i}`,
          new Vector3(x, footY + 0.07, zi),
          new Vector3(x, legTop, zi),
          0.22,
          0.22,
        )
      }

      // Header beam spanning the gallery
      this.placeTimberBeam(
        `setHeader_${i}`,
        new Vector3(x, headerY, zN),
        new Vector3(x, headerY, zS),
        0.24,
        0.22,
      )

      // Cap blocks seated on leg tops under the header
      for (const zi of [zN, zS]) {
        const cap = MeshBuilder.CreateBox(
          `setCap_${i}_${zi}`,
          { width: 0.36, height: 0.12, depth: 0.3 },
          this.scene,
        )
        cap.position = new Vector3(x, legTop + 0.05, zi)
        cap.material = this.timberMat
        cap.parent = this.root
      }

      // Diagonal braces: foot to header at each leg
      for (const [zi, inward] of [
        [zN, 1],
        [zS, -1],
      ] as const) {
        this.placeTimberBeam(
          `setBrace_${i}_${zi}`,
          new Vector3(x, footY + 0.12, zi),
          new Vector3(x, headerY - 0.04, zi + inward * 0.08),
          0.12,
          0.12,
        )
        // Cross brace toward gallery center
        this.placeTimberBeam(
          `setCross_${i}_${zi}`,
          new Vector3(x, footY + legH * 0.35, zi),
          new Vector3(x, headerY - 0.06, digCenter.z + inward * 0.12),
          0.1,
          0.1,
        )
      }

      // Lagging planks behind the legs
      if (hash01(i * 9) > 0.35) {
        for (const [zi, outward] of [
          [zN, -1],
          [zS, 1],
        ] as const) {
          const lag = MeshBuilder.CreateBox(
            `setLag_${i}_${zi}`,
            { width: 1.5, height: legH * 0.7, depth: 0.08 },
            this.scene,
          )
          lag.position = new Vector3(x, footY + legH * 0.42, zi + outward * 0.18)
          lag.material = this.timberMat
          lag.parent = this.root
        }
      }
    }
  }

  private buildVault(
    center: { x: number; z: number },
    outerW: number,
    outerD: number,
    wallH: number,
    seedBase: number,
  ) {
    // Irregular ceiling rock — overlapping chunks, not flat slabs
    const pieces = Math.max(18, Math.floor(outerW / 1.4))
    for (let i = 0; i < pieces; i++) {
      const t = (i + 0.5) / pieces
      const x = center.x - outerW / 2 + t * outerW
      const sag = Math.sin(t * Math.PI * 4 + hash01(seedBase + i) * 1.5) * 0.45
      const y = wallH * (0.82 + hash01(i * 3) * 0.22) - sag * 0.15
      const w = 0.9 + hash01(i + 1) * 1.6
      const h = 0.35 + hash01(i + 2) * 0.55
      const d = outerD * (0.35 + hash01(i + 4) * 0.3)

      this.placeRockChunk(
        `ceiling_${i}`,
        new Vector3(x + (hash01(i + 5) - 0.5) * 0.6, y, center.z + (hash01(i + 6) - 0.5) * outerD * 0.25),
        { w, h, d },
        {
          x: (hash01(i + 7) - 0.5) * 0.25,
          y: (hash01(i + 8) - 0.5) * 0.4,
          z: (hash01(i + 9) - 0.5) * 0.2,
        },
        hash01(i + 10) > 0.75 ? this.rockMat : this.darkRockMat,
      )
    }

    const spikes = Math.floor(outerW * 0.85)
    for (let i = 0; i < spikes; i++) {
      const x = center.x + (hash01(seedBase + i * 4) - 0.5) * outerW * 0.88
      const z = center.z + (hash01(seedBase + i * 6) - 0.5) * outerD * 0.4
      const h = 0.35 + hash01(i * 7) * 1.2
      const spike = MeshBuilder.CreateCylinder(
        `stalactite_${i}`,
        {
          height: h,
          diameterTop: 0.02,
          diameterBottom: 0.12 + hash01(i) * 0.2,
          tessellation: 6,
        },
        this.scene,
      )
      spike.position = new Vector3(x, wallH * 0.88 - h / 2 - hash01(i + 2) * 0.3, z)
      spike.material = this.rockMat
      spike.parent = this.root
    }
  }

  private buildTorches(
    digCenter: { x: number; z: number },
    digW: number,
    digD: number,
    wallH: number,
    mouthX: number,
  ) {
    const torchMat = new StandardMaterial('torchFlame', this.scene)
    torchMat.diffuseColor = new Color3(1, 0.55, 0.15)
    torchMat.emissiveColor = new Color3(0.95, 0.45, 0.08)
    torchMat.specularColor = new Color3(0, 0, 0)
    torchMat.disableLighting = true

    const holderMat = new StandardMaterial('torchHolder', this.scene)
    holderMat.diffuseColor = new Color3(0.2, 0.14, 0.08)
    tuneLitMaterial(holderMat)

    // Light the mouth — deeper shaft stays dark until the miner’s lamp arrives
    const spots: Array<{ x: number; z: number }> = [
      { x: mouthX + 0.6, z: digCenter.z - digD / 2 + 0.4 },
      { x: mouthX + 0.6, z: digCenter.z + digD / 2 - 0.4 },
      { x: mouthX + Math.min(5, digW * 0.25), z: digCenter.z - digD / 2 + 0.35 },
      { x: mouthX + Math.min(5, digW * 0.25), z: digCenter.z + digD / 2 - 0.35 },
    ]

    spots.forEach((spot, i) => {
      const y = wallH * 0.5
      const stick = MeshBuilder.CreateCylinder(
        `torchStick_${i}`,
        { height: 0.4, diameter: 0.07 },
        this.scene,
      )
      stick.position = new Vector3(spot.x, y, spot.z)
      stick.material = holderMat
      stick.parent = this.root

      const flame = MeshBuilder.CreateSphere(
        `torchFlame_${i}`,
        { diameter: 0.2, segments: 8 },
        this.scene,
      )
      flame.position = new Vector3(spot.x, y + 0.26, spot.z)
      flame.scaling.y = 1.3
      flame.material = torchMat
      flame.parent = this.root

      const light = new PointLight(
        `torchLight_${i}`,
        new Vector3(flame.position.x, flame.position.y, flame.position.z),
        this.scene,
      )
      light.diffuse = new Color3(1, 0.65, 0.32)
      light.specular = new Color3(0.25, 0.12, 0.04)
      light.intensity = 1.35
      light.range = 12
      this.torchLights.push(light)
    })
  }

  private planeBuildBedrock(
    center: { x: number; z: number },
    floorW: number,
    floorD: number,
    innerW: number,
    innerD: number,
  ) {
    const floor = MeshBuilder.CreateBox(
      'caveBedrock',
      { width: floorW, height: 0.4, depth: floorD },
      this.scene,
    )
    floor.position = new Vector3(center.x, -0.3, center.z)
    floor.material = this.floorMat
    floor.receiveShadows = true
    floor.parent = this.root

    // Extra stone shelves outside the main apron so the space feels wider
    for (let i = 0; i < 8; i++) {
      const ang = (i / 8) * Math.PI * 2 + hash01(i * 3) * 0.2
      const reach = 0.52 + hash01(i * 5) * 0.22
      const shelfW = 3.2 + hash01(i * 7) * 2.4
      const shelfD = 2.4 + hash01(i * 9) * 2
      const shelf = MeshBuilder.CreateBox(
        `caveShelf_${i}`,
        { width: shelfW, height: 0.35, depth: shelfD },
        this.scene,
      )
      shelf.position = new Vector3(
        center.x + Math.cos(ang) * (floorW * reach * 0.55),
        -0.38,
        center.z + Math.sin(ang) * (floorD * reach * 0.55),
      )
      shelf.rotation.y = ang + Math.PI / 2
      shelf.material = this.darkRockMat
      shelf.receiveShadows = true
      shelf.parent = this.root
    }

    // Rubble filling the apron between diggable board and cliff walls
    const apronMinX = center.x - floorW / 2 + 0.6
    const apronMaxX = center.x + floorW / 2 - 0.6
    const apronMinZ = center.z - floorD / 2 + 0.6
    const apronMaxZ = center.z + floorD / 2 - 0.6
    const gridMinX = center.x - innerW / 2 - 0.3
    const gridMaxX = center.x + innerW / 2 + 0.3
    const gridMinZ = center.z - innerD / 2 - 0.3
    const gridMaxZ = center.z + innerD / 2 + 0.3

    const count = Math.floor((floorW + floorD) * 2.4)
    for (let i = 0; i < count; i++) {
      let x = apronMinX + hash01(i * 2.1) * (apronMaxX - apronMinX)
      let z = apronMinZ + hash01(i * 3.7) * (apronMaxZ - apronMinZ)
      // Keep rubble off the diggable court
      if (x > gridMinX && x < gridMaxX && z > gridMinZ && z < gridMaxZ) {
        const push = hash01(i + 11)
        if (push < 0.25) x = gridMinX - 0.4 - hash01(i) * 1.2
        else if (push < 0.5) x = gridMaxX + 0.4 + hash01(i) * 1.2
        else if (push < 0.75) z = gridMinZ - 0.4 - hash01(i) * 1.2
        else z = gridMaxZ + 0.4 + hash01(i) * 1.2
      }

      const s = 0.28 + hash01(i * 3.1) * 0.7
      const rock = MeshBuilder.CreateBox(
        `rubble_${i}`,
        {
          width: s,
          height: s * (0.35 + hash01(i + 9) * 0.9),
          depth: s * (0.65 + hash01(i + 4) * 0.55),
        },
        this.scene,
      )
      rock.position = new Vector3(x, s * 0.22, z)
      rock.rotation.y = hash01(i + 11) * Math.PI * 2
      rock.rotation.x = (hash01(i + 13) - 0.5) * 0.4
      rock.material = hash01(i + 17) > 0.84 ? this.oreMat : this.darkRockMat
      rock.parent = this.root
      rock.receiveShadows = true
      if (hash01(i + 19) > 0.6) this.shadowGenerator.addShadowCaster(rock)
    }
  }

  private planeBuildWallRing(
    center: { x: number; z: number },
    outerW: number,
    outerD: number,
    wallH: number,
    wallInset: number,
  ) {
    // More segments → irregular coastline wall, not one smooth box side
    const segmentsX = Math.max(12, Math.floor(outerW / 1.15))
    const segmentsZ = Math.max(10, Math.floor(outerD / 1.15))

    const placeWallBlock = (
      name: string,
      x: number,
      z: number,
      seed: number,
      alongX: boolean,
      outwardX: number,
      outwardZ: number,
    ) => {
      // Push some segments farther out so the silhouette isn't rectangular
      const bulge = 0.4 + hash01(seed) * 2.8
      const px = x + outwardX * bulge
      const pz = z + outwardZ * bulge

      const w = alongX
        ? outerW / segmentsX + 0.35 + hash01(seed + 1) * 0.5
        : 1.1 + hash01(seed + 1) * 1.4
      const d = alongX
        ? 1.1 + hash01(seed + 2) * 1.4
        : outerD / segmentsZ + 0.35 + hash01(seed + 2) * 0.5
      const h = wallH * (0.55 + hash01(seed + 3) * 0.7)

      const block = MeshBuilder.CreateBox(name, { width: w, height: h, depth: d }, this.scene)
      block.position = new Vector3(
        px + (hash01(seed + 4) - 0.5) * 0.35,
        h / 2 - 0.08,
        pz + (hash01(seed + 5) - 0.5) * 0.35,
      )
      block.rotation.y = (hash01(seed + 6) - 0.5) * 0.35
      block.material = hash01(seed + 7) > 0.9 ? this.oreMat : this.rockMat
      block.parent = this.root
      block.receiveShadows = true
      this.shadowGenerator.addShadowCaster(block)

      // Occasional second tier behind the front face
      if (hash01(seed + 8) > 0.55) {
        const back = MeshBuilder.CreateBox(
          `${name}_tier`,
          {
            width: w * (0.7 + hash01(seed + 9) * 0.4),
            height: h * (0.7 + hash01(seed + 10) * 0.5),
            depth: d * (0.7 + hash01(seed + 11) * 0.4),
          },
          this.scene,
        )
        back.position = new Vector3(
          px + outwardX * (1.2 + hash01(seed + 12)),
          (h * 0.85) / 2,
          pz + outwardZ * (1.2 + hash01(seed + 12)),
        )
        back.material = this.darkRockMat
        back.parent = this.root
        this.shadowGenerator.addShadowCaster(back)
      }
    }

    const north = center.z - outerD / 2 + wallInset
    const south = center.z + outerD / 2 - wallInset
    const west = center.x - outerW / 2 + wallInset
    const east = center.x + outerW / 2 - wallInset

    for (let i = 0; i < segmentsX; i++) {
      const x = center.x - outerW / 2 + (i + 0.5) * (outerW / segmentsX)
      placeWallBlock(`wallN_${i}`, x, north, i * 13 + 1, true, 0, -1)
      placeWallBlock(`wallS_${i}`, x, south, i * 13 + 2, true, 0, 1)
    }
    for (let i = 0; i < segmentsZ; i++) {
      const z = center.z - outerD / 2 + (i + 0.5) * (outerD / segmentsZ)
      placeWallBlock(`wallW_${i}`, west, z, i * 13 + 3, false, -1, 0)
      placeWallBlock(`wallE_${i}`, east, z, i * 13 + 4, false, 1, 0)
    }
  }

  private planeBuildBoulders(
    center: { x: number; z: number },
    floorW: number,
    floorD: number,
    innerW: number,
    innerD: number,
  ) {
    // Mid-sized rock clusters in the apron — fills empty cavern floor
    const clusters = Math.max(8, Math.floor((floorW * floorD) / 28))
    for (let i = 0; i < clusters; i++) {
      const ang = hash01(i * 4.2) * Math.PI * 2
      const radial = 0.28 + hash01(i * 6.1) * 0.38
      const x = center.x + Math.cos(ang) * ((floorW * 0.5 - 1.2) * radial + innerW * 0.35)
      const z = center.z + Math.sin(ang) * ((floorD * 0.5 - 1.2) * radial + innerD * 0.35)

      // Skip anything too close to the dig court
      if (
        Math.abs(x - center.x) < innerW / 2 + 1.2 &&
        Math.abs(z - center.z) < innerD / 2 + 1.2
      ) {
        continue
      }

      const s = 0.7 + hash01(i * 2.2) * 1.4
      const boulder = MeshBuilder.CreateBox(
        `boulder_${i}`,
        {
          width: s,
          height: s * (0.55 + hash01(i + 3) * 0.7),
          depth: s * (0.75 + hash01(i + 5) * 0.5),
        },
        this.scene,
      )
      boulder.position = new Vector3(x, s * 0.28, z)
      boulder.rotation.y = hash01(i + 8) * Math.PI
      boulder.rotation.z = (hash01(i + 9) - 0.5) * 0.25
      boulder.material = hash01(i + 10) > 0.78 ? this.oreMat : this.rockMat
      boulder.parent = this.root
      boulder.receiveShadows = true
      this.shadowGenerator.addShadowCaster(boulder)
    }
  }

  private planeBuildTimberFrames(
    center: { x: number; z: number },
    floorW: number,
    floorD: number,
    wallH: number,
  ) {
    // Timbers sit near the dig zone, not the far cliffs — reads as a work site in a larger cave
    const insetX = Math.min(floorW * 0.28, 4.2)
    const insetZ = Math.min(floorD * 0.28, 4.2)
    const posts: Array<{ x: number; z: number }> = [
      { x: center.x - insetX, z: center.z - insetZ },
      { x: center.x + insetX, z: center.z - insetZ },
      { x: center.x - insetX, z: center.z + insetZ },
      { x: center.x + insetX, z: center.z + insetZ },
      { x: center.x, z: center.z - insetZ },
      { x: center.x, z: center.z + insetZ },
      { x: center.x - insetX, z: center.z },
      { x: center.x + insetX, z: center.z },
    ]

    posts.forEach((p, i) => {
      const h = wallH * (0.85 + hash01(i * 3) * 0.2)
      const post = MeshBuilder.CreateBox(
        `timberPost_${i}`,
        { width: 0.22, height: h, depth: 0.22 },
        this.scene,
      )
      post.position = new Vector3(p.x, h / 2, p.z)
      post.material = this.timberMat
      post.parent = this.root
      this.shadowGenerator.addShadowCaster(post)

      const beam = MeshBuilder.CreateBox(
        `timberCap_${i}`,
        { width: 0.85, height: 0.18, depth: 0.28 },
        this.scene,
      )
      beam.position = new Vector3(p.x, h * 0.95, p.z)
      beam.rotation.y = Math.abs(p.x - center.x) > Math.abs(p.z - center.z) ? 0 : Math.PI / 2
      beam.material = this.timberMat
      beam.parent = this.root
    })
  }

  private planeBuildVault(
    center: { x: number; z: number },
    outerW: number,
    outerD: number,
    wallH: number,
    seedBase: number,
  ) {
    // Edge overhangs only — leave the center open to fog (breaks the sandwich-box lid)
    const rimPieces = Math.max(10, Math.floor((outerW + outerD) / 3.2))
    for (let i = 0; i < rimPieces; i++) {
      const t = i / rimPieces
      const ang = t * Math.PI * 2
      const rx = (outerW * 0.5 - 0.8) * (0.88 + hash01(seedBase + i) * 0.18)
      const rz = (outerD * 0.5 - 0.8) * (0.88 + hash01(seedBase + i + 2) * 0.18)
      const x = center.x + Math.cos(ang) * rx
      const z = center.z + Math.sin(ang) * rz
      const span = 2.2 + hash01(i * 4) * 2.8
      const y = wallH * (0.78 + hash01(i * 5) * 0.35)

      const overhang = MeshBuilder.CreateBox(
        `vaultRim_${i}`,
        {
          width: span,
          height: 0.55 + hash01(i + 3) * 0.45,
          depth: 1.4 + hash01(i + 6) * 1.6,
        },
        this.scene,
      )
      overhang.position = new Vector3(x, y, z)
      overhang.rotation.y = ang + Math.PI / 2
      overhang.rotation.x = (hash01(i + 8) - 0.5) * 0.2
      overhang.material = this.darkRockMat
      overhang.parent = this.root
      this.shadowGenerator.addShadowCaster(overhang)
    }

    // A few high floating vault chunks (never a full closed ceiling)
    const chunks = 5 + Math.floor((outerW * outerD) / 120)
    for (let i = 0; i < chunks; i++) {
      const x = center.x + (hash01(seedBase + i * 9) - 0.5) * outerW * 0.55
      const z = center.z + (hash01(seedBase + i * 11) - 0.5) * outerD * 0.55
      const y = wallH * (1.05 + hash01(i * 7) * 0.45)
      const chunk = MeshBuilder.CreateBox(
        `vaultChunk_${i}`,
        {
          width: 2.5 + hash01(i) * 3.5,
          height: 0.7 + hash01(i + 1) * 0.8,
          depth: 2.2 + hash01(i + 2) * 3,
        },
        this.scene,
      )
      chunk.position = new Vector3(x, y, z)
      chunk.rotation.y = hash01(i + 12) * Math.PI
      chunk.material = hash01(i + 14) > 0.85 ? this.rockMat : this.darkRockMat
      chunk.parent = this.root
    }

    // Stalactites hanging from rim / chunks, sparse so the vault stays open
    const spikes = Math.floor((outerW + outerD) * 0.9)
    for (let i = 0; i < spikes; i++) {
      const ang = hash01(seedBase + i * 3) * Math.PI * 2
      const radial = 0.35 + hash01(seedBase + i * 5) * 0.55
      const x = center.x + Math.cos(ang) * (outerW * 0.5 * radial)
      const z = center.z + Math.sin(ang) * (outerD * 0.5 * radial)
      const h = 0.45 + hash01(seedBase + i * 7) * 1.35
      const y = wallH * (0.85 + hash01(i) * 0.35)
      const spike = MeshBuilder.CreateCylinder(
        `stalactite_${i}`,
        {
          height: h,
          diameterTop: 0.02,
          diameterBottom: 0.16 + hash01(i) * 0.22,
          tessellation: 6,
        },
        this.scene,
      )
      spike.position = new Vector3(x, y - h / 2, z)
      spike.material = hash01(i + 40) > 0.9 ? this.oreMat : this.rockMat
      spike.parent = this.root
    }
  }

  private planeBuildTorches(
    center: { x: number; z: number },
    floorW: number,
    floorD: number,
    wallH: number,
  ) {
    const torchMat = new StandardMaterial('torchFlame', this.scene)
    torchMat.diffuseColor = new Color3(1, 0.55, 0.15)
    torchMat.emissiveColor = new Color3(0.95, 0.45, 0.08)
    torchMat.specularColor = new Color3(0, 0, 0)

    const holderMat = new StandardMaterial('torchHolder', this.scene)
    holderMat.diffuseColor = new Color3(0.2, 0.14, 0.08)

    const insetX = Math.min(floorW * 0.3, 4.5)
    const insetZ = Math.min(floorD * 0.3, 4.5)

    const spots: Array<{ x: number; z: number }> = [
      { x: center.x - insetX, z: center.z - insetZ },
      { x: center.x + insetX, z: center.z - insetZ },
      { x: center.x - insetX, z: center.z + insetZ },
      { x: center.x + insetX, z: center.z + insetZ },
      { x: center.x, z: center.z - insetZ * 1.05 },
      { x: center.x, z: center.z + insetZ * 1.05 },
      { x: center.x - insetX * 1.05, z: center.z },
      { x: center.x + insetX * 1.05, z: center.z },
    ]

    // Far wall torches so the broader cavern still has depth lighting
    spots.push(
      { x: center.x - floorW * 0.38, z: center.z - floorD * 0.42 },
      { x: center.x + floorW * 0.38, z: center.z - floorD * 0.42 },
      { x: center.x - floorW * 0.38, z: center.z + floorD * 0.42 },
      { x: center.x + floorW * 0.38, z: center.z + floorD * 0.42 },
    )

    spots.forEach((spot, i) => {
      const y = wallH * 0.55
      const stick = MeshBuilder.CreateCylinder(
        `torchStick_${i}`,
        { height: 0.45, diameter: 0.07 },
        this.scene,
      )
      stick.position = new Vector3(spot.x, y, spot.z)
      stick.material = holderMat
      stick.parent = this.root

      const flame = MeshBuilder.CreateSphere(
        `torchFlame_${i}`,
        { diameter: 0.22, segments: 8 },
        this.scene,
      )
      flame.position = new Vector3(spot.x, y + 0.28, spot.z)
      flame.scaling.y = 1.35
      flame.material = torchMat
      flame.parent = this.root

      const light = new PointLight(
        `torchLight_${i}`,
        new Vector3(flame.position.x, flame.position.y, flame.position.z),
        this.scene,
      )
      light.diffuse = new Color3(1, 0.62, 0.28)
      light.specular = new Color3(0.4, 0.2, 0.05)
      light.intensity = i < 8 ? 0.95 : 0.7
      light.range = i < 8 ? 14 : 16
      this.torchLights.push(light)
    })
  }
}
