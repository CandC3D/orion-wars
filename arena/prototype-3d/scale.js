// Physical dimensions, millimetres. This is a tabletop scale, not a simulation scale.
export const MM_PER_UNIT = 10;
export const mm = n => n / MM_PER_UNIT;
export const SIZES = Object.freeze({
  table: [1000, 25, 700], board: [480, 2, 320], hexAcrossFlats: 32,
  mugBody: [80, 95, 80], mugWithHandle: [112, 95, 80],
  d6: 16, d20VertexDiameter: 20, rulebook: [216, 28, 279],
  notebook: [216, 6, 279], pencilLength: 190, pencilDiameter: 7,
  baseAcrossFlats: 25, baseHeight: 3, postHeight: 30, postDiameter: 2,
  miniatures: { EAR: 55, KRE: 65, VRA: 45 }
});
export const BOARD = Object.freeze({width:mm(SIZES.board[0]),depth:mm(SIZES.board[2]),top:mm(SIZES.board[1])});

// Local axis-aligned dimensions are checked before a prop's tabletop rotation.
// A D20 uses its vertex diameter; its AABB is smaller and is reported separately.
export function validateScaleRows(rows) {
  for (const row of rows) {
    if (!row.referenceMm?.length || row.actualMm.length !== row.referenceMm.length) throw new Error(`Missing scale measurement: ${row.object}`);
    row.actualMm.forEach((v,i)=>{
      if (!Number.isFinite(v) || Math.abs(v-row.referenceMm[i]) > 0.06) throw new Error(`Scale mismatch: ${row.object}, ${v} vs ${row.referenceMm[i]} mm`);
    });
  }
  return rows;
}
