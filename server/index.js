import cors from 'cors';
import express from 'express';
import sqlite3 from 'sqlite3';

const app = express();
const port = process.env.PORT || 3001;
const dbPath = process.env.DB_PATH || 'C:\\Users\\tomas\\projekty\\claims\\data\\reklamacje.db';

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

app.get('/api/claims', async (req, res) => {
  const db = openDb(sqlite3.OPEN_READONLY);
  try {
    const rows = await allQuery(db, 'SELECT rowid AS _rowid_, * FROM reklamacje');
    res.json(rows);
  } catch (error) {
    res.status(500).json({ error: `Failed to read table reklamacje: ${error.message}` });
  } finally {
    db.close();
  }
});

app.put('/api/claims/:rowId', async (req, res) => {
  const db = openDb(sqlite3.OPEN_READWRITE);
  const rowId = Number(req.params.rowId);

  if (!Number.isInteger(rowId)) {
    res.status(400).json({ error: 'Invalid row id.' });
    db.close();
    return;
  }

  try {
    const schemaRows = await allQuery(db, 'PRAGMA table_info(reklamacje)');
    const allowedColumns = new Set(schemaRows.map((row) => row.name));

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

app.listen(port, () => {
  console.log(`Claims API listening on port ${port}`);
  console.log(`Using SQLite database: ${dbPath}`);
});
