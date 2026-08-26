# Deploying Kalope Homes Finance on Hostinger

> **This is running in production.** Confirmed working on Hostinger with
> Node 22.18, MariaDB 11.8, the schema built by the app itself, and uploads
> stored outside the deployed folder. The settings below are the ones that
> worked — the deployment must run a Node server, not publish `dist/` as a
> static site. If a preset serves static files only, `/api` never exists and
> every request returns the host's own 503.
>
> `/status.html` diagnoses a broken deployment without needing the API.

One repo, one deployment. The Node server serves the built React app **and**
answers `/api` from the same origin, so there is no second thing to deploy and
no CORS to configure.

```
Browser  ──HTTPS──▶  Node server (server/)  ──▶  MariaDB
                     serves dist/ and /api
```

---

## 1. Create the database

hPanel → **Databases → Management**.

Create a *new* database rather than reusing one already listed — an existing one
usually belongs to another site. Hostinger prefixes both names with your account
id, so type the same suffix into both fields and you get something like
`u123456789_kalope`.

**Save the password before clicking Create — it is not shown again.** Keep it
letters and numbers only; symbols occasionally get mangled passing through
hosting panels, and that is not a problem worth an afternoon.

## 2. Point the deployment at the repo

You have this screen already. The settings that matter:

| Setting | Value |
|---|---|
| Framework preset | Must run a **Node server**, not a static export |
| Branch | `main` |
| Node version | **20.x or 22.x** (`package.json` requires >= 20.9.0) |
| Root directory | `./` |
| Build command | `npm run build` |
| Start command | `npm start` |

**Check the build settings actually run a Node server.** If the preset only does
`npm run build` and serves a folder, the API will not exist and nobody can sign
in. If anything mentions a *static export* or an `out/` directory, stop and
change it — this app needs `npm start` to run afterwards.

**Do not set a port.** The server reads `PORT` from the environment; a managed
host assigns one, and hardcoding makes the app unreachable.

## 3. Set the environment variables

**All of them, before the first deploy.** With none set the app starts cleanly,
creates no login, and nobody can get in.

```
MYSQL_HOST        127.0.0.1          ← not "localhost". See Trap 1.
MYSQL_PORT        3306
MYSQL_DATABASE    u123456789_kalope  ← the full prefixed name
MYSQL_USER        u123456789_kalope
MYSQL_PASSWORD    ············
ADMIN_EMAIL       you@yourdomain.com
ADMIN_PASSWORD    ············       ← this becomes your login
UPLOAD_DIR        /home/u123456789/kalope-uploads
```

Substitute your real account id. Use a different `ADMIN_PASSWORD` from anything
on your own machine — the same value in two places means one leak compromises
both.

### Trap 1 — use `127.0.0.1`, never `localhost`

MariaDB treats `user@localhost`, `user@127.0.0.1` and `user@::1` as **three
separate accounts**, and your grant covers one of them. Node opens a TCP
connection, and on current systems `localhost` resolves to IPv6 `::1` — matching
no grant.

The failure is `ER_ACCESS_DENIED_ERROR`: identical to a wrong password, with a
password that is completely correct. People reset the password twice chasing it.

Settle it in seconds — phpMyAdmin → SQL:

```sql
SHOW GRANTS FOR CURRENT_USER();
```

Whatever follows the `@` is the only host that will work. `/api/health` also
warns you if it sees `localhost`.

### Trap 2 — `UPLOAD_DIR` must be outside the app folder

A deploy replaces your application directory. Bill photos are gitignored —
correctly, they hold customer material — so they are **not** restored by it.
Left inside, every deploy silently destroys every photo, and nothing warns you.

Point it at a sibling directory like `/home/u123456789/kalope-uploads`. The
server creates it on first use. A literal `u123456789` left in the value fails
only later, the first time somebody uploads something — `/api/health` reports
`uploads.insideAppFolder` so you can confirm.

## 4. Deploy, then verify before opening the site

The tables are created on the first successful connection, so the first request
is also the migration.

Open `https://your-site/api/health`:

```json
{"service":"kalope-finance-api","server":"11.8.8-MariaDB","schemaVersion":3,
 "migrated":true,"rows":{"users":1,"projects":0,"receipts":0,"expenses":0},
 "uploads":{"exists":true,"writable":true,"insideAppFolder":false},"ok":true}
```

A version string, `users: 1` and `ok: true` means the schema was created, your
login exists and the app is wired up. Anything else names the failing step —
take it to the table below.

Then open the site and sign in with `ADMIN_EMAIL` / `ADMIN_PASSWORD`.

---

## When it fails

`/api/health` names the step. It stays open deliberately — it exists for the
case where nobody can log in, so putting it behind a session would defeat it. It
never reports a host, user, database name or password, and while signed out it
reports only whether a login exists — not how much is in the ledger.

| What health says | What it means | What to change |
|---|---|---|
| `step: "config"` | Variables not set, or not visible to the running app | Add them, save, redeploy |
| `ER_ACCESS_DENIED_ERROR` | Wrong password — **or the right one from the wrong host** | Run `SHOW GRANTS` first. Trap 1 |
| `ER_BAD_DB_ERROR` | Database does not exist | Create it in the panel |
| `ER_DBACCESS_DENIED_ERROR` | User exists but has no rights on it | Grant full privileges |
| `ECONNREFUSED` | Nothing listening at that host and port | Check `MYSQL_HOST` |
| `step: "schema"` | Connected, but table creation failed | Read the server log; usually a dialect issue |
| `uploads.writable: false` | Folder missing or read-only | Check `UPLOAD_DIR`, permissions `755` |
| `uploads.insideAppFolder: true` | Photos will die on the next deploy | Move `UPLOAD_DIR` outside the app |
| `rows.users: 0` | No login was created | Set `ADMIN_EMAIL` and `ADMIN_PASSWORD`, redeploy |

### The build succeeds but the deployment fails

This is the most likely problem, and it is a **settings** problem, not a code
one: the deployment is treating this as a frontend-only project. A static
preset builds `dist/` and publishes it — the Express server never runs, so
there is no `/api`, and nobody can sign in.

The tell: `https://your-site/` loads the sign-in page, but
`https://your-site/api/health` returns your site's HTML instead of JSON, or a
404.

**The fix is on the deployment screen, not in the repo.** The deployment must
run a Node server:

- **Build command:** `npm run build`
- **Start command:** `npm start`

If the framework preset is **Vite**, change it. Look for **Node.js**,
**Express**, or a **Custom / Other** preset that lets you set a start command.
Anything offering only a *static export* or an `out/`/`dist/` publish directory
cannot run this app — server-rendered routes and an API cannot work that way.

### If the panel asks for an "Entry File"

Panels commonly default this to `server.js` at the repository root. That file
exists and works — it builds the frontend if needed, then starts the server. So
any of these are correct, and you can leave the default alone:

| Entry File / start command | Works |
|---|---|
| `server.cjs` | yes — **use this one on Hostinger.** See below |
| `server.js` | yes, *unless* the host runs Phusion Passenger |
| `npm start` | yes |
| `server/index.js` | yes — `package.json`'s `main` |

Four things in the repo help a platform detect this correctly, all committed:
`server.cjs` and `server.js` at the root, `"main": "server/index.js"` in
`package.json`, and a `Procfile` containing `web: npm start`.

### Trap 3 — Passenger cannot require() an ES module

Hostinger runs the app under Phusion Passenger, which loads its startup file
with `require()`. This package is ESM (`"type": "module"`), so requiring
`server.js` fails before a single line of it runs — including the boot log that
exists to prove the process started.

What you see is the proxy's own 503 on every page, an empty runtime log, and a
build that succeeded perfectly. `npm install` ran, `vite build` wrote `dist/`,
every setting in the panel is correct. Nothing in the deployment looks wrong,
because nothing in the deployment *is* wrong.

Raising the Node version does not fix it. Node 20 cannot `require()` an ES
module at all, and Node 22's `require(esm)` refuses any module containing
top-level `await` — which `server.js` uses. The entry point itself has to be
CommonJS, which is what `server.cjs` is for: Passenger can `require()` it, and
`import()` reaches the real ESM server from inside.

The tell that you are here rather than somewhere else: `/status.html` loads but
`/` does not. Passenger serves `<app root>/public` itself, so the static file
answers while every route that needs Node returns 503.

As a safety net, `npm start` builds the frontend itself if `dist/` is missing,
so a platform that skips the build step still comes up.

**Verified from a clean clone of this repo:** `npm install` → `npm run build` →
`npm start` serves the app on `/`, SPA routes like `/projects`, hashed assets
with immutable caching, and `/api/health`. If your platform runs those three
commands, it works.

**Uploads fail on large photos.** The app already shrinks photos before sending,
so this is rare. Raise `MAX_UPLOAD_BYTES` if you need to.

---

## How your data is protected

**Nothing is lost if the connection drops.** Every change is written to a queue
in the browser *before* the screen updates, and only leaves the queue once the
database has confirmed it. Close the laptop mid-entry, lose signal on site, kill
the browser — the queue is still there next time and sends itself. The sidebar
shows `Saved`, `Waiting to save · 3`, or `Reconnect`, and closing the tab with
unsent work warns you first.

**A half-saved batch is impossible.** Each batch is applied inside one
transaction; if any operation fails, the whole batch rolls back.

**Re-sending is harmless.** Writes are upserts keyed by an id the browser
generated, which is what makes retrying safe.

**Nothing is truly deleted.** Deleting sets `deleted_at`; the row stays. A
mis-click is recoverable with one SQL statement.

**Every write is logged.** `audit_log` records who changed what and when,
forever. If a number is ever disputed, that table is the tape.

**Bills are private.** Photos live outside the web root and are served only
through `/files/{id}`, which checks your session first. The file's real content
decides its type — a script renamed `.png` is rejected.

**Money is DECIMAL, never FLOAT.** Floats round wrong, and a ledger that rounds
wrong is worthless.

## Adding a field later

Nothing manual. Add the column to `SCHEMA` in
[`server/schema.js`](server/schema.js), bump `SCHEMA_VERSION`, redeploy. On the
next request the app compares the live table against the declaration and issues
the `ALTER TABLE … ADD COLUMN` itself. Columns are only ever added — never
dropped, never retyped.

This exists because `CREATE TABLE IF NOT EXISTS` skips an existing table
*including its columns*, so a field added later would never reach the live
database: the deploy succeeds and every query touching it fails with
`Unknown column`.

`/api/health` reports what it did — `"columnsAdded": ["projects.phone"]`.

## Two things that look like tests but are not

**phpMyAdmin does not test your password.** Hostinger signs you in from your
panel session, so opening it proves nothing about the credentials the app is
using. `/api/health` is the only thing exercising the real path.

**The site loading is not proof the data survives.** Before real data exists,
create one project, redeploy, and check it is still there. Two minutes, and it
answers the only question that really matters.

## Backups

Hostinger backs up managed databases; it does **not** back up your uploads
directory.

- **In the app:** Settings → Download backup — one JSON file with the ledger and
  every attached photo inside it.
- **In phpMyAdmin:** Export → the whole database.
- **Your `UPLOAD_DIR`:** copy it somewhere yourself.

## Running locally

```bash
npm install
npm run dev          # app only, no database, data stays in the browser
```

To run the whole stack against a local MySQL:

```bash
cp .env.example .env    # fill in your local database
npm run build
npm start               # http://localhost:3000 — app and API together
```

`npm run dev` proxies `/api` to `http://127.0.0.1:3000`, so running both gives
you hot reload against a real database.

## Testing the API

```bash
npm run test:e2e
```

32 checks against a **throwaway** database — schema creation, login, the sync
queue, DECIMAL precision, transaction rollback, upload type-sniffing, soft
delete and auth. It writes and deletes, so never point it at real data.
