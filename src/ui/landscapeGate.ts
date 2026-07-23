/**
 * Portrait play on phones is unusable (controls eat the viewport).
 * Show a rotate gate; after a tap, try fullscreen + orientation.lock when the browser allows it.
 * iOS Safari typically won't lock — the gate remains the reliable path.
 */

const STYLE_ID = 'landscape-gate-style'
const ROOT_ID = 'landscape-gate'

function isTouchLike(): boolean {
  if (typeof window === 'undefined') return false
  if (navigator.maxTouchPoints > 0) return true
  try {
    return window.matchMedia('(pointer: coarse)').matches
  } catch {
    return false
  }
}

function isPortrait(): boolean {
  try {
    if (window.matchMedia('(orientation: portrait)').matches) return true
  } catch {
    // ignore
  }
  return window.innerHeight > window.innerWidth
}

function ensureStyles() {
  if (document.getElementById(STYLE_ID)) return
  const style = document.createElement('style')
  style.id = STYLE_ID
  style.textContent = `
    #${ROOT_ID} {
      position: fixed;
      inset: 0;
      z-index: 100000;
      display: none;
      align-items: center;
      justify-content: center;
      padding: max(1.25rem, env(safe-area-inset-top)) max(1.25rem, env(safe-area-inset-right)) max(1.25rem, env(safe-area-inset-bottom)) max(1.25rem, env(safe-area-inset-left));
      background: rgba(4, 6, 10, 0.94);
      color: #f2efe8;
      text-align: center;
      font-family: ui-monospace, "SF Mono", Menlo, monospace;
      touch-action: none;
    }
    #${ROOT_ID}.is-visible { display: flex; }
    #${ROOT_ID} .lg-card {
      max-width: 22rem;
      display: grid;
      gap: 0.85rem;
      justify-items: center;
    }
    #${ROOT_ID} .lg-phone {
      width: 3.2rem;
      height: 5rem;
      border: 2px solid rgba(242, 239, 232, 0.55);
      border-radius: 0.55rem;
      position: relative;
      animation: lg-tilt 1.4s ease-in-out infinite;
    }
    #${ROOT_ID} .lg-phone::after {
      content: "";
      position: absolute;
      left: 50%;
      bottom: 0.35rem;
      width: 0.9rem;
      height: 0.2rem;
      margin-left: -0.45rem;
      border-radius: 999px;
      background: rgba(242, 239, 232, 0.45);
    }
    @keyframes lg-tilt {
      0%, 100% { transform: rotate(0deg); }
      40%, 60% { transform: rotate(90deg); }
    }
    #${ROOT_ID} h2 {
      margin: 0;
      font-size: 1.05rem;
      font-weight: 600;
      letter-spacing: 0.04em;
      text-transform: uppercase;
    }
    #${ROOT_ID} p {
      margin: 0;
      font-size: 0.78rem;
      line-height: 1.45;
      opacity: 0.72;
    }
    #${ROOT_ID} button {
      appearance: none;
      border: 1px solid rgba(242, 239, 232, 0.28);
      background: rgba(242, 239, 232, 0.1);
      color: inherit;
      font: inherit;
      font-size: 0.72rem;
      letter-spacing: 0.08em;
      text-transform: uppercase;
      padding: 0.7rem 1.1rem;
      border-radius: 999px;
      cursor: pointer;
      touch-action: manipulation;
    }
    html, body {
      height: 100%;
      height: 100dvh;
      overflow: hidden;
      overscroll-behavior: none;
      -webkit-text-size-adjust: 100%;
    }
  `
  document.head.appendChild(style)
}

async function tryEnterLandscape() {
  try {
    const el = document.documentElement
    if (!document.fullscreenElement && el.requestFullscreen) {
      await el.requestFullscreen({ navigationUI: 'hide' } as FullscreenOptions)
    }
  } catch {
    // ignore — many mobile browsers block fullscreen outside PWA
  }
  try {
    const orientation = screen.orientation as ScreenOrientation & {
      lock?: (orientation: string) => Promise<void>
    }
    if (orientation?.lock) {
      await orientation.lock('landscape')
    }
  } catch {
    // iOS / unsigned sites often reject lock
  }
}

export function installLandscapeGate(): () => void {
  if (!isTouchLike()) return () => {}

  ensureStyles()
  let root = document.getElementById(ROOT_ID)
  if (!root) {
    root = document.createElement('div')
    root.id = ROOT_ID
    root.setAttribute('role', 'dialog')
    root.setAttribute('aria-modal', 'true')
    root.setAttribute('aria-label', 'Rotate to landscape')
    root.innerHTML = `
      <div class="lg-card">
        <div class="lg-phone" aria-hidden="true"></div>
        <h2>Turn sideways</h2>
        <p>These games play best in landscape. Rotate your phone, then tap continue.</p>
        <button type="button" data-lg-go>Continue in landscape</button>
      </div>
    `
    document.body.appendChild(root)
  }

  const sync = () => {
    const need = isPortrait()
    root!.classList.toggle('is-visible', need)
    document.body.classList.toggle('needs-landscape', need)
  }

  const onGo = async () => {
    await tryEnterLandscape()
    sync()
  }

  root.querySelector('[data-lg-go]')?.addEventListener('click', onGo)
  window.addEventListener('orientationchange', sync)
  window.addEventListener('resize', sync)
  const mq = window.matchMedia('(orientation: portrait)')
  const onMq = () => sync()
  if (mq.addEventListener) mq.addEventListener('change', onMq)
  else mq.addListener(onMq)
  sync()

  return () => {
    root?.querySelector('[data-lg-go]')?.removeEventListener('click', onGo)
    window.removeEventListener('orientationchange', sync)
    window.removeEventListener('resize', sync)
    if (mq.removeEventListener) mq.removeEventListener('change', onMq)
    else mq.removeListener(onMq)
  }
}

/** Call from a user-gesture handler (Start / Enter) to prefer landscape. */
export async function preferLandscapeFromGesture() {
  if (!isTouchLike()) return
  await tryEnterLandscape()
}
