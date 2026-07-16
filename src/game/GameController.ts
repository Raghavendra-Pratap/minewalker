import {
  countCleared,
  countFlags,
  createBoard,
  expandBoard,
  isWalkable,
  needsExpand,
  openSafePad,
  paddingNeededForDig,
  revealCell,
  toggleFlag,
  defaultSpawn,
} from './board'
import {
  DIRECTION_DELTA,
  GAME_MODES,
  type Board,
  type Cell,
  type Direction,
  type GameModeId,
  type GameSnapshot,
  type GameStatus,
  type PlayerState,
} from './types'

export type GameListener = (event: GameEvent) => void

export interface RevealResult {
  opened: Cell[]
  hitMine: boolean
  status: GameStatus
  exploded: { row: number; col: number } | null
}

export interface GameEvent {
  snapshot: GameSnapshot
  opened: Cell[]
  exploded: { row: number; col: number } | null
}

export class GameController {
  private board: Board
  private status: GameStatus = 'ready'
  private modeId: GameModeId = 'beginner'
  private elapsedSeconds = 0
  private timerId: number | null = null
  private startedAt: number | null = null
  private listeners = new Set<GameListener>()
  private player: PlayerState
  private moveGate = true
  private runId = 0

  constructor(mode: GameModeId = 'beginner') {
    this.modeId = mode
    this.board = this.createModeBoard()
    this.player = this.createPlayer()
    this.openSpawnSanctuary()
  }

  subscribe(listener: GameListener) {
    this.listeners.add(listener)
    listener({ snapshot: this.getSnapshot(), opened: [], exploded: null })
    return () => this.listeners.delete(listener)
  }

  getMode() {
    return this.modeId
  }

  setMode(mode: GameModeId) {
    if (this.modeId === mode) {
      this.restart()
      return
    }
    this.modeId = mode
    this.restart()
  }

  getSnapshot(): GameSnapshot {
    const mode = GAME_MODES[this.modeId]
    return {
      status: this.status,
      mode: this.modeId,
      layout: mode.layout,
      runId: this.runId,
      rows: this.board.rows,
      cols: this.board.cols,
      mines: this.board.mines,
      flagsRemaining: Math.max(0, this.board.mines - countFlags(this.board)),
      cleared: countCleared(this.board),
      elapsedSeconds: this.elapsedSeconds,
      cells: this.board.cells.map((row) => row.map((cell) => ({ ...cell }))),
      player: { ...this.player },
    }
  }

  getCell(row: number, col: number) {
    return this.board.cells[row]?.[col] ?? null
  }

  restart() {
    this.stopTimer()
    this.status = 'ready'
    this.elapsedSeconds = 0
    this.startedAt = null
    this.moveGate = true
    this.runId += 1
    this.board = this.createModeBoard()
    this.player = this.createPlayer()
    this.openSpawnSanctuary()
    this.emit([], null)
  }

  /** Face a direction; if the neighbor is walkable, step onto it. */
  tryMove(direction: Direction) {
    if (!this.player.alive || this.status === 'lost' || this.status === 'won') return false

    // Always update facing so dig/flag match the last pressed direction
    this.player.facing = direction

    if (!this.moveGate) {
      this.emit([], null)
      return false
    }

    const delta = DIRECTION_DELTA[direction]
    const nextRow = this.player.row + delta.row
    const nextCol = this.player.col + delta.col

    if (!isWalkable(this.board, nextRow, nextCol)) {
      this.emit([], null)
      return false
    }

    this.moveGate = false
    this.player.row = nextRow
    this.player.col = nextCol
    this.emit([], null)
    window.setTimeout(() => {
      this.moveGate = true
    }, 120)
    return true
  }

  /** Turn to face a cardinal without stepping. */
  faceToward(direction: Direction) {
    if (!this.player.alive || this.status === 'lost' || this.status === 'won') return
    this.player.facing = direction
    this.emit([], null)
  }

  /** Dig / reveal the crate in front of the player. */
  digAhead(): RevealResult {
    const target = this.facingCell()
    if (!target) {
      return { opened: [], hitMine: false, status: this.status, exploded: null }
    }
    return this.reveal(target.row, target.col)
  }

  /** Dig the neighbor in an explicit direction. */
  digIn(direction: Direction): RevealResult {
    this.faceToward(direction)
    return this.digAhead()
  }

  /** Flag / unflag the crate in front of the player. */
  flagAhead(): Cell | null {
    const target = this.facingCell()
    if (!target) return null
    return this.flag(target.row, target.col)
  }

  /** Flag the neighbor in an explicit direction. */
  flagIn(direction: Direction): Cell | null {
    this.faceToward(direction)
    return this.flagAhead()
  }

  getPlayer() {
    return { ...this.player }
  }

  reveal(row: number, col: number): RevealResult {
    if (this.status === 'lost' || this.status === 'won' || !this.player.alive) {
      return { opened: [], hitMine: false, status: this.status, exploded: null }
    }

    const cell = this.board.cells[row]?.[col]
    if (!cell || cell.status === 'flagged' || cell.status === 'revealed') {
      return { opened: [], hitMine: false, status: this.status, exploded: null }
    }

    const densityOpts = this.mineOptions()
    const { board, opened, hitMine } = revealCell(this.board, row, col, densityOpts)
    this.board = board

    if (this.status === 'ready' && (opened.length > 0 || hitMine)) {
      this.status = 'playing'
      this.startTimer()
    }

    if (hitMine) {
      this.status = 'lost'
      this.player.alive = false
      this.stopTimer()
      const exploded = { row, col }
      this.emit(opened, exploded)
      return { opened, hitMine: true, status: this.status, exploded }
    }

    if (GAME_MODES[this.modeId].endless) {
      this.expandForOpened(opened)
    } else if (this.checkWin()) {
      this.status = 'won'
      this.stopTimer()
      this.emit(opened, null)
      return { opened, hitMine: false, status: this.status, exploded: null }
    }

    this.emit(opened, null)
    return { opened, hitMine: false, status: this.status, exploded: null }
  }

  flag(row: number, col: number): Cell | null {
    if (this.status === 'lost' || this.status === 'won' || !this.player.alive) return null

    const { board, changed } = toggleFlag(this.board, row, col)
    this.board = board
    if (changed) this.emit([], null)
    return changed
  }

  private checkWin() {
    if (!this.board.generated) return false
    const safeTotal = this.board.rows * this.board.cols - this.board.mines
    return safeTotal > 0 && countCleared(this.board) >= safeTotal
  }

  private expandForOpened(opened: Cell[]) {
    if (opened.length === 0) return

    const padding = { north: 0, south: 0, east: 0, west: 0 }
    for (const cell of opened) {
      const need = paddingNeededForDig(this.board, cell.row, cell.col)
      padding.north = Math.max(padding.north, need.north)
      padding.south = Math.max(padding.south, need.south)
      padding.east = Math.max(padding.east, need.east)
      padding.west = Math.max(padding.west, need.west)
    }

    if (!needsExpand(padding)) return

    const { board, shiftRow, shiftCol } = expandBoard(this.board, padding)
    this.board = board
    this.player.row += shiftRow
    this.player.col += shiftCol
    for (const cell of opened) {
      cell.row += shiftRow
      cell.col += shiftCol
    }
  }

  private facingCell(): { row: number; col: number } | null {
    const delta = DIRECTION_DELTA[this.player.facing]
    const row = this.player.row + delta.row
    const col = this.player.col + delta.col
    if (row < 0 || col < 0 || row >= this.board.rows || col >= this.board.cols) return null
    return { row, col }
  }

  private createModeBoard(): Board {
    const mode = GAME_MODES[this.modeId]
    return createBoard(mode.startRows, mode.startCols)
  }

  private createPlayer(): PlayerState {
    const mode = GAME_MODES[this.modeId]
    const spawn = defaultSpawn(this.board.rows, this.board.cols, mode.layout)
    return {
      row: spawn.row,
      col: spawn.col,
      facing: mode.layout === 'plane' ? 'south' : 'east',
      alive: true,
    }
  }

  /** Carve a tight safe pad around spawn so stone rock stays close and readable. */
  private openSpawnSanctuary() {
    this.board = openSafePad(
      this.board,
      this.player.row,
      this.player.col,
      this.mineOptions(),
    )
    this.status = 'ready'
  }

  private mineOptions(): { mineCount?: number; mineDensity?: number } {
    const mode = GAME_MODES[this.modeId]
    if (mode.mines != null) return { mineCount: mode.mines }
    return { mineDensity: mode.mineDensity }
  }

  private startTimer() {
    this.stopTimer()
    this.startedAt = performance.now()
    this.timerId = window.setInterval(() => {
      if (this.startedAt === null) return
      this.elapsedSeconds = Math.floor((performance.now() - this.startedAt) / 1000)
      this.emit([], null)
    }, 250)
  }

  private stopTimer() {
    if (this.timerId !== null) {
      window.clearInterval(this.timerId)
      this.timerId = null
    }
  }

  private emit(opened: Cell[] = [], exploded: { row: number; col: number } | null = null) {
    const snapshot = this.getSnapshot()
    for (const listener of this.listeners) listener({ snapshot, opened, exploded })
  }
}
