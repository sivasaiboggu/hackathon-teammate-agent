# campus-queue

A live queue board for campus food counters. Students join a counter's queue from their phone and watch their position move; staff call the next token from a simple screen.

## What it does

- 6 HTTP endpoints (GET /api/counters, GET /api/counters/:id, POST /api/counters/:id/join, POST /api/counters/:id/next, POST /api/counters/:id/done/:tokenId, POST /api/counters/:id/leave/:tokenId)
- Automated tests in test/queue.test.js
- Starts with `npm start` (node server.js)
- Tests run with `npm test` (node --test test/queue.test.js)
- Serves a browser page from a static folder

## Install

```bash
npm install
```

## Run

```bash
npm start
```

## API

| Method | Path |
| --- | --- |
| GET | `/api/counters` |
| GET | `/api/counters/:id` |
| POST | `/api/counters/:id/join` |
| POST | `/api/counters/:id/next` |
| POST | `/api/counters/:id/done/:tokenId` |
| POST | `/api/counters/:id/leave/:tokenId` |

## Project layout

```
.gitignore
README.md
package.json
public/app.js
public/index.html
public/style.css
server.js
src/queue.js
test/queue.test.js
```

## Tests

```bash
npm test
```

## Notes

- This README was drafted from the repo files listed above. Check anything marked with a source before presenting it as final.
- The repo's previous README was 3 lines long and said almost nothing — this draft replaces it.
