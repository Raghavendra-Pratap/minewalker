import type { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial'
import type { PointLight } from '@babylonjs/core/Lights/pointLight'
import type { SpotLight } from '@babylonjs/core/Lights/spotLight'
import { Color3 } from '@babylonjs/core/Maths/math'

/** Room for hemi + shaft + headlamp + nearby torches on ore tiles. */
export const MAX_LIGHTS = 16

/** Soft cave fill so materials aren't crushed black when lamps fall off. */
export const CAVE_AMBIENT = new Color3(0.1, 0.09, 0.08)

/** Warm pool around the brim — visible on the tile directly ahead. */
export const HEADLAMP_FILL_INTENSITY = 5.5
export const HEADLAMP_FILL_RANGE = 18
/** Forward beam: soft edge, enough punch to read on covered stone. */
export const HEADLAMP_BEAM_INTENSITY = 9.0
export const HEADLAMP_BEAM_RANGE = 21
export const HEADLAMP_BEAM_ANGLE = Math.PI / 2.4
export const HEADLAMP_BEAM_EXPONENT = 14
/** Pitch so the beam hits the ore crate one tile ahead, not over it. */
export const HEADLAMP_LOOK_DOWN = 0.58

const HEADLAMP_WARM = new Color3(1, 0.84, 0.58)
const HEADLAMP_FILL_SPEC = new Color3(0.06, 0.05, 0.025)
const HEADLAMP_BEAM_SPEC = new Color3(0.14, 0.1, 0.04)

/** Warm helmet pool + gentle forward beam. */
export function tuneHeadlampLights(lamp: PointLight, spot: SpotLight) {
  lamp.diffuse = HEADLAMP_WARM.clone()
  lamp.specular = HEADLAMP_FILL_SPEC.clone()
  lamp.intensity = HEADLAMP_FILL_INTENSITY
  lamp.range = HEADLAMP_FILL_RANGE

  spot.diffuse = HEADLAMP_WARM.clone()
  spot.specular = HEADLAMP_BEAM_SPEC.clone()
  spot.intensity = HEADLAMP_BEAM_INTENSITY
  spot.range = HEADLAMP_BEAM_RANGE
  spot.angle = HEADLAMP_BEAM_ANGLE
  spot.exponent = HEADLAMP_BEAM_EXPONENT
}

export function tuneLitMaterial(mat: StandardMaterial) {
  mat.maxSimultaneousLights = MAX_LIGHTS
  if (mat.ambientColor.equals(Color3.Black())) {
    mat.ambientColor = CAVE_AMBIENT.clone()
  }
}
