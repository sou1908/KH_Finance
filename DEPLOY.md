# Putting Kalope Homes Finance on Hostinger

Follow these in order. Budget about 30 minutes the first time.

## Why there's a PHP folder in a React project

A React app runs **inside the browser**, on your phone or laptop. MySQL only
speaks its own protocol over a database port — a browser cannot call it, and if
it could, your database password would be sitting in plain JavaScript for anyone
who opens Developer Tools.

So there are three pieces:

```
React app  ──HTTPS──▶  PHP API (api/)  ──▶  MySQL
(browser)              (your Hostinger account)
```

The PHP API is the only thing holding the database password. PHP because your
Hostinger plan already runs it — nothing to install.

---

## 1. Create the database

hPanel → **Databases → MySQL Databases**.

- Create a database, e.g. `kalope`
- Create a user and give it access to that database
- Use a long generated password

Hostinger prefixes both with your account id, so you'll end up with something
like `u123456789_kalope`. **Write down the database name, username and
password** — you need all three in step 3.

## 2. Upload the API

hPanel → **File Manager** → open `public_html`. Upload the whole `api` folder so
you end up with `public_html/api/`.

**There is no SQL to run.** The app creates its own tables on the first
successful connection, and on every boot it compares the live columns against
what it expects and adds anything missing. That is deliberate: `CREATE TABLE IF
NOT EXISTS` skips an existing table *including its columns*, so a field added
later would never reach the live database and every query touching it would fail
with `Unknown column`. Adding columns is automatic; nothing is ever dropped or
retyped.

Then, inside `public_html/api/`, copy `config.example.php` to **`config.php`**
and fill in:

| Setting | What to put |
|---|---|
| `db.host` | **`127.0.0.1`** — not `localhost`. See the trap below. |
| `db.name`, `db.user` | The **full prefixed** names, e.g. `u123456789_kalope` |
| `db.password` | From step 1 |
| `uploads_dir` | A path **outside** `public_html`, e.g. `/home/u123456789/kalope-uploads` |
| `allowed_origins` | Where the app is served from, exactly, including `https://` |
| `app_secret` | Any long random string |
| `setup_key` | Any long random string — you clear this in step 4 |

### Trap 1 — use `127.0.0.1`, never `localhost`

MariaDB treats `user@localhost`, `user@127.0.0.1` and `user@::1` as **three
separate accounts**, and your grant covers one of them. PHP opens a TCP
connection, and on current systems `localhost` resolves to IPv6 `::1` — matching
no grant.

The failure is `ER_ACCESS_DENIED_ERROR`: identical to a wrong password, with a
password that is completely correct. People reset the password twice chasing it.

Settle it in seconds — phpMyAdmin → SQL:

```sql
SHOW GRANTS FOR CURRENT_USER();
```

Whatever follows the `@` is the only host that will work. Put exactly that in
`db.host`. (`/api/health` also warns you if it sees `localhost`.)

### Trap 2 — uploads must live outside the deployed folder

Re-uploading the app replaces the `api` folder. Bill photos are gitignored —
correctly, they hold customer material — so they are **not** restored by it. Left
inside, every deploy silently destroys every bill photo you have, and nothing
warns you.

Point `uploads_dir` at a sibling directory like `/home/u123456789/kalope-uploads`.
Substitute your real account id; a literal `uXXXXXXXX` fails only later, the
first time somebody uploads something. `/api/health` reports
`uploads.insideAppFolder` so you can confirm.

### Check it works

Visit `https://yourdomain.com/api/health`:

```json
{"service":"kalope-finance-api","server":"11.8.8-MariaDB","schemaVersion":3,
 "migrated":true,"rows":{"users":0,"projects":0,"receipts":0,"expenses":0},
 "uploads":{"exists":true,"writable":true,"insideAppFolder":false},
 "nextStep":"No login exists yet…","ok":true}
```

A version string and `ok: true` means the connection, the schema and the uploads
folder are all good. Anything else names the failing step — take it to the table
further down. It stays open deliberately: it exists for the case where nobody
can log in, so putting it behind a session would defeat it. It reports codes and
counts only — never a host, user, database name or password.

## 3. Create your login

Visit `https://yourdomain.com/api/setup.php?key=YOUR_SETUP_KEY`.

Enter the email and password you want to sign in with. Use a real password —
this is the key to your whole financial record.

**Then go back into `config.php` and set `'setup_key' => null`.** Until you do,
anyone who guesses that key can create a login. The page refuses to load once
it's null.

## 4. Build and upload the app

On your computer, in the project folder:

```bash
cp .env.example .env
```

Edit `.env` so it points at your API:

```
VITE_API_URL=https://yourdomain.com/api
```

Then:

```bash
npm install
npm run build
```

Upload **the contents of `dist/`** to wherever the app should live —
`public_html/` for the domain root, or `public_html/finance/` for a subfolder.

Open the site. You should get the sign-in screen.

---

## How your data is protected

**Nothing is lost if the connection drops.** Every change is written to a queue
in the browser *before* the screen updates, and only leaves the queue once MySQL
has confirmed it. Close the laptop mid-entry, lose signal on site, kill the
browser — the queue is still there next time and sends itself. The sidebar shows
`Saved`, `Waiting to save · 3`, or `Reconnect` so you always know where you
stand, and closing the tab with unsent work warns you first.

**Nothing is truly deleted.** Deleting hides a row by setting `deleted_at`; the
data stays in MySQL. A mis-click is recoverable with one SQL statement.

**Every write is logged.** The `audit_log` table records who changed what and
when, forever. If a number is ever disputed, that table is the tape.

**Bills are private.** Uploaded photos are stored outside the web root's reach
and served only through `/files/{id}`, which checks your session first. A direct
URL to the uploads folder returns nothing.

**Money is DECIMAL, never FLOAT.** Floats round wrong, and a ledger that rounds
wrong is worthless.

## Adding a field later

Nothing manual. Add the column to `SCHEMA` in
[`api/schema.php`](api/schema.php), bump `SCHEMA_VERSION`, and re-upload. The
next request compares the live table against the declaration and issues the
`ALTER TABLE … ADD COLUMN` itself. Columns are only ever added.

`/api/health` reports what it did — `"columnsAdded": ["projects.phone"]`.

## Two things that look like tests but are not

**phpMyAdmin does not test your password.** Hostinger signs you in from your
panel session, so opening it proves nothing about the credentials the API is
using. Use `/api/health` — that is the only thing exercising the real path.

**The site loading is not proof the data survives.** Before real data exists,
create one project, re-upload the app, and check it is still there. Two minutes,
and it answers the only question that really matters.

## Backups

Hostinger takes its own backups, but take your own too:

- **In the app:** Settings → Download backup. One JSON file with the ledger and
  every attached photo inside it.
- **In phpMyAdmin:** Export → the whole database.

Do this before anything risky.

## Running without the server

Delete `.env` (or leave `VITE_API_URL` blank) and the app runs entirely in the
browser with no login — useful for trying things out. Data then lives on that
one device only, and the sidebar says `This device only` so nobody mistakes it
for the real thing.

## When it fails

`/api/health` names the step. Find it here.

| What health says | What it means | What to change |
|---|---|---|
| `step: "config"` | A setting is blank in `config.php` | Fill it in and re-upload |
| `step: "connect"`, `1045` | Wrong password — **or the right one from the wrong host** | Run `SHOW GRANTS FOR CURRENT_USER()`. Trap 1 |
| `step: "connect"`, `1049` | That database does not exist | Create it in hPanel |
| `step: "connect"`, `1044` | User exists but has no rights on it | Grant full privileges |
| `step: "connect"`, refused | Nothing listening there | Check `db.host` and `db.port` |
| `step: "schema"` | Connected, but table creation failed | Usually a dialect issue; the full error is in your PHP error log |
| `uploads.writable: false` | The folder is missing or read-only | Create it, set permissions to `755` |
| `uploads.insideAppFolder: true` | Bill photos will die on the next deploy | Move `uploads_dir` outside `public_html` |

**"Could not reach the server" on the sign-in screen.**
Open `https://yourdomain.com/api/health` directly. If that fails, the API isn't
uploaded correctly. If it works, your site's address isn't in `allowed_origins`
in `config.php` — it must match exactly, including `https://`.

**Sign-in works but the ledger is empty and won't save.**
Almost always a stripped `Authorization` header. The included `api/.htaccess`
handles this; make sure it uploaded (File Manager hides dotfiles by default —
turn on "show hidden files").

**Uploads fail on large photos.**
Raise `upload_max_filesize` and `post_max_size` in hPanel → Advanced → PHP
Configuration. The app already shrinks photos before sending, so this is rare.

**Everything is slow after a few thousand entries.**
The indexes in `api/schema.php` cover the queries the app makes today. Beyond
that, the next step is paginating `/state` instead of loading the whole ledger.

---

## What has and hasn't been tested

**Tested by actually running it:** the PHP parses and runs, routing works,
`/health` reports the right step and status code, the auth guard returns 401,
unknown routes return 404, and the generated SQL carries no dialect that an
older MariaDB would reject. The React app is browser-tested down to 390px.

**Not tested:** the actual MySQL operations — reads, writes, the migration —
because there is no MySQL on the machine this was built on. `/api/health` is the
first thing that exercises them, which is exactly what it is for. Send me what
it returns and I'll fix whatever it names.
