export type TouchControlMode = 'simple' | 'immersive'

const STORAGE_PREFIX = 'minewalker-touch-mode'

/** True when we should show on-screen play controls (phones / tablets / coarse pointer). */
export function isTouchPlayTarget(): boolean {
  if (typeof window === 'undefined') return false
  if (navigator.maxTouchPoints > 0) return true
  try {
    return window.matchMedia('(pointer: coarse)').matches
  } catch {
    return false
  }
}

export function loadTouchControlMode(storageKey = STORAGE_PREFIX): TouchControlMode {
  try {
    const raw = localStorage.getItem(storageKey)
    if (raw === 'immersive' || raw === 'simple') return raw
  } catch {
    // ignore
  }
  return 'simple'
}

export function saveTouchControlMode(mode: TouchControlMode, storageKey = STORAGE_PREFIX) {
  try {
    localStorage.setItem(storageKey, mode)
  } catch {
    // ignore
  }
}
