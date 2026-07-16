import { DIRECTION_DELTA, type GameSnapshot } from '../game/types'

type MiniCell = 'rock' | 'floor' | 'mine' | 'flag' | 'focus' | 'ring'

/** 3×3 mini-grid; center is the numbered tile, ring = counted neighbors. */
function miniGrid(cells: MiniCell[][], centerLabel: string) {
  const rows = cells
    .map((row) => {
      const cols = row
        .map((kind) => {
          const isCenter = kind === 'focus'
          const numClass =
            centerLabel >= '0' && centerLabel <= '8'
              ? ` hud-mini-num--n${centerLabel}`
              : ''
          const inner = isCenter
            ? `<span class="hud-mini-num${numClass}">${centerLabel}</span>`
            : kind === 'mine'
              ? '<span class="hud-mini-mine" aria-hidden="true"></span>'
              : kind === 'flag'
                ? '<span class="hud-mini-flag" aria-hidden="true">F</span>'
                : ''
          return `<div class="hud-mini-cell hud-mini-cell--${kind}">${inner}</div>`
        })
        .join('')
      return `<div class="hud-mini-row">${cols}</div>`
    })
    .join('')
  return `<div class="hud-mini-grid" role="img">${rows}</div>`
}

const NEIGHBOR_RING: MiniCell[][] = [
  ['ring', 'ring', 'ring'],
  ['ring', 'focus', 'ring'],
  ['ring', 'ring', 'ring'],
]

const DEMO_ONE: MiniCell[][] = [
  ['rock', 'mine', 'rock'],
  ['floor', 'focus', 'floor'],
  ['floor', 'floor', 'floor'],
]

const DEMO_TWO: MiniCell[][] = [
  ['rock', 'mine', 'rock'],
  ['floor', 'focus', 'rock'],
  ['rock', 'mine', 'rock'],
]

const DEMO_ZERO: MiniCell[][] = [
  ['floor', 'floor', 'floor'],
  ['floor', 'focus', 'floor'],
  ['floor', 'floor', 'floor'],
]

export function trainingTipsMarkup() {
  return `
    <div class="hud-train-wrap" data-train hidden>
      <aside class="hud-train">
        <p class="hud-train-title">How numbers work</p>

        <div class="hud-tip-card">
          <p class="hud-tip-label">Eight neighbors</p>
          ${miniGrid(NEIGHBOR_RING, '?')}
          <p class="hud-tip-caption">
            Each glowing number counts <b>charges in the 8 cells touching that tile</b> — including diagonals.
          </p>
        </div>

        <div class="hud-tip-card">
          <p class="hud-tip-label">Reading a <span class="hud-tip-num hud-tip-num--1">1</span></p>
          ${miniGrid(DEMO_ONE, '1')}
          <p class="hud-tip-caption">
            A <b>1</b> means one neighbor is charged — the other seven are safe once you've found that charge.
          </p>
        </div>

        <div class="hud-tip-card">
          <p class="hud-tip-label">Reading a <span class="hud-tip-num hud-tip-num--2">2</span></p>
          ${miniGrid(DEMO_TWO, '2')}
          <p class="hud-tip-caption">
            This tile shows <b>2</b>, so exactly two of its neighbors hide a charge. The rest are safe to dig.
          </p>
        </div>

        <div class="hud-tip-card">
          <p class="hud-tip-label">Empty <span class="hud-tip-num hud-tip-num--0">0</span></p>
          ${miniGrid(DEMO_ZERO, '0')}
          <p class="hud-tip-caption">
            <b>0</b> means no charges nearby — digging it clears a whole safe pocket at once.
          </p>
        </div>

        <div class="hud-tip-card hud-tip-card--controls">
          <p class="hud-tip-label">Your tools</p>
          <div class="hud-tip-tools">
            <div><kbd>Space</kbd> dig the rock you face</div>
            <div><kbd>F</kbd> flag a suspected charge</div>
            <div><kbd>WASD</kbd> walk · <kbd>Q/E</kbd> turn</div>
          </div>
        </div>
      </aside>

      <div class="hud-train-live-stack">
        <aside class="hud-train-live hud-train-live--on" data-train-on hidden>
          <p class="hud-train-title">Tile on</p>
          <div data-train-on-grid></div>
          <p class="hud-tip-caption" data-train-on-caption></p>
        </aside>
        <aside class="hud-train-live hud-train-live--ahead" data-train-live hidden>
          <p class="hud-train-title">Tile ahead</p>
          <div data-train-live-grid></div>
          <p class="hud-tip-caption" data-train-live-caption></p>
        </aside>
      </div>
    </div>
  `
}

function cellAt(snapshot: GameSnapshot, row: number, col: number) {
  if (row < 0 || col < 0 || row >= snapshot.rows || col >= snapshot.cols) return null
  return snapshot.cells[row][col]
}

function facingCell(snapshot: GameSnapshot) {
  const delta = DIRECTION_DELTA[snapshot.player.facing]
  return cellAt(snapshot, snapshot.player.row + delta.row, snapshot.player.col + delta.col)
}

function standingCell(snapshot: GameSnapshot) {
  return cellAt(snapshot, snapshot.player.row, snapshot.player.col)
}

function isNumberedTile(cell: NonNullable<ReturnType<typeof cellAt>>) {
  return cell.status === 'revealed' && !cell.isMine
}

function neighborKinds(snapshot: GameSnapshot, row: number, col: number): MiniCell[][] {
  const grid: MiniCell[][] = []
  for (let dr = -1; dr <= 1; dr++) {
    const line: MiniCell[] = []
    for (let dc = -1; dc <= 1; dc++) {
      const r = row + dr
      const c = col + dc
      if (dr === 0 && dc === 0) {
        line.push('focus')
        continue
      }
      if (r < 0 || c < 0 || r >= snapshot.rows || c >= snapshot.cols) {
        line.push('rock')
        continue
      }
      const cell = snapshot.cells[r][c]
      if (cell.status === 'flagged') line.push('flag')
      else if (cell.isMine && cell.status === 'revealed') line.push('mine')
      else if (cell.status === 'revealed') line.push('floor')
      else line.push('rock')
    }
    grid.push(line)
  }
  return grid
}

function fillLiveCard(
  card: HTMLElement,
  gridHost: HTMLElement,
  caption: HTMLElement,
  snapshot: GameSnapshot,
  cell: NonNullable<ReturnType<typeof cellAt>>,
  kind: 'on' | 'ahead',
) {
  const n = cell.adjacent
  gridHost.innerHTML = miniGrid(neighborKinds(snapshot, cell.row, cell.col), String(n))

  if (kind === 'on') {
    if (n === 0) {
      caption.innerHTML =
        "You're standing on a <b>0</b> — no charges touch this tile. Dig any covered neighbor safely."
    } else {
      caption.innerHTML = `You're standing on a <b>${n}</b> — ${
        n === 1 ? 'one charge sits' : `${n} charges sit`
      } among the 8 neighbors around you.`
    }
  } else if (n === 0) {
    caption.innerHTML =
      'No charges touch this tile — safe to dig; it will open the whole pocket around it.'
  } else {
    caption.innerHTML = `You're facing a <b>${n}</b> — count ${
      n === 1 ? 'one charge' : `${n} charges`
    } among the 8 neighbors.`
  }

  card.hidden = false
}

export function updateTrainingLiveTip(root: HTMLElement, snapshot: GameSnapshot) {
  const onCard = root.querySelector('[data-train-on]') as HTMLElement
  const onGrid = root.querySelector('[data-train-on-grid]') as HTMLElement
  const onCaption = root.querySelector('[data-train-on-caption]') as HTMLElement
  const aheadCard = root.querySelector('[data-train-live]') as HTMLElement
  const aheadGrid = root.querySelector('[data-train-live-grid]') as HTMLElement
  const aheadCaption = root.querySelector('[data-train-live-caption]') as HTMLElement
  if (!onCard || !onGrid || !onCaption || !aheadCard || !aheadGrid || !aheadCaption) return

  const standing = standingCell(snapshot)
  if (standing && isNumberedTile(standing)) {
    fillLiveCard(onCard, onGrid, onCaption, snapshot, standing, 'on')
  } else {
    onCard.hidden = true
  }

  const facing = facingCell(snapshot)
  if (facing && isNumberedTile(facing)) {
    fillLiveCard(aheadCard, aheadGrid, aheadCaption, snapshot, facing, 'ahead')
  } else {
    aheadCard.hidden = true
  }
}
