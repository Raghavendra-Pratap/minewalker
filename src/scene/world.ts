export const TILE = 1
export const GAP = 0.06
export const STEP = TILE + GAP
export const FLOOR_Y = 0
export const CRATE_HEIGHT = 0.92
export const FLOOR_THICKNESS = 0.12

export function cellToWorld(row: number, col: number) {
  return {
    x: col * STEP,
    z: row * STEP,
  }
}

export function boardCenter(rows: number, cols: number) {
  return {
    x: ((cols - 1) * STEP) / 2,
    z: ((rows - 1) * STEP) / 2,
  }
}
