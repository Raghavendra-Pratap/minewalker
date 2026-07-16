import type { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial'
import { Color3 } from '@babylonjs/core/Maths/math'

/** Allow headlamp + torches + fill lights to all contribute. */
export const MAX_LIGHTS = 8

/** Soft cave fill so materials aren't crushed black when lamps fall off. */
export const CAVE_AMBIENT = new Color3(0.1, 0.09, 0.08)

export function tuneLitMaterial(mat: StandardMaterial) {
  mat.maxSimultaneousLights = MAX_LIGHTS
  if (mat.ambientColor.equals(Color3.Black())) {
    mat.ambientColor = CAVE_AMBIENT.clone()
  }
}
