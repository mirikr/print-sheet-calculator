/* Раскладка на лист — калькулятор для препресса.
 * Все размеры в миллиметрах. Ось X — ширина листа (слева направо), ось Y — длина (сверху вниз).
 */
(() => {
  'use strict';

  // Версия этой копии сайта — из адреса скрипта (app.js?v=8). Сравнивается с version.json на сервере.
  const APP_VERSION = (() => {
    try { return new URL(document.currentScript.src).searchParams.get('v') || ''; } catch (e) { return ''; }
  })();

  const EPS = 1e-7;
  const MAX_DRAW = 20000;   // больше изделий — рисуем блоками, без отдельных прямоугольников
  const MAX_LABELS = 3000;  // больше — без номеров и всплывающих подсказок
  const MARK_OFF = 1.5;     // отступ метки реза от края раскладки, мм
  const MARK_LEN = 5;       // длина метки реза, мм
  const MAX_DIV = 8;        // подбор деления листа бумаги: до 8 × 8 частей
  const STORE_KEY = 'imposer-state-v1';
  const THEME_KEY = 'imposer-theme';
  const LIB_KEY = 'imposer-library-v1';
  const MAX_DIV_MULTI = 4;  // для нескольких изделий перебираем деление до 4 × 4 (считать тяжелее)
  const MULTI_CAP = 1200;   // максимум изделий на одном сборном листе
  const MAX_ITEMS = 20;
  const PALETTE = [
    ['#d5ecf8', '#0a6a9e'], ['#fff0bf', '#a37800'], ['#d9f2df', '#2e7d4a'], ['#e9e1fb', '#6a4cb0'],
    ['#ffe1cc', '#b5561b'], ['#fbdbe8', '#a8326a'], ['#d2f1ee', '#1f7a72'], ['#e1e6ee', '#4a5a72'],
  ];
  const ITEM_FIELDS = { w: 'ширина', h: 'высота', b: 'вылет', q: 'тираж', n: 'количество на листе' };

  const G_OWN = 'Мои форматы';
  const G_PRESS = 'Печатные форматы';
  const G_PAPER = 'Форматы бумаги';
  const G_ITEMS = 'Стандартные';

  const SHEET_FORMATS = [
    { name: 'SRA3', w: 320, h: 450, group: G_PRESS },
    { name: 'SRA3+', w: 330, h: 488, group: G_PRESS },
    { name: 'A3', w: 297, h: 420, group: G_PRESS },
    { name: 'A4', w: 210, h: 297, group: G_PRESS },
    { name: 'B3', w: 353, h: 500, group: G_PRESS },
    { name: '', w: 350, h: 500, group: G_PRESS },
    { name: 'SRA2', w: 450, h: 640, group: G_PRESS },
    { name: '', w: 500, h: 700, group: G_PAPER },
    { name: '', w: 600, h: 840, group: G_PAPER },
    { name: '', w: 620, h: 940, group: G_PAPER },
    { name: '', w: 640, h: 900, group: G_PAPER },
    { name: '', w: 700, h: 1000, group: G_PAPER },
    { name: '', w: 720, h: 1020, group: G_PAPER },
    { name: '', w: 720, h: 1040, group: G_PAPER },
  ];

  const ITEM_FORMATS = [
    { name: 'Визитка', w: 90, h: 50 },
    { name: 'Евровизитка', w: 85, h: 55 },
    { name: 'Карточка', w: 50, h: 40 },
    { name: 'Листовка A6', w: 105, h: 148 },
    { name: 'Листовка A5', w: 148, h: 210 },
    { name: 'Листовка A4', w: 210, h: 297 },
    { name: 'Плакат A3', w: 297, h: 420 },
    { name: 'Евроформат', w: 99, h: 210 },
    { name: 'Открытка', w: 100, h: 150 },
    { name: 'Квадрат', w: 100, h: 100 },
    { name: 'Квадрат', w: 150, h: 150 },
    { name: 'Наклейка', w: 50, h: 50 },
  ].map((e) => ({ ...e, group: G_ITEMS }));

  const DEFAULTS = {
    dv: 0, sw: 320, sh: 450,
    pw: 640, ph: 900, dn: 2, dm: 2, mc: 1, mw: 330, mh: 488,
    mt: 10, mr: 15, mb: 10, ml: 15, sym: 1,
    iw: 50, ih: 40,
    bt: 2, br: 2, bb: 2, bl: 2, bsym: 1,
    gp: 0, md: 'sep', rot: 1,
    q: 1000, sp: 0,
    al: 'c', cm: 1, nm: 1, v: 'auto',
    mm: 0, mq: 'a', mi: 'Карточка~50~40~2~1000~24|Визитка~90~50~2~500~10',
  };

  const NUM = {
    sw: 'sheetW', sh: 'sheetH',
    pw: 'paperW', ph: 'paperH', dn: 'divN', dm: 'divM', mw: 'machW', mh: 'machH',
    mt: 'mT', mr: 'mR', mb: 'mB', ml: 'mL',
    iw: 'itemW', ih: 'itemH',
    bt: 'bT', br: 'bR', bb: 'bB', bl: 'bL',
    gp: 'gap', q: 'qty', sp: 'spoil',
  };
  const POSITIVE = new Set(['sw', 'sh', 'pw', 'ph', 'dn', 'dm', 'mw', 'mh', 'iw', 'ih']);
  const INTEGER = new Set(['q', 'dn', 'dm']);
  const DIVIDE_KEYS = ['pw', 'ph', 'dn', 'dm', 'mw', 'mh'];

  const NAMES = {
    sw: 'ширина листа', sh: 'длина листа',
    pw: 'ширина листа бумаги', ph: 'длина листа бумаги',
    dn: 'деление по ширине', dm: 'деление по длине',
    mw: 'ширина формата машины', mh: 'длина формата машины',
    mt: 'поле сверху', mr: 'поле справа', mb: 'поле снизу', ml: 'поле слева',
    iw: 'ширина основной части', ih: 'высота основной части',
    bt: 'обрезаемая часть сверху', br: 'обрезаемая часть справа',
    bb: 'обрезаемая часть снизу', bl: 'обрезаемая часть слева',
    gp: 'зазор', q: 'тираж', sp: 'запас на приладку',
  };

  // Цвета схемы — фиксированные, чтобы экспорт SVG выглядел одинаково в любой теме.
  const C = {
    paper: '#ffffff', paperLine: '#7d8690',
    nonprint: '#eef0f2', hatch: '#c3c9d0',
    pa: '#0075b0',
    bleed: 'rgba(229,0,126,0.16)',
    item: '#d5ecf8', itemLine: '#0a6a9e',
    rot: '#fff0bf', rotLine: '#a37800',
    mark: '#1d1d1b', num: '#1f4058', numRot: '#5a4500',
    cut: '#e5007e',
  };

  const $ = (id) => document.getElementById(id);
  const inp = {};
  for (const [k, id] of Object.entries(NUM)) inp[k] = $(id);
  const gross = { w: $('grossW'), h: $('grossH') };
  const form = $('form');

  let variantPref = 'auto';

  /* ---------- Числа и текст ---------- */

  const nf = new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 2 });
  const nf1 = new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 1 });
  const fmt = (n) => nf.format(Math.abs(n) < 0.005 ? 0 : n);
  const sz = (w, h) => `${fmt(w)} × ${fmt(h)}`;
  const r3 = (n) => Math.round(n * 1000) / 1000;
  const near = (a, b) => Math.abs(a - b) < 0.01;
  const bool = (x) => x === true || x === 1 || x === '1' || x === 'true';
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  function parseNum(s) {
    const t = String(s ?? '').replace(/[\s  ]/g, '').replace(',', '.');
    return t === '' ? NaN : Number(t);
  }
  const toInput = (n) => String(r3(n)).replace('.', ',');

  function plural(n, one, few, many) {
    const a = Math.abs(n) % 100, b = a % 10;
    if (a > 10 && a < 20) return many;
    if (b === 1) return one;
    if (b > 1 && b < 5) return few;
    return many;
  }
  const sheetsWord = (n) => plural(n, 'лист', 'листа', 'листов');
  const partsWord = (n) => plural(n, 'часть', 'части', 'частей');

  /* ---------- Геометрия раскладки ---------- */

  // Ориентация изделия: размеры основной части, обрезаемая часть по сторонам и шаг сетки.
  function orient(p, rotated) {
    let w = p.iw, h = p.ih, t = p.bt, r = p.br, b = p.bb, l = p.bl;
    if (rotated) { // поворот на 90° по часовой: верх ← лево, право ← верх, низ ← право, лево ← низ
      [w, h] = [h, w];
      [t, r, b, l] = [l, t, r, b];
    }
    if (p.md === 'common') {
      // Встык по линии реза: обрезаемая часть только по внешнему краю блока.
      return { rotated, w, h, t, r, b, l, cellW: w, cellH: h, gap: 0, exX: l + r, exY: t + b, inX: l, inY: t, trX: 0, trY: 0 };
    }
    return { rotated, w, h, t, r, b, l, cellW: w + l + r, cellH: h + t + b, gap: p.gp, exX: 0, exY: 0, inX: 0, inY: 0, trX: l, trY: t };
  }

  // Сколько ячеек размера cell с зазором gap поместится в длину len, если на края блока нужно extra.
  function fit(len, cell, gap, extra) {
    const avail = len - extra;
    if (cell <= 0 || avail + EPS < cell) return 0;
    return Math.floor((avail + gap + EPS) / (cell + gap));
  }
  const span = (n, cell, gap, extra) => (n > 0 ? n * cell + (n - 1) * gap + extra : 0);

  function block(o, cols, rows) {
    return { o, cols, rows, count: cols * rows, w: span(cols, o.cellW, o.gap, o.exX), h: span(rows, o.cellH, o.gap, o.exY) };
  }

  function grid(W, H, o) {
    const cols = fit(W, o.cellW, o.gap, o.exX);
    const rows = fit(H, o.cellH, o.gap, o.exY);
    return cols && rows ? block(o, cols, rows) : null;
  }

  // Комбинированная раскладка: блок A на всю ширину/длину + блок B в оставшейся полосе.
  // Такая схема режется на гильотине: сначала рез между блоками, потом каждый блок отдельно.
  function mixed(W, H, A, B, between) {
    const gA = grid(W, H, A);
    if (!gA) return null;
    let best = null;
    const consider = (c) => { if (!best || c.count > best.count) best = c; };
    for (let k = 1; k <= gA.rows; k++) { // A сверху (k рядов), B снизу
      const top = block(A, gA.cols, k);
      const gB = grid(W, H - top.h - between, B);
      if (gB) consider({ dir: 'stack', blocks: [top, gB], count: top.count + gB.count });
    }
    for (let k = 1; k <= gA.cols; k++) { // A слева (k столбцов), B справа
      const left = block(A, k, gA.rows);
      const gB = grid(W - left.w - between, H, B);
      if (gB) consider({ dir: 'side', blocks: [left, gB], count: left.count + gB.count });
    }
    return best;
  }

  // Деление листа бумаги: часть становится печатным листом.
  // Если задан формат машины — часть ориентируется так же, как формат машины.
  function derivePress(p) {
    p.parts = 1;
    p.pieceRot = false;
    p.fits = true;
    if (!p.dv) return;
    const cw = p.pw / p.dn, ch = p.ph / p.dm;
    let w = cw, h = ch;
    if (p.mc && !near(w, h) && (w <= h) !== (p.mw <= p.mh)) [w, h] = [h, w];
    p.cw = cw;
    p.ch = ch;
    p.sw = w;
    p.sh = h;
    p.pieceRot = !near(w, cw);
    p.parts = p.dn * p.dm;
    p.fits = !p.mc || (w <= p.mw + EPS && h <= p.mh + EPS);
  }

  function compute(p, pref = variantPref) {
    const pa = { x: p.ml, y: p.mt, w: p.sw - p.ml - p.mr, h: p.sh - p.mt - p.mb };
    const res = { pa, variants: [], chosen: null, best: null, problem: null };
    const empty = { id: 'normal', title: 'Без поворота', blocks: [], count: 0, dir: null };

    if (pa.w <= EPS || pa.h <= EPS) {
      res.variants.push(empty);
      res.best = res.chosen = empty;
      res.problem = 'Непечатаемые поля больше печатного листа — печатной области не остаётся.';
      return res;
    }

    const between = p.md === 'common' ? 0 : p.gp;
    const oN = orient(p, false);
    const oR = orient(p, true);
    const same = near(p.iw, p.ih) && near(p.bt, p.br) && near(p.br, p.bb) && near(p.bb, p.bl);

    const gN = grid(pa.w, pa.h, oN);
    res.variants.push({ id: 'normal', title: 'Без поворота', blocks: gN ? [gN] : [], count: gN ? gN.count : 0, dir: null });

    if (p.rot && !same) {
      const gR = grid(pa.w, pa.h, oR);
      res.variants.push({ id: 'rotated', title: 'Поворот на 90°', blocks: gR ? [gR] : [], count: gR ? gR.count : 0, dir: null });
      let m = mixed(pa.w, pa.h, oN, oR, between);
      const m2 = mixed(pa.w, pa.h, oR, oN, between);
      if (m2 && (!m || m2.count > m.count)) m = m2;
      const pureMax = Math.max(res.variants[0].count, res.variants[1].count);
      if (m && m.count > pureMax) {
        res.variants.push({ id: 'mixed', title: 'Комбинированная', blocks: m.blocks, count: m.count, dir: m.dir });
      }
    }

    res.best = res.variants.reduce((a, b) => (b.count > a.count ? b : a));
    const chosen = res.variants.find((v) => v.id === pref && v.count > 0);
    res.chosen = chosen || res.best;

    if (res.best.count === 0) {
      res.problem = 'Изделие вместе с обрезаемой частью не помещается в печатную область. Уменьшите поля, обрезаемую часть или размер изделия.';
    }
    return res;
  }

  // Перебор делений листа бумаги: сколько изделий получится с одного листа бумаги.
  function divisionOptions(p) {
    const list = [];
    for (let n = 1; n <= MAX_DIV; n++) {
      for (let m = 1; m <= MAX_DIV; m++) {
        const q = { ...p, dn: n, dm: m };
        derivePress(q);
        if (!q.fits) continue;
        const per = compute(q, 'auto').best.count;
        if (!per) continue;
        list.push({ n, m, parts: n * m, sw: q.sw, sh: q.sh, per, total: per * n * m });
      }
    }
    list.sort((a, b) => b.total - a.total || a.parts - b.parts || Math.abs(a.n - a.m) - Math.abs(b.n - b.m));
    return list;
  }

  // Размещение блоков на листе + габариты по линиям реза.
  function place(p, res) {
    const v = res.chosen, pa = res.pa;
    if (!v.blocks.length) return null;
    const center = p.al !== 'tl';
    const between = p.md === 'common' ? 0 : p.gp;
    const [A, B] = v.blocks;
    let bw, bh, pos;
    if (!B) {
      bw = A.w; bh = A.h; pos = [[0, 0]];
    } else if (v.dir === 'stack') {
      bw = Math.max(A.w, B.w); bh = A.h + between + B.h;
      pos = [[center ? (bw - A.w) / 2 : 0, 0], [center ? (bw - B.w) / 2 : 0, A.h + between]];
    } else {
      bw = A.w + between + B.w; bh = Math.max(A.h, B.h);
      pos = [[0, center ? (bh - A.h) / 2 : 0], [A.w + between, center ? (bh - B.h) / 2 : 0]];
    }
    const ox = pa.x + (center ? (pa.w - bw) / 2 : 0);
    const oy = pa.y + (center ? (pa.h - bh) / 2 : 0);

    const blocks = v.blocks.map((b, i) => {
      const o = b.o, stepX = o.cellW + o.gap, stepY = o.cellH + o.gap;
      const x = ox + pos[i][0], y = oy + pos[i][1];
      const tx0 = x + o.inX + o.trX, ty0 = y + o.inY + o.trY;
      return {
        ...b, x, y, stepX, stepY, tx0, ty0,
        trim: { x: tx0, y: ty0, w: (b.cols - 1) * stepX + o.w, h: (b.rows - 1) * stepY + o.h },
        nb: !B ? {} : v.dir === 'stack' ? (i === 0 ? { below: true } : { above: true }) : (i === 0 ? { right: true } : { left: true }),
      };
    });

    const minX = Math.min(...blocks.map((b) => b.trim.x));
    const minY = Math.min(...blocks.map((b) => b.trim.y));
    const maxX = Math.max(...blocks.map((b) => b.trim.x + b.trim.w));
    const maxY = Math.max(...blocks.map((b) => b.trim.y + b.trim.h));
    return { blocks, bbox: { x: ox, y: oy, w: bw, h: bh }, trim: { x: minX, y: minY, w: maxX - minX, h: maxY - minY } };
  }

  function formula(v) {
    if (!v.blocks.length) return 'не помещается';
    if (v.blocks.length === 1) return `${v.blocks[0].cols} × ${v.blocks[0].rows}`;
    return v.blocks.map((b) => `${b.cols} × ${b.rows}${b.o.rotated ? ' ↻' : ''}`).join(' + ');
  }

  function sheetsFor(count, p) {
    if (!(count > 0) || !(p.q > 0)) return null;
    const sheets = Math.ceil(p.q / count - EPS);
    const total = Math.ceil(sheets * (1 + p.sp / 100) - 1e-9);
    const paper = Math.ceil(total / (p.parts || 1) - EPS);
    return { sheets, total, extra: total - sheets, printed: sheets * count, over: sheets * count - p.q, paper };
  }

  /* ---------- Чтение формы ---------- */

  const radioVal = (name) => (form.querySelector(`input[name="${name}"]:checked`) || {}).value;
  const setRadio = (name, val) => { const el = form.querySelector(`input[name="${name}"][value="${val}"]`); if (el) el.checked = true; };

  function read() {
    const errs = [];
    const p = {};
    const common = radioVal('mode') === 'common';
    const dv = radioVal('dv') === '1';
    const mc = $('machineOn').checked;
    const mm = radioVal('mm') === '1';
    const skip = new Set();
    if (common && !mm) skip.add('gp');
    if (mm) ['iw', 'ih', 'bt', 'br', 'bb', 'bl', 'q'].forEach((k) => skip.add(k));
    if (dv) { skip.add('sw'); skip.add('sh'); } else DIVIDE_KEYS.forEach((k) => skip.add(k));
    if (dv && !mc) { skip.add('mw'); skip.add('mh'); }

    for (const k of Object.keys(NUM)) {
      const el = inp[k];
      const v = parseNum(el.value);
      if (skip.has(k)) {
        el.closest('.input').classList.remove('invalid');
        p[k] = k === 'gp' ? 0 : (Number.isFinite(v) ? v : 0);
        continue;
      }
      const max = k === 'q' ? 1e9 : (k === 'dn' || k === 'dm') ? 50 : 1e5;
      const ok = Number.isFinite(v) && v >= 0 && v <= max && (!POSITIVE.has(k) || v > 0) && (!INTEGER.has(k) || Number.isInteger(v));
      el.closest('.input').classList.toggle('invalid', !ok);
      if (!ok) errs.push(k);
      p[k] = ok ? v : 0;
    }
    p.dv = dv;
    p.mc = mc;
    p.mm = mm;
    p.mq = radioVal('mq') === 'm' ? 'm' : 'a';
    p.items = mm ? readItems(errs, p.mq) : [];
    p.md = common && !mm ? 'common' : 'sep';
    p.rot = $('rotate').checked;
    p.al = radioVal('align') === 'tl' ? 'tl' : 'c';
    p.cm = $('marks').checked;
    p.nm = $('numbers').checked;
    return { p, errs };
  }

  /* ---------- Несколько изделий: список в форме ---------- */

  const ICON_STAR = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round" aria-hidden="true"><path d="M12 3.5l2.6 5.3 5.9.9-4.3 4.1 1 5.8L12 16.9l-5.2 2.7 1-5.8-4.3-4.1 5.9-.9z"/></svg>';
  const ICON_X = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg>';

  function readItems(errs, mq) {
    return [...$('mItems').querySelectorAll('.mitem')].map((row, i) => {
      const it = { i, name: row.querySelector('[data-f="name"]').value.trim() || `Изделие ${i + 1}` };
      for (const f of ['w', 'h', 'b', 'q', 'n']) {
        const el = row.querySelector(`[data-f="${f}"]`);
        const v = parseNum(el.value);
        const isInt = f === 'q' || f === 'n';
        const skipIt = f === 'n' && mq !== 'm';
        const ok = skipIt || (Number.isFinite(v) && v >= 0 && v <= (isInt ? 1e9 : 1e5) &&
          ((f !== 'w' && f !== 'h') || v > 0) && (!isInt || Number.isInteger(v)));
        el.closest('.input').classList.toggle('invalid', !ok);
        if (!ok) errs.push(`${f}:${i}`);
        it[f] = ok && Number.isFinite(v) ? v : 0;
      }
      [it.fill, it.line] = PALETTE[i % PALETTE.length];
      return it;
    });
  }

  const errName = (k) => {
    if (!k.includes(':')) return NAMES[k];
    const [f, i] = k.split(':');
    return `${ITEM_FIELDS[f]} изделия ${Number(i) + 1}`;
  };

  // Сырые значения строк (как введены) — для сохранения в ссылке и перерисовки списка.
  function collectItems() {
    return [...$('mItems').querySelectorAll('.mitem')].map((row) => {
      const o = {};
      for (const f of ['name', 'w', 'h', 'b', 'q', 'n']) o[f] = row.querySelector(`[data-f="${f}"]`).value.trim();
      return o;
    });
  }
  const encItem = (s) => s.replace(/%/g, '%25').replace(/~/g, '%7E').replace(/\|/g, '%7C');
  const encodeItems = (list) => list.map((o) => [encItem(o.name), ...['w', 'h', 'b', 'q', 'n'].map((f) => String(o[f]).replace(',', '.'))].join('~')).join('|');
  function decodeItems(str) {
    try {
      return String(str || '').split('|').filter(Boolean).slice(0, MAX_ITEMS).map((part) => {
        const [name, w, h, b, q, n] = part.split('~');
        return { name: decodeURIComponent(name || ''), w, h, b, q, n };
      });
    } catch (e) {
      return [];
    }
  }

  function renderItems(list) {
    const val = (x, fallback) => {
      const n = parseNum(x);
      return Number.isFinite(n) ? toInput(n) : (x === undefined || x === '' ? fallback : esc(x));
    };
    const field = (f, label, v, mode) =>
      `<label class="mf mf-${f}"><span>${label}</span><span class="input sm"><input data-f="${f}" inputmode="${mode}" spellcheck="false" value="${v}"></span></label>`;
    $('mItems').innerHTML = list.length ? list.map((o, i) => {
      const [fill, line] = PALETTE[i % PALETTE.length];
      return `<div class="mitem" style="--c:${fill};--cl:${line}">
        <div class="mitem-head">
          <span class="mitem-no">${i + 1}</span>
          <input class="mitem-name" data-f="name" maxlength="40" spellcheck="false" placeholder="Изделие ${i + 1}" value="${esc(o.name || '')}" aria-label="Название изделия ${i + 1}">
          <button type="button" class="icon-btn" data-act="save" title="Сохранить формат в библиотеку" aria-label="Сохранить изделие ${i + 1} в библиотеку">${ICON_STAR}</button>
          <button type="button" class="icon-btn del" data-act="del" title="Убрать изделие" aria-label="Убрать изделие ${i + 1}">${ICON_X}</button>
        </div>
        <div class="mitem-grid">
          ${field('w', 'Ширина', val(o.w, '100'), 'decimal')}
          ${field('h', 'Высота', val(o.h, '70'), 'decimal')}
          ${field('b', 'Вылет', val(o.b, '2'), 'decimal')}
          ${field('q', 'Тираж', val(o.q, '1000'), 'numeric')}
          ${field('n', 'На листе', val(o.n, '1'), 'numeric')}
        </div>
      </div>`;
    }).join('') : '<p class="muted empty-note">Список пуст — добавьте изделие поиском или кнопкой «+ Изделие».</p>';
    $('mAdd').disabled = list.length >= MAX_ITEMS;
  }

  function addItem(o) {
    const list = collectItems();
    if (list.length >= MAX_ITEMS) { toast(`Не больше ${MAX_ITEMS} изделий на одном листе`); return; }
    list.push(o);
    renderItems(list);
    const rows = $('mItems').querySelectorAll('.mitem');
    const last = rows[rows.length - 1];
    if (last) last.querySelector(o.name ? '[data-f="q"]' : '[data-f="name"]').focus();
    schedule();
  }

  /* ---------- Несколько изделий: раскладка ---------- */

  const PACK_SORTS = {
    area: (a, b) => b.w * b.h - a.w * a.h,
    maxside: (a, b) => Math.max(b.w, b.h) - Math.max(a.w, a.h) || Math.min(b.w, b.h) - Math.min(a.w, a.h),
    h: (a, b) => b.h - a.h || b.w - a.w,
    w: (a, b) => b.w - a.w || b.h - a.h,
  };
  const PACK_FULL = [];
  for (const s of ['area', 'maxside', 'h', 'w']) {
    for (const f of ['tl', 'baf', 'bssf']) {
      for (const sp of ['sas', 'las', 'minas', 'maxas']) PACK_FULL.push([s, f, sp]);
    }
  }
  const PACK_FAST = [['area', 'tl', 'sas'], ['area', 'baf', 'sas'], ['maxside', 'tl', 'las'], ['h', 'tl', 'sas'], ['w', 'tl', 'las'], ['area', 'bssf', 'minas']];

  // Гильотинная упаковка: каждое размещённое изделие делит свободную область одним сквозным резом,
  // поэтому готовый лист всегда можно разрезать на гильотине.
  function packOnce(W, H, rects, rot, [sortKey, fitKey, splitKey]) {
    const order = rects.slice().sort((a, b) => PACK_SORTS[sortKey](a, b) || a.ti - b.ti);
    const free = [{ x: 0, y: 0, w: W, h: H }];
    const out = [];
    for (const r of order) {
      let best = null;
      const orients = rot && !near(r.w, r.h) ? [false, true] : [false];
      for (let fi = 0; fi < free.length; fi++) {
        const f = free[fi];
        for (const ro of orients) {
          const w = ro ? r.h : r.w, h = ro ? r.w : r.h;
          if (w > f.w + EPS || h > f.h + EPS) continue;
          const dw = f.w - w, dh = f.h - h;
          let s1, s2 = Math.min(dw, dh);
          if (fitKey === 'tl') s1 = f.y * 1e6 + f.x;            // ряды сверху вниз, слева направо
          else if (fitKey === 'baf') s1 = f.w * f.h - w * h;   // наименьший остаток площади
          else { s1 = Math.min(dw, dh); s2 = Math.max(dw, dh); } // наименьший остаток по короткой стороне
          if (!best || s1 < best.s1 - EPS || (Math.abs(s1 - best.s1) <= EPS && s2 < best.s2)) best = { fi, ro, w, h, s1, s2 };
        }
      }
      if (!best) return null;
      const f = free[best.fi];
      out.push({ ti: r.ti, ref: r, x: f.x, y: f.y, w: best.w, h: best.h, rot: best.ro });
      const dw = f.w - best.w, dh = f.h - best.h;
      let horiz;
      if (splitKey === 'sas') horiz = dw <= dh;
      else if (splitKey === 'las') horiz = dw > dh;
      else if (splitKey === 'minas') horiz = best.w * dh > dw * best.h;
      else horiz = best.w * dh <= dw * best.h;
      const bottom = { x: f.x, y: f.y + best.h, w: horiz ? f.w : best.w, h: dh };
      const right = { x: f.x + best.w, y: f.y, w: dw, h: horiz ? best.h : f.h };
      free.splice(best.fi, 1);
      if (bottom.w > EPS && bottom.h > EPS) free.push(bottom);
      if (right.w > EPS && right.h > EPS) free.push(right);
    }
    return out;
  }

  // Блоки: экземпляры одного изделия ставятся сеткой cols × rows (+ остаток одним рядом) —
  // так лист режется аккуратно. Для каждого изделия перебираем несколько форм сетки.
  const BLOCK_CONFIGS = [
    ['area', 'tl', 'sas'], ['area', 'baf', 'sas'], ['h', 'tl', 'sas'], ['w', 'tl', 'las'],
    ['maxside', 'tl', 'las'], ['area', 'bssf', 'minas'], ['h', 'baf', 'las'], ['maxside', 'baf', 'sas'],
  ];

  function typeShapes(t, n, W, H, rot) {
    const out = [];
    for (const ro of rot && !near(t.cw, t.ch) ? [false, true] : [false]) {
      const cw = ro ? t.ch : t.cw, ch = ro ? t.cw : t.ch;
      const maxC = Math.min(n, Math.floor((W + EPS) / cw));
      const maxR = Math.min(n, Math.floor((H + EPS) / ch));
      if (maxC < 1 || maxR < 1) continue;
      for (const cols of [maxC, Math.ceil(n / maxR), maxC - 1, Math.round(Math.sqrt((n * ch) / cw)), maxC - 2]) {
        if (cols < 1 || cols > maxC) continue;
        const rows = Math.floor(n / cols);
        if (rows > maxR || out.some((s) => s.ro === ro && s.cols === cols)) continue;
        out.push({ ro, cols, rows, rem: n - cols * rows });
      }
    }
    return out;
  }

  function planBlocks(types, ns, plan) {
    const rects = [];
    plan.forEach((s) => {
      const t = types[s.ti];
      const cw = s.ro ? t.ch : t.cw, ch = s.ro ? t.cw : t.ch;
      if (s.rows > 0) rects.push({ ti: s.ti, w: s.cols * cw, h: s.rows * ch, cols: s.cols, rows: s.rows, n: s.cols * s.rows, ro: s.ro });
      if (s.rem > 0) rects.push({ ti: s.ti, w: s.rem * cw, h: ch, cols: s.rem, rows: 1, n: s.rem, ro: s.ro });
    });
    return rects;
  }

  // Все сочетания форм (декартово произведение), но не больше limit штук.
  function blockPlans(types, ns, W, H, rot, limit) {
    const lists = [];
    types.forEach((t, ti) => {
      if (!ns[ti]) return;
      lists.push(typeShapes(t, ns[ti], W, H, rot).map((s) => ({ ...s, ti })));
    });
    if (!lists.length || lists.some((l) => !l.length)) return [];
    let cut = Math.max(...lists.map((l) => l.length));
    const total = (k) => lists.reduce((a, l) => a * Math.min(l.length, k), 1);
    while (cut > 1 && total(cut) > limit) cut--;
    const ls = lists.map((l) => l.slice(0, cut));
    const plans = [];
    const idx = ls.map(() => 0);
    for (;;) {
      plans.push(ls.map((l, i) => l[idx[i]]));
      let i = 0;
      while (i < idx.length && ++idx[i] >= ls[i].length) { idx[i] = 0; i++; }
      if (i === idx.length) break;
    }
    // если сочетаний слишком много, добавим «одинаковые» планы: j-я форма для всех изделий
    for (let j = cut; j < Math.max(...lists.map((l) => l.length)); j++) plans.push(lists.map((l) => l[Math.min(j, l.length - 1)]));
    return plans;
  }

  // Разворачиваем размещённые блоки в отдельные изделия.
  function expandPack(out, types) {
    const list = [];
    for (const o of out) {
      const b = o.ref;
      if (!b || b.n === undefined) { list.push(o); continue; }
      const t = types[o.ti];
      const ro = o.rot ? !b.ro : b.ro;
      const cols = o.rot ? b.rows : b.cols;
      const cw = ro ? t.ch : t.cw, ch = ro ? t.cw : t.ch;
      for (let k = 0; k < b.n; k++) {
        list.push({ ti: o.ti, x: o.x + (k % cols) * cw, y: o.y + Math.floor(k / cols) * ch, w: cw, h: ch, rot: ro });
      }
    }
    return list;
  }

  function evalPack(list) {
    let bw = 0, bh = 0;
    const xs = new Set(), ys = new Set();
    for (const o of list) {
      bw = Math.max(bw, o.x + o.w);
      bh = Math.max(bh, o.y + o.h);
      xs.add(r3(o.x)); xs.add(r3(o.x + o.w));
      ys.add(r3(o.y)); ys.add(r3(o.y + o.h));
    }
    return { list, bw, bh, lines: xs.size + ys.size };
  }

  const packCache = new Map();
  function packBest(W, H, types, ns, rot, configs, wantBest) {
    const key = [r3(W), r3(H), rot ? 1 : 0, wantBest ? 1 : 0, configs.length,
      types.map((t, i) => `${r3(t.cw)}x${r3(t.ch)}:${ns[i]}`).join(',')].join('|');
    if (packCache.has(key)) return packCache.get(key);
    let result = null;
    const rects = [];
    let area = 0;
    types.forEach((t, ti) => {
      for (let k = 0; k < ns[ti]; k++) rects.push({ ti, w: t.cw, h: t.ch });
      area += ns[ti] * t.cw * t.ch;
    });
    if (!rects.length) {
      result = { list: [], bw: 0, bh: 0 };
    } else if (rects.length <= MULTI_CAP && area <= W * H + EPS) {
      // Из подходящих раскладок берём ту, где меньше разных линий реза: аккуратнее лист, быстрее резка.
      const consider = (list) => {
        const e = evalPack(list);
        if (!result || e.lines < result.lines || (e.lines === result.lines && e.bw * e.bh < result.bw * result.bh - EPS)) result = e;
      };
      // 1) Каждое изделие — сеткой-блоком
      const fast = configs.length < PACK_FULL.length;
      const blockCfgs = fast ? BLOCK_CONFIGS.slice(0, 4) : BLOCK_CONFIGS;
      blocks: for (const plan of blockPlans(types, ns, W, H, rot, fast ? 60 : 400)) {
        const blocks = planBlocks(types, ns, plan);
        for (const cfg of blockCfgs) {
          const out = packOnce(W, H, blocks, rot, cfg);
          if (!out) continue;
          consider(expandPack(out, types));
          if (!wantBest) break blocks;
        }
      }
      // 2) По одному изделию — плотнее, но не так ровно
      if (wantBest || !result) {
        for (const cfg of configs) {
          const out = packOnce(W, H, rects, rot, cfg);
          if (!out) continue;
          consider(expandPack(out, types));
          if (!wantBest) break;
        }
      }
    }
    if (packCache.size > 4000) packCache.clear();
    packCache.set(key, result);
    return result;
  }

  // Сборный лист. Режим «подобрать»: ищем минимальное число листов S, при котором
  // на один лист помещается ceil(тираж / S) каждого изделия.
  function solveMulti(p, fast = false) {
    const pa = { x: p.ml, y: p.mt, w: p.sw - p.ml - p.mr, h: p.sh - p.mt - p.mb };
    const types = p.items.map((it) => ({ ...it, gw: it.w + 2 * it.b, gh: it.h + 2 * it.b }));
    const res = { multi: true, pa, types, placed: null, ns: null, count: 0, S: null, bbox: null, problem: null };
    if (!types.length) { res.problem = 'Добавьте хотя бы одно изделие.'; return res; }
    if (pa.w <= EPS || pa.h <= EPS) { res.problem = 'Непечатаемые поля больше печатного листа — печатной области не остаётся.'; return res; }

    const gap = p.gp;
    const W = pa.w + gap, H = pa.h + gap; // зазор добавляем справа и снизу каждого изделия
    types.forEach((t) => { t.cw = t.gw + gap; t.ch = t.gh + gap; });
    const bad = types.filter((t) => !((t.cw <= W + EPS && t.ch <= H + EPS) || (p.rot && t.ch <= W + EPS && t.cw <= H + EPS)));
    if (bad.length) {
      res.problem = `Не помещается в печатную область: ${bad.map((t) => `«${t.name}» (${sz(t.gw, t.gh)} мм с вылетами)`).join(', ')}.`;
      return res;
    }

    const configs = fast ? PACK_FAST : PACK_FULL;
    const need = types.filter((t) => t.q > 0);
    let ns, S, pack;
    if (p.mq === 'm') {
      ns = types.map((t) => t.n);
      if (!ns.some((n) => n > 0)) { res.problem = 'Укажите, сколько штук каждого изделия ставить на лист.'; return res; }
      pack = packBest(W, H, types, ns, p.rot, configs, !fast);
      if (!pack) {
        res.problem = 'Столько изделий не помещается на лист. Уменьшите количество «На листе» или переключитесь на «Подобрать».';
        return res;
      }
      const missing = need.filter((t) => !t.n);
      S = need.length && !missing.length ? Math.max(...need.map((t) => Math.ceil(t.q / t.n - EPS))) : null;
      if (missing.length) res.problem = `У изделия ${missing.map((t) => `«${t.name}»`).join(', ')} есть тираж, но на листе 0 шт.`;
    } else {
      if (!need.length) { res.problem = 'Укажите тираж хотя бы для одного изделия.'; return res; }
      const nsFor = (s) => types.map((t) => (t.q > 0 ? Math.ceil(t.q / s - EPS) : 0));
      const feas = (s) => packBest(W, H, types, nsFor(s), p.rot, configs, false);
      const maxQ = Math.max(...need.map((t) => t.q));
      if (!feas(maxQ)) {
        res.problem = 'Даже по одному экземпляру всех изделий не помещаются на лист. Уберите часть изделий или возьмите лист больше.';
        return res;
      }
      const area = need.reduce((a, t) => a + t.q * t.cw * t.ch, 0);
      let lo = Math.min(maxQ, Math.max(1, Math.ceil(area / (W * H) - EPS)));
      let hi = maxQ;
      while (lo < hi) {
        const mid = Math.floor((lo + hi) / 2);
        if (feas(mid)) hi = mid; else lo = mid + 1;
      }
      S = lo;
      ns = nsFor(S);
      pack = fast ? feas(S) : packBest(W, H, types, ns, p.rot, configs, true);
    }

    const center = p.al !== 'tl';
    const bw = Math.max(0, pack.bw - gap), bh = Math.max(0, pack.bh - gap);
    const ox = pa.x + (center ? (pa.w - bw) / 2 : 0);
    const oy = pa.y + (center ? (pa.h - bh) / 2 : 0);
    res.placed = pack.list.map((o) => {
      const t = types[o.ti];
      const x = ox + o.x, y = oy + o.y;
      return {
        type: t, rot: o.rot,
        gross: { x, y, w: o.rot ? t.gh : t.gw, h: o.rot ? t.gw : t.gh },
        trim: { x: x + t.b, y: y + t.b, w: o.rot ? t.h : t.w, h: o.rot ? t.w : t.h },
      };
    });
    res.ns = ns;
    res.count = ns.reduce((a, b) => a + b, 0);
    res.S = S;
    res.bbox = { x: ox, y: oy, w: bw, h: bh };
    return res;
  }

  function multiSheets(p, res) {
    if (!res.placed || !res.S) return null;
    const total = Math.ceil(res.S * (1 + p.sp / 100) - 1e-9);
    const printed = res.types.reduce((a, t, i) => a + res.S * res.ns[i], 0);
    const over = res.types.reduce((a, t, i) => a + Math.max(0, res.S * res.ns[i] - t.q), 0);
    return { sheets: res.S, total, extra: total - res.S, paper: Math.ceil(total / (p.parts || 1) - EPS), printed, over };
  }

  /* ---------- Библиотека форматов (localStorage) ---------- */

  const okNum = (x, max) => Number.isFinite(+x) && +x > 0 && +x <= max;
  function cleanEntry(e, withBleed) {
    if (!e || typeof e.name !== 'string' || !okNum(e.w, 1e5) || !okNum(e.h, 1e5)) return null;
    const out = { name: e.name.trim().slice(0, 60) || `Формат ${sz(+e.w, +e.h)}`, w: +e.w, h: +e.h };
    if (typeof e.d === 'string' && e.d.trim()) out.d = e.d.trim().slice(0, 140);
    if (withBleed && Array.isArray(e.b) && e.b.length === 4 && e.b.every((x) => Number.isFinite(+x) && +x >= 0 && +x <= 1000)) {
      out.b = e.b.map(Number);
    }
    return out;
  }
  function loadLib() {
    let x = null;
    try { x = JSON.parse(localStorage.getItem(LIB_KEY)); } catch (e) { x = null; }
    const arr = (a, wb) => (Array.isArray(a) ? a.map((e) => cleanEntry(e, wb)).filter(Boolean) : []);
    return { sheets: arr(x && x.sheets, false), items: arr(x && x.items, true) };
  }
  const lib = loadLib();
  function persistLib() {
    try { localStorage.setItem(LIB_KEY, JSON.stringify(lib)); return true; } catch (e) { return false; }
  }
  function upsert(kind, entry) {
    const list = lib[kind];
    const i = list.findIndex((e) => e.name.toLowerCase() === entry.name.toLowerCase());
    if (i >= 0) list[i] = entry; else list.unshift(entry);
    return i >= 0;
  }

  /* ---------- Общая библиотека (Supabase) ---------- */

  const G_SHARED = 'Общая библиотека';
  const CFG = window.RASKLADKA_CONFIG || {};
  const SB_URL = String(CFG.supabaseUrl || '').trim().replace(/\/+$/, '');
  const SB_KEY = String(CFG.supabaseAnonKey || '').trim();
  const SHARED_ON = !!(SB_URL && SB_KEY);
  const SB_TABLE = 'raskladka_formats';
  const TRASH_DAYS = 30;
  const shared = { sheets: [], items: [], trash: [], status: SHARED_ON ? 'loading' : 'off', error: '' };

  async function sb(path, { method = 'GET', body, prefer } = {}) {
    const headers = { apikey: SB_KEY, 'Content-Type': 'application/json' };
    if (SB_KEY.startsWith('eyJ')) headers.Authorization = `Bearer ${SB_KEY}`; // старый anon-ключ в формате JWT
    if (prefer) headers.Prefer = prefer;
    const res = await fetch(`${SB_URL}/rest/v1/${path}`, { method, headers, body: body ? JSON.stringify(body) : undefined });
    if (!res.ok) {
      let msg = String(res.status);
      try { const j = await res.json(); msg += ` ${j.message || j.hint || ''}`; } catch (e) { /* без тела */ }
      throw new Error(msg);
    }
    return res.status === 204 ? null : res.json();
  }

  function sharedEntry(r) {
    const kind = r && (r.kind === 'items' || r.kind === 'sheets') ? r.kind : null;
    if (!kind) return null;
    const e = cleanEntry({ name: r.name, w: r.w, h: r.h, b: r.b, d: r.description || '' }, kind === 'items');
    return e && { ...e, id: r.id, kind, createdAt: r.created_at, deletedAt: r.deleted_at || null };
  }

  async function loadShared(quiet) {
    if (!SHARED_ON) return;
    try {
      const since = new Date(Date.now() - TRASH_DAYS * 864e5).toISOString();
      const filter = encodeURIComponent(`(deleted_at.is.null,deleted_at.gt.${since})`);
      const rows = await sb(`${SB_TABLE}?select=id,kind,name,description,w,h,b,created_at,deleted_at&or=${filter}&order=created_at.desc&limit=2000`);
      shared.sheets = [];
      shared.items = [];
      shared.trash = [];
      for (const r of rows) {
        const e = sharedEntry(r);
        if (!e) continue;
        if (e.deletedAt) shared.trash.push(e); else shared[e.kind].push(e);
      }
      shared.trash.sort((a, b) => (a.deletedAt < b.deletedAt ? 1 : -1));
      shared.status = 'ok';
      shared.error = '';
    } catch (err) {
      // 404 — в базе ещё нет таблицы: владелец проекта не выполнил supabase/shared-library.sql
      shared.status = err.message.startsWith('404') ? 'missing' : 'error';
      shared.error = err.message;
      if (!quiet) toast(shared.status === 'missing' ? 'Общая библиотека ещё не настроена в Supabase' : 'Общая библиотека недоступна — проверьте интернет');
    }
    refreshLibraries();
  }

  async function addShared(kind, entry) {
    if (!SHARED_ON) return false;
    const dup = shared[kind].find((e) => e.name.toLowerCase() === entry.name.toLowerCase() && sameSize(e, entry.w, entry.h));
    if (dup) { toast(`«${entry.name}» уже есть в общей библиотеке`); return true; }
    try {
      const body = { kind, name: entry.name, description: entry.d || null, w: entry.w, h: entry.h, b: kind === 'items' && entry.b ? entry.b : null };
      const rows = await sb(SB_TABLE, { method: 'POST', body, prefer: 'return=representation' });
      const e = sharedEntry(rows && rows[0]);
      if (e) shared[kind].unshift(e);
      refreshLibraries();
      toast(`«${entry.name}» добавлен в общую библиотеку — его видят все`);
      return true;
    } catch (err) {
      toast(err.message.startsWith('404')
        ? 'Общая библиотека ещё не настроена в Supabase — сохраните пока «Только себе»'
        : 'Не удалось сохранить в общую библиотеку');
      return false;
    }
  }

  // Удаление из общей библиотеки — это перенос в корзину (deleted_at), его можно отменить.
  async function setDeleted(e, deleted) {
    const deletedAt = deleted ? new Date().toISOString() : null;
    await sb(`${SB_TABLE}?id=eq.${encodeURIComponent(e.id)}`, { method: 'PATCH', body: { deleted_at: deletedAt } });
    shared[e.kind] = shared[e.kind].filter((x) => x.id !== e.id);
    shared.trash = shared.trash.filter((x) => x.id !== e.id);
    const moved = { id: e.id, kind: e.kind, name: e.name, d: e.d, w: e.w, h: e.h, b: e.b, createdAt: e.createdAt, deletedAt };
    if (deleted) shared.trash.unshift(moved); else shared[e.kind].unshift(moved);
    refreshLibraries();
  }
  async function trashShared(e) {
    try {
      await setDeleted(e, true);
      toast(`«${e.name}» убран в корзину общей библиотеки`, 'Отменить', () => restoreShared(e, true));
    } catch (err) {
      toast('Не удалось удалить: нет связи с общей библиотекой');
    }
  }
  async function restoreShared(e, undo) {
    try {
      await setDeleted(e, false);
      toast(undo ? 'Удаление отменено' : `«${e.name}» возвращён в общую библиотеку`);
    } catch (err) {
      toast('Не удалось вернуть: нет связи с общей библиотекой');
    }
  }

  function removeOwn(kind, e) {
    const idx = lib[kind].findIndex((x) => x.name === e.name);
    if (idx < 0) return;
    const [removed] = lib[kind].splice(idx, 1);
    persistLib();
    refreshLibraries();
    toast(`«${removed.name}» удалён из ваших форматов`, 'Отменить', () => {
      lib[kind].splice(Math.min(idx, lib[kind].length), 0, removed);
      persistLib();
      refreshLibraries();
      toast('Удаление отменено');
    });
  }
  const removeEntry = (kind, e) => (e.isShared ? trashShared(e) : removeOwn(kind, e));

  const sameSize = (e, w, h) => (near(e.w, w) && near(e.h, h)) || (near(e.w, h) && near(e.h, w));
  const entryLabel = (e) => (e.name ? `${e.name} — ${sz(e.w, e.h)} мм` : `${sz(e.w, e.h)} мм`);
  const bleedShort = (b) => (b.every((x) => near(x, b[0])) ? `вылет ${fmt(b[0])}` : `вылеты ${b.map(fmt).join('/')}`);
  const normQ = (s) => String(s).toLowerCase().replace(/ё/g, 'е').replace(/[×х*]/g, 'x').replace(/,/g, '.').replace(/\s+/g, ' ').trim();
  const hay = (e) => normQ(`${e.name} ${e.d || ''} ${e.group || ''} ${e.w}x${e.h} ${e.h}x${e.w} ${e.w} ${e.h}`);
  const queryTokens = (q) => normQ(q).replace(/\s*x\s*/g, 'x').split(' ').filter(Boolean);

  const SEARCH_ICON = '<svg class="picker-ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg>';
  const STAR_ICON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round" aria-hidden="true"><path d="M12 3.5l2.6 5.3 5.9.9-4.3 4.1 1 5.8L12 16.9l-5.2 2.7 1-5.8-4.3-4.1 5.9-.9z"/></svg>';

  // Выпадающий список с поиском: свои форматы + стандартные.
  function createPicker(host, { kind, order, placeholder, getSize, onPick, addMode = false }) {
    const id = host.id;
    host.innerHTML = `
      <div class="picker-box">
        ${SEARCH_ICON}
        <input type="text" class="picker-input" role="combobox" aria-autocomplete="list" aria-expanded="false"
          aria-controls="${id}-list" placeholder="${esc(placeholder)}" autocomplete="off" spellcheck="false" data-nostate>
        <button type="button" class="picker-toggle" tabindex="-1" aria-label="Показать все форматы"></button>
      </div>
      <ul class="picker-list" id="${id}-list" role="listbox" hidden></ul>`;
    const input = host.querySelector('.picker-input');
    const list = host.querySelector('.picker-list');
    const toggle = host.querySelector('.picker-toggle');
    let shown = [];
    let active = -1;
    let query = '';
    let current = '';

    function entries() {
      const own = lib[kind].map((e) => ({ ...e, group: G_OWN, own: true }));
      const common = shared[kind].map((e) => ({ ...e, group: G_SHARED, isShared: true }));
      let base = kind === 'items' ? ITEM_FORMATS : SHEET_FORMATS;
      if (order) base = [...base].sort((a, b) => order.indexOf(a.group) - order.indexOf(b.group));
      return own.concat(common, base);
    }

    function render(resetActive) {
      const tokens = queryTokens(query);
      shown = entries().filter((e) => tokens.every((t) => hay(e).includes(t)));
      if (resetActive) active = query && shown.length ? 0 : -1;
      if (active >= shown.length) active = shown.length - 1;
      const [w, h] = getSize();
      let html = '';
      let group = null;
      shown.forEach((e, i) => {
        if (e.group !== group) {
          group = e.group;
          html += `<li class="picker-group" role="presentation">${esc(group)}</li>`;
        }
        html += `<li class="picker-opt${i === active ? ' active' : ''}" role="option" id="${id}-o${i}" data-i="${i}" aria-selected="${sameSize(e, w, h)}">
          <span class="name">${esc(e.name || `${sz(e.w, e.h)} мм`)}</span>
          <span class="size">${e.name ? sz(e.w, e.h) : ''}${e.b ? `<small>${bleedShort(e.b)}</small>` : ''}</span>
          ${e.own || e.isShared ? `<button type="button" class="picker-del" data-del="${i}" title="${e.isShared ? 'Убрать в корзину общей библиотеки (можно вернуть)' : 'Удалить из моих форматов'}" aria-label="Удалить «${esc(e.name)}»">✕</button>` : ''}
        </li>`;
      });
      if (!shown.length) {
        html = '<li class="picker-empty">Ничего не найдено. Введите размеры в поля ниже и нажмите «Сохранить в библиотеку».</li>';
      }
      list.innerHTML = html;
      input.setAttribute('aria-activedescendant', active >= 0 ? `${id}-o${active}` : '');
      if (active >= 0) {
        const el = list.querySelector('.picker-opt.active');
        if (el) el.scrollIntoView({ block: 'nearest' });
      }
    }

    function open() {
      if (!list.hidden) return;
      query = '';
      active = -1;
      render(false);
      list.hidden = false;
      input.setAttribute('aria-expanded', 'true');
      host.classList.add('open');
      const sel = list.querySelector('[aria-selected="true"]');
      if (sel) sel.scrollIntoView({ block: 'nearest' });
    }
    function close() {
      list.hidden = true;
      input.setAttribute('aria-expanded', 'false');
      host.classList.remove('open');
      input.value = current;
    }
    function pick(i) {
      const e = shown[i];
      if (!e) return;
      onPick(e);
      close();
      input.blur();
    }

    input.addEventListener('focus', () => { open(); input.select(); });
    input.addEventListener('click', () => open());
    input.addEventListener('input', () => {
      query = input.value;
      if (list.hidden) { list.hidden = false; input.setAttribute('aria-expanded', 'true'); host.classList.add('open'); }
      render(true);
    });
    input.addEventListener('keydown', (e) => {
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault();
        if (list.hidden) open();
        const n = shown.length;
        if (!n) return;
        active = e.key === 'ArrowDown' ? (active + 1) % n : (active - 1 + n) % n;
        render(false);
      } else if (e.key === 'Enter') {
        e.preventDefault();
        if (!list.hidden && shown.length) pick(active >= 0 ? active : 0);
      } else if (e.key === 'Escape') {
        e.preventDefault();
        close();
        input.blur();
      }
    });
    input.addEventListener('blur', () => {
      setTimeout(() => { if (document.activeElement !== input && !list.hidden) close(); }, 150);
    });
    list.addEventListener('mousedown', (e) => e.preventDefault());
    list.addEventListener('click', (e) => {
      const del = e.target.closest('.picker-del');
      if (del) {
        const en = shown[Number(del.dataset.del)];
        if (en) removeEntry(kind, en);
        return;
      }
      const li = e.target.closest('.picker-opt');
      if (li) pick(Number(li.dataset.i));
    });
    toggle.addEventListener('mousedown', (e) => e.preventDefault());
    toggle.addEventListener('click', () => {
      if (list.hidden) input.focus();
      else { close(); input.blur(); }
    });

    function sync() {
      if (addMode) { // поле «добавить изделие» всегда пустое, показывает подсказку
        current = '';
        if (document.activeElement !== input) input.value = '';
        return;
      }
      const [w, h] = getSize();
      const m = entries().find((e) => sameSize(e, w, h));
      current = m ? entryLabel(m) : (w > 0 && h > 0 ? `Свой формат — ${sz(w, h)} мм` : 'Свой формат');
      if (document.activeElement !== input) input.value = current;
    }

    return {
      sync,
      refresh() { if (!list.hidden) render(false); sync(); },
    };
  }

  // Кнопка «Сохранить в библиотеку» с полем для названия.
  function createSaveBox(host, { kind, noun, getEntry }) {
    host.innerHTML = `
      <button type="button" class="lib-btn">${STAR_ICON}Сохранить в библиотеку</button>
      <div class="lib-form" hidden>
        <span class="input"><input type="text" class="lib-name" maxlength="60" data-nostate aria-label="Название формата для библиотеки"></span>
        <span class="input"><input type="text" class="lib-name lib-desc" maxlength="140" data-nostate placeholder="Краткое описание — необязательно" aria-label="Краткое описание формата"></span>
        <div class="lib-form-actions">
          ${SHARED_ON ? '<button type="button" class="btn sm primary lib-share" title="Формат увидят все, кто открывает сайт">В общую библиотеку</button>' : ''}
          <button type="button" class="btn sm${SHARED_ON ? '' : ' primary'} lib-ok" title="Только в этом браузере">${SHARED_ON ? 'Только себе' : 'Сохранить'}</button>
          <button type="button" class="btn sm lib-cancel" aria-label="Отмена">✕</button>
        </div>
      </div>`;
    const btn = host.querySelector('.lib-btn');
    const box = host.querySelector('.lib-form');
    const name = host.querySelector('.lib-name:not(.lib-desc)');
    const desc = host.querySelector('.lib-desc');

    const hide = () => { box.hidden = true; btn.hidden = false; };
    btn.addEventListener('click', () => {
      const e = getEntry();
      if (!e) { toast('Сначала введите корректные размеры'); return; }
      btn.hidden = true;
      box.hidden = false;
      name.value = '';
      desc.value = '';
      name.placeholder = `Название, например «${noun} ${sz(e.w, e.h)}»`;
      name.focus();
    });
    const save = (toShared) => {
      const e = getEntry();
      if (!e) { toast('Сначала введите корректные размеры'); return; }
      const entry = cleanEntry({ ...e, name: name.value.trim() || `${noun} ${sz(e.w, e.h)}`, d: desc.value }, kind === 'items');
      if (toShared) {
        addShared(kind, entry).then((ok) => { if (ok) hide(); });
        return;
      }
      const replaced = upsert(kind, entry);
      const ok = persistLib();
      refreshLibraries();
      hide();
      toast(!ok
        ? 'Не удалось сохранить: браузер запрещает хранить данные'
        : replaced ? `«${entry.name}» обновлён в библиотеке` : `«${entry.name}» сохранён — он будет здесь и при следующем заходе`);
    };
    host.querySelector('.lib-ok').addEventListener('click', () => save(false));
    if (SHARED_ON) host.querySelector('.lib-share').addEventListener('click', () => save(true));
    host.querySelector('.lib-cancel').addEventListener('click', hide);
    for (const el of [name, desc]) {
      el.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') { e.preventDefault(); save(SHARED_ON); }
        if (e.key === 'Escape') { e.preventDefault(); hide(); }
      });
    }
  }

  const sizeOf = (a, b) => [parseNum(inp[a].value), parseNum(inp[b].value)];
  const validSize = ([w, h]) => okNum(w, 1e5) && okNum(h, 1e5);

  function applySheet(e, wKey, hKey) {
    const [cw, ch] = sizeOf(wKey, hKey);
    const landscape = cw > ch;
    const lo = Math.min(e.w, e.h), hi = Math.max(e.w, e.h);
    inp[wKey].value = toInput(landscape ? hi : lo);
    inp[hKey].value = toInput(landscape ? lo : hi);
    schedule();
  }

  const pickers = [
    createPicker($('sheetPicker'), {
      kind: 'sheets', placeholder: 'Поиск: SRA3, A3, 320…', order: [G_PRESS, G_PAPER],
      getSize: () => sizeOf('sw', 'sh'), onPick: (e) => applySheet(e, 'sw', 'sh'),
    }),
    createPicker($('paperPicker'), {
      kind: 'sheets', placeholder: 'Поиск: 700, 640 × 900…', order: [G_PAPER, G_PRESS],
      getSize: () => sizeOf('pw', 'ph'), onPick: (e) => applySheet(e, 'pw', 'ph'),
    }),
    createPicker($('itemPicker'), {
      kind: 'items', placeholder: 'Поиск: визитка, A5, 90…',
      getSize: () => sizeOf('iw', 'ih'),
      onPick: (e) => {
        inp.iw.value = toInput(e.w);
        inp.ih.value = toInput(e.h);
        if (e.b) {
          ['bt', 'br', 'bb', 'bl'].forEach((k, i) => { inp[k].value = toInput(e.b[i]); });
          $('bsym').checked = e.b.every((x) => near(x, e.b[0]));
        }
        schedule();
      },
    }),
    createPicker($('multiPicker'), {
      kind: 'items', placeholder: 'Добавить: визитка, A5, 90…', addMode: true,
      getSize: () => [NaN, NaN],
      onPick: (e) => {
        const last = collectItems().pop();
        const b = e.b ? Math.max(...e.b) : (last ? last.b : '2');
        addItem({ name: e.name || '', w: e.w, h: e.h, b, q: last ? last.q : '1000', n: '1' });
      },
    }),
  ];

  createSaveBox($('sheetSave'), {
    kind: 'sheets', noun: 'Лист',
    getEntry: () => { const s = sizeOf('sw', 'sh'); return validSize(s) ? { w: s[0], h: s[1] } : null; },
  });
  createSaveBox($('paperSave'), {
    kind: 'sheets', noun: 'Бумага',
    getEntry: () => { const s = sizeOf('pw', 'ph'); return validSize(s) ? { w: s[0], h: s[1] } : null; },
  });
  createSaveBox($('itemSave'), {
    kind: 'items', noun: 'Изделие',
    getEntry: () => {
      const s = sizeOf('iw', 'ih');
      const b = ['bt', 'br', 'bb', 'bl'].map((k) => parseNum(inp[k].value));
      if (!validSize(s)) return null;
      return { w: s[0], h: s[1], b: b.every((x) => Number.isFinite(x) && x >= 0) ? b : undefined };
    },
  });

  /* ---------- Раздел «Библиотека форматов»: плитки ---------- */

  const STD_DESC = { [G_PRESS]: 'Стандартный печатный лист', [G_PAPER]: 'Стандартный лист бумаги', [G_ITEMS]: 'Стандартное изделие' };
  const dateRu = (iso) => { const d = new Date(iso); return Number.isNaN(+d) ? '' : d.toLocaleDateString('ru-RU'); };

  // Миниатюра формата в пропорциях: лист — белый, изделие — основная часть с вылетом вокруг.
  function tileArt(e, kind) {
    const b = kind === 'items' && e.b ? e.b : [0, 0, 0, 0];
    const gw = e.w + b[1] + b[3], gh = e.h + b[0] + b[2];
    const s = 76 / Math.max(gw, gh);
    const x = (100 - gw * s) / 2, y = (100 - gh * s) / 2;
    if (kind !== 'items') {
      return `<svg viewBox="0 0 100 100" aria-hidden="true"><rect x="${r3(x)}" y="${r3(y)}" width="${r3(gw * s)}" height="${r3(gh * s)}" rx="1" class="art-sheet"/></svg>`;
    }
    const bleed = b.some((v) => v > 0)
      ? `<rect x="${r3(x)}" y="${r3(y)}" width="${r3(gw * s)}" height="${r3(gh * s)}" class="art-bleed"/>` : '';
    return `<svg viewBox="0 0 100 100" aria-hidden="true">${bleed}<rect x="${r3(x + b[3] * s)}" y="${r3(y + b[0] * s)}" width="${r3(e.w * s)}" height="${r3(e.h * s)}" class="art-item"/></svg>`;
  }

  function tileHtml(e, kind, src, key) {
    let desc = e.d || '';
    if (src === 'std') desc = STD_DESC[e.group] || '';
    else if (src === 'trash') {
      const ago = Math.max(0, Math.floor((Date.now() - Date.parse(e.deletedAt)) / 864e5));
      desc = `${ago ? `Удалён ${ago} дн. назад` : 'Удалён сегодня'} · вернуть можно ещё ${Math.max(1, TRASH_DAYS - ago)} дн.`;
    } else if (!desc) desc = src === 'shared' ? `Добавлен ${dateRu(e.createdAt)}` : 'Сохранён в этом браузере';

    const acts = [];
    if (src === 'own') {
      if (SHARED_ON) acts.push(`<button type="button" class="icon-btn" data-lib="share" data-kind="${kind}" data-idx="${key}" title="Отправить в общую библиотеку" aria-label="Отправить «${esc(e.name)}» в общую библиотеку">↑</button>`);
      acts.push(`<button type="button" class="icon-btn del" data-lib="del-own" data-kind="${kind}" data-idx="${key}" title="Удалить из моих форматов (можно отменить)" aria-label="Удалить «${esc(e.name)}»">${ICON_X}</button>`);
    } else if (src === 'shared') {
      acts.push(`<button type="button" class="icon-btn del" data-lib="trash" data-id="${esc(e.id)}" title="Убрать в корзину (можно вернуть)" aria-label="Убрать «${esc(e.name)}» в корзину">${ICON_X}</button>`);
    } else if (src === 'trash') {
      acts.push(`<button type="button" class="btn sm" data-lib="restore" data-id="${esc(e.id)}">Вернуть</button>`);
    }
    const clickable = src !== 'trash';
    const name = e.name || `${sz(e.w, e.h)} мм`;
    return `<div class="tile${clickable ? '' : ' is-trash'}"${clickable ? ' role="button" tabindex="0"' : ''} data-src="${src}" data-kind="${kind}" data-key="${esc(key)}"
        title="${esc(name)}${e.d ? ` — ${esc(e.d)}` : ''}${clickable ? ' · нажмите, чтобы применить' : ''}">
      <span class="tile-kind">${kind === 'items' ? 'изделие' : 'лист'}</span>
      ${acts.length ? `<div class="tile-act">${acts.join('')}</div>` : ''}
      <div class="tile-art">${tileArt(e, kind)}</div>
      <div class="tile-name">${esc(name)}</div>
      <div class="tile-size">${sz(e.w, e.h)} мм${kind === 'items' && e.b && e.b.some((v) => v > 0) ? ` · ${bleedShort(e.b)}` : ''}</div>
      <div class="tile-desc">${esc(desc)}</div>
    </div>`;
  }

  function renderLibraryView() {
    const total = shared.sheets.length + shared.items.length + lib.sheets.length + lib.items.length;
    $('libCount').textContent = total ? String(total) : '';
    if ($('libView').hidden) return;

    const tokens = queryTokens($('libSearch').value);
    const kindF = (document.querySelector('input[name="libKind"]:checked') || {}).value || 'all';
    const ok = (e, kind) => (kindF === 'all' || kindF === kind) && tokens.every((t) => hay(e).includes(t));
    const filtering = tokens.length > 0 || kindF !== 'all';
    const newTile = '<button type="button" class="tile tile-new" data-new="1"><span class="tile-plus">+</span><span class="tile-name">Новый формат</span><span class="tile-desc">с названием и описанием</span></button>';
    const empty = (text) => `<p class="muted tiles-empty">${text}</p>`;

    // Общая
    $('secShared').hidden = !SHARED_ON;
    if (SHARED_ON) {
      const list = [...shared.sheets.map((e) => [e, 'sheets']), ...shared.items.map((e) => [e, 'items'])]
        .sort((a, b) => (a[0].createdAt < b[0].createdAt ? 1 : -1))
        .filter(([e, k]) => ok(e, k));
      const notice = { loading: 'Загружаю…', missing: 'Общая библиотека ещё не настроена в Supabase.', error: 'Нет связи с общей библиотекой.' }[shared.status];
      $('tilesShared').innerHTML = (filtering || shared.status === 'missing' ? '' : newTile) + list.map(([e, k]) => tileHtml(e, k, 'shared', e.id)).join('') +
        (list.length ? '' : filtering ? empty('Ничего не найдено.') : notice ? empty(notice) : '');
    }

    // Мои
    const own = [...lib.sheets.map((e, i) => [e, 'sheets', i]), ...lib.items.map((e, i) => [e, 'items', i])].filter(([e, k]) => ok(e, k));
    $('tilesOwn').innerHTML = (SHARED_ON || filtering ? '' : newTile) + own.map(([e, k, i]) => tileHtml(e, k, 'own', i)).join('') +
      (own.length ? '' : filtering ? empty('Ничего не найдено.') : SHARED_ON ? empty('Пока пусто. Свои форматы сохраняются кнопкой «Сохранить в библиотеку» → «Только себе».') : '');
    $('libExport').disabled = !(lib.sheets.length + lib.items.length);

    // Стандартные
    const std = [...SHEET_FORMATS.map((e, i) => [e, 'sheets', i]), ...ITEM_FORMATS.map((e, i) => [e, 'items', i])].filter(([e, k]) => ok(e, k));
    $('tilesStd').innerHTML = std.map(([e, k, i]) => tileHtml(e, k, 'std', i)).join('') || empty('Ничего не найдено.');

    // Корзина
    const trash = shared.trash.filter((e) => ok(e, e.kind));
    $('secTrash').hidden = !SHARED_ON || !shared.trash.length;
    $('trashTitle').textContent = `Корзина общей библиотеки (${shared.trash.length})`;
    $('tilesTrash').innerHTML = trash.map((e) => tileHtml(e, e.kind, 'trash', e.id)).join('') || empty('Ничего не найдено.');
  }

  function sharedStatusHtml() {
    const n = shared.sheets.length + shared.items.length;
    if (!SHARED_ON) return '<span class="muted">Общая библиотека не подключена: в файле <code>config.js</code> не указан адрес Supabase.</span>';
    if (shared.status === 'loading') return '<span class="muted">Загружаю общую библиотеку…</span>';
    if (shared.status === 'missing') return '<span class="bad">● общая библиотека ещё не настроена</span>: в Supabase нет таблицы <code>raskladka_formats</code> — владелец сайта должен один раз выполнить <code>supabase/shared-library.sql</code>. <button type="button" class="link-btn" data-lib="reload">проверить снова</button>';
    if (shared.status === 'error') return '<span class="bad">● нет связи с общей библиотекой</span> <button type="button" class="link-btn" data-lib="reload">повторить</button>';
    return `<span class="good">● общая библиотека подключена</span> · ${n} ${plural(n, 'формат', 'формата', 'форматов')} <button type="button" class="link-btn" data-lib="reload">обновить</button>`;
  }

  function renderLibStats() {
    const html = sharedStatusHtml();
    $('sharedStatus').innerHTML = html;
    $('libStatus').innerHTML = html;
    renderLibraryView();
  }
  function refreshLibraries() {
    pickers.forEach((pk) => pk.refresh());
    renderLibStats();
  }

  /* ---------- Отрисовка ---------- */

  // Содержимое печатного листа в координатах листа (0,0)–(sw,sh), без размерных линий.
  function sheetMarkup(p, res, lay, idp, opts = {}) {
    const showNums = opts.numbers ?? p.nm;
    const allowLabels = opts.labels ?? true;
    const maxDraw = opts.maxDraw ?? MAX_DRAW;
    const W = p.sw, H = p.sh, M = Math.max(W, H);
    const fs = M / 30;
    const pa = res.pa;
    const paOk = pa.w > EPS && pa.h > EPS;
    const hs = M / 85;
    const NS = 'vector-effect="non-scaling-stroke"';
    const o = [];

    o.push('<defs>');
    o.push(`<pattern id="${idp}-hatch" patternUnits="userSpaceOnUse" width="${r3(hs)}" height="${r3(hs)}" patternTransform="rotate(45)">` +
      `<rect width="${r3(hs)}" height="${r3(hs)}" fill="${C.nonprint}"/>` +
      `<line x1="0" y1="0" x2="0" y2="${r3(hs)}" stroke="${C.hatch}" stroke-width="${r3(hs * 0.16)}"/></pattern>`);
    if (paOk) o.push(`<clipPath id="${idp}-clip"><rect x="${r3(pa.x)}" y="${r3(pa.y)}" width="${r3(pa.w)}" height="${r3(pa.h)}"/></clipPath>`);
    o.push('</defs>');

    // Лист: непечатаемая зона (штриховка) и печатная область (белая бумага)
    o.push(`<rect x="0" y="0" width="${r3(W)}" height="${r3(H)}" fill="url(#${idp}-hatch)"/>`);
    if (paOk) {
      o.push(`<rect x="${r3(pa.x)}" y="${r3(pa.y)}" width="${r3(pa.w)}" height="${r3(pa.h)}" fill="${C.paper}"/>`);
      o.push(`<rect x="${r3(pa.x)}" y="${r3(pa.y)}" width="${r3(pa.w)}" height="${r3(pa.h)}" fill="none" stroke="${C.pa}" stroke-width="1.25" stroke-dasharray="6 4" ${NS}/>`);
    }

    if (lay) {
      const total = res.chosen.count;
      const many = total > maxDraw;
      const labels = allowLabels && !many && total <= MAX_LABELS;
      const hasBleed = p.bt + p.br + p.bb + p.bl > EPS;

      // Обрезаемая часть
      if (hasBleed) {
        if (p.md === 'common' || many) {
          for (const b of lay.blocks) {
            o.push(`<rect x="${r3(b.x)}" y="${r3(b.y)}" width="${r3(b.w)}" height="${r3(b.h)}" fill="${C.bleed}"/>`);
          }
        } else {
          for (const b of lay.blocks) {
            const bo = b.o;
            for (let rI = 0; rI < b.rows; rI++) {
              for (let cI = 0; cI < b.cols; cI++) {
                const x = b.x + bo.inX + cI * b.stepX, y = b.y + bo.inY + rI * b.stepY;
                o.push(`<rect x="${r3(x)}" y="${r3(y)}" width="${r3(bo.cellW)}" height="${r3(bo.cellH)}" fill="${C.bleed}"/>`);
              }
            }
          }
        }
      }

      // Основная часть
      let n = 0;
      const nums = [];
      for (const b of lay.blocks) {
        const bo = b.o;
        const fill = bo.rotated ? C.rot : C.item;
        const line = bo.rotated ? C.rotLine : C.itemLine;
        if (many) {
          o.push(`<rect x="${r3(b.trim.x)}" y="${r3(b.trim.y)}" width="${r3(b.trim.w)}" height="${r3(b.trim.h)}" fill="${fill}" stroke="${line}" stroke-width="1" ${NS}/>`);
          continue;
        }
        const nfs = Math.min(Math.min(bo.w, bo.h) * 0.34, fs * 0.85);
        const showNum = showNums && labels && nfs >= fs * 0.3;
        for (let rI = 0; rI < b.rows; rI++) {
          for (let cI = 0; cI < b.cols; cI++) {
            n++;
            const x = b.tx0 + cI * b.stepX, y = b.ty0 + rI * b.stepY;
            const tip = labels
              ? `<title>№ ${n} · ${sz(bo.w, bo.h)} мм${bo.rotated ? ', повёрнуто на 90°' : ''} · от левого верхнего угла листа до реза: X ${fmt(x)}, Y ${fmt(y)} мм</title>`
              : '';
            o.push(`<rect x="${r3(x)}" y="${r3(y)}" width="${r3(bo.w)}" height="${r3(bo.h)}" fill="${fill}" stroke="${line}" stroke-width="1" ${NS}>${tip}</rect>`);
            if (showNum) {
              nums.push(`<text x="${r3(x + bo.w / 2)}" y="${r3(y + bo.h / 2)}" font-size="${r3(nfs)}" fill="${bo.rotated ? C.numRot : C.num}">${n}</text>`);
            }
          }
        }
      }
      if (nums.length) o.push(`<g text-anchor="middle" dominant-baseline="central" font-weight="500" pointer-events="none">${nums.join('')}</g>`);

      // Метки реза — только внутри печатной области (за её пределами их не напечатать)
      if (p.cm && !many && paOk) {
        const m = [];
        const ln = (x1, y1, x2, y2) => m.push(`<line x1="${r3(x1)}" y1="${r3(y1)}" x2="${r3(x2)}" y2="${r3(y2)}" ${NS}/>`);
        for (const b of lay.blocks) {
          const bo = b.o;
          const xs = new Set(), ys = new Set();
          for (let cI = 0; cI < b.cols; cI++) { const x = b.tx0 + cI * b.stepX; xs.add(r3(x)); xs.add(r3(x + bo.w)); }
          for (let rI = 0; rI < b.rows; rI++) { const y = b.ty0 + rI * b.stepY; ys.add(r3(y)); ys.add(r3(y + bo.h)); }
          const top = b.y - MARK_OFF, bottom = b.y + b.h + MARK_OFF, left = b.x - MARK_OFF, right = b.x + b.w + MARK_OFF;
          for (const x of xs) {
            if (!b.nb.above) ln(x, top, x, top - MARK_LEN);
            if (!b.nb.below) ln(x, bottom, x, bottom + MARK_LEN);
          }
          for (const y of ys) {
            if (!b.nb.left) ln(left, y, left - MARK_LEN, y);
            if (!b.nb.right) ln(right, y, right + MARK_LEN, y);
          }
        }
        o.push(`<g clip-path="url(#${idp}-clip)" stroke="${C.mark}" stroke-width="0.8" fill="none">${m.join('')}</g>`);
      }
    }

    // Сборный лист: у каждого изделия свой цвет и номер
    if (res.multi && res.placed) {
      const pl = res.placed;
      const labels = allowLabels && pl.length <= MAX_LABELS;
      for (const it of pl) {
        if (it.type.b > EPS) o.push(`<rect x="${r3(it.gross.x)}" y="${r3(it.gross.y)}" width="${r3(it.gross.w)}" height="${r3(it.gross.h)}" fill="${C.bleed}"/>`);
      }
      const nums = [];
      for (const it of pl) {
        const t = it.type, tr = it.trim;
        const tip = labels
          ? `<title>${t.i + 1}. ${esc(t.name)} · ${sz(t.w, t.h)} мм${it.rot ? ', повёрнуто на 90°' : ''} · от левого верхнего угла листа до реза: X ${fmt(tr.x)}, Y ${fmt(tr.y)} мм</title>`
          : '';
        o.push(`<rect x="${r3(tr.x)}" y="${r3(tr.y)}" width="${r3(tr.w)}" height="${r3(tr.h)}" fill="${t.fill}" stroke="${t.line}" stroke-width="1" ${NS}>${tip}</rect>`);
        const nfs = Math.min(Math.min(tr.w, tr.h) * 0.34, fs * 0.85);
        if (showNums && labels && nfs >= fs * 0.3) {
          nums.push(`<text x="${r3(tr.x + tr.w / 2)}" y="${r3(tr.y + tr.h / 2)}" font-size="${r3(nfs)}" fill="${t.line}">${t.i + 1}</text>`);
        }
      }
      if (nums.length) o.push(`<g text-anchor="middle" dominant-baseline="central" font-weight="600" pointer-events="none">${nums.join('')}</g>`);
    }

    // Контур листа
    o.push(`<rect x="0" y="0" width="${r3(W)}" height="${r3(H)}" fill="none" stroke="${C.paperLine}" stroke-width="1.25" ${NS}/>`);
    return o.join('');
  }

  // Размерные линии ширины (сверху) и длины (слева).
  function dimsMarkup(W, H, fs, pad) {
    const NS = 'vector-effect="non-scaling-stroke"';
    const dY = -pad * 0.42, dX = -pad * 0.42, t = fs * 0.32, gapE = fs * 0.2;
    const L = (x1, y1, x2, y2) => `<line x1="${r3(x1)}" y1="${r3(y1)}" x2="${r3(x2)}" y2="${r3(y2)}" stroke="currentColor" stroke-width="1" ${NS}/>`;
    return '<g>' +
      L(0, -gapE, 0, dY - t) + L(W, -gapE, W, dY - t) + L(0, dY, W, dY) +
      L(-t / 2, dY + t / 2, t / 2, dY - t / 2) + L(W - t / 2, dY + t / 2, W + t / 2, dY - t / 2) +
      L(-gapE, 0, dX - t, 0) + L(-gapE, H, dX - t, H) + L(dX, 0, dX, H) +
      L(dX - t / 2, t / 2, dX + t / 2, -t / 2) + L(dX - t / 2, H + t / 2, dX + t / 2, H - t / 2) +
      `<text x="${r3(W / 2)}" y="${r3(dY - fs * 0.4)}" font-size="${r3(fs)}" text-anchor="middle" fill="currentColor">${fmt(W)} мм</text>` +
      `<text transform="translate(${r3(dX - fs * 0.4)} ${r3(H / 2)}) rotate(-90)" font-size="${r3(fs)}" text-anchor="middle" fill="currentColor">${fmt(H)} мм</text>` +
      '</g>';
  }

  function drawMain(p, res, lay) {
    const svg = $('sheetSvg');
    const W = p.sw, H = p.sh, fs = Math.max(W, H) / 30, pad = fs * 3;
    svg.setAttribute('viewBox', [-pad, -pad, W + pad * 1.4, H + pad * 1.4].map(r3).join(' '));
    svg.innerHTML = sheetMarkup(p, res, lay, 'm') + dimsMarkup(W, H, fs, pad);
  }

  // Лист бумаги: части-печатные листы (каждая с раскладкой) и линии раскроя.
  function drawParent(p, res, lay) {
    const svg = $('parentSvg');
    const W = p.pw, H = p.ph, fs = Math.max(W, H) / 30, pad = fs * 3;
    const NS = 'vector-effect="non-scaling-stroke"';
    const cw = p.cw, ch = p.ch;
    const o = [];
    const piece = sheetMarkup(p, res, lay, 'pp', { labels: false, numbers: false, maxDraw: Math.max(300, MAX_DRAW / p.parts) });
    o.push(`<defs><g id="pp-piece">${piece}</g></defs>`);
    o.push(`<rect x="0" y="0" width="${r3(W)}" height="${r3(H)}" fill="${C.paper}"/>`);
    for (let i = 0; i < p.dn; i++) {
      for (let j = 0; j < p.dm; j++) {
        const x = i * cw, y = j * ch;
        const tf = p.pieceRot ? `translate(${r3(x + cw)} ${r3(y)}) rotate(90)` : `translate(${r3(x)} ${r3(y)})`;
        o.push(`<use href="#pp-piece" xlink:href="#pp-piece" transform="${tf}"/>`);
      }
    }
    const ext = fs * 0.6;
    const cut = [];
    for (let i = 1; i < p.dn; i++) cut.push(`<line x1="${r3(i * cw)}" y1="${r3(-ext)}" x2="${r3(i * cw)}" y2="${r3(H + ext)}" ${NS}/>`);
    for (let j = 1; j < p.dm; j++) cut.push(`<line x1="${r3(-ext)}" y1="${r3(j * ch)}" x2="${r3(W + ext)}" y2="${r3(j * ch)}" ${NS}/>`);
    if (cut.length) o.push(`<g stroke="${C.cut}" stroke-width="2" stroke-dasharray="10 6" fill="none">${cut.join('')}</g>`);
    o.push(`<rect x="0" y="0" width="${r3(W)}" height="${r3(H)}" fill="none" stroke="${C.paperLine}" stroke-width="1.5" ${NS}/>`);
    o.push(dimsMarkup(W, H, fs, pad));
    svg.setAttribute('viewBox', [-pad, -pad, W + pad * 1.4, H + pad * 1.4].map(r3).join(' '));
    svg.innerHTML = o.join('');
  }

  /* ---------- Вывод результатов ---------- */

  function setKpi(id, html, sub) {
    $(id).innerHTML = html;
    $(id + 'Sub').innerHTML = sub || '&nbsp;';
  }

  function renderKpis(p, res) {
    const v = res.chosen, c = v.count;
    setKpi('kPer', fmt(c),
      c ? `раскладка ${formula(v)}${v !== res.best ? ` · максимум ${fmt(res.best.count)}` : ''}` : 'не помещается');

    $('kSheetsLabel').textContent = p.dv ? 'Печатных листов' : 'Листов на тираж';
    const s = sheetsFor(c, p);
    if (s) {
      setKpi('kSheets', `${fmt(s.total)}<small>${sheetsWord(s.total)}</small>`,
        s.extra > 0 ? `${fmt(s.sheets)} + ${fmt(s.extra)} на приладку` : `на тираж ${fmt(p.q)} шт`);
      setKpi('kOver', s.over > 0 ? `+${fmt(s.over)}` : '0', `отпечатается ${fmt(s.printed)} шт`);
    } else {
      setKpi('kSheets', '—', c ? 'укажите тираж' : '');
      setKpi('kOver', '—', '');
    }

    $('kPaperCard').hidden = !p.dv;
    if (p.dv) {
      const perPaper = c * p.parts;
      setKpi('kPaper', s ? `${fmt(s.paper)}<small>${sheetsWord(s.paper)}</small>` : '—',
        `${sz(p.pw, p.ph)} мм · ${fmt(perPaper)} шт с листа`);
    }

    const net = c * p.iw * p.ih;
    const fillSheet = (net / (p.sw * p.sh)) * 100;
    const paArea = Math.max(res.pa.w, 0) * Math.max(res.pa.h, 0);
    setKpi('kFill', `${nf1.format(fillSheet)}<small>%</small>`,
      paArea > 0 ? `печатной области — ${nf1.format((net / paArea) * 100)} %` : '');

    $('mbPer').textContent = fmt(c);
    $('mbSheets').textContent = !s ? '' : p.dv
      ? `${fmt(s.paper)} ${sheetsWord(s.paper)} бумаги`
      : `${fmt(s.total)} ${sheetsWord(s.total)} на тираж`;
  }

  function renderVariants(p, res) {
    $('variants').innerHTML = res.variants.map((v) => {
      const isBest = v === res.best && v.count > 0 && res.variants.length > 1;
      const s = sheetsFor(v.count, p);
      const tail = !v.count ? '' : p.dv
        ? ` · ${fmt(v.count * p.parts)} шт с листа бумаги`
        : s ? ` · ${fmt(s.total)} ${sheetsWord(s.total)}` : '';
      return `<button type="button" class="variant" data-v="${v.id}" aria-pressed="${v === res.chosen}"${v.count ? '' : ' disabled'}>
        <span class="v-title">${v.title}${isBest ? '<span class="badge">максимум</span>' : ''}</span>
        <span class="v-count">${fmt(v.count)}<small>шт/лист</small></span>
        <span class="v-formula">${formula(v)}${tail}</span>
      </button>`;
    }).join('');
  }

  let divToken = 0;

  // Для нескольких изделий перебор тяжелее — считаем после отрисовки основной схемы.
  function renderDivOptionsMulti(p) {
    const token = divToken;
    $('divNote').textContent = p.mc
      ? `меньше всего листов бумаги на все тиражи; только деления, которые входят в машину ${sz(p.mw, p.mh)} мм`
      : 'меньше всего листов бумаги на все тиражи';
    $('divOptions').innerHTML = '<p class="muted empty-note">Подбираю варианты деления…</p>';
    setTimeout(() => {
      if (token !== divToken) return;
      const list = [];
      for (let n = 1; n <= MAX_DIV_MULTI; n++) {
        for (let m = 1; m <= MAX_DIV_MULTI; m++) {
          const q = { ...p, dn: n, dm: m };
          derivePress(q);
          if (!q.fits) continue;
          const r = solveMulti(q, true);
          const s = multiSheets(q, r);
          if (!s) continue;
          list.push({ n, m, parts: n * m, sw: q.sw, sh: q.sh, count: r.count, sheets: s.total, paper: s.paper });
        }
      }
      if (token !== divToken) return;
      list.sort((a, b) => a.paper - b.paper || a.parts - b.parts || a.sheets - b.sheets);
      const top = list.slice(0, 6);
      if (!top.some((o) => o.n === p.dn && o.m === p.dm)) {
        const cur = list.find((o) => o.n === p.dn && o.m === p.dm);
        if (cur) top.push(cur);
      }
      $('divOptions').innerHTML = top.length
        ? top.map((o, i) => `<button type="button" class="variant" data-n="${o.n}" data-m="${o.m}" aria-pressed="${o.n === p.dn && o.m === p.dm}">
            <span class="v-title">${o.n} × ${o.m} = ${o.parts} ${partsWord(o.parts)}${i === 0 ? '<span class="badge">минимум</span>' : ''}</span>
            <span class="v-count">${fmt(o.paper)}<small>${sheetsWord(o.paper)} бумаги</small></span>
            <span class="v-formula">лист ${sz(o.sw, o.sh)} · ${fmt(o.count)} шт на нём · ${fmt(o.sheets)} печ. ${sheetsWord(o.sheets)}</span>
          </button>`).join('')
        : `<p class="muted empty-note">Ни одно деление до ${MAX_DIV_MULTI} × ${MAX_DIV_MULTI} не подходит${p.mc ? ' под формат машины' : ''}.</p>`;
    }, 30);
  }

  function renderDivOptions(p) {
    divToken++;
    $('divPanel').hidden = !p.dv;
    if (!p.dv) return;
    if (p.mm) { renderDivOptionsMulti(p); return; }
    const all = divisionOptions(p);
    const top = all.slice(0, 6);
    if (!top.some((o) => o.n === p.dn && o.m === p.dm)) {
      const cur = all.find((o) => o.n === p.dn && o.m === p.dm);
      if (cur) top.push(cur);
    }
    $('divNote').textContent = p.mc
      ? `лучшие по количеству изделий с листа; только те, что входят в машину ${sz(p.mw, p.mh)} мм`
      : 'лучшие по количеству изделий с листа бумаги';
    $('divOptions').innerHTML = top.length
      ? top.map((o, i) => `<button type="button" class="variant" data-n="${o.n}" data-m="${o.m}" aria-pressed="${o.n === p.dn && o.m === p.dm}">
          <span class="v-title">${o.n} × ${o.m} = ${o.parts} ${partsWord(o.parts)}${i === 0 ? '<span class="badge">максимум</span>' : ''}</span>
          <span class="v-count">${fmt(o.total)}<small>шт с листа</small></span>
          <span class="v-formula">печатный лист ${sz(o.sw, o.sh)} · ${fmt(o.per)} шт на нём</span>
        </button>`).join('')
      : `<p class="muted empty-note">Ни одно деление до ${MAX_DIV} × ${MAX_DIV} не подходит${p.mc ? ' под формат машины' : ''}. Проверьте размеры листа бумаги, поля и изделие.</p>`;
  }

  function bleedText(p) {
    if (near(p.bt, p.br) && near(p.br, p.bb) && near(p.bb, p.bl)) return `${fmt(p.bt)} мм с каждой стороны`;
    return `сверху ${fmt(p.bt)} · справа ${fmt(p.br)} · снизу ${fmt(p.bb)} · слева ${fmt(p.bl)}`;
  }

  function baseSpecRows(p, pa) {
    const rows = [];
    if (p.dv) {
      rows.push(['Лист бумаги', `${sz(p.pw, p.ph)} → ${p.dn} × ${p.dm} = ${p.parts} ${partsWord(p.parts)} по ${sz(p.cw, p.ch)}`]);
      if (p.mc) {
        rows.push(['Формат машины', `${sz(p.mw, p.mh)} — ${p.fits
          ? 'печатный лист помещается'
          : '<span class="bad">печатный лист не помещается</span>'}`]);
      }
      rows.push(['Печатный лист', `${sz(p.sw, p.sh)}${p.pieceRot ? ' <span class="muted">(часть повёрнута на 90° под машину)</span>' : ''}`]);
    } else {
      rows.push(['Печатный лист', `${sz(p.sw, p.sh)} <span class="muted">(ширина × длина)</span>`]);
    }
    rows.push(
      ['Непечатаемые поля', `сверху ${fmt(p.mt)} · справа ${fmt(p.mr)} · снизу ${fmt(p.mb)} · слева ${fmt(p.ml)}`],
      ['Печатная область', pa.w > 0 && pa.h > 0 ? sz(pa.w, pa.h) : '—'],
    );
    return rows;
  }

  function renderKpisMulti(p, res) {
    const ok = !!res.placed;
    const c = res.count;
    setKpi('kPer', ok ? fmt(c) : '—',
      ok ? `${res.types.length} ${plural(res.types.length, 'вид', 'вида', 'видов')}: ${res.ns.join(' + ')}` : 'не помещается');
    $('kSheetsLabel').textContent = p.dv ? 'Печатных листов' : 'Листов на тираж';
    const s = multiSheets(p, res);
    if (s) {
      setKpi('kSheets', `${fmt(s.total)}<small>${sheetsWord(s.total)}</small>`,
        s.extra > 0 ? `${fmt(s.sheets)} + ${fmt(s.extra)} на приладку` : 'на все тиражи');
      setKpi('kOver', s.over > 0 ? `+${fmt(s.over)}` : '0', `отпечатается ${fmt(s.printed)} шт`);
    } else {
      setKpi('kSheets', '—', ok ? 'укажите тиражи' : '');
      setKpi('kOver', '—', '');
    }
    $('kPaperCard').hidden = !p.dv;
    if (p.dv) {
      setKpi('kPaper', s ? `${fmt(s.paper)}<small>${sheetsWord(s.paper)}</small>` : '—',
        `${sz(p.pw, p.ph)} мм · ${fmt(c * p.parts)} шт с листа`);
    }
    const net = ok ? res.types.reduce((a, t, i) => a + res.ns[i] * t.w * t.h, 0) : 0;
    const paArea = Math.max(res.pa.w, 0) * Math.max(res.pa.h, 0);
    setKpi('kFill', `${nf1.format((net / (p.sw * p.sh)) * 100)}<small>%</small>`,
      paArea > 0 ? `печатной области — ${nf1.format((net / paArea) * 100)} %` : '');
    $('mbPer').textContent = ok ? fmt(c) : '—';
    $('mbSheets').textContent = !s ? '' : p.dv
      ? `${fmt(s.paper)} ${sheetsWord(s.paper)} бумаги`
      : `${fmt(s.total)} ${sheetsWord(s.total)} на тираж`;
  }

  function renderMultiTable(p, res) {
    const s = multiSheets(p, res);
    $('multiNote').textContent = p.mq === 'm'
      ? 'количество на листе задано вручную'
      : 'подобрано так, чтобы все тиражи уложились в минимум листов';
    const types = res.types || [];
    const body = types.map((t, i) => {
      const n = res.ns ? res.ns[i] : null;
      const printed = s ? s.sheets * n : null;
      const over = printed !== null ? printed - t.q : null;
      return `<tr>
        <td><span class="tdot" style="background:${t.fill};border-color:${t.line}"></span>${i + 1}. ${esc(t.name)}</td>
        <td class="num">${sz(t.w, t.h)}</td>
        <td class="num">${fmt(t.b)}</td>
        <td class="num">${fmt(t.q)}</td>
        <td class="num"><b>${n !== null ? fmt(n) : '—'}</b></td>
        <td class="num">${printed !== null ? fmt(printed) : '—'}</td>
        <td class="num">${over !== null ? (over > 0 ? `+${fmt(over)}` : '0') : '—'}</td>
      </tr>`;
    }).join('');
    const sumQ = types.reduce((a, t) => a + t.q, 0);
    const foot = types.length > 1 ? `<tfoot><tr>
        <td>Всего</td><td></td><td></td>
        <td class="num">${fmt(sumQ)}</td>
        <td class="num">${res.placed ? fmt(res.count) : '—'}</td>
        <td class="num">${s ? fmt(s.printed) : '—'}</td>
        <td class="num">${s ? (s.over > 0 ? `+${fmt(s.over)}` : '0') : '—'}</td>
      </tr></tfoot>` : '';
    $('mTable').innerHTML = `<thead><tr>
        <th>Изделие</th><th class="num">В обрез</th><th class="num">Вылет</th><th class="num">Тираж</th>
        <th class="num">На листе</th><th class="num">Отпечатается</th><th class="num">Лишних</th>
      </tr></thead><tbody>${body}</tbody>${foot}`;
  }

  function renderSpecsMulti(p, res) {
    const pa = res.pa;
    const rows = baseSpecRows(p, pa);
    rows.push(['Изделия', res.types.map((t, i) => `${i + 1}. ${esc(t.name)} — ${sz(t.w, t.h)}, вылет ${fmt(t.b)}`).join('<br>')]);
    rows.push(['Резка', `у каждого изделия своя обрезаемая часть (двойной рез)${p.gp > 0 ? `, зазор ${fmt(p.gp)}` : ''}; раскладка гильотинная`]);
    rows.push(['Количество на листе', p.mq === 'm' ? 'задано вручную' : 'подобрано под тиражи — минимум листов на все изделия']);
    if (res.placed) {
      rows.push(['Схема раскладки', `<span class="em">${res.ns.map((n, i) => `${n} × №${i + 1}`).join(' + ')} = ${fmt(res.count)} шт</span>`]);
      if (p.dv) rows.push(['С листа бумаги', `<span class="em">${p.parts} × ${fmt(res.count)} = ${fmt(p.parts * res.count)} шт</span>`]);
      rows.push(['Габарит раскладки', `${sz(res.bbox.w, res.bbox.h)} с обрезаемой частью`]);
      rows.push(['Свободно в печатной области', `по ширине ${fmt(pa.w - res.bbox.w)} · по длине ${fmt(pa.h - res.bbox.h)}`]);
    }
    const s = multiSheets(p, res);
    if (s) {
      rows.push(['Тираж', `${fmt(s.sheets)} ${sheetsWord(s.sheets)}` +
        (s.extra > 0 ? ` + ${fmt(s.extra)} на приладку (${fmt(p.sp)} %) = ${fmt(s.total)} ${sheetsWord(s.total)}` : '') +
        (p.dv ? ` → <span class="em">${fmt(s.paper)} ${sheetsWord(s.paper)} бумаги ${sz(p.pw, p.ph)}</span>` : '') +
        ` · отпечатается ${fmt(s.printed)} шт`]);
    }
    $('specs').innerHTML = rows.map(([k, val]) => `<dt>${k}</dt><dd>${val}</dd>`).join('');
  }

  function setTypeLegend(res) {
    const anchor = $('legendItem');
    anchor.parentNode.querySelectorAll('.lt').forEach((n) => n.remove());
    anchor.hidden = !!res;
    if (!res || !res.types) return;
    anchor.insertAdjacentHTML('afterend', res.types.map((t, i) =>
      `<li class="lt"><span class="sw" style="background:${t.fill};border-color:${t.line}"></span>${i + 1}. ${esc(t.name)}</li>`).join(''));
  }

  function renderSpecs(p, res, lay) {
    const pa = res.pa, v = res.chosen;
    const rows = [];
    if (p.dv) {
      rows.push(['Лист бумаги', `${sz(p.pw, p.ph)} → ${p.dn} × ${p.dm} = ${p.parts} ${partsWord(p.parts)} по ${sz(p.cw, p.ch)}`]);
      if (p.mc) {
        rows.push(['Формат машины', `${sz(p.mw, p.mh)} — ${p.fits
          ? 'печатный лист помещается'
          : '<span class="bad">печатный лист не помещается</span>'}`]);
      }
      rows.push(['Печатный лист', `${sz(p.sw, p.sh)}${p.pieceRot ? ' <span class="muted">(часть повёрнута на 90° под машину)</span>' : ''}`]);
    } else {
      rows.push(['Печатный лист', `${sz(p.sw, p.sh)} <span class="muted">(ширина × длина)</span>`]);
    }
    rows.push(
      ['Непечатаемые поля', `сверху ${fmt(p.mt)} · справа ${fmt(p.mr)} · снизу ${fmt(p.mb)} · слева ${fmt(p.ml)}`],
      ['Печатная область', pa.w > 0 && pa.h > 0 ? sz(pa.w, pa.h) : '—'],
      ['Основная часть изделия', sz(p.iw, p.ih)],
      ['Обрезаемая часть', bleedText(p)],
      ['Размер до обреза', sz(p.iw + p.bl + p.br, p.ih + p.bt + p.bb)],
      ['Резка', p.md === 'common'
        ? 'общий рез: изделия встык, обрезаемая часть только по краю блока'
        : `обрезаемая часть у каждого изделия (двойной рез)${p.gp > 0 ? `, зазор ${fmt(p.gp)}` : ''}`],
    );

    if (lay) {
      const scheme = v.blocks.map((b) =>
        `${b.cols} × ${b.rows} = ${fmt(b.count)} шт ${b.o.rotated ? 'с поворотом 90°' : 'без поворота'}`).join(' + ');
      rows.push(['Схема раскладки', `<span class="em">${scheme}${v.blocks.length > 1 ? ` → ${fmt(v.count)} шт` : ''}</span> <span class="muted">(по ширине × по длине)</span>`]);
      if (p.dv) rows.push(['С листа бумаги', `<span class="em">${p.parts} × ${fmt(v.count)} = ${fmt(p.parts * v.count)} шт</span>`]);
      rows.push(['Габарит раскладки', `${sz(lay.bbox.w, lay.bbox.h)} с обрезаемой частью · ${sz(lay.trim.w, lay.trim.h)} по линиям реза`]);
      rows.push(['От края листа до реза', `слева ${fmt(lay.trim.x)} · сверху ${fmt(lay.trim.y)} · справа ${fmt(p.sw - lay.trim.x - lay.trim.w)} · снизу ${fmt(p.sh - lay.trim.y - lay.trim.h)}`]);
      rows.push(['Свободно в печатной области', `по ширине ${fmt(pa.w - lay.bbox.w)} · по длине ${fmt(pa.h - lay.bbox.h)}`]);
      if (v.blocks.length === 1) {
        const b = v.blocks[0], o = b.o;
        const needW = span(b.cols + 1, o.cellW, o.gap, o.exX) - pa.w;
        const needH = span(b.rows + 1, o.cellH, o.gap, o.exY) - pa.h;
        rows.push(['Чтобы влез ещё ряд', `+${fmt(b.rows)} шт — не хватает ${fmt(needW)} по ширине · +${fmt(b.cols)} шт — не хватает ${fmt(needH)} по длине`]);
      }
    }

    const s = sheetsFor(v.count, p);
    if (s) {
      rows.push(['Тираж', `${fmt(p.q)} шт → ${fmt(s.sheets)} ${sheetsWord(s.sheets)}` +
        (s.extra > 0 ? ` + ${fmt(s.extra)} на приладку (${fmt(p.sp)} %) = ${fmt(s.total)} ${sheetsWord(s.total)}` : '') +
        (p.dv ? ` → <span class="em">${fmt(s.paper)} ${sheetsWord(s.paper)} бумаги ${sz(p.pw, p.ph)}</span>` : '') +
        ` · отпечатается ${fmt(s.printed)} шт`]);
    }

    $('specs').innerHTML = rows.map(([k, val]) => `<dt>${k}</dt><dd>${val}</dd>`).join('');
  }

  function showAlert(text) {
    const a = $('alert');
    if (text) { a.textContent = text; a.hidden = false; } else { a.hidden = true; }
  }

  function refreshDerived(p, divideOk) {
    // Размер до обреза — пересчитываем, если пользователь сейчас не вводит его сам
    if (p.iw > 0 && document.activeElement !== gross.w) {
      gross.w.value = toInput(p.iw + p.bl + p.br);
      gross.w.closest('.input').classList.remove('invalid');
    }
    if (p.ih > 0 && document.activeElement !== gross.h) {
      gross.h.value = toInput(p.ih + p.bt + p.bb);
      gross.h.closest('.input').classList.remove('invalid');
    }
    $('netSize').textContent = p.iw > 0 && p.ih > 0 ? sz(p.iw, p.ih) : '—';
    const paw = p.sw - p.ml - p.mr, pah = p.sh - p.mt - p.mb;
    $('paSize').textContent = p.sw > 0 && p.sh > 0 && paw > 0 && pah > 0 ? sz(paw, pah) : '—';
    $('gapRow').hidden = p.md === 'common';
    $('modeHint').innerHTML = p.md === 'common'
      ? 'Изделия стоят встык: между соседями <b>один рез</b>, обрезаемая часть — только по внешнему краю блока.'
      : 'У каждого изделия своя обрезаемая часть: между соседями <b>два реза</b>.';

    $('wholeBlock').hidden = p.dv;
    $('divideBlock').hidden = !p.dv;
    $('singleBlock').hidden = p.mm;
    $('multiBlock').hidden = !p.mm;
    $('cutModeBlock').hidden = p.mm;
    $('qtyField').hidden = p.mm;
    $('mItems').classList.toggle('manual', p.mq === 'm');
    $('machineDims').classList.toggle('disabled', !p.mc);
    $('figures').classList.toggle('split', p.dv);
    $('parentPanel').hidden = !p.dv;

    const readout = $('pieceReadout');
    if (p.dv && divideOk) {
      readout.innerHTML = `Печатный лист: <b>${sz(p.sw, p.sh)} мм</b> — ${p.parts} ${partsWord(p.parts)} с листа бумаги` +
        (p.pieceRot ? '<br><span class="muted">часть повёрнута на 90°, как в машине</span>' : '') +
        (p.mc ? (p.fits
          ? '<br><span class="good">✓ помещается в машину</span>'
          : `<br><span class="bad">✕ больше формата машины ${sz(p.mw, p.mh)} мм</span>`) : '');
    } else {
      readout.innerHTML = p.dv ? 'Проверьте размеры листа бумаги и деление.' : '';
    }
  }

  function update() {
    const { p, errs } = read();
    const divideOk = !errs.some((k) => DIVIDE_KEYS.includes(k));
    if (p.dv) {
      if (divideOk) derivePress(p);
      else { p.sw = 0; p.sh = 0; p.parts = 1; }
    } else {
      derivePress(p);
    }
    pickers.forEach((pk) => pk.sync());
    refreshDerived(p, divideOk);
    save();

    const results = $('results');
    if (errs.length) {
      showAlert(`Проверьте значения: ${errs.map(errName).join(', ')}. Нужны числа не меньше нуля; размеры — больше нуля; тираж и деление — целые числа.`);
      results.classList.add('stale');
      return;
    }
    results.classList.remove('stale');

    const machineProblem = p.dv && !p.fits
      ? `Печатный лист ${sz(p.sw, p.sh)} мм больше формата машины ${sz(p.mw, p.mh)} мм. Выберите другое деление — подходящие варианты показаны ниже.`
      : null;
    $('variantsPanel').hidden = p.mm;
    $('multiPanel').hidden = !p.mm;
    if (p.mm) {
      const mres = solveMulti(p);
      lastMulti = mres;
      showAlert(mres.problem || machineProblem);
      renderKpisMulti(p, mres);
      renderMultiTable(p, mres);
      renderDivOptions(p);
      drawMain(p, mres, null);
      if (p.dv) drawParent(p, mres, null);
      renderSpecsMulti(p, mres);
      $('figCaption').textContent = mres.placed ? `сборный лист · ${fmt(mres.count)} шт на листе` : 'изделия не помещаются';
      $('parentCaption').textContent = p.dv
        ? `${p.parts} ${partsWord(p.parts)} по ${sz(p.cw, p.ch)} мм · ${fmt(mres.count * p.parts)} шт с листа`
        : '';
      $('legendRot').hidden = true;
      $('legendMarks').hidden = true;
      setTypeLegend(mres);
      return;
    }
    setTypeLegend(null);

    const res = compute(p);
    showAlert(res.problem || machineProblem);
    const lay = place(p, res);
    renderKpis(p, res);
    renderVariants(p, res);
    renderDivOptions(p);
    drawMain(p, res, lay);
    if (p.dv) drawParent(p, res, lay);
    renderSpecs(p, res, lay);

    $('figCaption').textContent = res.chosen.count
      ? `${res.chosen.title.toLowerCase()} · ${fmt(res.chosen.count)} шт на листе`
      : 'изделие не помещается';
    $('parentCaption').textContent = p.dv
      ? `${p.parts} ${partsWord(p.parts)} по ${sz(p.cw, p.ch)} мм · ${fmt(res.chosen.count * p.parts)} шт с листа`
      : '';
    $('legendRot').hidden = !res.chosen.blocks.some((b) => b.o.rotated);
    $('legendMarks').hidden = !p.cm;
  }

  let lastMulti = null;
  let pending = false;
  function schedule() {
    if (pending) return;
    pending = true;
    queueMicrotask(() => { pending = false; update(); });
  }

  /* ---------- Состояние: ссылка и localStorage ---------- */

  function snapshot() {
    const s = {};
    for (const k of Object.keys(NUM)) s[k] = inp[k].value.trim().replace(',', '.');
    s.dv = radioVal('dv') === '1' ? 1 : 0;
    s.mc = +$('machineOn').checked;
    s.sym = +$('sym').checked;
    s.bsym = +$('bsym').checked;
    s.md = radioVal('mode') === 'common' ? 'common' : 'sep';
    s.rot = +$('rotate').checked;
    s.al = radioVal('align') === 'tl' ? 'tl' : 'c';
    s.cm = +$('marks').checked;
    s.nm = +$('numbers').checked;
    s.v = variantPref;
    s.mm = radioVal('mm') === '1' ? 1 : 0;
    s.mq = radioVal('mq') === 'm' ? 'm' : 'a';
    s.mi = encodeItems(collectItems());
    return s;
  }

  function save() {
    const s = snapshot();
    try { history.replaceState(null, '', '#' + new URLSearchParams(s).toString()); } catch (e) { /* file:// и т. п. */ }
    try { localStorage.setItem(STORE_KEY, JSON.stringify(s)); } catch (e) { /* приватный режим */ }
  }

  function apply(src) {
    const s = { ...DEFAULTS, ...src };
    for (const k of Object.keys(NUM)) {
      const n = parseNum(s[k]);
      inp[k].value = toInput(Number.isFinite(n) ? n : DEFAULTS[k]);
    }
    setRadio('dv', bool(s.dv) ? '1' : '0');
    $('machineOn').checked = bool(s.mc);
    $('sym').checked = bool(s.sym);
    $('bsym').checked = bool(s.bsym);
    $('rotate').checked = bool(s.rot);
    $('marks').checked = bool(s.cm);
    $('numbers').checked = bool(s.nm);
    setRadio('mode', s.md === 'common' ? 'common' : 'sep');
    setRadio('align', s.al === 'tl' ? 'tl' : 'c');
    variantPref = ['auto', 'normal', 'rotated', 'mixed'].includes(s.v) ? s.v : 'auto';
    setRadio('mm', bool(s.mm) ? '1' : '0');
    setRadio('mq', s.mq === 'm' ? 'm' : 'a');
    const items = decodeItems(s.mi);
    renderItems(items.length || src.mi !== undefined ? items : decodeItems(DEFAULTS.mi));
  }

  function loadInitial() {
    const hash = location.hash.slice(1);
    if (hash) {
      const obj = Object.fromEntries(new URLSearchParams(hash));
      if (Object.keys(obj).some((k) => k in DEFAULTS)) return obj;
    }
    try { return JSON.parse(localStorage.getItem(STORE_KEY)) || {}; } catch (e) { return {}; }
  }

  /* ---------- События ---------- */

  const BLEEDS = ['bt', 'br', 'bb', 'bl'];

  form.addEventListener('submit', (e) => e.preventDefault());

  form.addEventListener('input', (e) => {
    const t = e.target;
    if (t.hasAttribute('data-nostate')) return; // поиск форматов и поле названия
    if (t === gross.w || t === gross.h) {
      const isW = t === gross.w;
      const g = parseNum(t.value);
      const b1 = parseNum((isW ? inp.bl : inp.bt).value) || 0;
      const b2 = parseNum((isW ? inp.br : inp.bb).value) || 0;
      const net = g - b1 - b2;
      const ok = Number.isFinite(g) && net > EPS;
      t.closest('.input').classList.toggle('invalid', !ok);
      if (ok) (isW ? inp.iw : inp.ih).value = toInput(net);
      schedule();
      return;
    }
    if ($('sym').checked) {
      if (t === inp.ml) inp.mr.value = t.value;
      if (t === inp.mr) inp.ml.value = t.value;
      if (t === inp.mt) inp.mb.value = t.value;
      if (t === inp.mb) inp.mt.value = t.value;
    }
    if ($('bsym').checked && BLEEDS.some((k) => inp[k] === t)) {
      for (const k of BLEEDS) if (inp[k] !== t) inp[k].value = t.value;
    }
    schedule();
  });

  form.addEventListener('change', (e) => {
    const t = e.target;
    if (t.hasAttribute('data-nostate')) return;
    if (t.name === 'mq' && t.value === 'm' && lastMulti && lastMulti.ns) {
      // Переход на ручной режим: начинаем с подобранных количеств, а не с пустого листа
      const fields = $('mItems').querySelectorAll('[data-f="n"]');
      lastMulti.ns.forEach((n, i) => { if (fields[i]) fields[i].value = String(n); });
    }
    if (t.id === 'sym' && t.checked) { inp.mr.value = inp.ml.value; inp.mb.value = inp.mt.value; }
    if (t.id === 'bsym' && t.checked) { for (const k of ['br', 'bb', 'bl']) inp[k].value = inp.bt.value; }
    if (t === gross.w || t === gross.h) t.closest('.input').classList.remove('invalid');
    schedule();
  });

  form.addEventListener('focusout', (e) => {
    if (e.target === gross.w || e.target === gross.h) schedule(); // вернуть значение, посчитанное от основной части
  });

  // Стрелки ↑/↓ в числовых полях
  form.addEventListener('keydown', (e) => {
    const t = e.target;
    if (t.tagName !== 'INPUT' || !t.inputMode || (e.key !== 'ArrowUp' && e.key !== 'ArrowDown')) return;
    const v = parseNum(t.value);
    if (!Number.isFinite(v)) return;
    e.preventDefault();
    const isInt = t.inputMode === 'numeric';
    const step = e.shiftKey ? 10 : (e.altKey && !isInt) ? 0.1 : 1;
    const min = t.id === 'divN' || t.id === 'divM' ? 1 : 0;
    const next = Math.max(min, r3(v + (e.key === 'ArrowUp' ? step : -step)));
    t.value = isInt ? String(Math.round(next)) : toInput(next);
    t.dispatchEvent(new Event('input', { bubbles: true }));
  });

  const swap = (a, b) => { [inp[a].value, inp[b].value] = [inp[b].value, inp[a].value]; schedule(); };
  $('sheetSwap').addEventListener('click', () => swap('sw', 'sh'));
  $('paperSwap').addEventListener('click', () => swap('pw', 'ph'));

  $('itemSwap').addEventListener('click', () => {
    // Поворот изделия: меняем ширину/высоту и поворачиваем обрезаемую часть вместе с ним
    [inp.iw.value, inp.ih.value] = [inp.ih.value, inp.iw.value];
    const [t, r, b, l] = BLEEDS.map((k) => inp[k].value);
    [inp.bt.value, inp.br.value, inp.bb.value, inp.bl.value] = [l, t, r, b];
    schedule();
  });

  $('variants').addEventListener('click', (e) => {
    const btn = e.target.closest('.variant');
    if (!btn || btn.disabled) return;
    variantPref = btn.dataset.v;
    update();
  });

  $('divOptions').addEventListener('click', (e) => {
    const btn = e.target.closest('.variant');
    if (!btn) return;
    inp.dn.value = btn.dataset.n;
    inp.dm.value = btn.dataset.m;
    update();
  });

  $('mAdd').addEventListener('click', () => {
    const last = collectItems().pop();
    addItem(last ? { ...last, name: '', n: '1' } : { name: '', w: '100', h: '70', b: '2', q: '1000', n: '1' });
  });

  $('mItems').addEventListener('click', (e) => {
    const btn = e.target.closest('[data-act]');
    if (!btn) return;
    const rows = [...$('mItems').querySelectorAll('.mitem')];
    const idx = rows.indexOf(btn.closest('.mitem'));
    const list = collectItems();
    if (btn.dataset.act === 'del') {
      list.splice(idx, 1);
      renderItems(list);
      schedule();
      return;
    }
    if (btn.dataset.act === 'save') {
      const it = list[idx];
      const w = parseNum(it.w), h = parseNum(it.h), b = parseNum(it.b);
      if (!validSize([w, h]) || !(b >= 0)) { toast('Сначала введите корректные размеры изделия'); return; }
      const entry = cleanEntry({ name: it.name || `Изделие ${sz(w, h)}`, w, h, b: [b, b, b, b] }, true);
      const replaced = upsert('items', entry);
      const ok = persistLib();
      refreshLibraries();
      toast(!ok ? 'Не удалось сохранить: браузер запрещает хранить данные'
        : replaced ? `«${entry.name}» обновлён в библиотеке` : `«${entry.name}» сохранён в библиотеку`);
    }
  });

  $('btnReset').addEventListener('click', () => {
    apply(DEFAULTS);
    variantPref = 'auto';
    update();
    toast('Параметры сброшены (библиотека форматов сохранена)');
  });

  $('btnPrint').addEventListener('click', () => window.print());

  $('mobileBar').addEventListener('click', () => $('results').scrollIntoView({ behavior: 'smooth', block: 'start' }));

  $('btnTheme').addEventListener('click', () => {
    const root = document.documentElement;
    const cur = root.dataset.theme || (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
    const next = cur === 'dark' ? 'light' : 'dark';
    root.dataset.theme = next;
    try { localStorage.setItem(THEME_KEY, next); } catch (e) { /* ignore */ }
  });

  $('btnLink').addEventListener('click', async () => {
    const url = location.href;
    try {
      await navigator.clipboard.writeText(url);
      toast('Ссылка с параметрами скопирована');
    } catch (e) {
      const ta = document.createElement('textarea');
      ta.value = url;
      document.body.appendChild(ta);
      ta.select();
      let ok = false;
      try { ok = document.execCommand('copy'); } catch (err) { ok = false; }
      ta.remove();
      toast(ok ? 'Ссылка с параметрами скопирована' : 'Скопируйте адрес из строки браузера');
    }
  });

  function download(name, data, type) {
    const blob = new Blob([data], { type });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  }

  function exportSvg(svg, name) {
    const vb = (svg.getAttribute('viewBox') || '').split(' ').map(Number);
    if (vb.length !== 4) return;
    const clone = svg.cloneNode(true);
    clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
    clone.setAttribute('xmlns:xlink', 'http://www.w3.org/1999/xlink');
    clone.setAttribute('width', `${vb[2]}mm`);   // 1 единица = 1 мм → масштаб 1:1
    clone.setAttribute('height', `${vb[3]}mm`);
    clone.setAttribute('font-family', 'Arial, Helvetica, sans-serif');
    clone.removeAttribute('role');
    clone.removeAttribute('id');
    clone.querySelectorAll('[vector-effect]').forEach((n) => {
      const w = parseFloat(n.getAttribute('stroke-width') || n.parentNode.getAttribute('stroke-width') || '1');
      n.removeAttribute('vector-effect');
      n.setAttribute('stroke-width', String(r3(w * 0.25)));
    });
    clone.querySelectorAll('[stroke-dasharray]').forEach((n) => n.setAttribute('stroke-dasharray', '1.5 1'));
    const data = '<?xml version="1.0" encoding="UTF-8"?>\n' +
      new XMLSerializer().serializeToString(clone).replace(/currentColor/g, '#3c434b');
    download(name, data, 'image/svg+xml;charset=utf-8');
    toast('Схема сохранена в SVG (масштаб 1:1, мм)');
  }

  $('btnSvg').addEventListener('click', () => {
    const { p } = read();
    if (p.dv) derivePress(p);
    const count = parseNum($('kPer').textContent) || 0;
    exportSvg($('sheetSvg'), `raskladka_${toInput(p.sw)}x${toInput(p.sh)}_${toInput(p.iw)}x${toInput(p.ih)}_${count}sht.svg`);
  });

  $('btnSvgParent').addEventListener('click', () => {
    const { p } = read();
    exportSvg($('parentSvg'), `raskroy_${toInput(p.pw)}x${toInput(p.ph)}_na_${p.dn}x${p.dm}.svg`);
  });

  // Библиотека: файл для переноса на другое устройство
  $('libExport').addEventListener('click', () => {
    const data = JSON.stringify({ app: 'raskladka-na-list', version: 1, sheets: lib.sheets, items: lib.items }, null, 2);
    download('biblioteka-formatov.json', data, 'application/json');
    toast('Файл библиотеки скачан');
  });
  $('libImport').addEventListener('click', () => $('libFile').click());
  $('libFile').addEventListener('change', async (e) => {
    const file = e.target.files && e.target.files[0];
    e.target.value = '';
    if (!file) return;
    try {
      const x = JSON.parse(await file.text());
      let n = 0;
      for (const kind of ['sheets', 'items']) {
        for (const raw of Array.isArray(x[kind]) ? x[kind] : []) {
          const entry = cleanEntry(raw, kind === 'items');
          if (entry) { upsert(kind, entry); n++; }
        }
      }
      persistLib();
      refreshLibraries();
      toast(n ? `Загружено форматов: ${n}` : 'В файле не найдено форматов');
    } catch (err) {
      toast('Не удалось прочитать файл библиотеки');
    }
  });

  let toastTimer = 0;
  let toastFn = null;
  function toast(text, actionLabel, onAction) {
    const t = $('toast');
    const btn = $('toastAction');
    $('toastText').textContent = text;
    toastFn = onAction || null;
    btn.hidden = !onAction;
    if (onAction) btn.textContent = actionLabel;
    t.classList.toggle('has-action', !!onAction);
    t.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { t.classList.remove('show'); toastFn = null; }, onAction ? 8000 : 2600);
  }
  $('toastAction').addEventListener('click', () => {
    const fn = toastFn;
    toastFn = null;
    $('toast').classList.remove('show');
    if (fn) fn();
  });

  /* ---------- Разделы сайта и библиотека ---------- */

  const VIEW_KEY = 'imposer-view';
  function showView(v) {
    const isLib = v === 'lib';
    $('libView').hidden = !isLib;
    document.querySelector('main.app').hidden = isLib;
    document.body.classList.toggle('view-lib', isLib);
    document.querySelectorAll('.tab').forEach((t) => t.setAttribute('aria-pressed', String(t.dataset.view === v)));
    try { localStorage.setItem(VIEW_KEY, v); } catch (e) { /* ignore */ }
    if (isLib) renderLibraryView();
    window.scrollTo(0, 0);
  }
  document.querySelectorAll('.tab').forEach((t) => t.addEventListener('click', () => showView(t.dataset.view)));
  $('openLib').addEventListener('click', () => showView('lib'));
  $('libSearch').addEventListener('input', renderLibraryView);
  document.querySelectorAll('input[name="libKind"]').forEach((r) => r.addEventListener('change', renderLibraryView));

  // Нажатие на плитку — подставить формат в калькулятор
  function applyFormat(e, kind) {
    const name = e.name || `${sz(e.w, e.h)} мм`;
    if (kind === 'sheets') {
      const dv = radioVal('dv') === '1';
      applySheet(e, dv ? 'pw' : 'sw', dv ? 'ph' : 'sh');
      toast(`«${name}» подставлен как ${dv ? 'лист бумаги' : 'печатный лист'}`);
    } else if (radioVal('mm') === '1') {
      const last = collectItems().pop();
      showView('calc');
      addItem({ name: e.name || '', w: e.w, h: e.h, b: e.b ? Math.max(...e.b) : (last ? last.b : '2'), q: last ? last.q : '1000', n: '1' });
      toast(`«${name}» добавлен в список изделий`);
      return;
    } else {
      inp.iw.value = toInput(e.w);
      inp.ih.value = toInput(e.h);
      if (e.b) {
        ['bt', 'br', 'bb', 'bl'].forEach((k, i) => { inp[k].value = toInput(e.b[i]); });
        $('bsym').checked = e.b.every((x) => near(x, e.b[0]));
      }
      schedule();
      toast(`«${name}» подставлен как изделие`);
    }
    showView('calc');
  }

  function tileEntry(tile) {
    const { src, kind, key } = tile.dataset;
    if (src === 'shared') return shared[kind].find((x) => x.id === key);
    if (src === 'own') return lib[kind][Number(key)];
    if (src === 'std') return (kind === 'items' ? ITEM_FORMATS : SHEET_FORMATS)[Number(key)];
    return null;
  }

  $('libView').addEventListener('click', (ev) => {
    if (ev.target.closest('[data-lib]')) return; // кнопки на плитке обрабатываются отдельно
    if (ev.target.closest('[data-new]') || ev.target.closest('#libNew')) { openFmtDialog(); return; }
    const tile = ev.target.closest('.tile[role="button"]');
    if (!tile) return;
    const e = tileEntry(tile);
    if (e) applyFormat(e, tile.dataset.kind);
  });
  $('libView').addEventListener('keydown', (ev) => {
    if (ev.key !== 'Enter' && ev.key !== ' ') return;
    const tile = ev.target.closest('.tile[role="button"]');
    if (!tile || ev.target !== tile) return;
    ev.preventDefault();
    tile.click();
  });

  // Окно «Новый формат»
  const fmtKind = () => (document.querySelector('input[name="fmtKind"]:checked') || {}).value || 'items';
  function fillFmtSizes() {
    const items = fmtKind() === 'items';
    const dv = radioVal('dv') === '1';
    const [w, h] = items ? sizeOf('iw', 'ih') : dv ? sizeOf('pw', 'ph') : sizeOf('sw', 'sh');
    $('fmtW').value = Number.isFinite(w) ? toInput(w) : '';
    $('fmtH').value = Number.isFinite(h) ? toInput(h) : '';
    $('fmtBleed').value = items ? toInput(parseNum(inp.bt.value) || 0) : '';
    $('fmtBleedField').hidden = !items;
    $('fmtWLabel').textContent = items ? 'Ширина в обрез' : 'Ширина';
    $('fmtHLabel').textContent = items ? 'Высота в обрез' : 'Длина';
  }
  function openFmtDialog() {
    const kf = (document.querySelector('input[name="libKind"]:checked') || {}).value;
    const kindRadio = document.querySelector(`input[name="fmtKind"][value="${kf === 'sheets' ? 'sheets' : 'items'}"]`);
    if (kindRadio) kindRadio.checked = true;
    $('fmtName').value = '';
    $('fmtDesc').value = '';
    fillFmtSizes();
    $('fmtShared').hidden = !SHARED_ON;
    $('fmtOwn').classList.toggle('primary', !SHARED_ON);
    $('fmtOwn').textContent = SHARED_ON ? 'Только себе' : 'Сохранить';
    document.querySelectorAll('#fmtForm .input').forEach((x) => x.classList.remove('invalid'));
    const dlg = $('fmtDialog');
    if (typeof dlg.showModal === 'function') dlg.showModal(); else dlg.setAttribute('open', '');
    $('fmtName').focus();
  }
  function closeFmtDialog() {
    const dlg = $('fmtDialog');
    if (typeof dlg.close === 'function') dlg.close(); else dlg.removeAttribute('open');
  }
  document.querySelectorAll('input[name="fmtKind"]').forEach((r) => r.addEventListener('change', fillFmtSizes));
  $('fmtCancel').addEventListener('click', closeFmtDialog);
  $('fmtForm').addEventListener('submit', (e) => e.preventDefault());
  async function saveFmt(toShared) {
    const items = fmtKind() === 'items';
    const w = parseNum($('fmtW').value), h = parseNum($('fmtH').value);
    const b = items ? parseNum($('fmtBleed').value || '0') : 0;
    const okW = okNum(w, 1e5), okH = okNum(h, 1e5), okB = !items || (Number.isFinite(b) && b >= 0 && b <= 1000);
    $('fmtW').closest('.input').classList.toggle('invalid', !okW);
    $('fmtH').closest('.input').classList.toggle('invalid', !okH);
    $('fmtBleed').closest('.input').classList.toggle('invalid', !okB);
    if (!okW || !okH || !okB) { toast('Проверьте размеры формата'); return; }
    const kind = items ? 'items' : 'sheets';
    const entry = cleanEntry({
      name: $('fmtName').value.trim() || `${items ? 'Изделие' : 'Лист'} ${sz(w, h)}`,
      d: $('fmtDesc').value, w, h, b: items ? [b, b, b, b] : undefined,
    }, items);
    if (toShared) {
      if (await addShared(kind, entry)) closeFmtDialog();
      return;
    }
    const replaced = upsert(kind, entry);
    const ok = persistLib();
    refreshLibraries();
    closeFmtDialog();
    toast(!ok ? 'Не удалось сохранить: браузер запрещает хранить данные'
      : replaced ? `«${entry.name}» обновлён в ваших форматах` : `«${entry.name}» сохранён в ваши форматы`);
  }
  $('fmtShared').addEventListener('click', () => saveFmt(true));
  $('fmtOwn').addEventListener('click', () => saveFmt(false));
  $('fmtForm').addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && e.target.tagName === 'INPUT') { e.preventDefault(); saveFmt(SHARED_ON); }
  });

  // Кнопки библиотеки (на плитках и в строке статуса)
  document.addEventListener('click', (e) => {
    const b = e.target.closest('[data-lib]');
    if (!b) return;
    const act = b.dataset.lib;
    if (act === 'reload') {
      shared.status = 'loading';
      renderLibStats();
      loadShared(false);
      return;
    }
    if (act === 'trash' || act === 'restore') {
      const en = [...shared.sheets, ...shared.items, ...shared.trash].find((x) => x.id === b.dataset.id);
      if (!en) return;
      b.disabled = true;
      if (act === 'trash') trashShared(en); else restoreShared(en, false);
      return;
    }
    const kind = b.dataset.kind;
    const en = lib[kind] && lib[kind][Number(b.dataset.idx)];
    if (!en) return;
    if (act === 'share') { b.disabled = true; addShared(kind, en).finally(() => { b.disabled = false; }); }
    if (act === 'del-own') removeOwn(kind, en);
  });

  /* ---------- Старт ---------- */

  apply(loadInitial());
  renderLibStats();
  update();
  try { if (localStorage.getItem(VIEW_KEY) === 'lib') showView('lib'); } catch (e) { /* ignore */ }

  // Уведомление о новой версии сайта
  let updateDismissed = '';
  async function checkUpdate() {
    if (!APP_VERSION) return;
    try {
      const res = await fetch(`version.json?t=${Date.now()}`, { cache: 'no-store' });
      if (!res.ok) return;
      const { version } = await res.json();
      const v = String(version || '');
      if (v && v !== APP_VERSION && v !== updateDismissed) $('updateBar').hidden = false;
    } catch (e) { /* офлайн — проверим позже */ }
  }
  $('updateBtn').addEventListener('click', () => location.reload());
  $('updateClose').addEventListener('click', async () => {
    $('updateBar').hidden = true;
    try { updateDismissed = String((await (await fetch(`version.json?t=${Date.now()}`, { cache: 'no-store' })).json()).version); } catch (e) { /* ignore */ }
  });
  setTimeout(checkUpdate, 3000);
  setInterval(() => { if (!document.hidden) checkUpdate(); }, 5 * 60 * 1000);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) checkUpdate(); });

  if (SHARED_ON) {
    loadShared(true);
    document.addEventListener('visibilitychange', () => { if (!document.hidden) loadShared(true); });
    setInterval(() => { if (!document.hidden) loadShared(true); }, 120000);
  }

  // Для проверки расчёта из консоли
  window.__imposer = { compute, derivePress, divisionOptions, orient, fit, span, grid, mixed, place, read, lib, solveMulti, packOnce, checkUpdate, APP_VERSION };
})();
