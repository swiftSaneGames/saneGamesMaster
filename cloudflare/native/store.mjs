import { AppError, requireThat, json, allowlist, equal, text, httpsURL } from './security.mjs';
import { projectInput, STAGES, TASKS, ROLES, gatesPass } from './models.mjs';

/** One SQLite-backed Durable Object per studio. Never exposed as a public URL.
 * All state transitions run synchronously inside a storage transaction. */
export class StudioStore {
  constructor(ctx, env) {
    this.ctx = ctx; this.env = env; this.sql = ctx.storage.sql;
    this.sql.exec(`CREATE TABLE IF NOT EXISTS oauth_states (id TEXT PRIMARY KEY, data TEXT NOT NULL, expires INTEGER NOT NULL);
      CREATE TABLE IF NOT EXISTS sessions (id TEXT PRIMARY KEY, data TEXT NOT NULL, expires INTEGER NOT NULL);
      CREATE TABLE IF NOT EXISTS identities (email TEXT PRIMARY KEY, sub TEXT UNIQUE NOT NULL);
      CREATE TABLE IF NOT EXISTS rate_limits (id TEXT PRIMARY KEY, count INTEGER NOT NULL, expires INTEGER NOT NULL);
      CREATE TABLE IF NOT EXISTS projects (id TEXT PRIMARY KEY, revision INTEGER NOT NULL, data TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS tasks (id TEXT PRIMARY KEY, project_id TEXT NOT NULL, revision INTEGER NOT NULL, data TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS releases (id TEXT PRIMARY KEY, project_id TEXT NOT NULL, manifest_hash TEXT UNIQUE NOT NULL, status TEXT NOT NULL, data TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS pins (game_id TEXT PRIMARY KEY, data TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS audit (seq INTEGER PRIMARY KEY AUTOINCREMENT, at TEXT NOT NULL, actor TEXT NOT NULL, event TEXT NOT NULL, target TEXT NOT NULL, details TEXT NOT NULL);
      CREATE INDEX IF NOT EXISTS tasks_project ON tasks(project_id);
      CREATE INDEX IF NOT EXISTS releases_project ON releases(project_id);
      CREATE INDEX IF NOT EXISTS sessions_expiry ON sessions(expires);
      CREATE INDEX IF NOT EXISTS oauth_expiry ON oauth_states(expires);
      CREATE INDEX IF NOT EXISTS rate_expiry ON rate_limits(expires);`);
  }
  rows(sql, ...args) { return [...this.sql.exec(sql, ...args)]; }
  row(sql, ...args) { return this.rows(sql, ...args)[0]; }
  log(actor, event, target, details = {}) { this.sql.exec('INSERT INTO audit(at,actor,event,target,details) VALUES(?,?,?,?,?)', new Date().toISOString(), actor, event, target, JSON.stringify(details)); }
  read(table, id) { const r = this.row(`SELECT * FROM ${table} WHERE id=?`, id); requireThat(r, 'Record not found', 404); return { ...JSON.parse(r.data), ...(r.revision ? { revision: r.revision } : {}) }; }
  save(table, record) { this.sql.exec(`UPDATE ${table} SET revision=?,data=? WHERE id=?`, record.revision, JSON.stringify(record), record.id); }
  session(id) {
    const r = this.row('SELECT * FROM sessions WHERE id=? AND expires>?', id || '', Math.floor(Date.now() / 1000));
    requireThat(r, 'Sign in to continue', 401, 'sign_in_required');
    const s = JSON.parse(r.data);
    requireThat(allowlist(this.env).includes(s.email), 'Access has been removed', 403);
    return s;
  }
  async fetch(request) {
    try {
      const { op, payload = {}, session_hash = '', csrf = '', agent = false } = await request.json();
      const result = this.ctx.storage.transactionSync(() => {
        const now = Math.floor(Date.now() / 1000);
        this.sql.exec('DELETE FROM sessions WHERE expires<=?', now);
        this.sql.exec('DELETE FROM oauth_states WHERE expires<=?', now);
        this.sql.exec('DELETE FROM rate_limits WHERE expires<=?', now);
        if (op === 'rate') {
          const r = this.row('SELECT count FROM rate_limits WHERE id=?', payload.key);
          requireThat(!r || r.count < payload.limit, 'Too many requests. Try again shortly.', 429);
          this.sql.exec('INSERT INTO rate_limits(id,count,expires) VALUES(?,1,?) ON CONFLICT(id) DO UPDATE SET count=count+1', payload.key, now + 60);
          return { ok: true };
        }
        if (op === 'oauth_create') { this.sql.exec('INSERT INTO oauth_states VALUES(?,?,?)', payload.id, JSON.stringify(payload.data), now + 600); return { ok: true }; }
        if (op === 'oauth_take') {
          const r = this.row('SELECT data FROM oauth_states WHERE id=? AND expires>?', payload.id, now);
          this.sql.exec('DELETE FROM oauth_states WHERE id=?', payload.id);
          requireThat(r, 'Sign-in expired. Try again.', 403); return JSON.parse(r.data);
        }
        if (op === 'login') {
          const u = payload.user; requireThat(allowlist(this.env).includes(u.email), 'Account is not allowed', 403);
          const identity = this.row('SELECT sub FROM identities WHERE email=?', u.email);
          requireThat(!identity || identity.sub === u.sub, 'Account identity changed; contact the studio owner', 403);
          this.sql.exec('INSERT OR IGNORE INTO identities(email,sub) VALUES(?,?)', u.email, u.sub);
          if (payload.old_hash) this.sql.exec('DELETE FROM sessions WHERE id=?', payload.old_hash);
          const s = { ...u, csrf: payload.csrf, issued: now, expires: now + 3600, role: 'owner' };
          this.sql.exec('INSERT INTO sessions VALUES(?,?,?)', payload.hash, JSON.stringify(s), s.expires);
          // Keep the most recent eight sessions for each Google identity.
          const active = this.rows('SELECT id,data FROM sessions ORDER BY expires DESC').filter(r => JSON.parse(r.data).sub === u.sub);
          for (const r of active.slice(8)) this.sql.exec('DELETE FROM sessions WHERE id=?', r.id);
          this.log(u.email, 'signed_in', 'studio'); return { ok: true };
        }
        const s = agent ? { email: 'intake-agent', role: 'agent' } : this.session(session_hash);
        if (s.role === 'agent') requireThat(['project_create', 'candidate_create', 'task_update'].includes(op), 'Agent cannot perform this operation', 403);
        const readOnly = ['session', 'state', 'export'].includes(op);
        if (!agent && !readOnly) requireThat(equal(s.csrf, csrf), 'Invalid security token. Refresh and try again.', 403);
        return this.dispatch(op, payload, s, session_hash);
      });
      return json(result);
    } catch (error) { if (error instanceof AppError) return json({ error: error.message, code: error.code }, error.status); return json({ error: 'Studio storage is temporarily unavailable', code: 'storage_error' }, 503); }
  }
  dispatch(op, p, user, sessionHash) {
    const actor = user.email, stamp = new Date().toISOString();
    if (op === 'session') return user;
    if (op === 'logout') { this.sql.exec('DELETE FROM sessions WHERE id=?', sessionHash); this.log(actor, 'signed_out', 'studio'); return { ok: true }; }
    if (op === 'state' || op === 'export') {
      return { user, projects: this.rows('SELECT data FROM projects').map(r => JSON.parse(r.data)),
        tasks: this.rows('SELECT data FROM tasks').map(r => JSON.parse(r.data)),
        releases: this.rows('SELECT data FROM releases ORDER BY rowid DESC LIMIT 200').map(r => JSON.parse(r.data)),
        pins: this.rows('SELECT data FROM pins').map(r => JSON.parse(r.data)),
        events: this.rows('SELECT * FROM audit ORDER BY seq DESC LIMIT ?', op === 'export' ? 2000 : 100).map(r => ({ ...r, details: JSON.parse(r.details) })) };
    }
    if (op === 'project_create') {
      const input = projectInput(p);
      requireThat(this.row('SELECT count(*) AS n FROM projects').n < 500, 'Project limit reached; export and archive before expanding');
      const id = 'p-' + crypto.randomUUID(), project = { ...input, id, stage: 'research', revision: 1, created_at: stamp, updated_at: stamp, repository_url: '', next_update_due: null };
      this.sql.exec('INSERT INTO projects VALUES(?,?,?)', id, 1, JSON.stringify(project));
      for (const [role, title] of TASKS) {
        const task = { id: 't-' + crypto.randomUUID(), project_id: id, role, title, status: 'queued', note: '', revision: 1, updated_at: stamp };
        this.sql.exec('INSERT INTO tasks VALUES(?,?,?,?)', task.id, id, 1, JSON.stringify(task));
      }
      this.log(actor, 'project_created', id, { title: input.title }); return { project, repository_created: false, agents_started: false };
    }
    if (op === 'project_update') {
      const r = this.read('projects', p.id); requireThat(r.revision === p.revision, 'Another owner changed this project. Refresh first.', 409);
      requireThat(STAGES.includes(p.stage) && (p.stage !== 'live' || r.stage === 'live'), 'Live status requires a recorded store release');
      const u = projectInput(p);
      const repository_url = p.repository_url ? httpsURL(p.repository_url, 'repository', ['github.com']) : '';
      if (repository_url) requireThat(/^https:\/\/github\.com\/swiftSaneGames\/[A-Za-z0-9._-]+\/?$/.test(repository_url), 'Repository must belong to swiftSaneGames');
      Object.assign(r, u, { repository_url, stage: p.stage, updated_at: stamp, revision: r.revision + 1 }); this.save('projects', r);
      this.log(actor, 'project_updated', r.id, { stage: r.stage }); return { project: r };
    }
    if (op === 'task_update') {
      const r = this.read('tasks', p.id); requireThat(r.revision === p.revision, 'Task changed. Refresh before saving.', 409);
      requireThat(['queued', 'in_progress', 'blocked', 'done'].includes(p.status), 'Invalid task status');
      requireThat(ROLES.includes(p.role || r.role), 'Invalid role');
      Object.assign(r, { status: p.status, role: p.role || r.role, note: text(p.note || '', 'task note', 2000), revision: r.revision + 1, updated_at: stamp });
      this.save('tasks', r); this.log(actor, 'task_updated', r.id, { status: r.status }); return { task: r };
    }
    if (op === 'pin') {
      requireThat(/^G\d{3}$/.test(p.game_id) && +p.game_id.slice(1) >= 1 && +p.game_id.slice(1) <= 100, 'Unknown game reference');
      requireThat(typeof p.pinned === 'boolean', 'Invalid pin state');
      if (p.pinned) this.sql.exec('INSERT INTO pins VALUES(?,?) ON CONFLICT(game_id) DO UPDATE SET data=excluded.data', p.game_id, JSON.stringify({ game_id: p.game_id, note: text(p.note || '', 'research note', 2000), updated_at: stamp }));
      else this.sql.exec('DELETE FROM pins WHERE game_id=?', p.game_id);
      this.log(actor, p.pinned ? 'reference_shortlisted' : 'reference_unpinned', p.game_id); return { ok: true };
    }
    if (op === 'candidate_create') {
      const m = p.manifest, project = this.read('projects', m.project_id);
      const existing = this.row('SELECT data FROM releases WHERE manifest_hash=?', p.hash);
      if (existing) return { candidate: JSON.parse(existing.data), idempotent: true, published: false };
      const id = 'r-' + crypto.randomUUID();
      // Never permit an earlier approval to apply to newly submitted artifacts.
      for (const row of this.rows("SELECT * FROM releases WHERE project_id=? AND status IN ('awaiting_review','approved')", m.project_id)) {
        const old = JSON.parse(row.data); old.status = 'superseded'; this.sql.exec('UPDATE releases SET status=?,data=? WHERE id=?', old.status, JSON.stringify(old), old.id);
      }
      const candidate = { id, project_id: m.project_id, title: project.title, manifest: m, manifest_hash: p.hash, status: 'awaiting_review', created_at: stamp, gates_pass: gatesPass(m), decision: null };
      this.sql.exec('INSERT INTO releases VALUES(?,?,?,?,?)', id, m.project_id, p.hash, candidate.status, JSON.stringify(candidate));
      project.stage = 'review'; project.revision++; project.updated_at = stamp; this.save('projects', project);
      this.log(actor, 'candidate_created', id, { manifest_hash: p.hash }); return { candidate, published: false };
    }
    if (op === 'decision') {
      requireThat(user.role === 'owner', 'Only an owner can approve', 403);
      const r = this.read('releases', p.id); requireThat(r.status === 'awaiting_review', 'Candidate is no longer awaiting review', 409);
      requireThat(equal(p.manifest_hash, r.manifest_hash), 'Build manifest changed. Review the exact candidate again.', 409);
      requireThat(['approve', 'request_changes'].includes(p.action), 'Invalid decision');
      const note = text(p.note || '', 'review note', 4000, p.action === 'request_changes' ? 10 : 0);
      if (p.action === 'approve') {
        requireThat(Math.floor(Date.now() / 1000) - user.issued < 900, 'Sign in again before approving this release.', 401, 'reauth_required');
        requireThat(gatesPass(r.manifest), 'All eight QA gates must pass with no blocking issues', 409);
        requireThat(p.confirmation === 'APPROVE ' + r.manifest.version && p.playtested_both === true && p.reviewed_evidence === true, 'Confirm the version, both device playtests, and evidence review');
      }
      r.status = p.action === 'approve' ? 'approved' : 'changes_requested';
      r.decision = { by: actor, at: stamp, note, manifest_hash: r.manifest_hash };
      this.sql.exec('UPDATE releases SET status=?,data=? WHERE id=?', r.status, JSON.stringify(r), r.id);
      if (r.status === 'changes_requested') { const project = this.read('projects', r.project_id); project.stage = 'building'; project.revision++; project.updated_at = stamp; this.save('projects', project); }
      this.log(actor, r.status, r.id, { manifest_hash: r.manifest_hash });
      return { candidate: r, published: false, message: 'Decision recorded. No store upload was triggered.' };
    }
    if (op === 'record_publication') {
      const r = this.read('releases', p.id); requireThat(r.status === 'approved', 'Only the current approved candidate can be recorded as released', 409);
      requireThat(p.confirmation === 'RECORD RELEASE', 'Confirm the manual publication record');
      const android_url = httpsURL(p.android_url, 'Google Play listing', ['play.google.com']);
      const ios_url = httpsURL(p.ios_url, 'App Store listing', ['apps.apple.com']);
      const date = Date.parse(p.published_at); requireThat(Number.isFinite(date) && date <= Date.now() + 60000, 'Invalid release date');
      r.status = 'released'; r.publication = { android_url, ios_url, published_at: new Date(date).toISOString(), recorded_by: actor, method: 'owner_recorded_not_store_verified' };
      this.sql.exec('UPDATE releases SET status=?,data=? WHERE id=?', r.status, JSON.stringify(r), r.id);
      const project = this.read('projects', r.project_id); project.stage = 'live'; project.revision++; project.updated_at = stamp; project.next_update_due = new Date(date + 30 * 86400000).toISOString(); this.save('projects', project);
      this.log(actor, 'publication_recorded', r.id, r.publication); return { candidate: r, project };
    }
    throw new AppError(404, 'Unknown studio operation');
  }
}
