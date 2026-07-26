const initSqlJs = require('sql.js');
const fs = require('node:fs');
const path = require('node:path');

let SQL = null;

async function getSql() {
  if (!SQL) {
    SQL = await initSqlJs();
  }
  return SQL;
}

function openDb(filePath) {
  if (!fs.existsSync(filePath)) {
    return { error: `File not found: ${filePath}` };
  }
  const buf = fs.readFileSync(filePath);
  return { buffer: buf };
}

async function listTables(filePath) {
  const sql = await getSql();
  const { buffer, error } = openDb(filePath);
  if (error) return { error };
  const db = new sql.Database(buffer);
  try {
    const stmt = db.exec("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name");
    const tables = stmt[0] ? stmt[0].values.map(v => v[0]) : [];
    return { path: filePath, tables, count: tables.length };
  } finally {
    db.close();
  }
}

async function getSchema(filePath, table) {
  const sql = await getSql();
  const { buffer, error } = openDb(filePath);
  if (error) return { error };
  const db = new sql.Database(buffer);
  try {
    const stmt = db.exec(`PRAGMA table_info("${table.replace(/"/g, '""')}")`);
    if (!stmt[0]) return { error: `Table not found: ${table}` };
    const columns = stmt[0].values.map(v => ({
      cid: v[0],
      name: v[1],
      type: v[2],
      notNull: !!v[3],
      defaultValue: v[4],
      primaryKey: !!v[5],
    }));
    return { path: filePath, table, columns, count: columns.length };
  } finally {
    db.close();
  }
}

async function query(filePath, sqlText, params) {
  const sql = await getSql();
  const { buffer, error } = openDb(filePath);
  if (error) return { error };
  const db = new sql.Database(buffer);
  try {
    const upper = sqlText.trim().toUpperCase();
    if (!upper.startsWith('SELECT') && !upper.startsWith('PRAGMA') && !upper.startsWith('EXPLAIN')) {
      return { error: 'Only SELECT/PRAGMA/EXPLAIN queries allowed in db_query. Use db_execute for modifications.' };
    }
    const stmt = db.prepare(sqlText);
    if (params) {
      stmt.bind(params);
    }
    const rows = [];
    const columns = stmt.getColumnNames();
    while (stmt.step()) {
      rows.push(stmt.getAsObject());
    }
    stmt.free();
    return { path: filePath, sql: sqlText, rows, columns, count: rows.length };
  } finally {
    db.close();
  }
}

async function execute(filePath, sqlText, params) {
  const sql = await getSql();
  const { buffer, error } = openDb(filePath);
  if (error) return { error };
  const db = new sql.Database(buffer);
  try {
    const upper = sqlText.trim().toUpperCase();
    if (upper.startsWith('SELECT') || upper.startsWith('PRAGMA') || upper.startsWith('EXPLAIN')) {
      return { error: 'Use db_query for read operations' };
    }
    db.run(sqlText, params);
    const affected = db.getRowsModified();
    const buf = db.export();
    fs.writeFileSync(filePath, buf);
    return { path: filePath, sql: sqlText, affectedRows: affected };
  } finally {
    db.close();
  }
}

async function backup(filePath, output) {
  const sql = await getSql();
  const { buffer, error } = openDb(filePath);
  if (error) return { error };
  const db = new sql.Database(buffer);
  try {
    const buf = db.export();
    const dir = path.dirname(output);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(output, buf);
    return { source: filePath, destination: output, size: buf.length };
  } finally {
    db.close();
  }
}

module.exports = { listTables, getSchema, query, execute, backup };
