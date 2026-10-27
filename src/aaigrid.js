import { DEM_FORMAT } from './terrain.js';

const fail = (message) => ({ ok: false, errors: [message] });

function headerOf(lines) {
  const header = {};
  for (const line of lines.slice(0, 6)) {
    const [key, value] = line.trim().split(/\s+/);
    header[key.toLowerCase()] = Number(value);
  }
  return header;
}

function headerProblem(h) {
  const needed = ['ncols', 'nrows', 'cellsize'];
  if (!needed.every((key) => Number.isFinite(h[key]))) return 'ASCII grid header needs ncols, nrows, and cellsize.';
  const hasCorner = Number.isFinite(h.xllcorner) && Number.isFinite(h.yllcorner);
  const hasCenter = Number.isFinite(h.xllcenter) && Number.isFinite(h.yllcenter);
  return hasCorner || hasCenter ? null : 'ASCII grid header needs xllcorner/yllcorner (or xllcenter/yllcenter).';
}

function cornerOf(h) {
  const half = Number.isFinite(h.xllcenter) ? h.cellsize / 2 : 0;
  return { west: (h.xllcorner ?? h.xllcenter) - half, south: (h.yllcorner ?? h.yllcenter) - half };
}

export function aaigridToDem(text, options) {
  if (!options.crs) return fail('Pass the grid CRS explicitly (--crs EPSG:4326); an ASCII grid does not carry one.');
  const lines = text.split(/\r?\n/).filter((l) => l.trim() !== '');
  const h = headerOf(lines);
  const problem = headerProblem(h);
  if (problem) return fail(problem);
  const values = lines.slice(6).join(' ').trim().split(/\s+/).map(Number);
  if (values.length !== h.ncols * h.nrows) return fail(`ASCII grid has ${values.length} values; expected ${h.ncols * h.nrows}.`);
  return { ok: true, dem: demOf(h, values, options) };
}

function demOf(h, values, options) {
  const { west, south } = cornerOf(h);
  return {
    format: DEM_FORMAT,
    source_name: options.source ?? 'converted ASCII grid',
    source_url: options.url ?? null,
    retrieved: options.retrieved ?? null,
    crs: options.crs,
    bounds: { west, south, east: west + h.ncols * h.cellsize, north: south + h.nrows * h.cellsize },
    width: h.ncols,
    height: h.nrows,
    vertical_units: options.units ?? 'm',
    no_data_value: h.nodata_value ?? null,
    values,
  };
}
