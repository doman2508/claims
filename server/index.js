import cors from 'cors';
import express from 'express';
import sqlite3 from 'sqlite3';

const app = express();
const port = process.env.PORT || 3001;

const dbPath = process.env.DB_PATH || 'C:\\Users\\tomas\\projekty\\claims\\data\\reklamacje.db';

app.use(cors());

app.get('/api/claims', (req, res) => {
  const db = new sqlite3.Database(dbPath, sqlite3.OPEN_READONLY, (error) => {
    if (error) {
      res.status(500).json({ error: `Failed to open database: ${error.message}`, dbPath });
    }
  });

  db.all('SELECT * FROM reklamacje', [], (error, rows) => {
    if (error) {
      res.status(500).json({ error: `Failed to read table reklamacje: ${error.message}` });
    } else {
      res.json(rows);
    }

    db.close();
  });
});

app.listen(port, () => {
  console.log(`Claims API listening on port ${port}`);
  console.log(`Using SQLite database: ${dbPath}`);
});
