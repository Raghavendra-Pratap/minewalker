import { ASSIGNMENT_META, ASSIGNMENT_ORDER } from './assignments'
import type { CampaignScreen } from './types'
import type { GameModeId } from '../game/types'
import { scoreLineForMode } from '../game/scores'
import './minewalker.css'

export interface CampaignShellApi {
  show: () => void
  hide: () => void
  goCover: () => void
  goHub: () => void
}

function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className?: string,
  text?: string,
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag)
  if (className) node.className = className
  if (text != null) node.textContent = text
  return node
}

function renderCover(onBegin: () => void, onGuide: () => void) {
  const screen = el('div', 'mw-screen')
  const shell = el('div', 'mw-shell mw-cover')

  shell.append(
    el('div', 'mw-stamp', 'Shift Log · Extraction Class C'),
    (() => {
      const h1 = el('h1', 'mw-title')
      h1.innerHTML = 'MINE<br><span>WALKER</span>'
      return h1
    })(),
    el(
      'p',
      'mw-sub',
      'You walk the vein on foot. Covered cells are solid rock — dig them open to move deeper. ' +
        'Your headlamp paints the stone ahead; flags mark charges you suspect. ' +
        'Clear every safe cut on classic fields, or keep pushing east in the endless tunnel.',
    ),
    (() => {
      const brief = el('div', 'mw-brief')
      const items = ASSIGNMENT_ORDER.map((id) => {
        const meta = ASSIGNMENT_META[id]
        return `<li><b>${meta.title.toUpperCase()}</b> — ${meta.blurb}</li>`
      }).join('')
      brief.innerHTML = `
        <h3>Four levels</h3>
        <ol>
          ${items}
        </ol>
      `
      return brief
    })(),
    (() => {
      const row = el('div', 'mw-cta-row')
      const begin = el('button', 'mw-cta', 'Enter the Shift →') as HTMLButtonElement
      begin.type = 'button'
      begin.addEventListener('click', onBegin)
      const guide = el('button', 'mw-cta mw-cta--ghost', 'How to Play') as HTMLButtonElement
      guide.type = 'button'
      guide.addEventListener('click', onGuide)
      row.append(begin, guide)
      return row
    })(),
    el('p', 'mw-footnote', 'Training yard · 4 levels · headlamp · ore satchel'),
  )

  screen.append(shell)
  return screen
}

function renderHub(onBack: () => void, onAssignment: (mode: GameModeId) => void) {
  const screen = el('div', 'mw-screen')
  const shell = el('div', 'mw-shell mw-hub')

  const back = el('button', 'mw-back-link', '← Back to cover') as HTMLButtonElement
  back.type = 'button'
  back.addEventListener('click', onBack)

  const head = el('div', 'mw-map-head')
  const headLeft = el('div')
  headLeft.append(el('p', 'mw-eyebrow', 'Select level'), el('h2', undefined, 'Shift Desk'))
  head.append(headLeft)

  shell.append(back, head, el('hr', 'mw-rule'))

  const grid = el('div', 'mw-hub-grid')

  const trainingCard = el('button', 'mw-hub-card mw-hub-card--training') as HTMLButtonElement
  trainingCard.type = 'button'
  const trainingScore = scoreLineForMode('training')
  trainingCard.innerHTML = `
    <span class="mw-badge">Onboarding</span>
    <h3>Training</h3>
    <p>
      Tiny 5×5 yard with three fixed charges. Practice walking, facing rock, digging numbers,
      and flagging before a real field.
    </p>
    <span class="mw-hub-card__spec">5×5 · 3 charges · fixed layout</span>
    ${trainingScore ? `<span class="mw-hub-card__score">${trainingScore}</span>` : ''}
    <span class="mw-hub-card__cta">Start training →</span>
  `
  trainingCard.addEventListener('click', () => onAssignment('training'))
  grid.append(trainingCard)

  for (const mode of ASSIGNMENT_ORDER) {
    const meta = ASSIGNMENT_META[mode]
    const score = scoreLineForMode(mode)
    const card = el(
      'button',
      `mw-hub-card mw-hub-card--${meta.badge}${mode === 'endless' ? ' mw-hub-card--endless' : ''}`,
    ) as HTMLButtonElement
    card.type = 'button'
    card.innerHTML = `
      <span class="mw-badge">${meta.eyebrow}</span>
      <h3>${meta.title}</h3>
      <p>${meta.blurb}</p>
      <span class="mw-hub-card__spec">${meta.spec}</span>
      ${score ? `<span class="mw-hub-card__score">${score}</span>` : ''}
      <span class="mw-hub-card__cta">Walk in →</span>
    `
    card.addEventListener('click', () => onAssignment(mode))
    grid.append(card)
  }

  shell.append(grid)
  screen.append(shell)
  return screen
}

function renderGuide(onBack: () => void, onBegin: () => void) {
  const screen = el('div', 'mw-screen')
  const shell = el('div', 'mw-shell mw-guide')

  const back = el('button', 'mw-back-link', '← Back to cover') as HTMLButtonElement
  back.type = 'button'
  back.addEventListener('click', onBack)

  shell.append(
    back,
    el('p', 'mw-eyebrow', 'Field guide'),
    (() => {
      const h1 = el('h1', 'mw-guide-title')
      h1.innerHTML = 'How to <span>Play</span>'
      return h1
    })(),
    el(
      'p',
      'mw-guide-lede',
      'Minewalker is classic minesweeper logic on a 3D dig site you walk through. ' +
        'Covered cells are solid rock. Dig them open, read the counts, mark charges, and clear every safe stone — or keep pushing east forever.',
    ),
    el('hr', 'mw-rule'),
    (() => {
      const sec = el('div', 'mw-guide-section')
      sec.innerHTML = `
        <h2>How the mine works</h2>
        <p>
          The grid is the same idea as minesweeper. Each covered cell is rock you cannot walk through
          until you dig it. Digging a safe cell reveals a number — how many <b>charges</b> sit in the
          eight neighboring cells. Dig a charge and the run ends.
        </p>
        <ul>
          <li><b>Covered rock</b> — blocks movement until dug or cleared by a flood reveal.</li>
          <li><b>Number</b> — adjacent charge count. Use it to decide the next dig or flag.</li>
          <li><b>Empty (0)</b> — no nearby charges; opening one often clears a whole pocket.</li>
          <li><b>Flag</b> — your mark on a suspected charge. Flags do not dig; they only warn you.</li>
        </ul>
        <p>
          You dig and flag the cell you are <b>facing</b>, not under your feet. Turn or step until
          the rock ahead is the one you mean to cut.
        </p>
      `
      return sec
    })(),
    (() => {
      const sec = el('div', 'mw-guide-section')
      sec.innerHTML = `
        <h2>Win &amp; lose</h2>
        <div class="mw-guide-table">
          <div><b>Classic fields</b><span>Clear every safe stone. Flags need not match charges exactly to win.</span></div>
          <div><b>Endless tunnel</b><span>No finish line — dig the fringe to expand east and keep going.</span></div>
          <div><b>Detonation</b><span>Digging a charge ends the run. Press R or Try again to restart.</span></div>
          <div><b>Shift Desk</b><span>← Desk returns you to levels. Pick a new field from there.</span></div>
        </div>
      `
      return sec
    })(),
    (() => {
      const sec = el('div', 'mw-guide-section')
      sec.innerHTML = `
        <h2>Controls</h2>
        <ul>
          <li><b>W / ↑</b> — step forward (relative to facing)</li>
          <li><b>S / ↓</b> — step back</li>
          <li><b>A / ←</b> — strafe left</li>
          <li><b>D / →</b> — strafe right</li>
          <li><b>Q / E</b> — turn left / right in place</li>
          <li><b>Space</b> — dig the rock you face</li>
          <li><b>F</b> — flag / unflag the rock you face</li>
          <li><b>R</b> — restart the current run</li>
          <li><b>V</b> — cycle cameras</li>
        </ul>
        <p>
          Movement follows your miner’s facing — the camera does not steer your feet. On <b>3rd</b>
          camera, <b>Shift+WASD</b> flies the drone; <b>Shift+Q/E</b> raises or lowers it; <b>T</b>
          recalls the drone behind you.
        </p>
      `
      return sec
    })(),
    (() => {
      const sec = el('div', 'mw-guide-section')
      sec.innerHTML = `
        <h2>Cameras</h2>
        <div class="mw-guide-table">
          <div><b>Head</b><span>Over-shoulder chase; follows facing. Drag to angle.</span></div>
          <div><b>3rd</b><span>Free drone scout. Park it and walk while it watches.</span></div>
          <div><b>1st</b><span>Eye-level headlamp view. Dig by what you see ahead.</span></div>
          <div><b>Orbit</b><span>Bright overview of the whole field — best for planning.</span></div>
        </div>
      `
      return sec
    })(),
    (() => {
      const sec = el('div', 'mw-guide-section')
      const items = ASSIGNMENT_ORDER.map((id) => {
        const meta = ASSIGNMENT_META[id]
        return `<li><b>${meta.title}</b> — ${meta.spec}. ${meta.blurb}</li>`
      }).join('')
      sec.innerHTML = `
        <h2>Levels</h2>
        <p>
          New diggers should start on <b>Training</b> from Shift Desk — a fixed 5×5 yard with three
          charges so you can learn movement and number reads without a random field.
        </p>
        <ul>
          ${items}
        </ul>
      `
      return sec
    })(),
    (() => {
      const sec = el('div', 'mw-guide-section')
      sec.innerHTML = `
        <h2>What walking changes</h2>
        <p>
          Same deduction as classic minesweeper — different body. You live inside the board, so
          space, facing, and camera matter as much as counting.
        </p>
        <ul>
          <li>
            <b>Strength — presence.</b> Numbers float on dug stone in the cavern. Reading a pocket
            feels like standing in it, not clicking a grid.
          </li>
          <li>
            <b>Strength — scouting.</b> Orbit and the 3rd drone let you plan from above, then drop
            back to Head or 1st to dig.
          </li>
          <li>
            <b>Tradeoff — slower clears.</b> Walking and turning cost time. Large Expert fields are
            a trek compared to mouse-click minesweeper.
          </li>
          <li>
            <b>Tradeoff — facing mistakes.</b> Dig/flag hit the cell ahead. Easy to cut the wrong
            neighbor if you mis-aim — especially in 1st person.
          </li>
          <li>
            <b>Tradeoff — visibility.</b> Dark tunnels need the headlamp and good camera choice;
            Orbit is brighter for overview, Head/1st for immersion.
          </li>
        </ul>
      `
      return sec
    })(),
    (() => {
      const footer = el('div', 'mw-guide-footer')
      const cta = el('button', 'mw-cta', 'Enter Shift Desk →') as HTMLButtonElement
      cta.type = 'button'
      cta.addEventListener('click', onBegin)
      footer.append(cta)
      return footer
    })(),
  )

  screen.append(shell)
  return screen
}

export function mountCampaignShell(
  root: HTMLElement,
  onEnterMine: (mode: GameModeId) => void,
): CampaignShellApi {
  let screen: CampaignScreen = 'cover'

  const render = () => {
    root.replaceChildren()
    if (screen === 'cover') {
      root.append(
        renderCover(
          () => {
            screen = 'hub'
            render()
          },
          () => {
            screen = 'guide'
            render()
          },
        ),
      )
      return
    }
    if (screen === 'guide') {
      root.append(
        renderGuide(
          () => {
            screen = 'cover'
            render()
          },
          () => {
            screen = 'hub'
            render()
          },
        ),
      )
      return
    }
    root.append(
      renderHub(
        () => {
          screen = 'cover'
          render()
        },
        onEnterMine,
      ),
    )
  }

  render()

  return {
    show: () => {
      root.hidden = false
    },
    hide: () => {
      root.hidden = true
    },
    goCover: () => {
      screen = 'cover'
      render()
    },
    goHub: () => {
      screen = 'hub'
      render()
    },
  }
}
