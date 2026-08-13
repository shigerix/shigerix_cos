// 背景の管理（内蔵プリセット＋アップロード画像）
// bg 値の形式: 'none' | 'preset:<id>' | 'upload:<id>'
import { putBackground, listBackgrounds, deleteBackground, getBackground } from './storage.js';

// iOS Safari は SVG の <image> に外部SVGファイルを参照すると描画しないため PNG を使う
export const PRESETS = [
  { id: 'studio',  label: 'スタジオ', src: 'assets/backgrounds/studio.png' },
  { id: 'grid',    label: 'グリッド', src: 'assets/backgrounds/grid.png' },
  { id: 'outdoor', label: '屋外',     src: 'assets/backgrounds/outdoor.png' },
  { id: 'night',   label: '夜',       src: 'assets/backgrounds/night.png' },
  { id: 'white',   label: '白',       src: 'assets/backgrounds/white.png' },
];

const PRESET_BY_ID = Object.fromEntries(PRESETS.map((p) => [p.id, p]));

// アップロード画像の dataURL をメモリキャッシュ（描画高速化）
const uploadCache = new Map();

export function genUploadId() {
  return 'u' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
}

export async function saveUpload(name, dataUrl) {
  const id = genUploadId();
  const rec = { id, name, dataUrl, created: Date.now() };
  await putBackground(rec);
  uploadCache.set(id, dataUrl);
  return rec;
}

export async function getUploads() {
  const all = await listBackgrounds();
  all.sort((a, b) => b.created - a.created);
  all.forEach((r) => uploadCache.set(r.id, r.dataUrl));
  return all;
}

export async function removeUpload(id) {
  await deleteBackground(id);
  uploadCache.delete(id);
}

// bg 値 → 画像URL（描画用）。'none' は null。
export async function resolveBgHref(bg) {
  if (!bg || bg === 'none') return null;
  if (bg.startsWith('preset:')) {
    const p = PRESET_BY_ID[bg.slice(7)];
    return p ? p.src : null;
  }
  if (bg.startsWith('upload:')) {
    const id = bg.slice(7);
    if (uploadCache.has(id)) return uploadCache.get(id);
    const rec = await getBackground(id);
    if (rec) { uploadCache.set(id, rec.dataUrl); return rec.dataUrl; }
    return null;
  }
  return null;
}

// ファイルを縮小して dataURL 化（長辺 1600px 上限、JPEG化で容量削減）
export function fileToDataUrl(file, maxSide = 1600) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      let { width, height } = img;
      const scale = Math.min(1, maxSide / Math.max(width, height));
      width = Math.round(width * scale);
      height = Math.round(height * scale);
      const canvas = document.createElement('canvas');
      canvas.width = width; canvas.height = height;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0, width, height);
      try {
        resolve(canvas.toDataURL('image/jpeg', 0.85));
      } catch (e) { reject(e); }
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('画像を読み込めませんでした')); };
    img.src = url;
  });
}
