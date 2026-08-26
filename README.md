# Kalope Homes — Project Finance (v1)

Track what a client pays in, what each job spends, and what's actually left.

```bash
npm install
npm run dev        # app only, no database — http://localhost:5173
npm run build      # bundle into dist/
npm start          # app + API on one port — http://localhost:3000
npm run test:e2e   # 32 API checks against a throwaway database
```

## One deployment, two halves

`npm start` runs a Node server that serves the built React app **and** answers
`/api` from the same origin. One thing to deploy, no CORS to configure. See
**[DEPLOY.md](DEPLOY.md)** for the Hostinger setup.

```
Browser  ──HTTPS──▶  Node server (server/)  ──▶  MariaDB
                     serves dist/ and /api
```

**Local-only mode.** `npm run dev` on its own has no database and no login —
everything stays in that browser. The sidebar says `This device only` so nobody
mistakes it for the real thing. A production build always talks to `/api`; no
frontend environment variable is needed.

Settings has **Download backup** / **Restore from backup** in both modes, and
the backup carries the attached files inside it.

## The six verticals

| Vertical | What it holds |
|---|---|
| **Projects** | The container. Every rupee is filed under one. Carries the quoted value, which is what makes margin measurable. |
| **Incoming** | Client payments, each tagged with the account it landed in — cash, a personal account, or the company account. |
| **Expenditure** | Bills under seven heads: Sheet, Fare, Hardware, Labour, Designer, Electric, Extra. Each records which account paid. |
| **Accounts** | Reconciliation. Money arrives in four channels and leaves from them; this is where the two sides meet, and where "personal money tied up in jobs" becomes visible. |
| **Inventory** | Bought quantity minus used quantity, for heads marked stock-tracked. Leftovers are stock, not loss. |
| **Settings** | Heads, accounts and clients as editable data — so the chart of accounts changes without a deploy. |

Projects, receipts and expenses all take **file attachments** — the signed
quotation, a photo of each bill, a bank screenshot. Every file filed against a
job collects in that project's Documents panel.

## How the numbers work

All arithmetic lives in one file: [`src/store/selectors.js`](src/store/selectors.js).
Components read totals; they never compute them. If a figure is ever disputed,
that's the only file to audit.

- **Remaining** = incoming − expenditure. Negative means the firm is funding the
  job out of its own pocket, and the dashboard says so.
- **Margin** = quoted − expenditure. This is the number that decides whether the
  job was worth taking; "remaining" only tracks cash position.
- **Inventory left** = (qty − usedQty) × rate, for stock-tracked heads.

## Architecture

```
server/             Node + MariaDB backend, and the static host for dist/
  index.js          express app: /api, dist/, SPA fallback
  config.js         environment variables, validation, warnings
  db.js             lazy mysql2 pool + driver-error hints
  schema.js         the schema, and the only definition of it — self-migrating
  auth.js           scrypt password hashing, sessions, requireUser
  entities.js       the camelCase ↔ snake_case field maps
  sync.js           applying the browser's queued operations
  files.js          uploads: content sniffing, safe filenames
  routes.js         /health /auth /state /sync /files
  e2e.mjs           integration test against a throwaway database

src/
  data/
    masters.js      seed heads + accounts (data, not code)
    repo.js         the local cache (localStorage)
    api.js          HTTP client for the API
    outbox.js       the queue that guarantees nothing is lost
    files.js        attachments: server + IndexedDB cache + image downscaling
    seed.js         demo project set
  store/
    AppStore.jsx    CRUD reducer → screen now, queue for the server
    ScopeContext.jsx  which project the ledger pages are filtered to (view state)
    selectors.js    every rupee calculation
  components/       Caliper, Measure, FlowChart, dialogs, layout, sign-in
  pages/            one per vertical
```

## How "nothing gets lost" actually works

Every change follows the same path:

1. `AppStore` dispatches it — the screen updates instantly, no spinner.
2. `outbox.enqueue()` writes it to a queue persisted in `localStorage`
   **before** anything is sent.
3. The queue drains to `POST /sync`, which applies the whole batch inside one
   MySQL transaction. A half-applied batch is impossible.
4. Only on the server's confirmation does the change leave the queue.

Lost connection, closed laptop, dead battery mid-entry: the queue survives and
sends itself on next load, or when the browser fires `online`. Failed sends back
off exponentially instead of hammering. A batch the server *rejects* (422) is
moved aside and reported rather than retried forever — otherwise one bad row
would block every change behind it.

Writes are upserts keyed by an id the **browser** generates, so re-sending a
batch is harmless. That's what makes retrying safe.

## What the API exposes

| Route | Does |
|---|---|
| `GET /ping` | Liveness only — touches no database and no disk. Separates "the app is broken" from "the host never started it". |
| `GET /health` | Names the failing step (config / connect / schema / query / uploads) plus the driver code. Open by design — it exists for when nobody can log in. Never reports a hostname or password, and while signed out reports only whether a login exists, not how much is in the ledger. |
| `POST /auth/login` | Email + password → session token |
| `GET /state` | The whole ledger in one response |
| `POST /sync` | A batch of queued changes, applied transactionally |
| `POST /files` | Upload a bill photo |
| `GET /files/{id}` | Fetch one, session-checked |

## Every dependency must be pure JavaScript

The host has no compiler, and the prebuilt binaries native packages download are
linked against a newer glibc than CloudLinux has. Both paths fail, so a single
native module makes `npm install` die on deploy — and the error points at the
package, not at the platform.

That rules out `bcrypt` and `argon2`; passwords use Node's built-in `scrypt`
instead, which is a proper memory-hard KDF and adds nothing to the tree. The
runtime dependencies are `express`, `mysql2` and `multer` — all pure JS.

Before adding a package, check it:

```bash
node -e "const fs=require('fs'),p=require('path');for(const d of fs.readdirSync('node_modules'))\
if(fs.existsSync(p.join('node_modules',d,'binding.gyp')))console.log('NATIVE:',d)"
```

## Schema changes

The schema lives only in [`server/schema.js`](server/schema.js). To add a field:
declare the column, bump `SCHEMA_VERSION`, re-upload. On the next request the
app compares the live table against the declaration and adds what is missing.

This exists because `CREATE TABLE IF NOT EXISTS` skips an existing table
*including its columns* — so a field added later never reaches a live database,
the deploy succeeds, and every query touching it fails with `Unknown column`.
Columns are only ever added; never dropped, never retyped.

Dialect rules, because the server version is not ours to choose: no `DEFAULT` on
a `TEXT` column, no `DEFAULT` that calls a function except `CURRENT_TIMESTAMP`
on a datetime, and money is always `DECIMAL`, never `FLOAT`.

## Mobile

Tested at 390px. Every page fits without the layout panning sideways, tap
targets are at least 42px under `pointer: coarse`, form fields are 16px so iOS
does not zoom on focus, and dialogs become bottom sheets with a scrolling body
and pinned footer.

Wide ledgers scroll inside their own box, with the **amount column pinned to the
right edge** so the money is readable however far the row is scrolled. On a
phone the row itself opens the entry, since edit and delete buttons would eat
the width the amount needs.

## Design

The app is an instrument for measuring a job, so it is dressed as one. Figures
are set in tabular mono, which makes columns align like an engraved scale and
makes a wrong digit easy to spot. The budget reading is a ruled beam with a
machined jaw rather than a rounded progress pill — each major tick is 10% of
money received, so the jaw's position is a real measurement rather than
decoration.

## What v2 should pick up

1. **Multi-user with roles.** The `users` table already carries a `role` column
   and every write is stamped in `audit_log`; nothing else is wired up yet.
   Owner sees margin, site supervisor only files bills.
2. **Account transfers.** Today money only moves in and out of projects, so
   reimbursing a personal account has nowhere to be recorded. The Accounts page
   flags the exposure but can't settle it.
3. **Paginate `/state`.** It loads the entire ledger in one response, which is
   right for hundreds or a few thousand rows and wrong beyond that. Fetch by
   project or date range when it starts to drag.
4. **Quantity estimates per project**, so purchases can be compared against a
   BOQ rather than only against money received.
5. **A PDF client statement** — the CSV export is the placeholder for it.
6. **An undelete screen.** Deleted rows are still in MySQL behind `deleted_at`;
   right now recovering one needs a SQL statement.
