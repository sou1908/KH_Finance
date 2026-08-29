# Kalope Homes — Project Finance (v1)

Track what a client pays in, what each job spends, and what's actually left.

```bash
npm install
npm run dev        # app only, no database — http://localhost:5173
npm run build      # bundle into dist/
npm start          # app + API on one port — http://localhost:3000
npm run test:e2e        # 32 API checks against a throwaway database
npm run test:roles      # what a procurement login is and isn't sent
npm run test:selectors  # money arithmetic — no database needed
npm run test:company    # company costs never reach a project figure
npm run test:due        # due-date arithmetic, including month ends
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

## Two halves, one pool

The business has a project side and a company side, and they run on different
clocks — company costs are steady and monthly, job margins land in lumps when
jobs finish. So they are two systems rather than one blended figure, and they
meet at **money in hand**, which sits in the top bar on every screen.

The switch at the top of the rail swaps the **whole rail**, not just the page:
in Company mode there is no Projects list to wander into and no client money
anywhere. Accounts and Settings appear on both sides because they belong to
both. The mode is read from the URL wherever the URL knows — so a bookmark, a
refresh and the back button all land in the right system — and only falls back
to the remembered choice on Accounts and Settings, which belong to neither.

```
              MONEY IN HAND          every account added up
                     │
       ┌─────────────┴─────────────┐
  PROJECT DASHBOARD          COMPANY DASHBOARD
  client money in            office A / office B
  job costs                  rent · power · wifi
  margin per job             marketing · software
  material in stock
```

| Vertical | What it holds |
|---|---|
| **Projects** | The container. Every project rupee is filed under one. Carries the quoted value, which is what makes margin measurable. |
| **Incoming** | Client payments, each tagged with the account it landed in — cash, a personal account, or the company account. |
| **Expenditure** | Job bills under the project heads: Sheet, Fare, Hardware, Labour, Designer, Electric, Extra. Each records which account paid. |
| **Company** | What the business costs to run whatever jobs are on — rent, power, internet, marketing, software. Split by office, with a company-wide bucket for what belongs to neither. |
| **What's due** | The only screen about the future. EMIs, rent, bills and anyone who owes you, each warning you as many days ahead as you set. |
| **Accounts** | Reconciliation. Both sides leave from the same accounts, so this is where they meet, and where "personal money tied up in jobs" becomes visible. |
| **Inventory** | Bought quantity minus what has left the pool, for heads marked stock-tracked. Leftovers are stock, not loss. |
| **Settings** | One page per side. Project settings holds job heads, items, vendors and clients; Company settings holds company heads, payees and offices. Accounts, logins and the backup are shared and appear under both. |

Projects, receipts, expenses and company bills all take **file attachments** —
the signed quotation, a photo of each bill, a bank screenshot. Every file filed
against a job collects in that project's Documents panel.

## How the numbers work

All arithmetic lives in one file: [`src/store/selectors.js`](src/store/selectors.js).
Components read totals; they never compute them. If a figure is ever disputed,
that's the only file to audit.

- **Expenditure** = the sum of the bills, exactly as recorded. It is never
  adjusted, because it has to keep matching the paper in the file.
- **Remaining** = incoming − expenditure. Negative means the firm is funding the
  job out of its own pocket, and the dashboard says so.
- **Net cost** = expenditure − material sent to other jobs + material received
  from them, each valued at the rate on the original purchase.
- **Margin** = quoted − **net cost**. This is the number that decides whether the
  job was worth taking; "remaining" only tracks cash position.
- **Inventory left** = what a purchase still has standing, per project, from the
  `movements` ledger × the purchase rate.
- **Money in hand** = every account added up. The one figure that is true with no
  qualification: what the firm can spend tomorrow.
- **Movement** = money in − job costs − company costs, over a period. Never
  called profit; see below.

### Why the monthly figure is a movement, not profit

A month where a client pays a ₹7L advance looks brilliant and the month the work
gets done looks terrible, though nothing about the business changed in between.
Read alone, that number would be worse than useless.

It is safe because it **accumulates**. Add up every month's movement, start from
the opening balances, and you land exactly on money in hand — the swings cancel.
So the app shows the movement as *"money in hand went up ₹4,20,000"* and reserves
the word profit for what it means. `npm run test:company` asserts the
accumulation lands on the balance to the rupee.

Loans are the one thing that would break the reading: borrow ₹5L and a month you
burned ₹5.2L looks like it broke even. Borrowing, EMIs and lending therefore get
their own rows rather than being blended into either side. *(Not built yet —
phase 4.)*

### Reminders, and why they are not payments

`commitments` is the only table about the future. One shape covers an EMI, the
rent, the wifi bill and a friend who owes you money, because they are the same
sentence: *an amount, a party, a date, and how often it comes round again.*
Four tables would have been four sets of date arithmetic to get wrong.

A commitment holds **no record of money that moved**. Settling one opens the
ordinary company expense form, prefilled and fully editable — the rent may have
gone up, and the bill in hand is what is true. Only once that bill is saved is
`last_settled_on` stamped, so a cancelled form leaves the reminder standing. The
ledger stays the single record of what happened; this only says what is coming.

The bill carries `commitment_id` back, which makes *"what is left on the loan"* a
sum over real bills rather than a figure somebody maintains by hand.

Two things the tests pin down, both of which were wrong first:

- **The 31st.** Rent due on the 31st still falls due in February, on the 28th or
  29th. Clamping to the month's last day is what stops those months being
  silently skipped.
- **A missed instalment is counted against today, never against the horizon.**
  Counting the whole pending list made "how many were missed" grow whenever the
  caller looked further ahead — not a property a count of the past should have.

Reminders are **in-app only**. Nothing is emailed or messaged, because a timer
inside the Node process would not fire: Passenger shuts the app down when idle.
Pushing them out needs Hostinger's cron calling a daily endpoint, which is a
separate piece of work.

### Why company costs are their own table

`company_expenses`, not `expenses` with an empty `project_id`. Every project
figure filters on `project_id`, and one missed filter would put office rent
inside a client's job cost — the exact failure the separate `transfers` table
was created to prevent. A table that project queries never name cannot leak into
them. **Heads and vendors** both carry a `kind` of `project` or `company` for
the same reason: rent must never be offerable on a client's bill, and the
landlord must never appear in the vendor dropdown beside the plywood shop. Both
default to `project`, so every head and vendor saved before the split stays
exactly where it already was.

Settings is split to match. Two pages, one per side, because a single combined
page would make that separation look accidental rather than deliberate.
Accounts, logins and the backup are genuinely shared and appear under both —
hunting for the backup button by first working out which half of the app owns
it would be the worse answer.

Procurement is filtered by **row** as well as by field: `PROCUREMENT_ROWS` drops
company heads and company vendors before the payload is built, since those are
entities that account does otherwise receive.

The test for which side something belongs on, written into the UI: **if you
would stop paying it the day the job ends it is a project cost; if you would
still pay it with no jobs running, it is a company cost.**

Overheads are deliberately **not** spread onto projects. Deciding whether
Kothari owes 40% or 60% of the office rent has no right answer, so project
margin is stated before overheads and company profit after.

### Why cost follows the material

Twenty sheets bought for Kothari and moved to Vaidya were paid for by Kothari,
but consumed by Vaidya. Left alone, Kothari's margin reads worse than it was and
Vaidya's better.

Two things could fix that, and only one of them is safe. Rewriting the bills —
shrinking Kothari's and inventing one for Vaidya — makes every head total,
percentage and inventory figure stop agreeing with the vendor's paperwork, which
is the one thing compliance actually asks you to preserve. So the bills stay
untouched and the adjustment is *derived*: `materialTransfers()` values each
`moved` movement at its original purchase rate and `projectTotals()` reports
both figures side by side. The project page shows the bridge between them.

The invariant, asserted in `npm run test:selectors`: **billed and consumed must
total the same across all projects.** Moving material between jobs relocates
cost; it can never create or destroy any.

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

A column added to a live table must carry a `DEFAULT` that is correct for every
row already there. `categories.kind` defaults to `'project'` precisely because
every head that already existed was one, so v7 needs no migration step.

Adding a whole entity means one entry in [`server/schema.js`](server/schema.js),
one in [`server/entities.js`](server/entities.js), and one key in `EMPTY` in
[`src/store/AppStore.jsx`](src/store/AppStore.jsx). Table names are derived from
the entity key by `tableOf` (`companyExpenses` → `company_expenses`), so there is
no third list to keep in step. Procurement is excluded from a new entity by
default: `filterStateFor` only ever sends what `PROCUREMENT_FIELDS` names.

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
