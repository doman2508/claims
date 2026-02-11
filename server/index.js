import crypto from 'node:crypto';
import cors from 'cors';
import express from 'express';
import path from 'node:path';
import sqlite3 from 'sqlite3';

const app = express();
const port = process.env.PORT || 3001;
const appRoot = process.env.APP_ROOT || process.cwd();
const dbPath = process.env.DB_PATH || path.join(appRoot, 'data', 'reklamacje.db');

const sessions = new Map();

app.use(cors());
app.use(express.json());

function openDb(mode = sqlite3.OPEN_READONLY) {
  return new sqlite3.Database(dbPath, mode);
}

function runQuery(db, sql, params = []) {
  return new Promise((resolve, reject) => {
    db.run(sql, params, function onRun(error) {
      if (error) {
        reject(error);
        return;
      }
      resolve(this);
    });
  });
}

function allQuery(db, sql, params = []) {
  return new Promise((resolve, reject) => {
    db.all(sql, params, (error, rows) => {
      if (error) {
        reject(error);
        return;
      }
      resolve(rows);
    });
  });
}

async function oneQuery(db, sql, params = []) {
  const rows = await allQuery(db, sql, params);
  return rows[0] ?? null;
}

function formatDateOnly(date) {
  return date.toISOString().slice(0, 10);
}

function formatDateTime(date) {
  return date.toISOString().slice(0, 19).replace('T', ' ');
}

async function loadTableSchema(db) {
  return allQuery(db, 'PRAGMA table_info(reklamacje)');
}

function findColumnName(schemaRows, expectedLowerName) {
  return schemaRows.find((row) => row.name?.toLowerCase() === expectedLowerName)?.name ?? null;
}

function buildFullName(user) {
  return `${user.first_name ?? ''} ${user.last_name ?? ''}`.trim();
}

async function enrichClaimsWithDept(db, rows) {
  if (!rows.length) {
    return rows;
  }

  const users = await allQuery(db, 'SELECT first_name, last_name, dept FROM users');
  const deptByFullName = new Map(
    users.map((user) => [buildFullName(user), user.dept ?? ''])
  );

  return rows.map((row) => {
    const existingDept = row.dept ?? row.dzial;
    if (existingDept) {
      return row;
    }

    const reporter = String(row.zglaszajacy ?? '');
    const mappedDept = deptByFullName.get(reporter) ?? '';

    return {
      ...row,
      dept: mappedDept
    };
  });
}

async function generateClaimNumber(db, year) {
  const prefix = `NZG-${year}-`;
  const rows = await allQuery(
    db,
    'SELECT claim_number FROM reklamacje WHERE claim_number LIKE ?',
    [`${prefix}%`]
  );

  let maxSequence = 0;
  for (const row of rows) {
    const value = String(row.claim_number ?? '');
    const sequencePart = value.slice(prefix.length);
    if (/^\d+$/.test(sequencePart)) {
      maxSequence = Math.max(maxSequence, Number(sequencePart));
    }
  }

  return `${prefix}${String(maxSequence + 1).padStart(3, '0')}`;
}

async function ensureUsersTable() {
  const db = openDb(sqlite3.OPEN_READWRITE | sqlite3.OPEN_CREATE);

  try {
    await runQuery(
      db,
      `CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        username TEXT NOT NULL UNIQUE,
        password TEXT NOT NULL,
        first_name TEXT NOT NULL,
        last_name TEXT NOT NULL,
        role TEXT NOT NULL,
        dept TEXT NOT NULL DEFAULT ""
      )`
    );

    const usersSchema = await allQuery(db, 'PRAGMA table_info(users)');
    const hasDept = usersSchema.some((column) => column.name === 'dept');
    if (!hasDept) {
      await runQuery(db, 'ALTER TABLE users ADD COLUMN dept TEXT NOT NULL DEFAULT ""');
    }

    const adminUser = await oneQuery(db, 'SELECT id FROM users WHERE username = ?', ['TODO']);
    if (!adminUser) {
      await runQuery(
        db,
        'INSERT INTO users (username, password, first_name, last_name, role, dept) VALUES (?, ?, ?, ?, ?, ?)',
        ['TODO', '1234', 'TODO', '', 'admin', 'DZIAŁ']
      );
      console.log('Created default admin user: TODO / 1234');
    }
  } finally {
    db.close();
  }
}

function authMiddleware(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;

  if (!token || !sessions.has(token)) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }

  req.user = sessions.get(token);
  req.token = token;
  next();
}

app.post('/api/auth/login', async (req, res) => {
  const db = openDb(sqlite3.OPEN_READONLY);
  const username = String(req.body?.username ?? '').trim();
  const password = String(req.body?.password ?? '');

  if (!username || !password) {
    res.status(400).json({ error: 'Username and password are required.' });
    db.close();
    return;
  }

  try {
    const user = await oneQuery(
      db,
      'SELECT id, username, first_name, last_name, role, dept FROM users WHERE username = ? AND password = ?',
      [username, password]
    );

    if (!user) {
      res.status(401).json({ error: 'Invalid username or password.' });
      return;
    }

    const token = crypto.randomUUID();
    const sessionUser = {
      id: user.id,
      username: user.username,
      first_name: user.first_name,
      last_name: user.last_name,
      fullName: buildFullName(user),
      role: user.role,
      dept: user.dept
    };

    sessions.set(token, sessionUser);
    res.json({ token, user: sessionUser });
  } catch (error) {
    res.status(500).json({ error: `Failed to login: ${error.message}` });
  } finally {
    db.close();
  }
});

app.post('/api/auth/logout', authMiddleware, (req, res) => {
  sessions.delete(req.token);
  res.json({ ok: true });
});

app.get('/api/auth/me', authMiddleware, (req, res) => {
  res.json({ user: req.user });
});

app.get('/api/claims/schema', authMiddleware, async (req, res) => {
  const db = openDb(sqlite3.OPEN_READONLY);

  try {
    const schemaRows = await loadTableSchema(db);
    res.json(schemaRows);
  } catch (error) {
    res.status(500).json({ error: `Failed to read schema: ${error.message}` });
  } finally {
    db.close();
  }
});

app.get('/api/claims', authMiddleware, async (req, res) => {
  const db = openDb(sqlite3.OPEN_READONLY);
  try {
    const schemaRows = await loadTableSchema(db);
    const reporterColumn = findColumnName(schemaRows, 'zglaszajacy');

    if (req.user.role === 'admin' || !reporterColumn) {
      const rows = await allQuery(db, 'SELECT rowid AS _rowid_, * FROM reklamacje');
      const rowsWithDept = await enrichClaimsWithDept(db, rows);
      res.json(rowsWithDept);
      return;
    }

    const rows = await allQuery(
      db,
      `SELECT rowid AS _rowid_, * FROM reklamacje WHERE "${reporterColumn.replaceAll('"', '""')}" = ?`,
      [req.user.fullName]
    );
    const rowsWithDept = await enrichClaimsWithDept(db, rows);
    res.json(rowsWithDept);
  } catch (error) {
    res.status(500).json({ error: `Failed to read table reklamacje: ${error.message}` });
  } finally {
    db.close();
  }
});

app.post('/api/claims', authMiddleware, async (req, res) => {
  const db = openDb(sqlite3.OPEN_READWRITE);

  try {
    const schemaRows = await loadTableSchema(db);
    const columns = new Set(schemaRows.map((row) => row.name));
    const incoming = req.body && typeof req.body === 'object' ? req.body : {};

    const disallowedOnCreate = new Set([
      'id',
      '_rowid_',
      'claim_number',
      'data_zgloszenia',
      'status',
      'utworzono',
      'zglaszajacy',
      'dzial',
      'dept'
    ]);
    const allowedEntries = Object.entries(incoming).filter(
      ([key]) => columns.has(key) && !disallowedOnCreate.has(key.toLowerCase())
    );

    const now = new Date();
    const year = now.getFullYear();

    const defaultEntries = [];
    if (columns.has('data_zgloszenia')) {
      defaultEntries.push(['data_zgloszenia', formatDateOnly(now)]);
    }
    if (columns.has('status')) {
      defaultEntries.push(['status', 'Nowe']);
    }
    if (columns.has('utworzono')) {
      defaultEntries.push(['utworzono', formatDateTime(now)]);
    }
    if (columns.has('claim_number')) {
      const nextClaimNumber = await generateClaimNumber(db, year);
      defaultEntries.push(['claim_number', nextClaimNumber]);
    }
    const reporterColumn = findColumnName(schemaRows, 'zglaszajacy');
    if (reporterColumn) {
      defaultEntries.push([reporterColumn, req.user.fullName]);
    }
    const deptColumn = findColumnName(schemaRows, 'dept') || findColumnName(schemaRows, 'dzial');
    if (deptColumn) {
      defaultEntries.push([deptColumn, req.user.dept || '']);
    }

    const entries = [...defaultEntries, ...allowedEntries];

    const providedColumns = new Set(entries.map(([column]) => column));
    const missingRequiredColumns = schemaRows
      .filter((row) => row.notnull === 1 && row.dflt_value == null && row.pk === 0)
      .map((row) => row.name)
      .filter((column) => !providedColumns.has(column));

    if (missingRequiredColumns.length) {
      res.status(400).json({
        error: `Missing required fields: ${missingRequiredColumns.join(', ')}`
      });
      return;
    }

    if (!entries.length) {
      res.status(400).json({ error: 'No valid fields provided.' });
      return;
    }

    const columnList = entries.map(([column]) => `"${column.replaceAll('"', '""')}"`).join(', ');
    const placeholders = entries.map(() => '?').join(', ');
    const values = entries.map(([, value]) => value);

    const result = await runQuery(db, `INSERT INTO reklamacje (${columnList}) VALUES (${placeholders})`, values);
    const createdRows = await allQuery(db, 'SELECT rowid AS _rowid_, * FROM reklamacje WHERE rowid = ?', [result.lastID]);
    res.status(201).json(createdRows[0]);
  } catch (error) {
    res.status(500).json({ error: `Failed to create row: ${error.message}` });
  } finally {
    db.close();
  }
});


async function ensureUserCanAccessRow(db, schemaRows, rowId, user) {
  if (user.role === 'admin') {
    return { ok: true };
  }

  const reporterColumn = findColumnName(schemaRows, 'zglaszajacy');
  if (!reporterColumn) {
    return { ok: true };
  }

  const row = await oneQuery(
    db,
    `SELECT "${reporterColumn.replaceAll('"', '""')}" AS reporter FROM reklamacje WHERE rowid = ?`,
    [rowId]
  );

  if (!row) {
    return { ok: false, status: 404, error: 'Claim row not found.' };
  }

  if (String(row.reporter ?? '') !== user.fullName) {
    return { ok: false, status: 403, error: 'Forbidden: you can modify only your own claims.' };
  }

  return { ok: true };
}

app.put('/api/claims/:rowId', authMiddleware, async (req, res) => {
  const db = openDb(sqlite3.OPEN_READWRITE);
  const rowId = Number(req.params.rowId);

  if (!Number.isInteger(rowId)) {
    res.status(400).json({ error: 'Invalid row id.' });
    db.close();
    return;
  }

  try {
    const schemaRows = await loadTableSchema(db);
    const allowedColumns = new Set(schemaRows.map((row) => row.name));

    const access = await ensureUserCanAccessRow(db, schemaRows, rowId, req.user);
    if (!access.ok) {
      res.status(access.status).json({ error: access.error });
      return;
    }

    const incoming = req.body && typeof req.body === 'object' ? req.body : {};
    const entries = Object.entries(incoming).filter(([key]) => allowedColumns.has(key));

    if (!entries.length) {
      res.status(400).json({ error: 'No editable fields provided.' });
      return;
    }

    const setClause = entries.map(([column]) => `"${column.replaceAll('"', '""')}" = ?`).join(', ');
    const values = entries.map(([, value]) => value);
    const result = await runQuery(db, `UPDATE reklamacje SET ${setClause} WHERE rowid = ?`, [...values, rowId]);

    if (!result.changes) {
      res.status(404).json({ error: 'Claim row not found.' });
      return;
    }

    const updatedRows = await allQuery(db, 'SELECT rowid AS _rowid_, * FROM reklamacje WHERE rowid = ?', [rowId]);
    res.json(updatedRows[0]);
  } catch (error) {
    res.status(500).json({ error: `Failed to update row: ${error.message}` });
  } finally {
    db.close();
  }
});

await ensureUsersTable();


app.delete('/api/claims/:rowId', authMiddleware, async (req, res) => {
  const db = openDb(sqlite3.OPEN_READWRITE);
  const rowId = Number(req.params.rowId);

  if (!Number.isInteger(rowId)) {
    res.status(400).json({ error: 'Invalid row id.' });
    db.close();
    return;
  }

  try {
    const schemaRows = await loadTableSchema(db);
    const access = await ensureUserCanAccessRow(db, schemaRows, rowId, req.user);
    if (!access.ok) {
      res.status(access.status).json({ error: access.error });
      return;
    }

    const result = await runQuery(db, 'DELETE FROM reklamacje WHERE rowid = ?', [rowId]);
    if (!result.changes) {
      res.status(404).json({ error: 'Claim row not found.' });
      return;
    }

    res.json({ ok: true, rowId });
  } catch (error) {
    res.status(500).json({ error: `Failed to delete row: ${error.message}` });
  } finally {
    db.close();
  }
});

app.listen(port, () => {
  console.log(`Claims API listening on port ${port}`);
  console.log(`Application root: ${appRoot}`);
  console.log(`Using SQLite database: ${dbPath}`);
});
