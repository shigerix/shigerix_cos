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
  bgImage: $('#bgImage'),
  frame: $('#frame'),
  figuresLayer: $('#figures'),
};

let scene = newScene();
let selectedId = null;
let size = canvasSize(scene.ar);

function getFig(id) { return scene.figures.find((f) => f.id === id); }
function selectedFig() { return getFig(selectedId); }

// ---- 描画 ----
async function render() {
  size = canvasSize(scene.ar);
  for (const r of [refs.plate, refs.frame]) {
    r.setAttribute('width', size.w);
    r.setAttribute('height', size.h);
  }
  renderStage(refs, scene, size, selectedId);
  updatePanel();
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

function updatePanel() {
  const fig = selectedFig();
  const panel = $('#panel');
  if (!fig) { panel.classList.add('hidden'); return; }
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
  onChange: () => saveLocal(scene),
};

// ---- ツールバー ----
$('#btnAdd').addEventListener('click', () => {
  const f = addFigure(scene);
  selectedId = f.id;
  render();
});

$('#btnReset').addEventListener('click', () => {
  if (!confirm('すべての人形を消してリセットしますか？')) return;
  scene = newScene();
  addFigure(scene);
  selectedId = scene.figures[0].id;
  render();
});

$('#btnShare').addEventListener('click', async () => {
  const url = buildShareUrl(scene);
  try {
    await navigator.clipboard.writeText(url);
    toast('共有リンクをコピーしました');
  } catch (e) {
    // クリップボード不可時はプロンプト表示
    window.prompt('この URL をコピーして共有してください', url);
  }
});

// ---- 構図モーダル ----
const aspectModal = $('#aspectModal');
$('#btnAspect').addEventListener('click', () => openModal(aspectModal));
function buildAspectList() {
  const list = $('#aspectList');
  list.innerHTML = '';
  ASPECTS.forEach((a) => {
    const b = document.createElement('button');
    b.className = 'chip' + (a.id === scene.ar ? ' active' : '');
    b.textContent = a.label;
    b.addEventListener('click', () => {
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
$('#btnBg').addEventListener('click', async () => { await buildBgLists(); openModal(bgModal); });

$('#bgUpload').addEventListener('change', async (e) => {
  const file = e.target.files && e.target.files[0];
  e.target.value = '';
  if (!file) return;
  try {
    const dataUrl = await fileToDataUrl(file);
    const rec = await saveUpload(file.name, dataUrl);
    scene.bg = 'upload:' + rec.id;
    await buildBgLists();
    render();
    toast('背景を追加しました');
  } catch (err) {
    toast('画像の読み込みに失敗しました');
  }
});

async function buildBgLists() {
  // プリセット
  const pl = $('#presetList');
  pl.innerHTML = '';
  pl.appendChild(thumb('背景なし', null, scene.bg === 'none', () => { scene.bg = 'none'; refreshBgActive(); render(); }, 'none'));
  PRESETS.forEach((p) => {
    const val = 'preset:' + p.id;
    pl.appendChild(thumb(p.label, p.src, scene.bg === val, () => { scene.bg = val; refreshBgActive(); render(); }));
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
    const t = thumb(rec.name, rec.dataUrl, scene.bg === val, () => { scene.bg = val; refreshBgActive(); render(); });
    const del = document.createElement('button');
    del.className = 'del';
    del.textContent = '✕';
    del.addEventListener('click', async (ev) => {
      ev.stopPropagation();
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
  d.addEventListener('click', onClick);
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
    b.addEventListener('click', () => {
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
    b.addEventListener('click', () => {
      const f = selectedFig(); if (!f) return;
      f.color = c; render();
    });
    row.appendChild(b);
  });
}

$('#panel').addEventListener('click', (e) => {
  const btn = e.target.closest('.ctl');
  if (!btn) return;
  const f = selectedFig(); if (!f) return;
  const act = btn.dataset.act;
  if (act === 'bigger') f.s = Math.min(4, f.s * 1.12);
  else if (act === 'smaller') f.s = Math.max(0.25, f.s / 1.12);
  else if (act === 'flip') f.flip = !f.flip;
  else if (act === 'dup') { const c = duplicateFigure(scene, f.id); if (c) selectedId = c.id; }
  else if (act === 'del') { removeFigure(scene, f.id); selectedId = null; }
  render();
});

// ---- モーダル共通 ----
function openModal(m) { m.classList.remove('hidden'); }
function closeModal(m) { m.classList.add('hidden'); }
document.querySelectorAll('.modal').forEach((m) => {
  m.addEventListener('click', (e) => {
    if (e.target === m || e.target.hasAttribute('data-close')) closeModal(m);
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
