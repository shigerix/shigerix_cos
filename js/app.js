// エントリーポイント: 各モジュールを結線
import { DEFAULT_POSE } from './skeleton.js';
import { POSES, POSE_BY_ID } from './poses.js';
import {
  ASPECTS, COLORS, canvasSize, newScene,
  addFigure, duplicateFigure, removeFigure, saveLocal, loadLocal,
} from './scene.js';
import { renderStage } from './render.js';
import { initInteraction } from './interaction.js';
import { buildShareUrl, decodeScene, readShareHash } from './share.js';
import {
  PRESETS, getUploads, saveUpload, removeUpload, resolveBgHref, fileToDataUrl,
} from './background.js';

const $ = (s) => document.querySelector(s);

const refs = {
  svg: $('#stage'),
  plate: $('#plate'),
  clipRect: $('#clipRect'),
  bgImage: $('#bgImage'),
  frame: $('#frame'),
  figuresLayer: $('#figures'),
};

let scene = newScene();
let selectedId = null;
let size = canvasSize(scene.ar);
let bgAdjust = false;

// 背景画像に平行移動＋（フレーム中心基準の）拡大縮小を適用
function applyBgTransform() {
  const cx = size.w / 2, cy = size.h / 2;
  refs.bgImage.setAttribute(
    'transform',
    `translate(${scene.bgX} ${scene.bgY}) translate(${cx} ${cy}) scale(${scene.bgS}) translate(${-cx} ${-cy})`
  );
}

function hasBgImage() { return scene.bg && scene.bg !== 'none'; }

// iOS Safari は viewport の user-scalable=no を無視するため、ページ全体の
// ピンチズーム（ツールバー等まで拡大される）を明示的に抑止する。
// キャンバス内の拡大縮小は Pointer Events による自前処理なので影響しない。
['gesturestart', 'gesturechange', 'gestureend'].forEach((ev) => {
  document.addEventListener(ev, (e) => e.preventDefault(), { passive: false });
});

// ---- タップ処理 ----
// X アプリ内ブラウザなどの WebView では合成 click が届かないことがあるため、
// pointerup を主経路にし、直後に来る click は捨てる。
// sel を渡すと委譲になる（el 配下で sel に一致した要素をタップ対象とする）。
const TAP_SLOP = 12; // これ以上動いたらスクロール／ドラッグ扱い

function onTap(el, fn, sel = null) {
  let down = null; // { target, x, y }
  let handledAt = 0;
  const hit = (t) => (sel ? (t && t.closest ? t.closest(sel) : null) : el);

  el.addEventListener('pointerdown', (e) => {
    const target = e.isPrimary ? hit(e.target) : null;
    down = target ? { target, x: e.clientX, y: e.clientY } : null;
  });
  el.addEventListener('pointerup', (e) => {
    const start = down;
    down = null;
    if (!start || !e.isPrimary) return;
    if (hit(e.target) !== start.target) return;
    if (Math.hypot(e.clientX - start.x, e.clientY - start.y) > TAP_SLOP) return;
    handledAt = Date.now();
    fn(e, start.target);
  });
  el.addEventListener('pointercancel', () => { down = null; });
  el.addEventListener('click', (e) => {
    if (Date.now() - handledAt < 700) {
      // pointerup で処理済み。重複した click は親にも伝えない
      // （子が pointerup を stopPropagation した場合に親が二重に反応するのを防ぐ）
      e.stopPropagation();
      return;
    }
    const target = hit(e.target);
    if (target) fn(e, target);
  });
}

function getFig(id) { return scene.figures.find((f) => f.id === id); }
function selectedFig() { return getFig(selectedId); }

// ---- 描画 ----
async function render() {
  size = canvasSize(scene.ar);
  for (const r of [refs.plate, refs.frame, refs.clipRect]) {
    r.setAttribute('width', size.w);
    r.setAttribute('height', size.h);
  }
  renderStage(refs, scene, size, selectedId);
  applyBgTransform();
  updatePanel();
  updateMode();
  // 背景
  const href = await resolveBgHref(scene.bg);
  if (href) {
    refs.bgImage.setAttributeNS('http://www.w3.org/1999/xlink', 'href', href);
    refs.bgImage.setAttribute('href', href);
    refs.bgImage.style.display = '';
  } else {
    refs.bgImage.removeAttribute('href');
    refs.bgImage.style.display = 'none';
  }
  saveLocal(scene);
}

// 背景調整モードの表示状態を反映
function updateMode() {
  // 背景画像が無ければ調整ボタンを隠し、モードも解除
  const btn = $('#btnBgAdjust');
  if (hasBgImage()) btn.classList.remove('hidden');
  else { btn.classList.add('hidden'); bgAdjust = false; }
  btn.classList.toggle('active', bgAdjust);
  document.body.classList.toggle('bg-adjust', bgAdjust);
  $('#bgBar').classList.toggle('hidden', !bgAdjust);
}

function updatePanel() {
  const fig = selectedFig();
  const panel = $('#panel');
  if (!fig || bgAdjust) { panel.classList.add('hidden'); return; }
  panel.classList.remove('hidden');
  // カラー選択状態
  document.querySelectorAll('#colorRow .swatch').forEach((el) => {
    el.classList.toggle('active', el.dataset.color === fig.color);
  });
}

// ---- 操作 API（interaction 用） ----
const api = {
  getScene: () => scene,
  getSize: () => size,
  getSelected: () => selectedId,
  getMode: () => (bgAdjust ? 'bg' : 'edit'),
  select: (id) => { selectedId = id; render(); },
  moveFigure: (id, x, y) => {
    const f = getFig(id); if (!f) return;
    f.x = x; f.y = y;
    renderStage(refs, scene, size, selectedId); // 軽量再描画
  },
  setJoint: (id, seg, angle) => {
    const f = getFig(id); if (!f) return;
    f.pose[seg] = angle;
    renderStage(refs, scene, size, selectedId);
  },
  resizeFigure: (id, s) => {
    const f = getFig(id); if (!f) return;
    f.s = Math.max(0.25, Math.min(4, s));
    renderStage(refs, scene, size, selectedId);
  },
  setBg: (s, x, y) => {
    scene.bgS = Math.max(0.3, Math.min(8, s));
    scene.bgX = x; scene.bgY = y;
    applyBgTransform(); // 背景のみ更新（人形は再描画しない）
  },
  onChange: () => saveLocal(scene),
};

// ---- ダイアログ ----
// アプリ内ブラウザは window.confirm / prompt を表示せず即座に false を返すため、
// 確認と URL 表示は自前のモーダルで行う（Promise<boolean> を返す）。
const dialog = $('#dialog');
const dlgText = $('#dlgText');
let dlgResolve = null;

function openDialog({ title, message = '', text = null, ok = 'OK', cancel = 'キャンセル' }) {
  settleDialog(false); // 前回が開いたままなら先に解決しておく
  $('#dlgTitle').textContent = title;
  $('#dlgMsg').textContent = message;
  dlgText.value = text || '';
  dlgText.classList.toggle('hidden', !text);
  $('#dlgOk').textContent = ok;
  $('#dlgCancel').textContent = cancel;
  openModal(dialog);
  return new Promise((resolve) => { dlgResolve = resolve; });
}

function settleDialog(val) {
  if (!dlgResolve) return;
  const resolve = dlgResolve;
  dlgResolve = null;
  closeModal(dialog);
  resolve(val);
}

// クリップボードへコピー。失敗したら選択状態にしてダイアログは開いたままにする。
async function copyDialogText() {
  try {
    await navigator.clipboard.writeText(dlgText.value);
    return true;
  } catch (e) { /* 続けて execCommand を試す */ }
  try {
    dlgText.focus();
    dlgText.setSelectionRange(0, dlgText.value.length);
    if (document.execCommand('copy')) return true;
  } catch (e) { /* noop */ }
  return false;
}

onTap($('#dlgOk'), async () => {
  if (!dlgText.classList.contains('hidden')) {
    if (!(await copyDialogText())) { toast('長押しで選択してコピーしてください'); return; }
    toast('共有リンクをコピーしました');
  }
  settleDialog(true);
});
onTap($('#dlgCancel'), () => settleDialog(false));
onTap(dialog, (e) => {
  if (e.target === dialog || (e.target.hasAttribute && e.target.hasAttribute('data-close'))) settleDialog(false);
});

// ---- ツールバー ----
onTap($('#btnAdd'), () => {
  const f = addFigure(scene);
  selectedId = f.id;
  render();
});

onTap($('#btnReset'), async () => {
  const yes = await openDialog({
    title: '全消去',
    message: 'すべての人形を消してリセットしますか？',
    ok: '消去する',
  });
  if (!yes) return;
  scene = newScene();
  addFigure(scene);
  selectedId = scene.figures[0].id;
  render();
});

onTap($('#btnShare'), async () => {
  const url = buildShareUrl(scene);
  try {
    await navigator.clipboard.writeText(url);
    toast('共有リンクをコピーしました');
  } catch (e) {
    // クリップボード不可時は URL をダイアログで表示（prompt は WebView で出ない）
    await openDialog({
      title: '共有リンク',
      message: 'この URL をコピーして共有してください',
      text: url,
      ok: 'コピー',
      cancel: '閉じる',
    });
  }
});

// ---- 背景調整モード ----
onTap($('#btnBgAdjust'), () => {
  if (!hasBgImage()) return;
  bgAdjust = !bgAdjust;
  if (bgAdjust) selectedId = null; // 背景操作中は人形の選択を外す
  render();
});
onTap($('#bgDone'), () => { bgAdjust = false; saveLocal(scene); render(); });
onTap($('#bgReset'), () => {
  scene.bgS = 1; scene.bgX = 0; scene.bgY = 0;
  applyBgTransform(); saveLocal(scene);
});

// ---- 構図モーダル ----
const aspectModal = $('#aspectModal');
onTap($('#btnAspect'), () => openModal(aspectModal));
function buildAspectList() {
  const list = $('#aspectList');
  list.innerHTML = '';
  ASPECTS.forEach((a) => {
    const b = document.createElement('button');
    b.className = 'chip' + (a.id === scene.ar ? ' active' : '');
    b.textContent = a.label;
    onTap(b, () => {
      scene.ar = a.id;
      $('#aspectLabel').textContent = a.label;
      buildAspectList();
      closeModal(aspectModal);
      render();
    });
    list.appendChild(b);
  });
}

// ---- 背景モーダル ----
const bgModal = $('#bgModal');
onTap($('#btnBg'), async () => { await buildBgLists(); openModal(bgModal); });

// 背景を選ぶと位置・スケールはリセット（中央から開始）
function chooseBg(val) {
  scene.bg = val;
  scene.bgS = 1; scene.bgX = 0; scene.bgY = 0;
  refreshBgActive();
  render();
}

$('#bgUpload').addEventListener('change', async (e) => {
  const file = e.target.files && e.target.files[0];
  e.target.value = '';
  if (!file) return;
  try {
    const dataUrl = await fileToDataUrl(file);
    const rec = await saveUpload(file.name, dataUrl);
    chooseBg('upload:' + rec.id);
    await buildBgLists();
    toast('背景を追加しました。「🎯背景調整」で位置を調整できます');
  } catch (err) {
    toast('画像の読み込みに失敗しました');
  }
});

async function buildBgLists() {
  // プリセット
  const pl = $('#presetList');
  pl.innerHTML = '';
  pl.appendChild(thumb('背景なし', null, scene.bg === 'none', () => chooseBg('none'), 'none'));
  PRESETS.forEach((p) => {
    const val = 'preset:' + p.id;
    pl.appendChild(thumb(p.label, p.src, scene.bg === val, () => chooseBg(val)));
  });
  // アップロード
  const ul = $('#uploadList');
  ul.innerHTML = '';
  const uploads = await getUploads();
  if (uploads.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'thumb none';
    empty.textContent = 'なし';
    ul.appendChild(empty);
  }
  uploads.forEach((rec) => {
    const val = 'upload:' + rec.id;
    const t = thumb(rec.name, rec.dataUrl, scene.bg === val, () => chooseBg(val));
    const del = document.createElement('button');
    del.className = 'del';
    del.textContent = '✕';
    onTap(del, async (ev) => {
      ev.stopPropagation(); // 親サムネの選択を発火させない
      await removeUpload(rec.id);
      if (scene.bg === val) scene.bg = 'none';
      await buildBgLists();
      render();
    });
    t.appendChild(del);
    ul.appendChild(t);
  });
}

function refreshBgActive() {
  document.querySelectorAll('#bgModal .thumb').forEach((el) => el.classList.remove('active'));
}

function thumb(label, src, active, onClick, extraClass) {
  const d = document.createElement('div');
  d.className = 'thumb' + (active ? ' active' : '') + (extraClass ? ' ' + extraClass : '');
  if (src) d.style.backgroundImage = `url("${src}")`;
  if (label === '背景なし') d.textContent = '背景なし';
  else {
    const cap = document.createElement('span');
    cap.className = 'cap';
    cap.textContent = label;
    d.appendChild(cap);
  }
  onTap(d, onClick);
  return d;
}

// ---- 下部パネル ----
function buildPoseRow() {
  const row = $('#poseRow');
  row.innerHTML = '';
  POSES.forEach((p) => {
    const b = document.createElement('button');
    b.className = 'pose-btn';
    b.textContent = p.label;
    onTap(b, () => {
      const f = selectedFig(); if (!f) return;
      f.pose = { ...DEFAULT_POSE, ...POSE_BY_ID[p.id].pose };
      render();
    });
    row.appendChild(b);
  });
}

function buildColorRow() {
  const row = $('#colorRow');
  row.innerHTML = '';
  COLORS.forEach((c) => {
    const b = document.createElement('button');
    b.className = 'swatch';
    b.dataset.color = c;
    b.style.background = c;
    onTap(b, () => {
      const f = selectedFig(); if (!f) return;
      f.color = c; render();
    });
    row.appendChild(b);
  });
}

onTap($('#panel'), (e, btn) => {
  const f = selectedFig(); if (!f) return;
  const act = btn.dataset.act;
  if (act === 'bigger') f.s = Math.min(4, f.s * 1.12);
  else if (act === 'smaller') f.s = Math.max(0.25, f.s / 1.12);
  else if (act === 'flip') f.flip = !f.flip;
  else if (act === 'dup') { const c = duplicateFigure(scene, f.id); if (c) selectedId = c.id; }
  else if (act === 'del') { removeFigure(scene, f.id); selectedId = null; }
  render();
}, '.ctl');

// ---- モーダル共通 ----
function openModal(m) { m.classList.remove('hidden'); }
function closeModal(m) { m.classList.add('hidden'); }
document.querySelectorAll('.modal').forEach((m) => {
  if (m === dialog) return; // #dialog は Promise を解決する必要があるので自前で閉じる
  onTap(m, (e) => {
    if (e.target === m || (e.target.hasAttribute && e.target.hasAttribute('data-close'))) closeModal(m);
  });
});

// ---- トースト ----
let toastTimer = null;
function toast(msg) {
  const t = $('#toast');
  t.textContent = msg;
  t.classList.remove('hidden');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.add('hidden'), 1800);
}

// ---- 初期化 ----
function boot() {
  buildPoseRow();
  buildColorRow();
  buildAspectList();
  initInteraction(refs.svg, api);

  const code = readShareHash();
  let loaded = null;
  if (code) {
    try { loaded = decodeScene(code); } catch (e) { loaded = null; }
  }
  if (!loaded) loaded = loadLocal();
  if (!loaded) loaded = newScene();
  scene = loaded;
  if (!scene.figures || scene.figures.length === 0) {
    addFigure(scene);
  }
  selectedId = scene.figures[0] ? scene.figures[0].id : null;
  $('#aspectLabel').textContent = (ASPECTS.find((a) => a.id === scene.ar) || ASPECTS[0]).label;
  render();
}

// 起動時にハッシュを消してリロード時の意図しない復元を防ぐ（履歴は残す）
window.addEventListener('load', () => {
  boot();
  if (location.hash) {
    history.replaceState(null, '', location.pathname + location.search);
  }
});
