// スケルトン定義と Forward Kinematics（棒人形の関節計算・描画データ生成）

// 角度の慣習: world 0 = 上向き(-y), 時計回りが正。
// dir(θ) = (sinθ, -cosθ)
const D2R = Math.PI / 180;

// 編集可能な関節（ポーズとして保存する角度のキー）と描画順（親→子）
export const EDITABLE = [
  'spine', 'neck',
  'upperArmL', 'foreArmL', 'upperArmR', 'foreArmR',
  'thighL', 'shinL', 'thighR', 'shinR',
];

// 中立（デフォルト）ポーズ
export const DEFAULT_POSE = {
  spine: 0, neck: 0,
  upperArmL: 183, foreArmL: 0, upperArmR: 177, foreArmR: 0,
  thighL: 183, shinL: 0, thighR: 177, shinR: 0,
};

// セグメント定義（親を先に並べる）
// base: 開始する関節名（'root'=腰=原点）, ref: 角度の基準（'world' or セグメント名）
// joint: このセグメントが生成する関節名, len: 長さ, fixed: 固定角度（editable でないもの）
const SEGMENTS = [
  { name: 'spine',     base: 'root',      ref: 'world',     len: 34, joint: 'chest',     editable: true },
  { name: 'neck',      base: 'chest',     ref: 'spine',     len: 22, joint: 'head',      editable: true },
  { name: 'collarL',   base: 'chest',     ref: 'world',     len: 13, joint: 'shoulderL', fixed: 270 },
  { name: 'collarR',   base: 'chest',     ref: 'world',     len: 13, joint: 'shoulderR', fixed: 90 },
  { name: 'upperArmL', base: 'shoulderL', ref: 'world',     len: 24, joint: 'elbowL',    editable: true },
  { name: 'foreArmL',  base: 'elbowL',    ref: 'upperArmL', len: 22, joint: 'handL',     editable: true },
  { name: 'upperArmR', base: 'shoulderR', ref: 'world',     len: 24, joint: 'elbowR',    editable: true },
  { name: 'foreArmR',  base: 'elbowR',    ref: 'upperArmR', len: 22, joint: 'handR',     editable: true },
  { name: 'pelvisL',   base: 'root',      ref: 'world',     len: 10, joint: 'hipL',       fixed: 208 },
  { name: 'pelvisR',   base: 'root',      ref: 'world',     len: 10, joint: 'hipR',       fixed: 152 },
  { name: 'thighL',    base: 'hipL',      ref: 'world',     len: 30, joint: 'kneeL',      editable: true },
  { name: 'shinL',     base: 'kneeL',     ref: 'thighL',    len: 30, joint: 'footL',      editable: true },
  { name: 'thighR',    base: 'hipR',      ref: 'world',     len: 30, joint: 'kneeR',      editable: true },
  { name: 'shinR',     base: 'kneeR',     ref: 'thighR',    len: 30, joint: 'footR',      editable: true },
];

// 描画するボーン（関節ペア）
export const BONES = [
  ['root', 'chest'], ['chest', 'head'],
  ['shoulderL', 'shoulderR'],
  ['chest', 'shoulderL'], ['chest', 'shoulderR'],
  ['shoulderL', 'elbowL'], ['elbowL', 'handL'],
  ['shoulderR', 'elbowR'], ['elbowR', 'handR'],
  ['hipL', 'hipR'],
  ['root', 'hipL'], ['root', 'hipR'],
  ['hipL', 'kneeL'], ['kneeL', 'footL'],
  ['hipR', 'kneeR'], ['kneeR', 'footR'],
];

// セグメント名 → { base, ref }（関節ドラッグの角度計算に使用）
export const SEG_INFO = Object.fromEntries(
  SEGMENTS.map((s) => [s.name, { base: s.base, ref: s.ref }])
);

// ドラッグできる関節ハンドル → 対応する編集セグメント
export const JOINT_TO_SEG = {
  chest: 'spine', head: 'neck',
  elbowL: 'upperArmL', handL: 'foreArmL',
  elbowR: 'upperArmR', handR: 'foreArmR',
  kneeL: 'thighL', footL: 'shinL',
  kneeR: 'thighR', footR: 'shinR',
};

export const HEAD_RADIUS = 9;

// ポーズ角度からすべての関節座標・各セグメントの world 角度を計算
export function computeFigure(pose) {
  const joints = { root: { x: 0, y: 0 } };
  const world = {};
  for (const seg of SEGMENTS) {
    const angle = seg.editable ? (pose[seg.name] ?? DEFAULT_POSE[seg.name]) : seg.fixed;
    const refWorld = seg.ref === 'world' ? 0 : world[seg.ref];
    const w = refWorld + angle;
    world[seg.name] = w;
    const b = joints[seg.base];
    const rad = w * D2R;
    joints[seg.joint] = {
      x: b.x + Math.sin(rad) * seg.len,
      y: b.y - Math.cos(rad) * seg.len,
    };
  }
  // バウンディングボックス（頭の半径込み）
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const k in joints) {
    const p = joints[k];
    minX = Math.min(minX, p.x); maxX = Math.max(maxX, p.x);
    minY = Math.min(minY, p.y); maxY = Math.max(maxY, p.y);
  }
  minX -= HEAD_RADIUS; maxX += HEAD_RADIUS;
  minY -= HEAD_RADIUS; maxY += HEAD_RADIUS;
  return { joints, world, bbox: { minX, minY, maxX, maxY } };
}

// 図形ローカルの基準高さ（スケール計算用）
export const FIG_LOCAL_HEIGHT = 150;

// 角度を 0..360 に正規化
export function norm(a) {
  a = a % 360;
  if (a < 0) a += 360;
  return a;
}
