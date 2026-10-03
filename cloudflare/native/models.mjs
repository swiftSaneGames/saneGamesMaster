import { requireThat, text, httpsURL } from './security.mjs';
export const STAGES = ['research', 'design', 'building', 'qa', 'review', 'live'];
export const ROLES = ['researcher', 'designer', 'architect', 'producer', 'developer', 'art-ux', 'qa', 'release', 'liveops'];
export const GATES = ['automated_tests', 'android_device', 'ios_device', 'save_migration', 'performance', 'privacy_ads', 'licenses', 'launch_materials'];
export const CATEGORIES = ['Business simulation', 'Idle management', 'Decision simulation', 'Puzzle', 'Arcade', 'Steering'];
export const TASKS = [['researcher', 'Study references and record evidence'], ['designer', 'Validate an original core loop'], ['architect', 'Define architecture and acceptance criteria'], ['art-ux', 'Define visual direction and accessible controls'], ['developer', 'Implement and test the playable game'], ['qa', 'Complete independent QA on both platforms'], ['release', 'Prepare the exact release-review pack'], ['liveops', 'Prepare the 30-day maintenance plan']];
export function projectInput(input) {
  const title = text(input.title, 'title', 100, 3), summary = text(input.summary || '', 'summary', 4000);
  requireThat(CATEGORIES.includes(input.category), 'Choose a supported category');
  requireThat(['per_game', 'children', 'teens', 'adults'].includes(input.audience || 'per_game'), 'Invalid audience');
  requireThat(['per_game', 'offline', 'optional_online', 'online'].includes(input.connectivity || 'per_game'), 'Invalid connectivity');
  const references = input.references || [];
  requireThat(Array.isArray(references) && references.length <= 10 && references.every(x => /^G\d{3}$/.test(x) && +x.slice(1) >= 1 && +x.slice(1) <= 100), 'Invalid references');
  return { title, summary, category: input.category, audience: input.audience || 'per_game', connectivity: input.connectivity || 'per_game', references: [...new Set(references)] };
}
export function manifestInput(input, env) {
  const version = text(input.version, 'version', 40, 1);
  requireThat(/^[0-9]+\.[0-9]+\.[0-9]+(?:[-+][A-Za-z0-9.-]+)?$/.test(version), 'Use a semantic version, such as 1.0.0');
  const source_commit = text(input.source_commit, 'source commit', 64, 40).toLowerCase();
  requireThat(/^(?:[a-f0-9]{40}|[a-f0-9]{64})$/.test(source_commit), 'Invalid source commit');
  const hosts = String(env.ARTIFACT_HOSTS || 'github.com,testflight.apple.com,play.google.com,appstoreconnect.apple.com').split(',').map(x => x.trim());
  const artifacts = {};
  for (const platform of ['android', 'ios']) {
    const a = input.artifacts?.[platform]; requireThat(a && /^[a-f0-9]{64}$/i.test(a.sha256 || ''), `A SHA-256 is required for ${platform}`);
    artifacts[platform] = { url: httpsURL(a.url, `${platform} build`, hosts), sha256: a.sha256.toLowerCase() };
  }
  requireThat(Array.isArray(input.evidence) && input.evidence.length === GATES.length, 'All eight evidence gates are required');
  const evidence = GATES.map(key => {
    const matches = input.evidence.filter(x => x.key === key); requireThat(matches.length === 1, `Exactly one ${key} gate is required`);
    const e = matches[0]; requireThat(['pass', 'fail', 'not_run'].includes(e.status), 'Invalid evidence status');
    return { key, status: e.status, report_url: httpsURL(e.report_url, 'evidence report', hosts), summary: text(e.summary || '', 'evidence summary', 1500) };
  });
  requireThat(Number.isInteger(input.blocking_issues) && input.blocking_issues >= 0 && input.blocking_issues <= 10000, 'Invalid blocking issue count');
  return { project_id: text(input.project_id, 'project id', 50, 1), version, source_commit, artifacts, evidence, blocking_issues: input.blocking_issues, launch_summary: text(input.launch_summary, 'launch summary', 6000, 10) };
}
export const gatesPass = m => m.blocking_issues === 0 && m.evidence.length === GATES.length && m.evidence.every(e => e.status === 'pass');
