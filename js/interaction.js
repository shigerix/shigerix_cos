// タッチ／マウス操作（Pointer Events）
// - 編集モード: 人形の選択・移動・関節ドラッグ、2本指ピンチで選択人形を拡大縮小
// - 背景調整モード: 1本指で背景を移動、2本指ピンチで背景を拡大縮小
import { computeFigure, JOINT_TO_SEG, SEG_INFO, norm } from './skeleton.js';
import { scaleFactor } from './render.js';

// clientX/Y を SVG 論理座標（viewBox 座標）へ。SVG ルートは再描画で消えない。
function toLogical(svg, clientX, clientY) {
  const pt = svg.createSVGPoint();
  pt.x = clientX; pt.y = clientY;
  const ctm = svg.getScreenCTM();
  if (!ctm) return { x: 0, y: 0 };
  const p = pt.matrixTransform(ctm.inverse());
  return { x: p.x, y: p.y };
}

// 論理座標 → 図形ローカル座標（図形の変換を数式で逆算。DOM 要素に依存しない）
function logicalToFigureLocal(logical, fig, size) {
  const base = scaleFactor(size.h);
  const sx = base * fig.s * (fig.flip ? -1 : 1);
  const sy = base * fig.s;
  return {
    x: (logical.x - fig.x * size.w) / sx,
    y: (logical.y - fig.y * size.h) / sy,
  };
}

const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
const mid = (a, b) => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });
const clamp01 = (v) => Math.max(0, Math.min(1, v));

// api: getScene, getSize, getSelected, getMode, select,
//      moveFigure, setJoint, resizeFigure, setBg, onChange
export function initInteraction(svg, api) {
  const pointers = new Map(); // pointerId -> {x, y}（client 座標）
  let gesture = null;

  const points = () => [...pointers.values()];
  const logicalOf = (p) => toLogical(svg, p.x, p.y);

  function startGesture(target) {
    const n = pointers.size;
    const mode = api.getMode();

    if (mode === 'bg') {
      if (n === 1) {
        gesture = { type: 'bgPan', last: logicalOf(points()[0]) };
      } else if (n >= 2) {
        const [a, b] = points();
        const sc = api.getScene();
        gesture = {
          type: 'bgPinch', startDist: dist(a, b) || 1,
          startMid: logicalOf(mid(a, b)),
          s0: sc.bgS, x0: sc.bgX, y0: sc.bgY,
        };
      }
      return;
    }

    // 編集モード
    if (n >= 2) {
      const sel = api.getSelected();
      if (sel) {
        const fig = api.getScene().figures.find((f) => f.id === sel);
        const [a, b] = points();
        gesture = { type: 'figPinch', id: sel, startDist: dist(a, b) || 1, s0: fig ? fig.s : 1 };
      } else {
        gesture = null;
      }
      return;
    }

    // 1本指: タップ対象で判定
    const handleEl = target.closest ? target.closest('.handle') : null;
    const figEl = target.closest ? target.closest('[data-fig]') : null;
    const selected = api.getSelected();
    if (figEl) {
      const id = figEl.dataset.fig;
      if (handleEl && id === selected) {
        gesture = { type: 'joint', id, joint: handleEl.dataset.joint };
      } else {
        if (id !== selected) api.select(id);
        const fig = api.getScene().figures.find((f) => f.id === id);
        const size = api.getSize();
        const lg = logicalOf(points()[0]);
        gesture = { type: 'body', id, offx: lg.x - fig.x * size.w, offy: lg.y - fig.y * size.h };
      }
    } else {
      if (selected) api.select(null);
      gesture = null;
    }
  }

  svg.addEventListener('pointerdown', (e) => {
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    try { svg.setPointerCapture(e.pointerId); } catch (_) { /* noop */ }
    e.preventDefault();
    startGesture(e.target);
  });

  svg.addEventListener('pointermove', (e) => {
    if (!pointers.has(e.pointerId)) return;
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (!gesture) return;
    const size = api.getSize();

    if (gesture.type === 'body') {
      const lg = toLogical(svg, e.clientX, e.clientY);
      api.moveFigure(gesture.id,
        clamp01((lg.x - gesture.offx) / size.w),
        clamp01((lg.y - gesture.offy) / size.h));
    } else if (gesture.type === 'joint') {
      const fig = api.getScene().figures.find((f) => f.id === gesture.id);
      if (!fig) return;
      const { joints, world } = computeFigure(fig.pose);
      const seg = JOINT_TO_SEG[gesture.joint];
      const info = SEG_INFO[seg];
      const basePt = joints[info.base] || { x: 0, y: 0 };
      const local = logicalToFigureLocal(toLogical(svg, e.clientX, e.clientY), fig, size);
      const worldAngle = Math.atan2(local.x - basePt.x, -(local.y - basePt.y)) * 180 / Math.PI;
      const refWorld = info.ref === 'world' ? 0 : world[info.ref];
      api.setJoint(gesture.id, seg, norm(worldAngle - refWorld));
    } else if (gesture.type === 'figPinch') {
      const [a, b] = points();
      if (!a || !b) return;
      api.resizeFigure(gesture.id, gesture.s0 * (dist(a, b) / gesture.startDist));
    } else if (gesture.type === 'bgPan') {
      const cur = toLogical(svg, e.clientX, e.clientY);
      const sc = api.getScene();
      api.setBg(sc.bgS, sc.bgX + (cur.x - gesture.last.x), sc.bgY + (cur.y - gesture.last.y));
      gesture.last = cur;
    } else if (gesture.type === 'bgPinch') {
      const [a, b] = points();
      if (!a || !b) return;
      const r = dist(a, b) / gesture.startDist;
      const curMid = logicalOf(mid(a, b));
      api.setBg(gesture.s0 * r,
        gesture.x0 + (curMid.x - gesture.startMid.x),
        gesture.y0 + (curMid.y - gesture.startMid.y));
    }
  });

  function end(e) {
    if (pointers.has(e.pointerId)) {
      pointers.delete(e.pointerId);
      try { svg.releasePointerCapture(e.pointerId); } catch (_) { /* noop */ }
    }
    if (pointers.size === 0) {
      if (gesture) api.onChange();
      gesture = null;
      return;
    }
    // 指が減った: 背景モードで1本残ればパン継続。編集モードはピンチ後の誤操作を防ぐため終了。
    if (api.getMode() === 'bg' && pointers.size === 1) {
      gesture = { type: 'bgPan', last: logicalOf(points()[0]) };
    } else {
      gesture = null;
    }
  }
  svg.addEventListener('pointerup', end);
  svg.addEventListener('pointercancel', end);

  // アプリ内ブラウザはホスト UI に切り替わると pointerup を落とすことがある。
  // 取り残したポインタが残るとポインタキャプチャや誤ったジェスチャが続くのでリセットする。
  function reset() {
    for (const id of pointers.keys()) {
      try { svg.releasePointerCapture(id); } catch (_) { /* noop */ }
    }
    if (gesture) api.onChange();
    pointers.clear();
    gesture = null;
  }
  document.addEventListener('visibilitychange', () => { if (document.hidden) reset(); });
  window.addEventListener('blur', reset);
}
