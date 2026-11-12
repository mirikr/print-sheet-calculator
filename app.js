/* Раскладка на лист — калькулятор для препресса.
 * Все размеры в миллиметрах. Ось X — ширина листа (слева направо), ось Y — длина (сверху вниз).
 */
(() => {
  'use strict';

  const EPS = 1e-7;
  const MAX_DRAW = 20000;   // больше изделий — рисуем блоками, без отдельных прямоугольников
  const MAX_LABELS = 3000;  // больше — без номеров и всплывающих подсказок
  const MARK_OFF = 1.5;     // отступ метки реза от края раскладки, мм
  const MARK_LEN = 5;       // длина метки реза, мм
  const MAX_DIV = 8;        // подбор деления листа бумаги: до 8 × 8 частей
  const STORE_KEY = 'imposer-state-v1';
  const THEME_KEY = 'imposer-theme';
  const LIB_KEY = 'imposer-library-v1';

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
    const skip = new Set();
    if (common) skip.add('gp');
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
    p.md = common ? 'common' : 'sep';
    p.rot = $('rotate').checked;
    p.al = radioVal('align') === 'tl' ? 'tl' : 'c';
    p.cm = $('marks').checked;
    p.nm = $('numbers').checked;
    return { p, errs };
  }

  /* ---------- Библиотека форматов (localStorage) ---------- */

  const okNum = (x, max) => Number.isFinite(+x) && +x > 0 && +x <= max;
  function cleanEntry(e, withBleed) {
    if (!e || typeof e.name !== 'string' || !okNum(e.w, 1e5) || !okNum(e.h, 1e5)) return null;
    const out = { name: e.name.trim().slice(0, 60) || `Формат ${sz(+e.w, +e.h)}`, w: +e.w, h: +e.h };
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

  const sameSize = (e, w, h) => (near(e.w, w) && near(e.h, h)) || (near(e.w, h) && near(e.h, w));
  const entryLabel = (e) => (e.name ? `${e.name} — ${sz(e.w, e.h)} мм` : `${sz(e.w, e.h)} мм`);
  const bleedShort = (b) => (b.every((x) => near(x, b[0])) ? `вылет ${fmt(b[0])}` : `вылеты ${b.map(fmt).join('/')}`);
  const normQ = (s) => String(s).toLowerCase().replace(/ё/g, 'е').replace(/[×х*]/g, 'x').replace(/,/g, '.').replace(/\s+/g, ' ').trim();
  const hay = (e) => normQ(`${e.name} ${e.group} ${e.w}x${e.h} ${e.h}x${e.w} ${e.w} ${e.h}`);
  const queryTokens = (q) => normQ(q).replace(/\s*x\s*/g, 'x').split(' ').filter(Boolean);

  const SEARCH_ICON = '<svg class="picker-ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg>';
  const STAR_ICON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round" aria-hidden="true"><path d="M12 3.5l2.6 5.3 5.9.9-4.3 4.1 1 5.8L12 16.9l-5.2 2.7 1-5.8-4.3-4.1 5.9-.9z"/></svg>';

  // Выпадающий список с поиском: свои форматы + стандартные.
  function createPicker(host, { kind, order, placeholder, getSize, onPick }) {
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
      let base = kind === 'items' ? ITEM_FORMATS : SHEET_FORMATS;
      if (order) base = [...base].sort((a, b) => order.indexOf(a.group) - order.indexOf(b.group));
      return own.concat(base);
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
          ${e.own ? `<button type="button" class="picker-del" data-del="${i}" title="Удалить из библиотеки" aria-label="Удалить «${esc(e.name)}» из библиотеки">✕</button>` : ''}
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
        if (en && window.confirm(`Удалить «${en.name}» из библиотеки?`)) {
          lib[kind] = lib[kind].filter((x) => x.name !== en.name);
          persistLib();
          refreshLibraries();
          toast(`«${en.name}» удалён из библиотеки`);
        }
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
        <button type="button" class="btn sm primary lib-ok">Сохранить</button>
        <button type="button" class="btn sm lib-cancel" aria-label="Отмена">✕</button>
      </div>`;
    const btn = host.querySelector('.lib-btn');
    const box = host.querySelector('.lib-form');
    const name = host.querySelector('.lib-name');

    const hide = () => { box.hidden = true; btn.hidden = false; };
    btn.addEventListener('click', () => {
      const e = getEntry();
      if (!e) { toast('Сначала введите корректные размеры'); return; }
      btn.hidden = true;
      box.hidden = false;
      name.value = '';
      name.placeholder = `Название, например «${noun} ${sz(e.w, e.h)}»`;
      name.focus();
    });
    const save = () => {
      const e = getEntry();
      if (!e) { toast('Сначала введите корректные размеры'); return; }
      const entry = cleanEntry({ ...e, name: name.value.trim() || `${noun} ${sz(e.w, e.h)}` }, kind === 'items');
      const replaced = upsert(kind, entry);
      const ok = persistLib();
      refreshLibraries();
      hide();
      toast(!ok
        ? 'Не удалось сохранить: браузер запрещает хранить данные'
        : replaced ? `«${entry.name}» обновлён в библиотеке` : `«${entry.name}» сохранён — он будет здесь и при следующем заходе`);
    };
    host.querySelector('.lib-ok').addEventListener('click', save);
    host.querySelector('.lib-cancel').addEventListener('click', hide);
    name.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') { e.preventDefault(); save(); }
      if (e.key === 'Escape') { e.preventDefault(); hide(); }
    });
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

  function renderLibStats() {
    const ns = lib.sheets.length, ni = lib.items.length;
    $('libStats').innerHTML = ns || ni
      ? `Сохранено: <b>${ns}</b> ${plural(ns, 'формат листа', 'формата листов', 'форматов листов')}, <b>${ni}</b> ${plural(ni, 'изделие', 'изделия', 'изделий')}.`
      : 'Пока ничего не сохранено.';
    $('libExport').disabled = !(ns || ni);
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

  function renderDivOptions(p) {
    $('divPanel').hidden = !p.dv;
    if (!p.dv) return;
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
      showAlert(`Проверьте значения: ${errs.map((k) => NAMES[k]).join(', ')}. Нужны числа не меньше нуля; размеры — больше нуля; тираж и деление — целые числа.`);
      results.classList.add('stale');
      return;
    }
    results.classList.remove('stale');

    const res = compute(p);
    const machineProblem = p.dv && !p.fits
      ? `Печатный лист ${sz(p.sw, p.sh)} мм больше формата машины ${sz(p.mw, p.mh)} мм. Выберите другое деление — подходящие варианты показаны ниже.`
      : null;
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
  function toast(text) {
    const t = $('toast');
    t.textContent = text;
    t.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => t.classList.remove('show'), 2600);
  }

  /* ---------- Старт ---------- */

  apply(loadInitial());
  renderLibStats();
  update();

  // Для проверки расчёта из консоли
  window.__imposer = { compute, derivePress, divisionOptions, orient, fit, span, grid, mixed, place, read, lib };
})();
