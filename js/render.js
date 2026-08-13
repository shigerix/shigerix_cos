// SVG ステージの描画（背景＋棒人形群）
import { computeFigure, BONES, JOINT_TO_SEG, HEAD_RADIUS, FIG_LOCAL_HEIGHT } from './skeleton.js';

const NS = 'http://www.w3.org/2000/svg';

function el(tag, attrs) {
  const e = document.createElementNS(NS, tag);
  for (const k in attrs) e.setAttribute(k, attrs[k]);
  return e;
}

export function scaleFactor(sizeH) {
  return (0.5 * sizeH) / FIG_LOCAL_HEIGHT;
}

// 1体の棒人形の <g> を生成
export function buildFigure(fig, size, selected) {
  const { joints: J, bbox: b } = computeFigure(fig.pose);
  const base = scaleFactor(size.h);
  const px = fig.x * size.w;
  const py = fig.y * size.h;
  const sx = base * fig.s * (fig.flip ? -1 : 1);
  const sy = base * fig.s;
  const g = el('g', {
    'data-fig': fig.id,
    class: 'figure' + (selected ? ' selected' : ''),
    transform: `translate(${px} ${py}) scale(${sx} ${sy})`,
  });

  // 体全体の当たり判定（下）＋選択枠
  const hit = el('rect', {
    'data-fig': fig.id, class: 'fig-hit',
    x: b.minX, y: b.minY, width: b.maxX - b.minX, height: b.maxY - b.minY,
  });
  g.appendChild(hit);
  if (selected) {
    g.appendChild(el('rect', {
      class: 'fig-outline',
      x: b.minX, y: b.minY, width: b.maxX - b.minX, height: b.maxY - b.minY,
      rx: 6,
    }));
  }

  // ボーン
  for (const [a, c] of BONES) {
    const pa = J[a], pc = J[c];
    if (!pa || !pc) continue;
    g.appendChild(el('line', {
      class: 'bone', x1: pa.x, y1: pa.y, x2: pc.x, y2: pc.y,
      stroke: fig.color,
    }));
  }
  // 頭
  g.appendChild(el('circle', {
    class: 'head', cx: J.head.x, cy: J.head.y, r: HEAD_RADIUS, stroke: fig.color,
  }));

  // 関節ハンドル（選択時のみ）
  if (selected) {
    for (const joint in JOINT_TO_SEG) {
      const p = J[joint];
      if (!p) continue;
      g.appendChild(el('circle', {
        class: 'handle', 'data-fig': fig.id, 'data-joint': joint,
        cx: p.x, cy: p.y, r: 4.5,
      }));
    }
  }
  return g;
}

export function renderStage(refs, scene, size, selectedId) {
  const { svg, bgImage, figuresLayer } = refs;
  svg.setAttribute('viewBox', `0 0 ${size.w} ${size.h}`);
  bgImage.setAttribute('width', size.w);
  bgImage.setAttribute('height', size.h);

  // 選択中を最後に描いて前面へ
  const ordered = [...scene.figures].sort((a, bf) => (a.id === selectedId ? 1 : 0) - (bf.id === selectedId ? 1 : 0));
  figuresLayer.textContent = '';
  for (const fig of ordered) {
    figuresLayer.appendChild(buildFigure(fig, size, fig.id === selectedId));
  }
}
