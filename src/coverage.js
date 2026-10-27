import { boundsOf, distanceToSegment, pointInRings } from './geo.js';

export const COVERAGE = {
  method: 'grid_swath_buffer_v1',
  cellsPerSwath: 5,
  minCellM: 2,
  maxCells: 400000,
};

function cellSizeFor(box, swathWidthM) {
  const bySwath = Math.max(COVERAGE.minCellM, swathWidthM / COVERAGE.cellsPerSwath);
  const byBudget = Math.sqrt(((box.maxX - box.minX) * (box.maxY - box.minY)) / COVERAGE.maxCells);
  return Math.max(bySwath, byBudget);
}

function buildGrid(boundary, swathWidthM) {
  const rings = boundary.projected.flat();
  const box = boundsOf(rings.flat());
  const size = cellSizeFor(box, swathWidthM);
  const cols = Math.ceil((box.maxX - box.minX) / size);
  const rows = Math.ceil((box.maxY - box.minY) / size);
  const eligible = new Uint8Array(cols * rows);
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      eligible[r * cols + c] = pointInRings(box.minX + (c + 0.5) * size, box.minY + (r + 0.5) * size, rings) ? 1 : 0;
    }
  }
  return { box, size, cols, rows, eligible };
}

function cellRange(grid, segment, radius) {
  const { box, size, cols, rows } = grid;
  const lo = (v, min) => Math.floor((v - min) / size);
  return {
    c0: Math.max(0, lo(Math.min(segment.start.x, segment.end.x) - radius, box.minX)),
    c1: Math.min(cols - 1, lo(Math.max(segment.start.x, segment.end.x) + radius, box.minX)),
    r0: Math.max(0, lo(Math.min(segment.start.y, segment.end.y) - radius, box.minY)),
    r1: Math.min(rows - 1, lo(Math.max(segment.start.y, segment.end.y) + radius, box.minY)),
  };
}

function stampSegment(grid, state, segment, radius, legNumber) {
  const { c0, c1, r0, r1 } = cellRange(grid, segment, radius);
  for (let r = r0; r <= r1; r++) {
    for (let c = c0; c <= c1; c++) stampCell(grid, state, segment, radius, legNumber, r * grid.cols + c, c, r);
  }
}

function stampCell(grid, state, segment, radius, legNumber, index, c, r) {
  if (!grid.eligible[index] || state.lastLeg[index] === legNumber) return;
  const center = { x: grid.box.minX + (c + 0.5) * grid.size, y: grid.box.minY + (r + 0.5) * grid.size };
  if (distanceToSegment(center, segment.start, segment.end) > radius) return;
  state.lastLeg[index] = legNumber;
  state.passes[index] += 1;
}

export function computeCoverage(boundary, route, swathWidthM) {
  const grid = buildGrid(boundary, swathWidthM);
  const state = { lastLeg: new Uint32Array(grid.eligible.length), passes: new Uint16Array(grid.eligible.length) };
  const searchLegs = route.segments.filter((s) => s.type === 'search');
  searchLegs.forEach((segment, i) => stampSegment(grid, state, segment, swathWidthM / 2, i + 1));
  return summarize(grid, state);
}

function summarize(grid, state) {
  const eligible = Math.max(1, grid.eligible.reduce((total, v) => total + v, 0));
  const covered = state.passes.reduce((total, n) => total + (n >= 1 ? 1 : 0), 0);
  const repeated = state.passes.reduce((total, n) => total + (n >= 2 ? 1 : 0), 0);
  return {
    coverage_pct: (100 * covered) / eligible,
    repeat_coverage_pct: (100 * repeated) / eligible,
    cell_size_m: grid.size,
    eligible_cells: eligible,
    method: COVERAGE.method,
  };
}
