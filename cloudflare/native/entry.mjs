/** Thin Cloudflare lifecycle adapter; the same engine runs against real SQLite in tests. */
import { DurableObject } from 'cloudflare:workers';
import { StudioStore as StoreEngine } from './store.mjs';
export { default } from './worker.mjs';
export class StudioStore extends DurableObject {
  constructor(ctx, env) { super(ctx, env); this.engine = new StoreEngine(ctx, env); }
  fetch(request) { return this.engine.fetch(request); }
}
