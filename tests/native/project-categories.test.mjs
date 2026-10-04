import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { harness, project } from './harness.mjs';
import { CATEGORIES } from '../../cloudflare/native/models.mjs';

test('the original-game genres can be created with a repository in the first request', async t => {
  const h = harness(); t.after(() => h.close());
  const owner = await h.login();
  for (const [index, category] of CATEGORIES.entries()) {
    const repository_url = `https://github.com/swiftSaneGames/genre-fixture-${index}`;
    const response = await h.as(owner, '/api/projects', 'POST', { ...project, category, repository_url });
    assert.equal(response.status, 200, category);
    const value = await response.json();
    assert.equal(value.project.category, category);
    assert.equal(value.project.repository_url, repository_url);
    assert.equal(value.agents_started, false);
    assert.equal(value.repository_created, false);
  }
  const state = await (await h.as(owner, '/api/state')).json();
  assert.equal(state.jobs.length, 0, 'Creating records must not claim execution');
  assert.equal((await h.as(owner, '/api/projects', 'POST', { ...project, category: 'Battle royale' })).status, 422);
});

test('the game kickoff CLI and native API share the supported genre choices', () => {
  const source = fs.readFileSync(new URL('../../scripts/start_game.py', import.meta.url), 'utf8');
  const line = source.split('\n').find(s => s.startsWith('CATEGORIES = '));
  assert.deepEqual([...line.matchAll(/'([^']+)'/g)].map(match => match[1]), CATEGORIES);
});
