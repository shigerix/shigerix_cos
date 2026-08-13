// プリセットポーズ（編集セグメントの角度上書き。未指定は DEFAULT_POSE を使用）
// キーは skeleton.js の EDITABLE と対応。

export const POSES = [
  { id: 'stand',     label: '立ち',     pose: {} },
  { id: 'attention', label: '気をつけ', pose: { upperArmL: 181, upperArmR: 179 } },
  { id: 'banzai',    label: 'バンザイ', pose: { upperArmL: 335, upperArmR: 25 } },
  { id: 'wave',      label: '手を振る', pose: { upperArmR: 20, foreArmR: -25 } },
  { id: 'hips',      label: '腰に手',   pose: { upperArmL: 150, foreArmL: 78, upperArmR: 210, foreArmR: -78 } },
  { id: 'point',     label: '指さし',   pose: { upperArmR: 110, foreArmR: 0 } },
  { id: 'think',     label: '考える',   pose: { upperArmR: 60, foreArmR: -110, upperArmL: 200, foreArmL: 40 } },
  { id: 'sit',       label: '座る',     pose: { thighL: 120, shinL: 55, thighR: 120, shinR: 55, upperArmL: 200, upperArmR: 160 } },
  { id: 'crouch',    label: 'しゃがむ', pose: { thighL: 125, shinL: 95, thighR: 125, shinR: 95, upperArmL: 205, upperArmR: 155 } },
  { id: 'kneel',     label: '片膝',     pose: { thighR: 178, shinR: 95, thighL: 120, shinL: 30 } },
  { id: 'run',       label: '走る',     pose: { thighL: 150, shinL: 35, thighR: 212, shinR: 40, upperArmL: 150, foreArmL: -30, upperArmR: 210, foreArmR: 30 } },
  { id: 'jump',      label: 'ジャンプ', pose: { upperArmL: 330, upperArmR: 30, thighL: 205, shinL: 35, thighR: 155, shinR: 35 } },
];

export const POSE_BY_ID = Object.fromEntries(POSES.map((p) => [p.id, p]));
