// タッチ／マウス操作（Pointer Events）: 選択・移動・関節ドラッグ
import { computeFigure, JOINT_TO_SEG, SEG_INFO, norm } from './skeleton.js';

// clientX/Y を SVG 論理座標へ
function toLogical(svg, clientX, clientY) {
  const pt = svg.createSVGPoint();
  pt.x = clientX; pt.y = clientY;
  const ctm = svg.getScreenCTM();
  if (!ctm) return { x: 0, y: 0 };
  const p = pt.matrixTransform(ctm.inverse());
  return { x: p.x, y: p.y };
}

// clientX/Y を、指定した図形<g>のローカル座標へ
function toFigureLocal(gEl, svg, clientX, clientY) {
  const pt = svg.createSVGPoint();
  pt.x = clientX; pt.y = clientY;
  const ctm = gEl.getScreenCTM();
  if (!ctm) return { x: 0, y: 0 };
  const p = pt.matrixTransform(ctm.inverse());
  return { x: p.x, y: p.y };
}

// api: { getScene, getSize, getSelected, select, moveFigure, setJoint, onChange }
export function initInteraction(svg, api) {
  let drag = null; // { type:'body'|'joint', id, offset?, joint? }
  let moved = false;

  svg.addEventListener('pointerdown', (e) => {
    const handleEl = e.target.closest('.handle');
    const figEl = e.target.closest('[data-fig]');
    const selected = api.getSelected();
    moved = false;

    if (figEl) {
      const id = figEl.dataset.fig;
      if (handleEl && id === selected) {
        drag = { type: 'joint', id, joint: handleEl.dataset.joint, gEl: figEl };
      } else {
        if (id !== selected) api.select(id);
        const size = api.getSize();
        const fig = api.getScene().figures.find((f) => f.id === id);
        const p = toLogical(svg, e.clientX, e.clientY);
        drag = { type: 'body', id, offset: { x: p.x - fig.x * size.w, y: p.y - fig.y * size.h } };
      }
      svg.setPointerCapture(e.pointerId);
      e.preventDefault();
    } else {
      // 空白タップ → 選択解除
      if (selected) { api.select(null); }
    }
  });

  svg.addEventListener('pointermove', (e) => {
    if (!drag) return;
    moved = true;
    if (drag.type === 'body') {
      const size = api.getSize();
      const p = toLogical(svg, e.clientX, e.clientY);
      const x = clamp01((p.x - drag.offset.x) / size.w);
      const y = clamp01((p.y - drag.offset.y) / size.h);
      api.moveFigure(drag.id, x, y);
    } else if (drag.type === 'joint') {
      const fig = api.getScene().figures.find((f) => f.id === drag.id);
      if (!fig) return;
      const { joints, world } = computeFigure(fig.pose);
      const seg = JOINT_TO_SEG[drag.joint];
      const info = SEG_INFO[seg];
      const basePt = joints[info.base] || { x: 0, y: 0 };
      const local = toFigureLocal(drag.gEl, svg, e.clientX, e.clientY);
      const vx = local.x - basePt.x;
      const vy = local.y - basePt.y;
      const worldAngle = Math.atan2(vx, -vy) * 180 / Math.PI;
      const refWorld = info.ref === 'world' ? 0 : world[info.ref];
      api.setJoint(drag.id, seg, norm(worldAngle - refWorld));
    }
  });

  function end(e) {
    if (drag) {
      try { svg.releasePointerCapture(e.pointerId); } catch (_) { /* noop */ }
      const wasDrag = drag;
      drag = null;
      if (moved) api.onChange();
      moved = false;
      void wasDrag;
    }
  }
  svg.addEventListener('pointerup', end);
  svg.addEventListener('pointercancel', end);
}

function clamp01(v) { return Math.max(0, Math.min(1, v)); }
