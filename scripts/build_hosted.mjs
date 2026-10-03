import fs from 'node:fs';
import path from 'node:path';
const root = path.resolve(import.meta.dirname, '..');
export function parseCSV(source) {
  const rows = []; let row = [], field = '', quoted = false;
  for (let i = 0; i < source.length; i++) {
    const ch = source[i];
    if (ch === '"') { if (quoted && source[i + 1] === '"') { field += '"'; i++; } else quoted = !quoted; }
    else if (ch === ',' && !quoted) { row.push(field); field = ''; }
    else if (ch === '\n' && !quoted) { row.push(field.replace(/\r$/, '')); if (row.some(Boolean)) rows.push(row); row = []; field = ''; }
    else field += ch;
  }
  if (quoted) throw new Error('Unterminated CSV field');
  if (field || row.length) { row.push(field); rows.push(row); }
  const header = rows.shift();
  return rows.map(values => { if (values.length !== header.length) throw new Error('CSV column mismatch'); return Object.fromEntries(header.map((k, i) => [k, values[i]])); });
}
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const gamesCSV = read('research/games_100.csv'), studiosCSV = read('research/studios_20.csv');
const games = parseCSV(gamesCSV), studios = parseCSV(studiosCSV);
if (games.length !== 100 || new Set(games.map(g => g.game_id)).size !== 100 || studios.length !== 20) throw new Error('Research catalog counts are invalid');
for (const studio of studios.filter(s => s.group === 'primary')) if (games.filter(g => g.studio_id === studio.studio_id).length !== 10) throw new Error('Expected ten references per primary studio');
const concepts = read('research/GAME_SHORTLIST.md').split('\n').filter(x => /^\| \d+ \|/.test(x)).map(x => { const v = x.split('|').slice(1, -1).map(s => s.trim()); return { id: +v[0], title: v[1], references: v[2], differentiator: v[3], concerns: v[4] }; });
const documentPaths = ['docs/REQUIREMENTS_INTERVIEW.md', 'docs/STUDIO_BLUEPRINT.md', 'docs/AGENT_ORGANIZATION.md', 'docs/DECISIONS.md', 'research/README.md', 'research/PRIORITIZATION.md', 'research/GAME_SHORTLIST.md', 'research/STORE_ENROLLMENT.md', 'research/SOURCES.md', 'scraper/RESEARCH_PROMPT.md', 'docs/HOSTED_DASHBOARD.md', 'docs/HOSTED_TESTING.md'];
const documents = documentPaths.filter(f => fs.existsSync(path.join(root, f))).map(file => ({ id: path.basename(file, '.md').toLowerCase(), title: read(file).split('\n')[0].replace(/^#\s*/, ''), file, content: read(file) }));
const agentRegistry = JSON.parse(read('agents/registry.json'));
const sharedContract = read(agentRegistry.shared_contract);
const roles = agentRegistry.roles.map(role => ({
  id: role.id, description: role.description, parent: role.parent,
  dashboard_role: role.dashboard_role, file: role.prompt,
  content: sharedContract + '\n\n---\n\n' + read(role.prompt),
}));
const bundle = { games, studios, concepts, documents, roles, gamesCSV, studiosCSV, research_date: '2026-10-03', ranking_status: 'PENDING_DATA' };
fs.mkdirSync(path.join(root, 'cloudflare/generated'), { recursive: true });
fs.writeFileSync(path.join(root, 'cloudflare/generated/research.mjs'), '// Generated from repository research. Do not edit.\nexport default ' + JSON.stringify(bundle) + ';\n');
console.log(`Bundled ${games.length} references, ${studios.length} studios, ${concepts.length} concepts, and ${documents.length} documents.`);
