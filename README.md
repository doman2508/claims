# Claims app

Simple React + Tailwind web app that reads and edits reported claims from SQLite table `reklamacje`.

## Preferred app location (Windows)

You can move the whole project to:

`C:\Users\tomas\projekty\claims`

### Example (PowerShell)

```powershell
New-Item -ItemType Directory -Force C:\Users\tomas\projekty\claims
# Copy this repository files into C:\Users\tomas\projekty\claims
cd C:\Users\tomas\projekty\claims
```

## Setup

```bash
npm install
```

## Run

```bash
npm run dev
```

By default, backend now reads DB from:

`<application_root>\data\reklamacje.db`

So when app root is `C:\Users\tomas\projekty\claims`, default DB path is:

`C:\Users\tomas\projekty\claims\data\reklamacje.db`

If needed, override paths:

```bash
APP_ROOT=/custom/app/root DB_PATH=/custom/path/reklamacje.db npm run dev
```

App URL: <http://localhost:5173>
API URL: <http://localhost:3001/api/claims>

## Features

- Displays rows from `reklamacje` in a responsive table.
- Global search field that filters by every visible field.
- Editing in a dedicated modal window with save/cancel actions.
