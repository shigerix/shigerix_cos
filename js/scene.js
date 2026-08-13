// シーン状態の管理（構図・背景・棒人形リスト、追加/複製/削除、自動保存）
import { DEFAULT_POSE } from './skeleton.js';

// 構図プリセット（縦・横・正方）。論理キャンバスは短辺 1000。
export const ASPECTS = [
  { id: '3:4',  label: '縦 3:4' },
  { id: '9:16', label: '縦 9:16' },
  { id: '1:1',  label: '正方 1:1' },
  { id: '4:3',  label: '横 4:3' },
  { id: '16:9', label: '横 16:9' },
];

export const COLORS = ['#2b2b2b', '#e5484d', '#3b82f6', '#22c55e', '#a855f7', '#f59e0b'];

const BASE = 1000;

export function canvasSize(ar) {
  const [w, h] = ar.split(':').map(Number);
  if (h >= w) return { w: Math.round(BASE * (w / h)), h: BASE };
  return { w: BASE, h: Math.round(BASE * (h / w)) };
}

let nextId = 1;
function genId() { return 'f' + (nextId++) + Date.now().toString(36).slice(-3); }

export function newScene() {
  return { v: 1, ar: '3:4', bg: 'none', figures: [] };
}

export function newFigure(x = 0.5, y = 0.55, color = COLORS[0]) {
  return {
    id: genId(),
    x, y,
    s: 1,
    flip: false,
    color,
    pose: { ...DEFAULT_POSE },
  };
}

export function addFigure(scene, opts = {}) {
  const idx = scene.figures.length;
  // 追加のたびに少しずらして重ならないように
  const fx = 0.3 + ((idx * 0.12) % 0.4);
  const color = COLORS[idx % COLORS.length];
  const fig = newFigure(fx, 0.55, opts.color || color);
  scene.figures.push(fig);
  return fig;
}

export function duplicateFigure(scene, id) {
  const src = scene.figures.find((f) => f.id === id);
  if (!src) return null;
  const copy = {
    ...src,
    id: genId(),
    x: Math.min(0.95, src.x + 0.06),
    y: Math.min(0.95, src.y + 0.04),
    pose: { ...src.pose },
  };
  scene.figures.push(copy);
  return copy;
}

export function removeFigure(scene, id) {
  const i = scene.figures.findIndex((f) => f.id === id);
  if (i >= 0) scene.figures.splice(i, 1);
}

// ---- 自動保存（localStorage） ----
const LS_KEY = 'cospose.scene.v1';

export function saveLocal(scene) {
  try { localStorage.setItem(LS_KEY, JSON.stringify(scene)); } catch (e) { /* ignore */ }
}

export function loadLocal() {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (!raw) return null;
    return normalizeScene(JSON.parse(raw));
  } catch (e) { return null; }
}

// 読み込んだシーンに欠損があっても壊れないよう補正し、id を振り直す
export function normalizeScene(s) {
  const scene = newScene();
  if (!s || typeof s !== 'object') return scene;
  if (ASPECTS.some((a) => a.id === s.ar)) scene.ar = s.ar;
  if (typeof s.bg === 'string') scene.bg = s.bg;
  if (Array.isArray(s.figures)) {
    scene.figures = s.figures.map((f) => ({
      id: genId(),
      x: clamp01(num(f.x, 0.5)),
      y: clamp01(num(f.y, 0.55)),
      s: clamp(num(f.s, 1), 0.2, 4),
      flip: !!f.flip,
      color: typeof f.color === 'string' ? f.color : COLORS[0],
      pose: { ...DEFAULT_POSE, ...(f.pose && typeof f.pose === 'object' ? f.pose : {}) },
    }));
  }
  return scene;
}

function num(v, d) { return Number.isFinite(+v) ? +v : d; }
function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }
function clamp01(v) { return clamp(v, 0, 1); }
