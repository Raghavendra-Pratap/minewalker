import { ENDLESS_MINE, type Board, type Cell } from './types'

const NEIGHBOR_OFFSETS: Array<[number, number]> = [
  [-1, -1],
  [-1, 0],
  [-1, 1],
  [0, -1],
  [0, 1],
  [1, -1],
  [1, 0],
  [1, 1],
]

export interface ExpandPadding {
  north: number
  south: number
  east: number
  west: number
}

export function createBoard(rows: number, cols: number): Board {
  const cells: Cell[][] = []
  for (let row = 0; row < rows; row++) {
    const line: Cell[] = []
    for (let col = 0; col < cols; col++) {
      line.push({
        row,
        col,
        isMine: false,
        adjacent: 0,
        status: 'covered',
      })
    }
    cells.push(line)
  }

  return {
    rows,
    cols,
    mines: 0,
    cells,
    generated: false,
  }
}

export function createEndlessBoard(
  rows = ENDLESS_MINE.startRows,
  cols = ENDLESS_MINE.startCols,
): Board {
  return createBoard(rows, cols)
}

export function inBounds(board: Board, row: number, col: number) {
  return row >= 0 && row < board.rows && col >= 0 && col < board.cols
}

export function forEachNeighbor(
  board: Board,
  row: number,
  col: number,
  visit: (cell: Cell) => void,
) {
  for (const [dr, dc] of NEIGHBOR_OFFSETS) {
    const nr = row + dr
    const nc = col + dc
    if (!inBounds(board, nr, nc)) continue
    visit(board.cells[nr][nc])
  }
}

function cloneBoardShell(board: Board): Board {
  return {
    rows: board.rows,
    cols: board.cols,
    mines: board.mines,
    generated: board.generated,
    cells: board.cells.map((row) => row.map((cell) => ({ ...cell }))),
  }
}

function recountMines(board: Board) {
  let mines = 0
  for (const row of board.cells) {
    for (const cell of row) {
      if (cell.isMine) mines += 1
    }
  }
  board.mines = mines
}

function recomputeAdjacents(board: Board) {
  for (let row = 0; row < board.rows; row++) {
    for (let col = 0; col < board.cols; col++) {
      const cell = board.cells[row][col]
      if (cell.isMine) {
        cell.adjacent = 0
        continue
      }
      let count = 0
      forEachNeighbor(board, row, col, (n) => {
        if (n.isMine) count += 1
      })
      cell.adjacent = count
    }
  }
}

function reindexCells(board: Board) {
  for (let row = 0; row < board.rows; row++) {
    for (let col = 0; col < board.cols; col++) {
      board.cells[row][col].row = row
      board.cells[row][col].col = col
    }
  }
}

/** Place mines after the first dig so that cell (and its neighborhood) is safe. */
export function generateMines(
  board: Board,
  safeRow: number,
  safeCol: number,
  options: { mineCount?: number; mineDensity?: number } = {},
): Board {
  const next = cloneBoardShell(board)
  const forbidden = new Set<string>()
  forbidden.add(`${safeRow},${safeCol}`)
  forEachNeighbor(next, safeRow, safeCol, (cell) => {
    forbidden.add(`${cell.row},${cell.col}`)
  })

  const candidates: Array<{ row: number; col: number }> = []
  for (let row = 0; row < next.rows; row++) {
    for (let col = 0; col < next.cols; col++) {
      if (forbidden.has(`${row},${col}`)) continue
      candidates.push({ row, col })
    }
  }

  for (let i = candidates.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[candidates[i], candidates[j]] = [candidates[j], candidates[i]]
  }

  const density = options.mineDensity ?? ENDLESS_MINE.mineDensity ?? 0.15
  const targetMines =
    options.mineCount != null
      ? options.mineCount
      : Math.max(1, Math.floor(candidates.length * density))
  const mineCount = Math.min(Math.max(0, targetMines), candidates.length)
  for (let i = 0; i < mineCount; i++) {
    const { row, col } = candidates[i]
    next.cells[row][col].isMine = true
  }

  recomputeAdjacents(next)
  recountMines(next)
  next.generated = true
  return next
}

export function countFlags(board: Board) {
  let flags = 0
  for (const row of board.cells) {
    for (const cell of row) {
      if (cell.status === 'flagged') flags += 1
    }
  }
  return flags
}

export function countCleared(board: Board) {
  let cleared = 0
  for (const row of board.cells) {
    for (const cell of row) {
      if (!cell.isMine && cell.status === 'revealed') cleared += 1
    }
  }
  return cleared
}

/** Covered / flagged crates block the player; revealed floors are walkable. */
export function isWalkable(board: Board, row: number, col: number) {
  if (!inBounds(board, row, col)) return false
  return board.cells[row][col].status === 'revealed'
}

/** Open a small safe courtyard without flood-filling the whole shaft. */
export function openSafePad(
  board: Board,
  row: number,
  col: number,
  options: { mineCount?: number; mineDensity?: number } = {},
): Board {
  let working = board
  if (!working.generated) {
    working = generateMines(working, row, col, options)
  }

  const next = cloneBoardShell(working)
  for (let r = row - 1; r <= row + 1; r++) {
    for (let c = col - 1; c <= col + 1; c++) {
      if (!inBounds(next, r, c)) continue
      const cell = next.cells[r][c]
      if (cell.isMine) continue
      cell.status = 'revealed'
    }
  }
  return next
}

export function revealCell(
  board: Board,
  row: number,
  col: number,
  options: { mineCount?: number; mineDensity?: number } = {},
): { board: Board; opened: Cell[]; hitMine: boolean } {
  if (!inBounds(board, row, col)) {
    return { board, opened: [], hitMine: false }
  }

  let working = board
  if (!working.generated) {
    working = generateMines(working, row, col, options)
  }

  const next = cloneBoardShell(working)
  const start = next.cells[row][col]
  if (start.status === 'flagged' || start.status === 'revealed') {
    return { board: next, opened: [], hitMine: false }
  }

  if (start.isMine) {
    start.status = 'revealed'
    for (const line of next.cells) {
      for (const cell of line) {
        if (cell.isMine) cell.status = 'revealed'
      }
    }
    return { board: next, opened: [start], hitMine: true }
  }

  const opened: Cell[] = []
  const queue: Array<{ row: number; col: number }> = [{ row, col }]
  const seen = new Set<string>()

  while (queue.length > 0) {
    const current = queue.shift()!
    const key = `${current.row},${current.col}`
    if (seen.has(key)) continue
    seen.add(key)

    const cell = next.cells[current.row][current.col]
    if (cell.status === 'flagged' || cell.status === 'revealed' || cell.isMine) continue

    cell.status = 'revealed'
    opened.push({ ...cell })

    if (cell.adjacent === 0) {
      forEachNeighbor(next, cell.row, cell.col, (n) => {
        if (n.status === 'covered' && !n.isMine) {
          queue.push({ row: n.row, col: n.col })
        }
      })
    }
  }

  return { board: next, opened, hitMine: false }
}

export function toggleFlag(
  board: Board,
  row: number,
  col: number,
): { board: Board; changed: Cell | null } {
  if (!inBounds(board, row, col)) {
    return { board, changed: null }
  }

  const next = cloneBoardShell(board)
  const cell = next.cells[row][col]
  if (cell.status === 'revealed') {
    return { board: next, changed: null }
  }

  cell.status = cell.status === 'flagged' ? 'covered' : 'flagged'
  return { board: next, changed: { ...cell } }
}

/** Entrance: west mouth for tunnels, board center for classic planes. */
export function defaultSpawn(
  rows: number,
  cols: number,
  layout: 'plane' | 'tunnel' = 'tunnel',
) {
  if (layout === 'plane') {
    return { row: Math.floor(rows / 2), col: Math.floor(cols / 2) }
  }
  return { row: Math.floor(rows / 2), col: 1 }
}

export function paddingNeededForDig(board: Board, row: number, col: number): ExpandPadding {
  const m = ENDLESS_MINE.expandMargin ?? 4
  const chunk = ENDLESS_MINE.expandChunk ?? 12
  const side = Math.max(4, Math.floor(chunk / 3))
  return {
    // Slight side growth only — stay a narrow gallery
    north: row < m ? side : 0,
    south: row >= board.rows - m ? side : 0,
    // Sealed mouth behind the miner — never grow west
    west: 0,
    // The working face: keep expanding into the mountain
    east: col >= board.cols - m ? chunk : 0,
  }
}

export function needsExpand(padding: ExpandPadding) {
  return padding.north + padding.south + padding.east + padding.west > 0
}

function makeBlankCell(row: number, col: number): Cell {
  return {
    row,
    col,
    isMine: false,
    adjacent: 0,
    status: 'covered',
  }
}

function hasRevealedNeighbor(board: Board, row: number, col: number) {
  let found = false
  forEachNeighbor(board, row, col, (n) => {
    if (n.status === 'revealed' && !n.isMine) found = true
  })
  return found
}

/**
 * Grow the mine in the given directions. Returns the expanded board and how
 * much existing coordinates shifted (for remapping the player).
 */
export function expandBoard(
  board: Board,
  padding: ExpandPadding,
): { board: Board; shiftRow: number; shiftCol: number } {
  if (!needsExpand(padding)) {
    return { board, shiftRow: 0, shiftCol: 0 }
  }

  const newRows = board.rows + padding.north + padding.south
  const newCols = board.cols + padding.east + padding.west
  const cells: Cell[][] = []

  for (let row = 0; row < newRows; row++) {
    const line: Cell[] = []
    for (let col = 0; col < newCols; col++) {
      const oldRow = row - padding.north
      const oldCol = col - padding.west
      if (oldRow >= 0 && oldRow < board.rows && oldCol >= 0 && oldCol < board.cols) {
        const src = board.cells[oldRow][oldCol]
        line.push({ ...src, row, col })
      } else {
        line.push(makeBlankCell(row, col))
      }
    }
    cells.push(line)
  }

  const next: Board = {
    rows: newRows,
    cols: newCols,
    mines: board.mines,
    generated: board.generated,
    cells,
  }

  if (next.generated) {
    // Seed new rock with mines, but keep the diggable fringe safe.
    for (let row = 0; row < next.rows; row++) {
      for (let col = 0; col < next.cols; col++) {
        const oldRow = row - padding.north
        const oldCol = col - padding.west
        const isNew =
          oldRow < 0 || oldRow >= board.rows || oldCol < 0 || oldCol >= board.cols
        if (!isNew) continue
        if (hasRevealedNeighbor(next, row, col)) continue
        if (Math.random() < (ENDLESS_MINE.mineDensity ?? 0.15)) {
          next.cells[row][col].isMine = true
        }
      }
    }
    recomputeAdjacents(next)
    recountMines(next)
  }

  reindexCells(next)
  return {
    board: next,
    shiftRow: padding.north,
    shiftCol: padding.west,
  }
}
