// 4コマ漫画の台本（JSON）から SVG を組み立てます。
// 台本の形式:
// {
//   "title": "開封率より報告数",
//   "panels": [   // ちょうど4つ
//     { "characters": [   // 1〜2人。2人とも話すときは先に話す人を先に書く
//         { "id": "it", "position": "right", "expression": "happy", "prop": "chart_down", "says": "開封率が下がりました！" }
//     ] }
//   ]
// }

export const CAST = {
  reten: { name: 'レ点さん', role: '内部監査人', female: true },
  moriya: { name: '守屋さん', role: '情報セキュリティ担当', female: true },
  it: { name: 'ITくん', role: '情報システム部', female: false },
  bucho: { name: '部長', role: '業務部門の部長', female: false },
};
export const EXPRESSIONS = ['normal', 'smile', 'happy', 'surprised', 'worried', 'sweat', 'serious', 'thinking', 'shocked'];
export const PROPS = ['chart_up', 'chart_down', 'document', 'laptop', 'memo', 'mail', 'phone', 'key', 'lock', 'ai_chat', 'red_tick'];
export const MAX_SAYS = 36; // 1つのふきだしの最大文字数
const LINE_WIDE = 13;   // 1人だけ話すコマの1行の文字数
const LINE_NARROW = 10; // 2人とも話すコマの1行の文字数

// ---------- 検証 ----------
export function validateComic(c) {
  const errors = [];
  if (!c || typeof c !== 'object') return ['台本がオブジェクトではありません'];
  if (!c.title || typeof c.title !== 'string') errors.push('title がありません');
  if (!Array.isArray(c.panels) || c.panels.length !== 4) {
    errors.push('panels はちょうど4つ必要です');
    return errors;
  }
  let female = false;
  c.panels.forEach((p, i) => {
    const n = i + 1;
    if (!Array.isArray(p.characters) || p.characters.length < 1 || p.characters.length > 2) {
      errors.push(`${n}コマ目: 登場人物は1〜2人にしてください`);
      return;
    }
    const pos = new Set();
    for (const ch of p.characters) {
      if (!CAST[ch.id]) errors.push(`${n}コマ目: id「${ch.id}」は ${Object.keys(CAST).join(', ')} のどれかにしてください`);
      else if (CAST[ch.id].female) female = true;
      if (!['left', 'right'].includes(ch.position)) errors.push(`${n}コマ目: position は left か right です`);
      if (pos.has(ch.position)) errors.push(`${n}コマ目: 2人が同じ position です`);
      pos.add(ch.position);
      if (!EXPRESSIONS.includes(ch.expression)) errors.push(`${n}コマ目: expression「${ch.expression}」は ${EXPRESSIONS.join(', ')} のどれかです`);
      if (ch.prop != null && ch.prop !== '' && !PROPS.includes(ch.prop)) errors.push(`${n}コマ目: prop「${ch.prop}」は ${PROPS.join(', ')} のどれかか null です`);
      if (ch.says != null && typeof ch.says !== 'string') errors.push(`${n}コマ目: says は文字列です`);
      if (ch.says && [...ch.says].length > MAX_SAYS) errors.push(`${n}コマ目: 台詞「${ch.says}」が${MAX_SAYS}字を超えています`);
    }
    const both = p.characters.length === 2 && p.characters.every((ch) => ch.says);
    for (const ch of p.characters) {
      const maxLines = both ? 2 : 3;
      if (ch.says && wrap(ch.says, both ? LINE_NARROW : LINE_WIDE).length > maxLines) {
        errors.push(`${n}コマ目: 台詞「${ch.says}」が長すぎます（${both ? '2人とも話すコマは1行10字×2行' : '1行13字×3行'}まで）`);
      }
    }
  });
  if (!female) errors.push('女性キャラクター（reten か moriya）を少なくとも1人登場させてください');
  return errors;
}

// ---------- 描画の部品 ----------
const INK = '#1d2a36';
const SKIN = '#f6dcc8';
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

// 折り返し。台詞中の改行（\n）を優先し、なければ読点などの直後で区切る。
const NO_START = '、。，．！？!?）」』…ー';
const GOOD_BREAK = '、。！？!?」』…';
export function wrap(text, width) {
  const out = [];
  for (const para of String(text).split('\n')) {
    let rest = [...para];
    while (rest.length > width) {
      let cut = width;
      // 区切りのよい位置（読点などの直後）を後ろから探す
      for (let i = width; i >= Math.ceil(width / 2); i--) {
        if (GOOD_BREAK.includes(rest[i - 1])) { cut = i; break; }
      }
      // 行頭禁則
      while (cut < rest.length && NO_START.includes(rest[cut])) cut++;
      out.push(rest.slice(0, cut).join(''));
      rest = rest.slice(cut);
    }
    if (rest.length) out.push(rest.join(''));
  }
  return out;
}

function body(id, x, base, heldProp) {
  const y = base;
  switch (id) {
    case 'reten':
      return `<path d="M${x - 25} ${y} Q${x - 27} ${y - 50} ${x} ${y - 54} Q${x + 27} ${y - 50} ${x + 25} ${y} Z" fill="#1d2a36"/>
<path d="M${x - 7} ${y - 54} L${x} ${y - 38} L${x + 7} ${y - 54} Z" fill="#fbfcfa"/>
${heldProp === 'red_tick' ? '' : `<path d="M${x + 12} ${y - 44} L${x + 14} ${y - 26}" stroke="#c3352b" stroke-width="3" stroke-linecap="round"/>`}`; // 赤ペンを手に持つときは胸ポケットから消す
    case 'moriya':
      return `<path d="M${x - 25} ${y} Q${x - 27} ${y - 50} ${x} ${y - 54} Q${x + 27} ${y - 50} ${x + 25} ${y} Z" fill="#2f7f7a"/>
<path d="M${x - 9} ${y - 54} Q${x} ${y - 44} ${x + 9} ${y - 54}" fill="#fbfcfa"/>
<line x1="${x}" y1="${y - 44}" x2="${x}" y2="${y}" stroke="#256663" stroke-width="1.5"/>
<circle cx="${x - 4}" cy="${y - 34}" r="1.6" fill="#fbfcfa"/><circle cx="${x - 4}" cy="${y - 22}" r="1.6" fill="#fbfcfa"/>`;
    case 'it':
      return `<path d="M${x - 25} ${y} Q${x - 27} ${y - 50} ${x} ${y - 54} Q${x + 27} ${y - 50} ${x + 25} ${y} Z" fill="#6d8f7a"/>
<path d="M${x - 8} ${y - 52} L${x} ${y - 28} L${x + 8} ${y - 52}" fill="none" stroke="#c3352b" stroke-width="2"/>
<rect x="${x - 6}" y="${y - 30}" width="12" height="15" rx="2" fill="#fbfcfa" stroke="#9fb5a6"/>`;
    case 'bucho':
      return `<path d="M${x - 27} ${y} Q${x - 29} ${y - 52} ${x} ${y - 56} Q${x + 29} ${y - 52} ${x + 27} ${y} Z" fill="#5b6770"/>
<path d="M${x - 8} ${y - 56} L${x} ${y - 44} L${x + 8} ${y - 56} Z" fill="#fbfcfa"/>
<path d="M${x - 3} ${y - 46} L${x + 3} ${y - 46} L${x + 5} ${y - 14} L${x} ${y - 8} L${x - 5} ${y - 14} Z" fill="#8a2b25"/>`;
    default: return '';
  }
}

function head(id, x, hy) {
  const face = `<circle cx="${x}" cy="${hy}" r="27" fill="${SKIN}"/>`;
  switch (id) {
    case 'reten': // 顎までのボブ、赤い髪留め
      return `<path d="M${x - 30} ${hy + 14} Q${x - 34} ${hy - 34} ${x} ${hy - 31} Q${x + 34} ${hy - 34} ${x + 30} ${hy + 14} L${x + 24} ${hy + 14} Q${x + 24} ${hy - 10} ${x + 16} ${hy - 14} L${x - 16} ${hy - 14} Q${x - 24} ${hy - 10} ${x - 24} ${hy + 14} Z" fill="#2b3a4a"/>
${face}
<path d="M${x - 27} ${hy - 2} Q${x - 28} ${hy - 30} ${x} ${hy - 30} Q${x + 28} ${hy - 30} ${x + 27} ${hy - 2} Q${x + 14} ${hy - 20} ${x - 4} ${hy - 16} Q${x - 18} ${hy - 14} ${x - 27} ${hy - 2} Z" fill="#2b3a4a"/>
<rect x="${x + 12}" y="${hy - 24}" width="10" height="4" rx="2" fill="#c3352b" transform="rotate(-20 ${x + 17} ${hy - 22})"/>`;
    case 'moriya': // ポニーテール
      return `<path d="M${x + 20} ${hy - 22} Q${x + 46} ${hy - 20} ${x + 40} ${hy + 18} Q${x + 34} ${hy - 4} ${x + 18} ${hy - 10} Z" fill="#5a3b2a"/>
${face}
<path d="M${x - 27} ${hy - 2} Q${x - 28} ${hy - 31} ${x} ${hy - 31} Q${x + 28} ${hy - 31} ${x + 27} ${hy - 4} Q${x + 10} ${hy - 22} ${x - 8} ${hy - 18} Q${x - 20} ${hy - 14} ${x - 27} ${hy - 2} Z" fill="#5a3b2a"/>
<circle cx="${x + 22}" cy="${hy - 20}" r="3.5" fill="#2f7f7a"/>`;
    case 'it': // ツンツン頭
      return `${face}
<path d="M${x - 27} ${hy - 4} Q${x - 28} ${hy - 28} ${x - 10} ${hy - 30} L${x - 6} ${hy - 38} L${x + 2} ${hy - 29} L${x + 10} ${hy - 37} L${x + 13} ${hy - 27} Q${x + 28} ${hy - 24} ${x + 27} ${hy - 4} Q${x + 18} ${hy - 18} ${x} ${hy - 16} Q${x - 16} ${hy - 18} ${x - 27} ${hy - 4} Z" fill="#7a5638"/>`;
    case 'bucho': // 白髪まじりのサイド、口ひげ
      return `${face}
<path d="M${x - 27} ${hy + 4} Q${x - 30} ${hy - 22} ${x - 16} ${hy - 22} Q${x - 22} ${hy - 6} ${x - 22} ${hy + 6} Z" fill="#a9b0b5"/>
<path d="M${x + 27} ${hy + 4} Q${x + 30} ${hy - 22} ${x + 16} ${hy - 22} Q${x + 22} ${hy - 6} ${x + 22} ${hy + 6} Z" fill="#a9b0b5"/>
<path d="M${x - 8} ${hy - 26} Q${x} ${hy - 30} ${x + 8} ${hy - 26}" fill="none" stroke="#a9b0b5" stroke-width="2"/>`;
    default: return face;
  }
}

function face(id, expr, x, hy) {
  const L = x - 10, R = x + 10, ey = hy + 2, my = hy + 15;
  const ln = (d) => `<path d="${d}" fill="none" stroke="${INK}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>`;
  const dot = (cx, cy, r = 2.6) => `<circle cx="${cx}" cy="${cy}" r="${r}" fill="${INK}"/>`;
  const ring = (cx, cy) => `<circle cx="${cx}" cy="${cy}" r="4" fill="none" stroke="${INK}" stroke-width="2"/>`;
  const drops = `<path d="M${x + 32} ${hy - 14} Q${x + 38} ${hy - 4} ${x + 32} ${hy + 2} Q${x + 26} ${hy - 4} ${x + 32} ${hy - 14} Z" fill="#7fb6d6"/>
<path d="M${x + 40} ${hy + 4} Q${x + 45} ${hy + 12} ${x + 40} ${hy + 16} Q${x + 35} ${hy + 12} ${x + 40} ${hy + 4} Z" fill="#7fb6d6"/>`;
  let out = '';
  switch (expr) {
    case 'smile': out = dot(L, ey) + dot(R, ey) + ln(`M${x - 6} ${my - 2} Q${x} ${my + 4} ${x + 6} ${my - 2}`); break;
    case 'happy': out = ln(`M${L - 5} ${ey + 1} Q${L} ${ey - 4} ${L + 5} ${ey + 1}`) + ln(`M${R - 5} ${ey + 1} Q${R} ${ey - 4} ${R + 5} ${ey + 1}`)
      + `<path d="M${x - 8} ${my - 3} Q${x} ${my + 8} ${x + 8} ${my - 3} Z" fill="#8a2b25"/>`; break;
    case 'surprised': out = ring(L, ey) + ring(R, ey) + `<ellipse cx="${x}" cy="${my + 1}" rx="4" ry="5" fill="${INK}"/>`; break;
    case 'worried': out = dot(L, ey + 1) + dot(R, ey + 1) + ln(`M${L - 6} ${ey - 9} L${L + 4} ${ey - 6}`) + ln(`M${R + 6} ${ey - 9} L${R - 4} ${ey - 6}`)
      + ln(`M${x - 7} ${my + 1} Q${x - 3} ${my - 3} ${x} ${my + 1} Q${x + 3} ${my + 5} ${x + 7} ${my + 1}`); break;
    case 'sweat': out = ln(`M${L - 6} ${ey} L${L + 5} ${ey}`) + ln(`M${R - 5} ${ey} L${R + 6} ${ey}`)
      + ln(`M${x - 7} ${my + 1} Q${x - 3} ${my - 3} ${x} ${my + 1} Q${x + 3} ${my + 5} ${x + 7} ${my + 1}`) + drops; break;
    case 'serious': out = dot(L, ey + 1) + dot(R, ey + 1) + ln(`M${L - 6} ${ey - 6} L${L + 5} ${ey - 3}`) + ln(`M${R + 6} ${ey - 6} L${R - 5} ${ey - 3}`)
      + ln(`M${x - 6} ${my} L${x + 6} ${my}`); break;
    case 'thinking': out = dot(L + 1, ey - 2) + dot(R + 1, ey - 2) + ln(`M${x + 1} ${my} Q${x + 5} ${my - 2} ${x + 8} ${my}`)
      + `<circle cx="${x + 38}" cy="${hy - 24}" r="2" fill="${INK}"/><circle cx="${x + 44}" cy="${hy - 32}" r="3" fill="${INK}"/>`; break;
    case 'shocked': out = ring(L, ey) + ring(R, ey) + `<ellipse cx="${x}" cy="${my + 2}" rx="6" ry="7" fill="#8a2b25"/>`
      + `<path d="M${x - 14} ${hy - 22} V${hy - 12} M${x - 6} ${hy - 24} V${hy - 12} M${x + 2} ${hy - 24} V${hy - 12}" stroke="#4a6a8a" stroke-width="1.5"/>`; break;
    default: out = dot(L, ey) + dot(R, ey) + ln(`M${x - 5} ${my} L${x + 5} ${my}`);
  }
  if (CAST[id]?.female) {
    out = `<ellipse cx="${L - 6}" cy="${my - 3}" rx="5" ry="3" fill="#f2b8b0" opacity=".8"/><ellipse cx="${R + 6}" cy="${my - 3}" rx="5" ry="3" fill="#f2b8b0" opacity=".8"/>` + out;
  }
  if (id === 'reten') {
    out += `<circle cx="${L}" cy="${ey}" r="8" fill="none" stroke="#2b3a4a" stroke-width="2"/><circle cx="${R}" cy="${ey}" r="8" fill="none" stroke="#2b3a4a" stroke-width="2"/><line x1="${L + 8}" y1="${ey}" x2="${R - 8}" y2="${ey}" stroke="#2b3a4a" stroke-width="2"/>`;
  }
  if (id === 'bucho') {
    out += `<path d="M${x - 9} ${my - 4} Q${x} ${my - 9} ${x + 9} ${my - 4}" fill="none" stroke="#a9b0b5" stroke-width="3" stroke-linecap="round"/>`;
  }
  return out;
}

// 小道具（dir は体の内側＝相手のいる向き）
function prop(name, x, base, dir) {
  if (!name) return '';
  const px = dir > 0 ? x + 34 : x - 34 - 56; // 小道具の左上x
  const py = base - 92;
  const arm = `<path d="M${x + dir * 18} ${base - 40} Q${x + dir * 30} ${base - 44} ${x + dir * 40} ${base - 54}" fill="none" stroke="${SKIN}" stroke-width="7" stroke-linecap="round"/>`;
  const box = (w, h, fill = '#ffffff') => `<rect x="${px}" y="${py}" width="${w}" height="${h}" rx="3" fill="${fill}" stroke="${INK}" stroke-width="1.5"/>`;
  switch (name) {
    case 'chart_up':
    case 'chart_down': {
      const hs = name === 'chart_up' ? [12, 22, 34] : [34, 22, 10];
      const bars = hs.map((h, i) => `<rect x="${px + 9 + i * 15}" y="${py + 44 - h}" width="10" height="${h}" fill="${i === 2 ? '#c3352b' : '#9fb5a6'}"/>`).join('');
      return box(56, 50) + bars + arm;
    }
    case 'document':
      return box(42, 54) + [12, 20, 28, 36].map((d) => `<line x1="${px + 7}" y1="${py + d}" x2="${px + 35}" y2="${py + d}" stroke="#cfdcd2" stroke-width="2"/>`).join('')
        + `<path d="M${px + 22} ${py + 44} L${px + 27} ${py + 49} L${px + 36} ${py + 38}" fill="none" stroke="#c3352b" stroke-width="2.5" stroke-linecap="round"/>` + arm;
    case 'laptop':
      return `<rect x="${px}" y="${py + 8}" width="56" height="36" rx="3" fill="#2b3a4a"/><rect x="${px + 4}" y="${py + 12}" width="48" height="28" fill="#cfe3ea"/>
<path d="M${px - 6} ${py + 44} H${px + 62} L${px + 56} ${py + 52} H${px} Z" fill="#9aa5ad"/>` + arm;
    case 'memo':
      return box(36, 46) + [12, 21, 30].map((d) => `<line x1="${px + 6}" y1="${py + d}" x2="${px + 30}" y2="${py + d}" stroke="#cfdcd2" stroke-width="2"/>`).join('')
        + `<line x1="${px + 28}" y1="${py + 50}" x2="${px + 46}" y2="${py + 30}" stroke="#e0a43a" stroke-width="4" stroke-linecap="round"/>` + arm;
    case 'mail':
      return box(54, 38) + `<path d="M${px} ${py} L${px + 27} ${py + 22} L${px + 54} ${py}" fill="none" stroke="${INK}" stroke-width="1.5"/>
<circle cx="${px + 52}" cy="${py + 2}" r="9" fill="#c3352b"/><text x="${px + 52}" y="${py + 7}" text-anchor="middle" font-size="13" font-weight="700" fill="#ffffff">!</text>` + arm;
    case 'phone':
      return `<rect x="${px + 14}" y="${py}" width="28" height="50" rx="5" fill="#2b3a4a"/><rect x="${px + 17}" y="${py + 5}" width="22" height="36" fill="#cfe3ea"/>` + arm;
    case 'key':
      return `<circle cx="${px + 14}" cy="${py + 20}" r="10" fill="none" stroke="#c49a2c" stroke-width="5"/><path d="M${px + 24} ${py + 20} H${px + 54} M${px + 46} ${py + 20} V${py + 30} M${px + 38} ${py + 20} V${py + 28}" stroke="#c49a2c" stroke-width="5" stroke-linecap="round"/>` + arm;
    case 'lock':
      return `<path d="M${px + 16} ${py + 22} V${py + 12} Q${px + 28} ${py - 4} ${px + 40} ${py + 12} V${py + 22}" fill="none" stroke="#7d8890" stroke-width="5"/><rect x="${px + 8}" y="${py + 22}" width="40" height="30" rx="4" fill="#c49a2c"/><circle cx="${px + 28}" cy="${py + 35}" r="4" fill="${INK}"/>` + arm;
    case 'ai_chat': // AIとやりとりしているノートPC（ふきだし2つと、きらめき）
      return `<rect x="${px}" y="${py + 2}" width="58" height="42" rx="3" fill="#2b3a4a"/><rect x="${px + 4}" y="${py + 6}" width="50" height="34" fill="#eef4f1"/>
<rect x="${px + 8}" y="${py + 10}" width="26" height="9" rx="4" fill="#9fb5a6"/><rect x="${px + 20}" y="${py + 24}" width="30" height="11" rx="4" fill="#6b8fd6"/>
<path d="M${px + 50} ${py - 12} L${px + 53} ${py - 5} L${px + 60} ${py - 2} L${px + 53} ${py + 1} L${px + 50} ${py + 8} L${px + 47} ${py + 1} L${px + 40} ${py - 2} L${px + 47} ${py - 5} Z" fill="#e0a43a"/>
<path d="M${px - 6} ${py + 44} H${px + 64} L${px + 58} ${py + 52} H${px} Z" fill="#9aa5ad"/>` + arm;
    case 'red_tick': {
      const tx = dir > 0 ? x - 78 : x + 38; // 外側の下の方に大きなレ点
      const ty = base - 98;
      return `<path d="M${tx} ${ty + 18} L${tx + 14} ${ty + 34} L${tx + 40} ${ty}" fill="none" stroke="#c3352b" stroke-width="6" stroke-linecap="round" stroke-linejoin="round"/>
<path d="M${x + dir * 18} ${base - 40} Q${x + dir * 34} ${base - 50} ${x + dir * 40} ${base - 66}" fill="none" stroke="${SKIN}" stroke-width="7" stroke-linecap="round"/>
<line x1="${x + dir * 40}" y1="${base - 66}" x2="${x + dir * 46}" y2="${base - 86}" stroke="#c3352b" stroke-width="4" stroke-linecap="round"/>`;
    }
    default: return '';
  }
}

function bubble(text, speakerX, hy, region, width, by = 10) {
  const lines = wrap(text, width);
  const fs = 15, lh = 21, padX = 12, padY = 10;
  const maxLen = Math.max(...lines.map((l) => [...l].length));
  // 句読点は少し狭いが、安全側で1文字=1字幅として計算
  const w = Math.max(64, maxLen * fs + padX * 2);
  const h = lines.length * lh + padY * 2 - 4;
  let bx = speakerX - w / 2;
  bx = Math.max(region[0], Math.min(bx, region[1] - w));
  const bottom = by + h;
  const r = 10;
  const tx = Math.max(bx + r + 10, Math.min(speakerX, bx + w - r - 10)); // しっぽの付け根
  const tipX = speakerX + (speakerX < 200 ? 4 : -4);
  const tipY = hy - 36;
  const d = `M${bx + r} ${by} H${bx + w - r} Q${bx + w} ${by} ${bx + w} ${by + r} V${bottom - r} Q${bx + w} ${bottom} ${bx + w - r} ${bottom}`
    + ` H${tx + 7} L${tipX} ${tipY} L${tx - 7} ${bottom} H${bx + r} Q${bx} ${bottom} ${bx} ${bottom - r} V${by + r} Q${bx} ${by} ${bx + r} ${by} Z`;
  const t = lines.map((l, i) => `<text x="${bx + padX}" y="${by + padY + fs + i * lh - 2}" font-size="${fs}" fill="${INK}">${esc(l)}</text>`).join('');
  return `<path d="${d}" fill="#ffffff" stroke="${INK}" stroke-width="1.5" stroke-linejoin="round"/>${t}`;
}

// ---------- 組み立て ----------
const PW = 400, PH = 230, GAP = 14, M = 10;

export function renderComic(c) {
  const errors = validateComic(c);
  if (errors.length) throw new Error(`4コマの台本に問題があります:\n- ${errors.join('\n- ')}`);
  const H = M * 2 + PH * 4 + GAP * 3;
  const transcript = c.panels.map((p, i) => `${i + 1}コマ目：` + p.characters.filter((ch) => ch.says).map((ch) => `${CAST[ch.id].name}「${ch.says.replace(/\n/g, '')}」`).join(' ')).join(' ');
  const panels = c.panels.map((p, i) => {
    const oy = M + i * (PH + GAP);
    const base = PH - 10;
    const hy = base - 82;
    const two = p.characters.length === 2;
    const both = two && p.characters.every((ch) => ch.says);
    let g = `<rect x="0" y="0" width="${PW}" height="${PH}" fill="#fbfcfa" stroke="${INK}" stroke-width="2"/>
<line x1="0" y1="${base}" x2="${PW}" y2="${base}" stroke="#cfdcd2"/>`;
    for (const ch of p.characters) {
      const x = two ? (ch.position === 'left' ? 100 : 300) : (ch.position === 'left' ? 140 : 260);
      const dir = ch.position === 'left' ? 1 : -1;
      g += body(ch.id, x, base, ch.prop) + head(ch.id, x, hy) + face(ch.id, ch.expression, x, hy) + prop(ch.prop, x, base, dir);
    }
    // 2人とも話すときは、先に話す人（characters の先頭）のふきだしを上にずらして読む順を示す
    let order = 0;
    for (const ch of p.characters) {
      if (!ch.says) continue;
      const by = both ? (order++ === 0 ? 6 : 32) : 10;
      const x = two ? (ch.position === 'left' ? 100 : 300) : (ch.position === 'left' ? 140 : 260);
      const region = both ? (ch.position === 'left' ? [8, 196] : [204, 392]) : [8, 392];
      g += bubble(ch.says, x, hy, region, both ? LINE_NARROW : LINE_WIDE, by);
    }
    return `<g transform="translate(${M} ${oy})">${g}</g>`;
  }).join('\n');
  return `<svg class="comic-svg" viewBox="0 0 ${PW + M * 2} ${H}" role="img" aria-labelledby="comic-t comic-d" xmlns="http://www.w3.org/2000/svg" font-family="'M PLUS Rounded 1c', 'Hiragino Maru Gothic ProN', 'Hiragino Sans', 'Yu Gothic', Meiryo, sans-serif">
<title id="comic-t">4コマ漫画「${esc(c.title)}」</title>
<desc id="comic-d">${esc(transcript)}</desc>
${panels}
</svg>`;
}

export function comicTranscript(c) {
  return c.panels.map((p, i) => `${i + 1}. ` + p.characters.map((ch) =>
    `${CAST[ch.id]?.name ?? ch.id}（${ch.expression}${ch.prop ? '・' + ch.prop : ''}）${ch.says ? '「' + ch.says.replace(/\n/g, '') + '」' : ''}`).join(' / ')).join('\n');
}
