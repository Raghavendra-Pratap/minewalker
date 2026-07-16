import { GAME_MODES, type GameModeId } from '../game/types'

/** Playable Shift Desk levels (training is separate). */
export type LevelModeId = Exclude<GameModeId, 'training'>

export const ASSIGNMENT_ORDER: LevelModeId[] = ['beginner', 'intermediate', 'expert', 'endless']

export interface AssignmentMeta {
  id: LevelModeId
  eyebrow: string
  title: string
  blurb: string
  badge: string
  spec: string
}

export const ASSIGNMENT_META: Record<LevelModeId, AssignmentMeta> = {
  beginner: {
    id: 'beginner',
    eyebrow: 'Surface vein',
    title: 'Beginner',
    badge: 'surface',
    blurb: 'Open cavern plane. Ten charges in a 9×9 cut. Learn to read the rock before you dig.',
    spec: `${GAME_MODES.beginner.startCols}×${GAME_MODES.beginner.startRows} · ${GAME_MODES.beginner.mines} charges`,
  },
  intermediate: {
    id: 'intermediate',
    eyebrow: 'Deep cut',
    title: 'Intermediate',
    badge: 'deep',
    blurb: 'Wider gallery, denser field. Forty charges across sixteen rows — pace your flags.',
    spec: `${GAME_MODES.intermediate.startCols}×${GAME_MODES.intermediate.startRows} · ${GAME_MODES.intermediate.mines} charges`,
  },
  expert: {
    id: 'expert',
    eyebrow: 'Master gallery',
    title: 'Expert',
    badge: 'master',
    blurb: 'Thirty columns of pressure. Ninety-nine charges. Clear every safe stone or lose the shift.',
    spec: `${GAME_MODES.expert.startCols}×${GAME_MODES.expert.startRows} · ${GAME_MODES.expert.mines} charges`,
  },
  endless: {
    id: 'endless',
    eyebrow: 'Endless tunnel',
    title: 'Endless',
    badge: 'tunnel',
    blurb: 'The vein never ends. Dig the fringe to expand the gallery — charges keep spawning ahead.',
    spec: 'Growing tunnel · density field',
  },
}
