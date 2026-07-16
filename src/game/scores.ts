import type { GameModeId } from './types'

const STORAGE_KEY = 'minewalker.scores.v1'

export interface ModeScore {
  /** Classic / training: best clear time in seconds (lower is better). */
  bestTimeSec?: number
  /** Endless: deepest safe stones cleared in a run (higher is better). */
  bestCleared?: number
  wins: number
  runs: number
  lastAt?: string
}

export type ScoreBoard = Partial<Record<GameModeId, ModeScore>>

export interface RunResult {
  mode: GameModeId
  elapsedSeconds: number
  cleared: number
  won: boolean
}

export interface RecordResult {
  score: ModeScore
  isNewBest: boolean
  previousBestTimeSec?: number
  previousBestCleared?: number
}

function emptyScore(): ModeScore {
  return { wins: 0, runs: 0 }
}

function readAll(): ScoreBoard {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return {}
    const parsed = JSON.parse(raw) as ScoreBoard
    return parsed && typeof parsed === 'object' ? parsed : {}
  } catch {
    return {}
  }
}

function writeAll(board: ScoreBoard) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(board))
  } catch {
    // private mode / quota — ignore
  }
}

export function getModeScore(mode: GameModeId): ModeScore {
  return { ...emptyScore(), ...readAll()[mode] }
}

export function getAllScores(): ScoreBoard {
  return readAll()
}

export function formatScoreTime(seconds: number) {
  const m = Math.floor(seconds / 60)
  const s = seconds % 60
  return `${m}:${s.toString().padStart(2, '0')}`
}

/** Persist a finished run. Classic/training best = fastest win; endless best = most cleared. */
export function recordRun(result: RunResult): RecordResult {
  const board = readAll()
  const prev = { ...emptyScore(), ...board[result.mode] }
  const previousBestTimeSec = prev.bestTimeSec
  const previousBestCleared = prev.bestCleared

  const next: ModeScore = {
    ...prev,
    runs: prev.runs + 1,
    lastAt: new Date().toISOString(),
  }

  let isNewBest = false

  if (result.mode === 'endless') {
    if (result.cleared > 0 && (previousBestCleared == null || result.cleared > previousBestCleared)) {
      next.bestCleared = result.cleared
      isNewBest = true
    }
  } else if (result.won) {
    next.wins = prev.wins + 1
    if (previousBestTimeSec == null || result.elapsedSeconds < previousBestTimeSec) {
      next.bestTimeSec = result.elapsedSeconds
      isNewBest = true
    }
  }

  board[result.mode] = next
  writeAll(board)

  return {
    score: next,
    isNewBest,
    previousBestTimeSec,
    previousBestCleared,
  }
}

export function scoreLineForMode(mode: GameModeId): string | null {
  const score = getModeScore(mode)
  if (mode === 'endless') {
    if (score.bestCleared == null || score.bestCleared <= 0) return null
    return `Best · ${score.bestCleared} cleared`
  }
  if (score.bestTimeSec == null) return null
  const wins = score.wins > 0 ? ` · ${score.wins} clear${score.wins === 1 ? '' : 's'}` : ''
  return `Best · ${formatScoreTime(score.bestTimeSec)}${wins}`
}
