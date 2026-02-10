# Claims app

Simple React + Tailwind web app that reads reported claims from SQLite table `reklamacje`.

## Setup

```bash
npm install
```

## Run

```bash
# Uses default DB path:
# C:\Users\tomas\projekty\claims\data\reklamacje.db
npm run dev
```

If needed, override DB path:

```bash
DB_PATH=/path/to/reklamacje.db npm run dev
```

App URL: <http://localhost:5173>
API URL: <http://localhost:3001/api/claims>
