<?php
declare(strict_types=1);

require __DIR__ . '/lib.php';

cors();

/**
 * Field maps. The browser speaks camelCase, MySQL speaks snake_case; this is
 * the only place that knows the difference, so adding a column means adding one
 * line here and one line in schema.sql.
 */
const ENTITIES = [
    'clients' => [
        'table'  => 'clients',
        'fields' => ['id' => 'id', 'name' => 'name', 'phone' => 'phone', 'note' => 'note'],
    ],
    'accounts' => [
        'table'  => 'accounts',
        'fields' => [
            'id' => 'id', 'name' => 'name', 'kind' => 'kind', 'holder' => 'holder',
            'openingBalance' => 'opening_balance',
        ],
    ],
    'categories' => [
        'table'  => 'categories',
        'fields' => [
            'id' => 'id', 'name' => 'name', 'unit' => 'unit',
            'tracksInventory' => 'tracks_inventory',
        ],
    ],
    'projects' => [
        'table'  => 'projects',
        'fields' => [
            'id' => 'id', 'name' => 'name', 'clientId' => 'client_id', 'phone' => 'phone',
            'site' => 'site', 'quotedAmount' => 'quoted_amount', 'startDate' => 'start_date',
            'status' => 'status', 'note' => 'note',
        ],
    ],
    'receipts' => [
        'table'  => 'receipts',
        'fields' => [
            'id' => 'id', 'projectId' => 'project_id', 'date' => 'date', 'amount' => 'amount',
            'accountId' => 'account_id', 'mode' => 'mode', 'reference' => 'reference', 'note' => 'note',
        ],
    ],
    'expenses' => [
        'table'  => 'expenses',
        'fields' => [
            'id' => 'id', 'projectId' => 'project_id', 'date' => 'date', 'categoryId' => 'category_id',
            'accountId' => 'account_id', 'vendor' => 'vendor', 'description' => 'description',
            'qty' => 'qty', 'unit' => 'unit', 'rate' => 'rate', 'amount' => 'amount',
            'billNo' => 'bill_no', 'usedQty' => 'used_qty',
        ],
    ],
];

// Numeric columns are cast on the way out so the browser gets 4321, not "4321.00".
const NUMERIC_FIELDS  = ['amount', 'rate', 'qty', 'usedQty', 'quotedAmount', 'openingBalance'];
const BOOLEAN_FIELDS  = ['tracksInventory'];

const ALLOWED_UPLOAD_TYPES = [
    'image/jpeg' => 'jpg', 'image/png' => 'png', 'image/webp' => 'webp',
    'image/heic' => 'heic', 'image/gif' => 'gif', 'application/pdf' => 'pdf',
];

// ------------------------------------------------------------------ routing

$path = $_SERVER['PATH_INFO'] ?? '';
if ($path === '') {
    $uri  = parse_url($_SERVER['REQUEST_URI'] ?? '/', PHP_URL_PATH) ?? '/';
    $base = rtrim(str_replace('\\', '/', dirname($_SERVER['SCRIPT_NAME'] ?? '')), '/');
    $path = $base !== '' && str_starts_with($uri, $base) ? substr($uri, strlen($base)) : $uri;
}
$path   = '/' . trim(preg_replace('#^/index\.php#', '', $path), '/');
$method = $_SERVER['REQUEST_METHOD'] ?? 'GET';

try {
    match (true) {
        $path === '/health'                       => route_health(),
        $path === '/auth/login'  && $method === 'POST' => route_login(),
        $path === '/auth/logout' && $method === 'POST' => route_logout(),
        $path === '/auth/me'                      => route_me(),
        $path === '/state'       && $method === 'GET'  => route_state(),
        $path === '/sync'        && $method === 'POST' => route_sync(),
        $path === '/files'       && $method === 'POST' => route_upload(),
        (bool) preg_match('#^/files/([A-Za-z0-9_]+)$#', $path, $m) => $method === 'DELETE'
            ? route_file_delete($m[1])
            : route_file_get($m[1]),
        default => json_out(['error' => "No such endpoint: $method $path"], 404),
    };
} catch (Throwable $e) {
    error_log('Kalope API error: ' . $e->getMessage() . ' @ ' . $e->getFile() . ':' . $e->getLine());
    json_out(['error' => 'Something went wrong on the server. It has been logged.'], 500);
}

// ------------------------------------------------------------------- routes

/**
 * Deliberately open — no session required. It exists precisely for the case
 * where nobody can log in, so putting it behind auth would defeat it.
 * Reports codes and counts only: never a host, user, database name or password.
 */
function route_health(): void
{
    $out = ['service' => 'kalope-finance-api', 'time' => gmdate('c')];
    $step = 'config';

    try {
        $config = config();
        foreach (['host', 'name', 'user', 'password'] as $key) {
            if (trim((string) ($config['db'][$key] ?? '')) === '') {
                json_out($out + ['ok' => false, 'step' => 'config', 'error' => "db.$key is not set in config.php"], 500);
            }
        }
        if (str_contains((string) $config['db']['host'], 'localhost')) {
            $out['warning'] = 'db.host is "localhost". MariaDB treats that as a different account from 127.0.0.1 '
                . 'and it usually fails as ER_ACCESS_DENIED_ERROR. Run SHOW GRANTS FOR CURRENT_USER() to confirm.';
        }

        $step = 'connect';
        $pdo = connect();
        $out['server'] = $pdo->getAttribute(PDO::ATTR_SERVER_VERSION);

        $step = 'schema';
        $migration = ensure_schema($pdo, $config['db']['name']);
        $out['schemaVersion'] = SCHEMA_VERSION;
        if ($migration['ran']) {
            $out['migrated'] = true;
            if ($migration['added']) {
                $out['columnsAdded'] = $migration['added'];
            }
        }

        $step = 'query';
        foreach (['users', 'projects', 'receipts', 'expenses', 'attachments'] as $table) {
            $out['rows'][$table] = (int) $pdo->query("SELECT COUNT(*) FROM `$table`")->fetchColumn();
        }

        $step = 'uploads';
        $dir = uploads_dir();
        $out['uploads'] = [
            'exists'   => is_dir($dir),
            'writable' => is_writable($dir),
            // Not the path itself — that leaks the account id.
            'insideAppFolder' => uploads_at_risk(),
        ];
        if (uploads_at_risk()) {
            $out['warning'] = 'Uploads are inside the deployed folder. A deploy replaces that folder and would '
                . 'delete every bill photo. Point uploads_dir at a directory outside it.';
        }

        if ($out['rows']['users'] === 0) {
            $out['nextStep'] = 'No login exists yet. Set setup_key in config.php and visit /api/setup.php?key=…';
        }

        json_out($out + ['ok' => true]);
    } catch (PDOException $e) {
        error_log("Kalope health failed at $step: " . $e->getMessage());
        json_out(
            $out + [
                'ok'    => false,
                'step'  => $step,
                'code'  => $e->errorInfo[0] ?? null,
                'error' => driver_hint($e),
            ],
            500,
        );
    } catch (Throwable $e) {
        error_log("Kalope health failed at $step: " . $e->getMessage());
        json_out($out + ['ok' => false, 'step' => $step, 'error' => $e->getMessage()], 500);
    }
}

/** Turns a driver code into the thing to actually go and change. */
function driver_hint(PDOException $e): string
{
    $message = $e->getMessage();

    return match (true) {
        str_contains($message, 'ER_ACCESS_DENIED') || str_contains($message, '1045') =>
            'Access denied. Either the password is wrong, or it is right but the grant is for a different host — '
            . 'run SHOW GRANTS FOR CURRENT_USER() in phpMyAdmin and use exactly the host after the @.',
        str_contains($message, '1049') =>
            'That database does not exist. Create it in hPanel → Databases.',
        str_contains($message, '1044') =>
            'The user exists but has no rights on that database. Grant it full privileges.',
        str_contains($message, 'refused') || str_contains($message, '2002') =>
            'Nothing is listening at that host and port. Check db.host and db.port.',
        str_contains($message, '1064') =>
            'The server rejected the SQL as invalid — usually a syntax feature it is too old for.',
        default => 'Database error. The full message is in your PHP error log.',
    };
}

function route_login(): void
{
    $body     = json_in();
    $email    = strtolower(trim((string) ($body['email'] ?? '')));
    $password = (string) ($body['password'] ?? '');

    if ($email === '' || $password === '') {
        json_out(['error' => 'Enter your email and password.'], 400);
    }

    $stmt = db()->prepare('SELECT * FROM users WHERE email = ? LIMIT 1');
    $stmt->execute([$email]);
    $user = $stmt->fetch();

    // Same message and similar timing whether the email or the password was
    // wrong, so this cannot be used to discover which emails exist.
    if (!$user || !password_verify($password, $user['password_hash'])) {
        usleep(random_int(150_000, 350_000));
        json_out(['error' => 'That email and password do not match.'], 401);
    }

    $token = bin2hex(random_bytes(32));
    $days  = (int) config()['session_days'];

    db()->prepare('INSERT INTO sessions (token, user_id, expires_at) VALUES (?, ?, DATE_ADD(NOW(), INTERVAL ? DAY))')
        ->execute([$token, $user['id'], $days]);

    // Housekeeping: drop expired sessions occasionally.
    if (random_int(1, 20) === 1) {
        db()->query('DELETE FROM sessions WHERE expires_at < NOW()');
    }

    json_out([
        'token' => $token,
        'user'  => ['id' => $user['id'], 'email' => $user['email'], 'name' => $user['name'], 'role' => $user['role']],
    ]);
}

function route_logout(): void
{
    $token = bearer_token();
    if ($token !== null) {
        db()->prepare('DELETE FROM sessions WHERE token = ?')->execute([$token]);
    }
    json_out(['ok' => true]);
}

function route_me(): void
{
    json_out(['user' => require_user()]);
}

/** The whole ledger in one response — this is what the app loads on sign-in. */
function route_state(): void
{
    require_user();

    $state = [];
    foreach (ENTITIES as $name => $spec) {
        $order = in_array($name, ['receipts', 'expenses'], true) ? 'date DESC, id DESC' : 'name ASC';
        $rows  = db()->query("SELECT * FROM {$spec['table']} WHERE deleted_at IS NULL ORDER BY $order")->fetchAll();
        $state[$name] = array_map(fn($row) => row_to_json($row, $spec['fields']), $rows);
    }

    attach_files($state);
    json_out($state);
}

/**
 * The single write endpoint. The app sends a batch of queued operations; each
 * is applied in order inside one transaction, so a half-applied batch is
 * impossible. Re-sending a batch is harmless — writes are upserts keyed by the
 * id the browser generated.
 */
function route_sync(): void
{
    $user = require_user();
    $body = json_in();
    $ops  = $body['ops'] ?? [];

    if (!is_array($ops)) {
        json_out(['error' => 'Expected a list of operations.'], 400);
    }
    if (count($ops) > 500) {
        json_out(['error' => 'Too many operations in one batch.'], 413);
    }

    $applied = [];
    $pdo     = db();
    $pdo->beginTransaction();

    try {
        foreach ($ops as $op) {
            $type   = (string) ($op['type'] ?? '');
            $entity = (string) ($op['entity'] ?? '');
            $row    = $op['payload'] ?? [];

            switch ($type) {
                case 'add':
                case 'update':
                    apply_upsert($entity, $row, $user['id']);
                    break;

                case 'remove':
                    apply_soft_delete($entity, (string) ($row['id'] ?? ''), $user['id']);
                    break;

                case 'removeProject':
                    apply_remove_project((string) ($row['id'] ?? ''), $user['id']);
                    break;

                case 'replaceAll':
                    apply_replace_all($row, $user['id']);
                    break;

                default:
                    throw new RuntimeException("Unknown operation type: $type");
            }

            $applied[] = $op['id'] ?? null;
        }

        $pdo->commit();
    } catch (Throwable $e) {
        $pdo->rollBack();
        error_log('Kalope sync failed: ' . $e->getMessage());
        json_out(['error' => 'That batch could not be saved: ' . $e->getMessage()], 422);
    }

    json_out(['applied' => $applied, 'count' => count($applied)]);
}

function route_upload(): void
{
    $user = require_user();

    if (!isset($_FILES['file']) || $_FILES['file']['error'] !== UPLOAD_ERR_OK) {
        json_out(['error' => 'No file arrived. It may be larger than the server allows.'], 400);
    }

    $file = $_FILES['file'];
    $max  = (int) config()['max_upload_bytes'];

    if ($file['size'] > $max) {
        json_out(['error' => 'That file is larger than ' . round($max / 1048576) . ' MB.'], 413);
    }

    // Trust the file's actual contents, never the browser-supplied type.
    $mime = (new finfo(FILEINFO_MIME_TYPE))->file($file['tmp_name']) ?: '';
    if (!isset(ALLOWED_UPLOAD_TYPES[$mime])) {
        json_out(['error' => 'Only photos and PDFs can be attached.'], 415);
    }

    $dir = uploads_dir();
    if (!is_dir($dir) || !is_writable($dir)) {
        json_out(['error' => 'The uploads folder is missing or not writable. Check uploads_dir in config.php.'], 500);
    }

    // The stored name comes from our own id, never from the uploaded filename,
    // so a file called "../../index.php" cannot escape the folder.
    $id       = (string) ($_POST['id'] ?? '') ?: new_id('att');
    $id       = preg_replace('/[^A-Za-z0-9_]/', '', $id);
    $filename = $id . '.' . ALLOWED_UPLOAD_TYPES[$mime];

    if (!move_uploaded_file($file['tmp_name'], "$dir/$filename")) {
        json_out(['error' => 'The file could not be saved on the server.'], 500);
    }

    $name = mb_substr((string) $file['name'], 0, 255);

    db()->prepare(
        'INSERT INTO attachments (id, owner_type, owner_id, name, mime, size, path)
         VALUES (?, ?, ?, ?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE name = VALUES(name), mime = VALUES(mime),
                                 size = VALUES(size), path = VALUES(path), deleted_at = NULL'
    )->execute([
        $id,
        (string) ($_POST['ownerType'] ?? ''),
        (string) ($_POST['ownerId'] ?? ''),
        $name,
        $mime,
        (int) $file['size'],
        $filename,
    ]);

    audit($user['id'], 'upload', 'attachments', $id, ['name' => $name, 'size' => $file['size']]);

    json_out(['id' => $id, 'name' => $name, 'type' => $mime, 'size' => (int) $file['size']]);
}

function route_file_get(string $id): void
{
    require_user();

    $stmt = db()->prepare('SELECT * FROM attachments WHERE id = ? AND deleted_at IS NULL LIMIT 1');
    $stmt->execute([$id]);
    $meta = $stmt->fetch();

    if (!$meta) {
        json_out(['error' => 'That file is not on the server.'], 404);
    }

    $full = uploads_dir() . '/' . basename($meta['path']);
    if (!is_file($full)) {
        json_out(['error' => 'That file is missing from storage.'], 410);
    }

    // Streamed, so the buffer must go before the bytes start.
    discard_stray_output();
    header('Content-Type: ' . $meta['mime']);
    header('Content-Length: ' . filesize($full));
    header('Content-Disposition: inline; filename="' . addslashes($meta['name']) . '"');
    header('Cache-Control: private, max-age=86400');
    readfile($full);
    exit;
}

function route_file_delete(string $id): void
{
    $user = require_user();
    db()->prepare('UPDATE attachments SET deleted_at = NOW() WHERE id = ?')->execute([$id]);
    audit($user['id'], 'remove', 'attachments', $id, null);
    json_out(['ok' => true]);
}

// ------------------------------------------------------------------ helpers

function row_to_json(array $row, array $fields): array
{
    $out = [];
    foreach ($fields as $jsKey => $column) {
        $value = $row[$column] ?? null;

        if (in_array($jsKey, NUMERIC_FIELDS, true)) {
            $out[$jsKey] = $value === null ? 0 : (float) $value;
        } elseif (in_array($jsKey, BOOLEAN_FIELDS, true)) {
            $out[$jsKey] = (bool) $value;
        } else {
            $out[$jsKey] = $value === null ? '' : (string) $value;
        }
    }
    return $out;
}

/** Hangs each row's attachment list off it, in one query per owner type. */
function attach_files(array &$state): void
{
    $rows = db()->query(
        'SELECT id, owner_type, owner_id, name, mime, size
           FROM attachments
          WHERE deleted_at IS NULL AND owner_id <> ""
          ORDER BY uploaded_at ASC'
    )->fetchAll();

    $byOwner = [];
    foreach ($rows as $r) {
        $byOwner[$r['owner_type']][$r['owner_id']][] = [
            'id'   => $r['id'],
            'name' => $r['name'],
            'type' => $r['mime'],
            'size' => (int) $r['size'],
        ];
    }

    foreach (['projects', 'receipts', 'expenses'] as $entity) {
        foreach ($state[$entity] as &$row) {
            $row['attachments'] = $byOwner[$entity][$row['id']] ?? [];
        }
        unset($row);
    }
}

function apply_upsert(string $entity, array $row, string $userId): void
{
    if (!isset(ENTITIES[$entity])) {
        throw new RuntimeException("Unknown entity: $entity");
    }

    $spec = ENTITIES[$entity];
    $id   = (string) ($row['id'] ?? '');
    if ($id === '') {
        throw new RuntimeException("A $entity row arrived without an id.");
    }

    $columns = [];
    $values  = [];
    foreach ($spec['fields'] as $jsKey => $column) {
        if (!array_key_exists($jsKey, $row)) {
            continue;
        }
        $columns[] = $column;
        $values[]  = normalise_value($jsKey, $row[$jsKey]);
    }

    $placeholders = implode(', ', array_fill(0, count($columns), '?'));
    $updates      = implode(', ', array_map(fn($c) => "$c = VALUES($c)", $columns));
    $columnList   = implode(', ', $columns);

    // Upsert, so replaying a queued operation twice is harmless. `deleted_at`
    // is cleared because saving a row means it exists again.
    db()->prepare(
        "INSERT INTO {$spec['table']} ($columnList) VALUES ($placeholders)
         ON DUPLICATE KEY UPDATE $updates, deleted_at = NULL"
    )->execute($values);

    if (array_key_exists('attachments', $row) && in_array($entity, ['projects', 'receipts', 'expenses'], true)) {
        sync_attachments($entity, $id, is_array($row['attachments']) ? $row['attachments'] : []);
    }

    audit($userId, 'upsert', $entity, $id, $row);
}

function normalise_value(string $jsKey, $value)
{
    if (in_array($jsKey, NUMERIC_FIELDS, true)) {
        return is_numeric($value) ? $value + 0 : 0;
    }
    if (in_array($jsKey, BOOLEAN_FIELDS, true)) {
        return $value ? 1 : 0;
    }
    // An empty date string is NULL, not '0000-00-00', which strict MySQL rejects.
    if (in_array($jsKey, ['startDate', 'date'], true) && (string) $value === '') {
        return null;
    }
    if (in_array($jsKey, ['clientId', 'accountId', 'categoryId'], true) && (string) $value === '') {
        return null;
    }
    return is_scalar($value) ? (string) $value : json_encode($value);
}

/** Points the listed files at this row, and retires any it no longer claims. */
function sync_attachments(string $entity, string $rowId, array $list): void
{
    $keep = [];
    foreach ($list as $meta) {
        $attId = preg_replace('/[^A-Za-z0-9_]/', '', (string) ($meta['id'] ?? ''));
        if ($attId === '') {
            continue;
        }
        $keep[] = $attId;
        db()->prepare(
            'UPDATE attachments SET owner_type = ?, owner_id = ?, deleted_at = NULL WHERE id = ?'
        )->execute([$entity, $rowId, $attId]);
    }

    if ($keep === []) {
        db()->prepare('UPDATE attachments SET deleted_at = NOW() WHERE owner_type = ? AND owner_id = ? AND deleted_at IS NULL')
            ->execute([$entity, $rowId]);
        return;
    }

    $placeholders = implode(', ', array_fill(0, count($keep), '?'));
    db()->prepare(
        "UPDATE attachments SET deleted_at = NOW()
          WHERE owner_type = ? AND owner_id = ? AND deleted_at IS NULL AND id NOT IN ($placeholders)"
    )->execute(array_merge([$entity, $rowId], $keep));
}

function apply_soft_delete(string $entity, string $id, string $userId): void
{
    if (!isset(ENTITIES[$entity]) || $id === '') {
        throw new RuntimeException("Cannot delete from $entity.");
    }
    db()->prepare("UPDATE {$entity} SET deleted_at = NOW() WHERE id = ?")->execute([$id]);
    audit($userId, 'remove', $entity, $id, null);
}

function apply_remove_project(string $id, string $userId): void
{
    if ($id === '') {
        throw new RuntimeException('Cannot delete a project without an id.');
    }
    foreach (['projects' => 'id', 'receipts' => 'project_id', 'expenses' => 'project_id'] as $table => $column) {
        db()->prepare("UPDATE $table SET deleted_at = NOW() WHERE $column = ?")->execute([$id]);
    }
    audit($userId, 'removeProject', 'projects', $id, null);
}

/** Used by "load demo data", "erase everything" and restoring a backup. */
function apply_replace_all(array $state, string $userId): void
{
    foreach (array_keys(ENTITIES) as $entity) {
        db()->query("UPDATE $entity SET deleted_at = NOW() WHERE deleted_at IS NULL");
    }
    foreach (ENTITIES as $entity => $spec) {
        foreach (($state[$entity] ?? []) as $row) {
            if (is_array($row)) {
                apply_upsert($entity, $row, $userId);
            }
        }
    }
    audit($userId, 'replaceAll', 'all', null, ['counts' => array_map(
        fn($e) => count($state[$e] ?? []),
        array_keys(ENTITIES)
    )]);
}
