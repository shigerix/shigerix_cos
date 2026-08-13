// シーン ⇄ URL ハッシュ のエンコード/デコード（サーバー不要の共有）
// アップロード背景（bg が 'upload:*'）は共有に含めず 'none' に落とす。
import { EDITABLE, DEFAULT_POSE } from './skeleton.js';
import { normalizeScene } from './scene.js';

function b64urlEncode(str) {
  const b64 = btoa(unescape(encodeURIComponent(str)));
  return b64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
function b64urlDecode(str) {
  let b64 = str.replace(/-/g, '+').replace(/_/g, '/');
  while (b64.length % 4) b64 += '=';
  return decodeURIComponent(escape(atob(b64)));
}

// 共有用のコンパクト表現に変換
export function encodeScene(scene) {
  const bg = scene.bg && scene.bg.startsWith('upload:') ? 'none' : scene.bg;
  const obj = {
    v: 1,
    a: scene.ar,
    b: bg,
    f: scene.figures.map((fg) => ({
      x: Math.round(fg.x * 1000),
      y: Math.round(fg.y * 1000),
      s: Math.round(fg.s * 100),
      l: fg.flip ? 1 : 0,
      c: fg.color,
      p: EDITABLE.map((k) => Math.round(fg.pose[k] ?? DEFAULT_POSE[k])),
    })),
  };
  return b64urlEncode(JSON.stringify(obj));
}

export function decodeScene(code) {
  const obj = JSON.parse(b64urlDecode(code));
  const scene = {
    ar: obj.a,
    bg: obj.b || 'none',
    figures: (obj.f || []).map((fo) => {
      const pose = {};
      (fo.p || []).forEach((val, i) => { if (EDITABLE[i]) pose[EDITABLE[i]] = val; });
      return {
        x: (fo.x ?? 500) / 1000,
        y: (fo.y ?? 550) / 1000,
        s: (fo.s ?? 100) / 100,
        flip: !!fo.l,
        color: fo.c || '#2b2b2b',
        pose,
      };
    }),
  };
  return normalizeScene(scene);
}

export function buildShareUrl(scene) {
  const base = location.origin + location.pathname;
  return base + '#s=' + encodeScene(scene);
}

// URL ハッシュに共有コードがあれば取り出す
export function readShareHash() {
  const m = location.hash.match(/[#&]s=([^&]+)/);
  return m ? m[1] : null;
}
