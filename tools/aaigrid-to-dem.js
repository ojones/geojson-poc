import { readFileSync, writeFileSync } from 'node:fs';
import { aaigridToDem } from '../src/aaigrid.js';

function optionsFrom(args) {
  const options = {};
  for (let i = 0; i < args.length; i += 2) options[args[i].replace(/^--/, '')] = args[i + 1];
  return options;
}

const [input, output, ...rest] = process.argv.slice(2);
if (!input || !output) {
  console.error('usage: node tools/aaigrid-to-dem.js in.asc out.json --crs EPSG:4326 [--units m|ft] [--source NAME] [--url URL] [--retrieved YYYY-MM-DD]');
  process.exit(2);
}
const result = aaigridToDem(readFileSync(input, 'utf8'), optionsFrom(rest));
if (!result.ok) {
  console.error(result.errors.join('\n'));
  process.exit(1);
}
writeFileSync(output, JSON.stringify(result.dem));
console.log(`wrote ${output} (${result.dem.width}x${result.dem.height})`);
