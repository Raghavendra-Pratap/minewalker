import { ArcRotateCamera } from '@babylonjs/core/Cameras/arcRotateCamera'
import { HemisphericLight } from '@babylonjs/core/Lights/hemisphericLight'
import { DirectionalLight } from '@babylonjs/core/Lights/directionalLight'
import { ShadowGenerator } from '@babylonjs/core/Lights/Shadows/shadowGenerator'
import { Color3, Color4, Vector3 } from '@babylonjs/core/Maths/math'
import { Engine } from '@babylonjs/core/Engines/engine'
import { Scene } from '@babylonjs/core/scene'
import '@babylonjs/core/Lights/Shadows/shadowGeneratorSceneComponent'

export interface SceneBundle {
  engine: Engine
  scene: Scene
  camera: ArcRotateCamera
  shadowGenerator: ShadowGenerator
  hemi: HemisphericLight
  shaft: DirectionalLight
}

export function createScene(canvas: HTMLCanvasElement): SceneBundle {
  const engine = new Engine(canvas, true, {
    preserveDrawingBuffer: true,
    stencil: true,
    adaptToDeviceRatio: true,
  })

  const scene = new Scene(engine)
  scene.clearColor = new Color4(0.01, 0.01, 0.012, 1)
  scene.fogMode = Scene.FOGMODE_EXP2
  scene.fogDensity = 0.038
  scene.fogColor = new Color3(0.02, 0.016, 0.012)
  scene.ambientColor = new Color3(0.06, 0.05, 0.04)

  const camera = new ArcRotateCamera(
    'camera',
    -Math.PI / 2,
    Math.PI / 3.1,
    28,
    Vector3.Zero(),
    scene,
  )
  camera.lowerRadiusLimit = 8
  camera.upperRadiusLimit = 90
  // Keep a downward overview — β near π/2 looks sideways into the floor slab
  camera.lowerBetaLimit = 0.42
  camera.upperBetaLimit = Math.PI / 2.55
  camera.wheelPrecision = 20
  camera.panningSensibility = 0
  camera.minZ = 0.5
  camera.attachControl(canvas, true)

  const pointers = camera.inputs.attached.pointers as { buttons?: number[] } | undefined
  if (pointers) pointers.buttons = [0]

  const hemi = new HemisphericLight('caveFill', new Vector3(0.15, 1, 0.2), scene)
  hemi.intensity = 0.22
  hemi.groundColor = new Color3(0.04, 0.035, 0.03)
  hemi.diffuse = new Color3(0.45, 0.48, 0.52)

  const shaft = new DirectionalLight('shaft', new Vector3(-0.25, -1, 0.2), scene)
  shaft.position = new Vector3(6, 22, -4)
  shaft.intensity = 0.28
  shaft.diffuse = new Color3(0.7, 0.6, 0.45)
  shaft.shadowEnabled = true

  const shadowGenerator = new ShadowGenerator(2048, shaft)
  shadowGenerator.useBlurExponentialShadowMap = true
  shadowGenerator.blurKernel = 24
  shadowGenerator.setDarkness(0.45)

  engine.runRenderLoop(() => {
    scene.render()
  })

  window.addEventListener('resize', () => engine.resize())

  return { engine, scene, camera, shadowGenerator, hemi, shaft }
}
