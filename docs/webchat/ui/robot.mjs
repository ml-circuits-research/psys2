// Robot tab: an SVG face drawn from the ui.avatar state (spec 07 §3). Own code, no library.
import { colorOf } from './util.mjs';

const DEFAULTS = {
  name: 'Robi', faceColor: 'silver', faceShape: 'round',
  eyes: { size: 'medium', shape: 'round', color: 'blue' },
  mouth: 'smile', look: 'center', antenna: { on: true, color: 'red' }, hat: 'none', accessory: 'none', ears: true, blink: true,
};
const FACES = {
  round: (c) => `<ellipse cx="200" cy="230" rx="125" ry="125" fill="${c}" class="stroke"/>`,
  square: (c) => `<rect x="75" y="105" width="250" height="250" rx="34" fill="${c}" class="stroke"/>`,
  oval: (c) => `<ellipse cx="200" cy="230" rx="105" ry="135" fill="${c}" class="stroke"/>`,
};
const HALF_W = { round: 125, square: 125, oval: 105 };
const TOP = { round: 105, square: 105, oval: 95 };
const EYE_R = { small: 10, medium: 16, large: 24 };
const INK = '#2b2b33';

function star(cx, cy, R) {
  const pts = [];
  for (let i = 0; i < 10; i++) {
    const r = i % 2 ? R * 0.45 : R;
    const a = -Math.PI / 2 + (i * Math.PI) / 5;
    pts.push(`${(cx + r * Math.cos(a)).toFixed(1)},${(cy + r * Math.sin(a)).toFixed(1)}`);
  }
  return pts.join(' ');
}

function eye(cx, cy, st, look, surprised) {
  const r = EYE_R[st.size] ?? 16;
  const R = surprised ? r * 1.25 : r;
  const color = colorOf(st.color, '#4a8fe0');
  const socketR = Math.max(R * 1.5, 24);
  const slack = Math.max(0, socketR - R - 4);
  const [dx, dy] = { left: [-slack, 0], right: [slack, 0], up: [0, -slack], down: [0, slack] }[look] ?? [0, 0];
  const x = cx + dx, y = cy + dy;
  let iris;
  switch (st.shape) {
    case 'square': iris = `<rect x="${x - R}" y="${y - R}" width="${2 * R}" height="${2 * R}" rx="${R * 0.2}" fill="${color}"/>`; break;
    case 'oval': iris = `<ellipse cx="${x}" cy="${y}" rx="${R * 0.75}" ry="${R * 1.2}" fill="${color}"/>`; break;
    case 'star': return `<g class="eye"><polygon points="${star(cx + dx, cy + dy, R * 1.5)}" fill="${color}" stroke="${INK}" stroke-width="3" stroke-linejoin="round"/></g>`;
    default: iris = `<circle cx="${x}" cy="${y}" r="${R}" fill="${color}"/>`;
  }
  return `<g class="eye"><circle cx="${cx}" cy="${cy}" r="${socketR}" fill="#fff" stroke="${INK}" stroke-width="3"/>${iris}`
    + `<circle cx="${x + R * 0.3}" cy="${y - R * 0.3}" r="${Math.max(2.5, R * 0.25)}" fill="#fff" opacity=".9"/></g>`;
}

export function mouthSvg(kind) {
  const line = (d) => `<path d="${d}" fill="none" stroke="${INK}" stroke-width="7" stroke-linecap="round"/>`;
  switch (kind) {
    case 'neutral': return line('M168 303 L232 303');
    case 'sad': return line('M162 320 Q200 282 238 320');
    case 'open': return `<ellipse cx="200" cy="308" rx="30" ry="20" fill="${INK}"/><ellipse cx="200" cy="318" rx="16" ry="8" fill="#e57373"/>`;
    case 'surprised': return `<circle cx="200" cy="312" r="17" fill="${INK}"/>`;
    case 'grin': return `<path d="M158 292 Q200 342 242 292 Z" fill="${INK}"/><path d="M168 294 Q200 306 232 294 L230 302 Q200 313 170 302Z" fill="#fff"/>`;
    default: return line('M160 292 Q200 334 240 292'); // smile
  }
}

function hat(kind, top) {
  const g = (inner) => `<g transform="translate(0 ${top - 105})">${inner}</g>`;
  switch (kind) {
    case 'cap': return g(`<path d="M128 110 Q128 46 200 46 Q272 46 272 110 Z" fill="#d9534f" stroke="${INK}" stroke-width="3"/>`
      + `<path d="M262 106 Q340 100 348 120 Q300 126 258 116Z" fill="#b8423e" stroke="${INK}" stroke-width="3"/><circle cx="200" cy="46" r="7" fill="#b8423e" stroke="${INK}" stroke-width="2"/>`);
    case 'crown': return g(`<path d="M140 110 L136 52 L170 78 L200 40 L230 78 L264 52 L260 110 Z" fill="#e6b422" stroke="${INK}" stroke-width="3" stroke-linejoin="round"/>`
      + `<rect x="140" y="98" width="120" height="12" fill="#c99a14"/><circle cx="200" cy="70" r="7" fill="#e0443e"/><circle cx="168" cy="92" r="5" fill="#4a8fe0"/><circle cx="232" cy="92" r="5" fill="#4caf6a"/>`);
    case 'party': return g(`<path d="M160 112 L200 -6 L240 112 Z" fill="#8e5bd0" stroke="${INK}" stroke-width="3" stroke-linejoin="round"/>`
      + `<path d="M176 66 L224 78 M168 90 L232 104" stroke="#f5cd3a" stroke-width="7" stroke-linecap="round"/><circle cx="200" cy="-8" r="11" fill="#f08ab4" stroke="${INK}" stroke-width="2"/>`);
    case 'wizard': return g(`<ellipse cx="200" cy="110" rx="108" ry="14" fill="#3b3a8f" stroke="${INK}" stroke-width="3"/>`
      + `<path d="M150 108 Q190 60 196 -10 Q230 20 252 108 Z" fill="#4b4bb0" stroke="${INK}" stroke-width="3" stroke-linejoin="round"/>`
      + `<rect x="152" y="92" width="98" height="12" fill="#e6b422"/><polygon points="${star(200, 55, 11)}" fill="#f5cd3a"/><polygon points="${star(222, 85, 7)}" fill="#f5cd3a"/>`);
    default: return '';
  }
}

function accessory(kind) {
  switch (kind) {
    case 'glasses': return `<g fill="rgba(255,255,255,.18)" stroke="${INK}" stroke-width="5"><circle cx="150" cy="210" r="38"/><circle cx="250" cy="210" r="38"/>`
      + `<path d="M188 208 Q200 198 212 208" fill="none"/><path d="M112 206 L90 196 M288 206 L310 196" fill="none" stroke-linecap="round"/></g>`;
    case 'mustache': return `<path d="M200 276 Q184 262 156 270 Q148 292 172 288 Q192 286 200 282 Q208 286 228 288 Q252 292 244 270 Q216 262 200 276Z" fill="#3a2a1f"/>`;
    case 'bowtie': return `<g stroke="${INK}" stroke-width="3" stroke-linejoin="round"><path d="M200 380 L160 360 L160 400 Z" fill="#d9534f"/><path d="M200 380 L240 360 L240 400 Z" fill="#d9534f"/><circle cx="200" cy="380" r="8" fill="#b8423e"/></g>`;
    default: return '';
  }
}

export function robotMarkup(state, { mouth, surprised = false } = {}) {
  const s = { ...DEFAULTS, ...state, eyes: { ...DEFAULTS.eyes, ...state?.eyes }, antenna: { ...DEFAULTS.antenna, ...state?.antenna } };
  const shape = FACES[s.faceShape] ? s.faceShape : 'round';
  const face = colorOf(s.faceColor, '#c3c8cf');
  const top = TOP[shape], hw = HALF_W[shape];
  const ears = s.ears ? `<g class="stroke" fill="${face}"><rect x="${200 - hw - 20}" y="210" width="26" height="48" rx="9"/><rect x="${200 + hw - 6}" y="210" width="26" height="48" rx="9"/></g>` : '';
  const antenna = s.antenna.on && s.hat === 'none'
    ? `<line x1="200" y1="${top}" x2="200" y2="${top - 46}" stroke="#6b7078" stroke-width="6" stroke-linecap="round"/><circle class="antenna-ball" cx="200" cy="${top - 54}" r="11" fill="${colorOf(s.antenna.color, '#e0443e')}" stroke="${INK}" stroke-width="3"/>` : '';
  return `<rect x="132" y="352" width="136" height="64" rx="18" fill="#6b7078" stroke="${INK}" stroke-width="3"/>`
    + `<rect x="178" y="338" width="44" height="24" fill="#6b7078" stroke="${INK}" stroke-width="3"/>`
    + `${antenna}${ears}${FACES[shape](face)}`
    + `<circle cx="116" cy="285" r="15" fill="#f08ab4" opacity=".25"/><circle cx="284" cy="285" r="15" fill="#f08ab4" opacity=".25"/>`
    + `<g class="eyes">${eye(150, 210, s.eyes, s.look, surprised)}${eye(250, 210, s.eyes, s.look, surprised)}</g>`
    + `<g class="mouth">${mouthSvg(mouth ?? s.mouth)}</g>${accessory(s.accessory)}${hat(s.hat, top)}`;
}

export function createRobot(container) {
  container.classList.add('p2-robot-wrap');
  const svgNS = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(svgNS, 'svg');
  svg.setAttribute('viewBox', '0 -30 400 450');
  svg.setAttribute('class', 'p2-robot');
  svg.setAttribute('role', 'img');
  const caption = document.createElement('p');
  caption.className = 'p2-robot-name';
  container.append(svg, caption);

  let state = null, transient = null, transientTimer = 0, speaking = false, frame = false, talkTimer = 0, blinkTimer = 0;
  const baseMouth = () => transient?.mouth ?? state?.mouth ?? DEFAULTS.mouth;
  const shownMouth = () => {
    const base = baseMouth();
    if (!speaking || !frame) return base;
    return base === 'open' ? 'neutral' : 'open';
  };
  function describe() {
    const s = { ...DEFAULTS, ...state, eyes: { ...DEFAULTS.eyes, ...state?.eyes } };
    const bits = [`${s.faceColor} ${s.faceShape} face`, `${s.eyes.size} ${s.eyes.color} ${s.eyes.shape} eyes`, `${shownMouth()} mouth`];
    if (s.hat !== 'none') bits.push(`a ${s.hat} hat`);
    if (s.accessory !== 'none') bits.push(s.accessory);
    return `${s.name}, a robot with ${bits.join(', ')}`;
  }
  function render() {
    svg.innerHTML = robotMarkup(state, { mouth: shownMouth(), surprised: transient?.mouth === 'surprised' });
    svg.setAttribute('aria-label', describe());
    caption.textContent = (state?.name ?? DEFAULTS.name);
  }
  function renderMouth() {
    const m = svg.querySelector('.mouth');
    if (m) m.innerHTML = mouthSvg(shownMouth());
  }
  function scheduleBlink() {
    clearTimeout(blinkTimer);
    blinkTimer = setTimeout(() => {
      if (state?.blink !== false && !document.hidden) {
        svg.classList.add('blink');
        setTimeout(() => svg.classList.remove('blink'), 140);
      }
      scheduleBlink();
    }, 2200 + Math.random() * 3200);
  }
  render();
  scheduleBlink();
  return {
    update(next) { state = next ?? state; render(); },
    /** Short-lived expression (not stored): { mouth: 'smile' | 'surprised' }. */
    express(mouth, ms = 2200) {
      clearTimeout(transientTimer);
      transient = { mouth };
      render();
      transientTimer = setTimeout(() => { transient = null; render(); }, ms);
    },
    setSpeaking(on) {
      if (on === speaking) return;
      speaking = on; frame = false;
      clearInterval(talkTimer);
      if (on) talkTimer = setInterval(() => { frame = !frame; renderMouth(); }, 150);
      renderMouth();
    },
    destroy() { clearTimeout(blinkTimer); clearTimeout(transientTimer); clearInterval(talkTimer); },
  };
}
