<?php
declare(strict_types=1);

/**
 * Shared plumbing: config, database handle, CORS, JSON, auth.
 */

require_once __DIR__ . '/schema.php';

// Anything printed before a header is sent poisons every response: PHP emits
// "headers already sent", the status code silently stays 200, and the JSON
// arrives with HTML warnings glued to the front.
//
// The usual cause is invisible — a UTF-8 byte-order mark that a Windows editor
// puts at the start of config.php, or a blank line after a closing PHP tag.
// Nobody finds that by reading the file. Buffering absorbs it, and json_out()
// throws the buffer away before sending anything.
//
// (Note for anyone editing these comments: never write a literal close-PHP tag
// inside a // comment. It ends PHP mode, and the file quietly prints itself.)
if (ob_get_level() === 0) {
    ob_start();
}

function discard_stray_output(): void
{
    while (ob_get_level() > 0) {
        ob_end_clean();
    }
}

function config(): array
{
    static $config = null;
    if ($config === null) {
        $path = __DIR__ . '/config.php';
        if (!is_file($path)) {
            json_out(['error' => 'The API is not configured. Copy config.example.php to config.php.'], 500);
        }
        // Buffered at the source: if config.php carries a byte-order mark or a
        // stray blank line, it is swallowed here rather than being printed
        // ahead of the first header and wrecking every response.
        ob_start();
        $config = require $path;
        ob_end_clean();
    }
    return $config;
}

/**
 * The connection is opened lazily and never at import time. A misconfigured app
 * must still start and be able to say what is wrong — an app that cannot boot
 * without a database can only ever show a blank 500.
 */
function db(): PDO
{
    static $pdo = null;
    if ($pdo !== null) {
        return $pdo;
    }

    $pdo = connect();
    ensure_schema($pdo, config()['db']['name']);
    return $pdo;
}

/** Raw connection with no schema work, so /health can report each step apart. */
function connect(): PDO
{
    $c = config()['db'];
    $port = (int) ($c['port'] ?? 3306);
    $dsn = "mysql:host={$c['host']};port={$port};dbname={$c['name']};charset={$c['charset']}";

    return new PDO($dsn, $c['user'], $c['password'], [
        PDO::ATTR_ERRMODE            => PDO::ERRMODE_EXCEPTION,
        PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
        // Real prepared statements, so a vendor name containing a quote can
        // never become SQL.
        PDO::ATTR_EMULATE_PREPARES   => false,
    ]);
}

/**
 * Where bill photos live. Configured to sit OUTSIDE the deployed folder,
 * because a deploy replaces that folder and would take every upload with it.
 */
function uploads_dir(): string
{
    $configured = trim((string) (config()['uploads_dir'] ?? ''));
    $dir = $configured !== '' ? rtrim($configured, '/\\') : __DIR__ . '/uploads';

    if (!is_dir($dir)) {
        @mkdir($dir, 0755, true);
    }
    return $dir;
}

/** True when uploads sit inside the deploy folder — survivable, but a warning. */
function uploads_at_risk(): bool
{
    $dir = realpath(uploads_dir());
    $app = realpath(__DIR__);
    return $dir !== false && $app !== false && str_starts_with($dir, $app);
}

function cors(): void
{
    // The buffer opened at the top of this file stays open through here, so
    // these header() calls are safe even if something printed already.
    $origin  = $_SERVER['HTTP_ORIGIN'] ?? '';
    $allowed = config()['allowed_origins'];

    if ($origin !== '' && in_array($origin, $allowed, true)) {
        header("Access-Control-Allow-Origin: $origin");
        header('Vary: Origin');
        header('Access-Control-Allow-Credentials: true');
    }

    header('Access-Control-Allow-Methods: GET, POST, DELETE, OPTIONS');
    header('Access-Control-Allow-Headers: Content-Type, Authorization');
    header('Access-Control-Max-Age: 86400');

    if (($_SERVER['REQUEST_METHOD'] ?? '') === 'OPTIONS') {
        discard_stray_output();
        http_response_code(204);
        exit;
    }
}

function json_out($data, int $status = 200): void
{
    discard_stray_output();
    http_response_code($status);
    header('Content-Type: application/json; charset=utf-8');
    echo json_encode($data, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    exit;
}

function json_in(): array
{
    $raw = file_get_contents('php://input');
    if ($raw === '' || $raw === false) {
        return [];
    }
    $data = json_decode($raw, true);
    if (!is_array($data)) {
        json_out(['error' => 'Request body was not valid JSON.'], 400);
    }
    return $data;
}

function bearer_token(): ?string
{
    $header = $_SERVER['HTTP_AUTHORIZATION'] ?? $_SERVER['REDIRECT_HTTP_AUTHORIZATION'] ?? '';

    // Some Apache configurations strip the Authorization header; this is the
    // documented fallback.
    if ($header === '' && function_exists('apache_request_headers')) {
        foreach (apache_request_headers() as $key => $value) {
            if (strcasecmp($key, 'Authorization') === 0) {
                $header = $value;
                break;
            }
        }
    }

    if (preg_match('/Bearer\s+([A-Za-z0-9]+)/', $header, $m)) {
        return $m[1];
    }
    return null;
}

/** Returns the signed-in user, or ends the request with 401. */
function require_user(): array
{
    $token = bearer_token();
    if ($token === null) {
        json_out(['error' => 'Not signed in.'], 401);
    }

    $stmt = db()->prepare(
        'SELECT u.id, u.email, u.name, u.role
           FROM sessions s
           JOIN users u ON u.id = s.user_id
          WHERE s.token = ? AND s.expires_at > NOW()
          LIMIT 1'
    );
    $stmt->execute([$token]);
    $user = $stmt->fetch();

    if (!$user) {
        json_out(['error' => 'Your session has expired. Sign in again.'], 401);
    }
    return $user;
}

function new_id(string $prefix): string
{
    return $prefix . '_' . bin2hex(random_bytes(8));
}

function audit(?string $userId, string $op, string $entity, ?string $rowId, $payload): void
{
    try {
        db()->prepare('INSERT INTO audit_log (user_id, op, entity, row_id, payload) VALUES (?, ?, ?, ?, ?)')
            ->execute([$userId, $op, $entity, $rowId, json_encode($payload, JSON_UNESCAPED_UNICODE)]);
    } catch (Throwable $e) {
        // The audit trail must never block a real write.
        error_log('Kalope audit failed: ' . $e->getMessage());
    }
}
