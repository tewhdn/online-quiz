import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
export const MIGRATIONS_DIR = path.join(ROOT, 'workers/api/migrations');

/** 与 wrangler d1 migrations 类似：记录已执行迁移，避免重复执行。 */
export function applyMigrations(db, dir = MIGRATIONS_DIR) {
  db.exec(`CREATE TABLE IF NOT EXISTS _local_migrations (
    name TEXT PRIMARY KEY,
    applied_at INTEGER NOT NULL
  );`);
  const rows = db.prepare('SELECT name FROM _local_migrations').all();
  const applied = new Set(rows.map((row) => row.name));
  const files = readdirSync(dir).filter((name) => name.endsWith('.sql')).sort();
  for (const file of files) {
    if (applied.has(file)) continue;
    const sql = readFileSync(path.join(dir, file), 'utf8');
    db.exec('BEGIN');
    try {
      db.exec(sql);
      db.prepare('INSERT INTO _local_migrations (name, applied_at) VALUES (?, ?)').run(file, Date.now());
      db.exec('COMMIT');
      console.log(`[db] applied ${file}`);
    } catch (error) {
      db.exec('ROLLBACK');
      throw error;
    }
  }
}
