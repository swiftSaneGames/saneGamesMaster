import { test } from 'node:test';
import assert from 'node:assert/strict';
import { harness } from './harness.mjs';

test('authenticated discovery serves all verified identities with honest ranking status', async () => {
  const h = harness();
  try {
    const login = await h.login();
    const catalog = await (await h.as(login, '/api/catalog')).json();
    assert.equal(catalog.discovery_games.length, 500);
    assert.equal(new Set(catalog.discovery_games.map(game => game.package_id)).size, 500);
    for (const game of catalog.discovery_games) {
      assert.equal(game.ranking_status, 'unranked_reference');
      assert.equal(game.verification_status, 'direct_play_listing_verified');
      const source = new URL(game.play_url);
      assert.equal(source.hostname, 'play.google.com');
      assert.equal(source.searchParams.get('id'), game.package_id);
    }
    assert.match(catalog.discovery_note, /not a verified download ranking/);
  } finally { h.close(); }
});

test('dashboard serves every complete role contract and the game-name kickoff handbook', async () => {
  const h = harness();
  try {
    const login = await h.login();
    const catalog = await (await h.as(login, '/api/catalog')).json();
    assert.equal(catalog.roles.length, 29);
    assert.equal(new Set(catalog.roles.map(role => role.id)).size, 29);
    for (const role of catalog.roles) {
      assert.ok(role.content.split(/\s+/).length > 2000, role.id + ' must include its full shared and role contracts');
      assert.match(role.content, /checkpoint/i);
    }
    for (const id of ['prom', 'start_a_game', 'worker_setup', 'claude_dashboard_workflow', 'dashboard_design', 'claude_tooling', 'implementation_roadmap', 'agent-directory']) {
      assert.ok(catalog.documents.some(document => document.id === id), id);
      assert.equal((await h.as(login, '/api/docs/' + id)).status, 200);
    }
  } finally { h.close(); }
});
