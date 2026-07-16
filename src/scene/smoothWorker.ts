/**
 * Soften Quaternius Worker for Babylon — mirrors frontend-dev smoothBody.js:
 * average normals across coincident verts (no topology change → skin stays intact),
 * then Phong-like StandardMaterial.
 */
import { Color3 } from '@babylonjs/core/Maths/math'
import { Mesh } from '@babylonjs/core/Meshes/mesh'
import { VertexBuffer } from '@babylonjs/core/Buffers/buffer'
import { VertexData } from '@babylonjs/core/Meshes/mesh.vertexData'
import { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial'
import { PBRMaterial } from '@babylonjs/core/Materials/PBR/pbrMaterial'
import type { Material } from '@babylonjs/core/Materials/material'
import type { Scene } from '@babylonjs/core/scene'
import { tuneLitMaterial } from './lighting'

function toPhongish(raw: Material | null, scene: Scene, name: string): Material | null {
  if (!raw) return raw
  if (raw instanceof StandardMaterial) {
    raw.specularColor = new Color3(0.42, 0.42, 0.42)
    raw.specularPower = 56
    tuneLitMaterial(raw)
    return raw
  }
  if (raw instanceof PBRMaterial) {
    const std = new StandardMaterial(name || raw.name || 'workerPhong', scene)
    std.diffuseColor = raw.albedoColor?.clone() ?? new Color3(0.55, 0.55, 0.55)
    std.emissiveColor = raw.emissiveColor?.clone() ?? Color3.Black()
    std.specularColor = new Color3(0.42, 0.42, 0.42)
    std.specularPower = 56
    if (raw.albedoTexture) std.diffuseTexture = raw.albedoTexture
    std.transparencyMode = raw.transparencyMode
    std.alpha = raw.alpha
    tuneLitMaterial(std)
    /* Keep the PBR material alive — disposing can nuke shared GLTF textures. */
    return std
  }
  return raw
}

/**
 * Soft shading without welding: Quaternius ships hard-edge duplicate verts.
 * Averaging normals by position keeps skin weights / indices intact.
 */
function softNormalsByPosition(mesh: Mesh) {
  const positions = mesh.getVerticesData(VertexBuffer.PositionKind)
  const indices = mesh.getIndices()
  if (!positions || positions.length < 9) return

  const vertCount = positions.length / 3
  const faceNormals = new Float32Array(positions.length)

  /* Accumulate unnormalized face normals onto each corner. */
  if (indices && indices.length >= 3) {
    for (let i = 0; i < indices.length; i += 3) {
      const i0 = indices[i]! * 3
      const i1 = indices[i + 1]! * 3
      const i2 = indices[i + 2]! * 3
      const ax = positions[i0]!
      const ay = positions[i0 + 1]!
      const az = positions[i0 + 2]!
      const bx = positions[i1]!
      const by = positions[i1 + 1]!
      const bz = positions[i1 + 2]!
      const cx = positions[i2]!
      const cy = positions[i2 + 1]!
      const cz = positions[i2 + 2]!
      const ux = bx - ax
      const uy = by - ay
      const uz = bz - az
      const vx = cx - ax
      const vy = cy - ay
      const vz = cz - az
      const nx = uy * vz - uz * vy
      const ny = uz * vx - ux * vz
      const nz = ux * vy - uy * vx
      faceNormals[i0]! += nx
      faceNormals[i0 + 1]! += ny
      faceNormals[i0 + 2]! += nz
      faceNormals[i1]! += nx
      faceNormals[i1 + 1]! += ny
      faceNormals[i1 + 2]! += nz
      faceNormals[i2]! += nx
      faceNormals[i2 + 1]! += ny
      faceNormals[i2 + 2]! += nz
    }
  } else {
    VertexData.ComputeNormals(positions, null, faceNormals)
  }

  /* Bucket coincident verts (quantize) and average. */
  let extent = 0
  for (let i = 0; i < positions.length; i++) {
    extent = Math.max(extent, Math.abs(positions[i]!))
  }
  const quant = Math.max(1e-5, extent * 1e-5)
  const buckets = new Map<string, { nx: number; ny: number; nz: number; ids: number[] }>()

  for (let v = 0; v < vertCount; v++) {
    const i = v * 3
    const key = `${Math.round(positions[i]! / quant)}_${Math.round(positions[i + 1]! / quant)}_${Math.round(positions[i + 2]! / quant)}`
    let b = buckets.get(key)
    if (!b) {
      b = { nx: 0, ny: 0, nz: 0, ids: [] }
      buckets.set(key, b)
    }
    b.nx += faceNormals[i]!
    b.ny += faceNormals[i + 1]!
    b.nz += faceNormals[i + 2]!
    b.ids.push(v)
  }

  const soft = new Float32Array(positions.length)
  for (const b of buckets.values()) {
    const len = Math.hypot(b.nx, b.ny, b.nz) || 1
    const nx = b.nx / len
    const ny = b.ny / len
    const nz = b.nz / len
    for (const v of b.ids) {
      const i = v * 3
      soft[i] = nx
      soft[i + 1] = ny
      soft[i + 2] = nz
    }
  }

  mesh.setVerticesData(VertexBuffer.NormalKind, soft, true)
}

export function smoothWorkerMeshes(meshes: Mesh[]) {
  for (const mesh of meshes) {
    try {
      if (mesh.getTotalVertices() > 0) {
        if (mesh.skeleton) {
          /*
           * Never weld skinned meshes — forceSharedVertices corrupts influences
           * and freezes the body in bind pose while bones still animate.
           */
          softNormalsByPosition(mesh)
        } else {
          mesh.forceSharedVertices()
          mesh.createNormals(true)
        }
      }

      const scene = mesh.getScene()
      const mats = Array.isArray(mesh.material)
        ? mesh.material
        : mesh.material
          ? [mesh.material]
          : []
      const next = mats
        .map((m) => toPhongish(m, scene, m.name || `${mesh.name}_phong`))
        .filter((m): m is Material => !!m)
      if (next.length === 1) mesh.material = next[0]
      else if (next.length > 1) mesh.material = next as unknown as Material
    } catch (err) {
      console.warn('[smoothWorker] skipped', mesh.name, err)
    }
  }
}
