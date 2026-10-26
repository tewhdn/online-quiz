import { DatabaseSync } from 'node:sqlite';

/**
 * Cloudflare D1 的最小本地实现（基于 Node 内置 node:sqlite）。
 * 仅用于本地开发与自动化测试；生产环境使用真实 D1 绑定。
 * 支持的 API 与项目实际使用的一致：prepare / bind / first / all / run / batch / exec。
 */
export class NodeD1Database {
  constructor(filename = ':memory:') {
    this.db = new DatabaseSync(filename);
    this.db.exec('PRAGMA foreign_keys = ON;');
  }

  prepare(sql) {
    return new NodeD1Statement(this.db, sql, []);
  }

  async exec(sql) {
    this.db.exec(sql);
    return { count: 0, duration: 0 };
  }

  /** D1 batch 在一个事务中执行，任何一条失败都会整体回滚。 */
  async batch(statements) {
    this.db.exec('BEGIN IMMEDIATE');
    const results = [];
    try {
      for (const statement of statements) {
        results.push(statement.runSync());
      }
      this.db.exec('COMMIT');
      return results;
    } catch (error) {
      try {
        this.db.exec('ROLLBACK');
      } catch {
        // ignore rollback failure
      }
      throw error;
    }
  }

  close() {
    this.db.close();
  }
}

function normalizeParams(params) {
  return params.map((value) => {
    if (value === undefined) return null;
    if (typeof value === 'boolean') return value ? 1 : 0;
    return value;
  });
}

class NodeD1Statement {
  constructor(db, sql, params) {
    this.db = db;
    this.sql = sql;
    this.params = params;
  }

  bind(...params) {
    return new NodeD1Statement(this.db, this.sql, normalizeParams(params));
  }

  runSync(values = []) {
    const params = values.length > 0 ? normalizeParams(values) : this.params;
    const statement = this.db.prepare(this.sql);
    const result = statement.run(...params);
    return {
      success: true,
      results: [],
      meta: {
        changes: Number(result.changes ?? 0),
        last_row_id: Number(result.lastInsertRowid ?? 0),
      },
    };
  }

  async first(column, ...values) {
    const params = values.length > 0 ? normalizeParams(values) : this.params;
    const statement = this.db.prepare(this.sql);
    const row = statement.get(...params);
    if (row === undefined) return null;
    if (column) return row[column];
    return row;
  }

  async all(...values) {
    const params = values.length > 0 ? normalizeParams(values) : this.params;
    const statement = this.db.prepare(this.sql);
    const rows = statement.all(...params);
    return { success: true, results: rows, meta: { changes: 0 } };
  }

  async run(...values) {
    return this.runSync(values);
  }

  async raw(...values) {
    const params = values.length > 0 ? normalizeParams(values) : this.params;
    const statement = this.db.prepare(this.sql);
    const rows = statement.all(...params);
    return rows.map((row) => Object.values(row));
  }
}
