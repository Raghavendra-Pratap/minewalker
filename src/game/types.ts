export type CellStatus = 'covered' | 'revealed' | 'flagged'

export interface Cell {
  row: number
  col: number
  isMine: boolean
  adjacent: number
  status: CellStatus
}

export type GameStatus = 'ready' | 'playing' | 'won' | 'lost'

export type Direction = 'north' | 'south' | 'east' | 'west'

export const DIRECTION_DELTA: Record<Direction, { row: number; col: number }> = {
  north: { row: -1, col: 0 },
  south: { row: 1, col: 0 },
  east: { row: 0, col: 1 },
  west: { row: 0, col: -1 },
}

export const DIRECTION_YAW: Record<Direction, number> = {
  north: Math.PI,
  south: 0,
  east: Math.PI / 2,
  west: -Math.PI / 2,
}

/** Open rectangular field (classic) vs eastward tunnel gallery (endless). */
export type BoardLayout = 'plane' | 'tunnel'

/** Classic difficulties + endless mine + training yard. */
export type GameModeId = 'training' | 'beginner' | 'intermediate' | 'expert' | 'endless'

export interface GameMode {
  id: GameModeId
  label: string
  startRows: number
  startCols: number
  /** Fixed mine count (classic). Mutually preferred over density when set. */
  mines?: number
  mineDensity?: number
  layout: BoardLayout
  endless: boolean
  expandChunk?: number
  expandMargin?: number
}

/** Original v1 presets from the project plan, plus endless tunnel and training. */
export const GAME_MODES: Record<GameModeId, GameMode> = {
  training: {
    id: 'training',
    label: 'Training',
    startRows: 5,
    startCols: 5,
    mines: 3,
    layout: 'plane',
    endless: false,
  },
  beginner: {
    id: 'beginner',
    label: 'Beginner',
    startRows: 9,
    startCols: 9,
    mines: 10,
    layout: 'plane',
    endless: false,
  },
  intermediate: {
    id: 'intermediate',
    label: 'Intermediate',
    startRows: 16,
    startCols: 16,
    mines: 40,
    layout: 'plane',
    endless: false,
  },
  expert: {
    id: 'expert',
    label: 'Expert',
    startRows: 16,
    startCols: 30,
    mines: 99,
    layout: 'plane',
    endless: false,
  },
  endless: {
    id: 'endless',
    label: 'Endless',
    startRows: 11,
    startCols: 24,
    mineDensity: 0.15,
    layout: 'tunnel',
    endless: true,
    expandChunk: 12,
    expandMargin: 4,
  },
}

/** Alias for endless expand helpers. */
export const ENDLESS_MINE = GAME_MODES.endless

export interface Board {
  rows: number
  cols: number
  mines: number
  cells: Cell[][]
  generated: boolean
}

export interface PlayerState {
  row: number
  col: number
  facing: Direction
  alive: boolean
}

export interface GameSnapshot {
  status: GameStatus
  mode: GameModeId
  layout: BoardLayout
  /** Bumps on each New run / R so the scene can fully reset even if board size is unchanged. */
  runId: number
  rows: number
  cols: number
  mines: number
  flagsRemaining: number
  cleared: number
  elapsedSeconds: number
  cells: Cell[][]
  player: PlayerState
}
