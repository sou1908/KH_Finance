<?php
declare(strict_types=1);

/**
 * The schema, and the only definition of it.
 *
 * Tables are created and repaired by the app on first connection, so there is
 * no SQL file to paste and nothing to keep in step by hand.
 *
 * This exists because of a specific trap: CREATE TABLE IF NOT EXISTS silently
 * skips a table that already exists — columns included. Add a field later and
 * it never reaches the live database; the deploy succeeds and every query
 * touching that column dies with "Unknown column". So on boot the declared
 * columns below are compared against information_schema and anything missing is
 * added. Columns are only ever ADDED — never dropped, never retyped.
 *
 * Dialect rules, because the server version is not ours to choose:
 *   - No DEFAULT on a TEXT column (needs MySQL 8.0.13+).
 *   - No DEFAULT that calls a function, except CURRENT_TIMESTAMP on a datetime,
 *     which every supported MySQL and MariaDB accepts.
 *   - Values that need computing are computed in PHP.
 */

const SCHEMA_VERSION = 3;

const SCHEMA = [
    'app_meta' => [
        'columns' => [
            'k' => 'VARCHAR(64) NOT NULL',
            'v' => "VARCHAR(255) NOT NULL DEFAULT ''",
        ],
        'primary' => '(k)',
    ],

    'users' => [
        'columns' => [
            'id'            => 'VARCHAR(40) NOT NULL',
            'email'         => 'VARCHAR(190) NOT NULL',
            'password_hash' => 'VARCHAR(255) NOT NULL',
            'name'          => "VARCHAR(120) NOT NULL DEFAULT ''",
            'role'          => "VARCHAR(20) NOT NULL DEFAULT 'owner'",
            'created_at'    => 'DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP',
        ],
        'primary' => '(id)',
        'keys'    => ['UNIQUE KEY uniq_users_email (email)'],
    ],

    'sessions' => [
        'columns' => [
            'token'      => 'CHAR(64) NOT NULL',
            'user_id'    => 'VARCHAR(40) NOT NULL',
            'created_at' => 'DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP',
            'expires_at' => 'DATETIME NOT NULL',
        ],
        'primary' => '(token)',
        'keys'    => ['KEY idx_sessions_user (user_id)', 'KEY idx_sessions_expiry (expires_at)'],
    ],

    'clients' => [
        'columns' => [
            'id'         => 'VARCHAR(40) NOT NULL',
            'name'       => 'VARCHAR(190) NOT NULL',
            'phone'      => "VARCHAR(40) NOT NULL DEFAULT ''",
            'note'       => 'TEXT NULL',
            'updated_at' => 'DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP',
            'deleted_at' => 'DATETIME NULL',
        ],
        'primary' => '(id)',
        'keys'    => ['KEY idx_clients_live (deleted_at)'],
    ],

    'accounts' => [
        'columns' => [
            'id'              => 'VARCHAR(40) NOT NULL',
            'name'            => 'VARCHAR(190) NOT NULL',
            'kind'            => "VARCHAR(30) NOT NULL DEFAULT 'cash'",
            'holder'          => "VARCHAR(190) NOT NULL DEFAULT ''",
            'opening_balance' => 'DECIMAL(14,2) NOT NULL DEFAULT 0',
            'updated_at'      => 'DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP',
            'deleted_at'      => 'DATETIME NULL',
        ],
        'primary' => '(id)',
        'keys'    => ['KEY idx_accounts_live (deleted_at)'],
    ],

    'categories' => [
        'columns' => [
            'id'               => 'VARCHAR(40) NOT NULL',
            'name'             => 'VARCHAR(190) NOT NULL',
            'unit'             => "VARCHAR(40) NOT NULL DEFAULT ''",
            'tracks_inventory' => 'TINYINT(1) NOT NULL DEFAULT 0',
            'updated_at'       => 'DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP',
            'deleted_at'       => 'DATETIME NULL',
        ],
        'primary' => '(id)',
        'keys'    => ['KEY idx_categories_live (deleted_at)'],
    ],

    'projects' => [
        'columns' => [
            'id'            => 'VARCHAR(40) NOT NULL',
            'name'          => 'VARCHAR(190) NOT NULL',
            'client_id'     => 'VARCHAR(40) NULL',
            'phone'         => "VARCHAR(40) NOT NULL DEFAULT ''",
            'site'          => "VARCHAR(190) NOT NULL DEFAULT ''",
            'quoted_amount' => 'DECIMAL(14,2) NOT NULL DEFAULT 0',
            'start_date'    => 'DATE NULL',
            'status'        => "VARCHAR(20) NOT NULL DEFAULT 'Active'",
            'note'          => 'TEXT NULL',
            'updated_at'    => 'DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP',
            'deleted_at'    => 'DATETIME NULL',
        ],
        'primary' => '(id)',
        'keys'    => ['KEY idx_projects_client (client_id)', 'KEY idx_projects_live (deleted_at)'],
    ],

    'receipts' => [
        'columns' => [
            'id'         => 'VARCHAR(40) NOT NULL',
            'project_id' => 'VARCHAR(40) NOT NULL',
            'date'       => 'DATE NULL',
            'amount'     => 'DECIMAL(14,2) NOT NULL DEFAULT 0',
            'account_id' => 'VARCHAR(40) NULL',
            'mode'       => "VARCHAR(40) NOT NULL DEFAULT ''",
            'reference'  => "VARCHAR(190) NOT NULL DEFAULT ''",
            'note'       => 'TEXT NULL',
            'updated_at' => 'DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP',
            'deleted_at' => 'DATETIME NULL',
        ],
        'primary' => '(id)',
        'keys'    => [
            'KEY idx_receipts_project (project_id, date)',
            'KEY idx_receipts_account (account_id)',
            'KEY idx_receipts_live (deleted_at)',
        ],
    ],

    'expenses' => [
        'columns' => [
            'id'          => 'VARCHAR(40) NOT NULL',
            'project_id'  => 'VARCHAR(40) NOT NULL',
            'date'        => 'DATE NULL',
            'category_id' => 'VARCHAR(40) NULL',
            'account_id'  => 'VARCHAR(40) NULL',
            'vendor'      => "VARCHAR(190) NOT NULL DEFAULT ''",
            'description' => 'TEXT NULL',
            'qty'         => 'DECIMAL(14,3) NOT NULL DEFAULT 0',
            'unit'        => "VARCHAR(40) NOT NULL DEFAULT ''",
            'rate'        => 'DECIMAL(14,2) NOT NULL DEFAULT 0',
            'amount'      => 'DECIMAL(14,2) NOT NULL DEFAULT 0',
            'bill_no'     => "VARCHAR(80) NOT NULL DEFAULT ''",
            'used_qty'    => 'DECIMAL(14,3) NOT NULL DEFAULT 0',
            'updated_at'  => 'DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP',
            'deleted_at'  => 'DATETIME NULL',
        ],
        'primary' => '(id)',
        'keys'    => [
            'KEY idx_expenses_project (project_id, date)',
            'KEY idx_expenses_category (category_id)',
            'KEY idx_expenses_account (account_id)',
            'KEY idx_expenses_live (deleted_at)',
        ],
    ],

    'attachments' => [
        'columns' => [
            'id'          => 'VARCHAR(40) NOT NULL',
            'owner_type'  => "VARCHAR(20) NOT NULL DEFAULT ''",
            'owner_id'    => "VARCHAR(40) NOT NULL DEFAULT ''",
            'name'        => "VARCHAR(255) NOT NULL DEFAULT ''",
            'mime'        => "VARCHAR(100) NOT NULL DEFAULT 'application/octet-stream'",
            'size'        => 'INT UNSIGNED NOT NULL DEFAULT 0',
            'path'        => "VARCHAR(255) NOT NULL DEFAULT ''",
            'uploaded_at' => 'DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP',
            'deleted_at'  => 'DATETIME NULL',
        ],
        'primary' => '(id)',
        'keys'    => ['KEY idx_attachments_owner (owner_type, owner_id)', 'KEY idx_attachments_live (deleted_at)'],
    ],

    'audit_log' => [
        'columns' => [
            'id'         => 'BIGINT UNSIGNED NOT NULL AUTO_INCREMENT',
            'user_id'    => 'VARCHAR(40) NULL',
            'op'         => "VARCHAR(20) NOT NULL DEFAULT ''",
            'entity'     => "VARCHAR(30) NOT NULL DEFAULT ''",
            'row_id'     => 'VARCHAR(40) NULL',
            'payload'    => 'LONGTEXT NULL',
            'created_at' => 'DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP',
        ],
        'primary' => '(id)',
        'keys'    => ['KEY idx_audit_entity (entity, row_id)', 'KEY idx_audit_time (created_at)'],
    ],
];

/** The seven heads and four accounts a new install starts with. */
const SEED_ACCOUNTS = [
    ['acc_cash', 'Cash', 'cash', ''],
    ['acc_personal_a', 'Personal A/C — A', 'personal', 'A'],
    ['acc_personal_b', 'Personal A/C — B', 'personal', 'B'],
    ['acc_company', 'Company A/C', 'company', 'Kalope Homes'],
];

const SEED_CATEGORIES = [
    ['cat_sheet', 'Sheet', 'sheet', 1],
    ['cat_fare', 'Fare', 'trip', 0],
    ['cat_hardware', 'Hardware', 'pcs', 1],
    ['cat_labour', 'Labour', 'day', 0],
    ['cat_designer', 'Designer', 'job', 0],
    ['cat_electric', 'Electric', 'pcs', 1],
    ['cat_extra', 'Extra', 'item', 0],
];

/**
 * Creates anything missing and adds any column the live database has not seen.
 * Cheap on the common path: one small SELECT, then nothing.
 *
 * @return array{ran: bool, added: string[]}
 */
function ensure_schema(PDO $pdo, string $dbName, bool $force = false): array
{
    $current = current_schema_version($pdo);
    if (!$force && $current === SCHEMA_VERSION) {
        return ['ran' => false, 'added' => []];
    }

    foreach (SCHEMA as $table => $spec) {
        $pdo->exec(create_table_sql($table, $spec));
    }

    // The repair pass. This is the part that CREATE TABLE IF NOT EXISTS cannot do.
    $added = [];
    foreach (SCHEMA as $table => $spec) {
        $stmt = $pdo->prepare(
            'SELECT COLUMN_NAME FROM information_schema.COLUMNS
              WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ?'
        );
        $stmt->execute([$dbName, $table]);

        $live = array_map('strtolower', $stmt->fetchAll(PDO::FETCH_COLUMN));

        foreach ($spec['columns'] as $column => $definition) {
            if (in_array(strtolower($column), $live, true)) {
                continue;
            }
            // Backticks, because `k` and `date` are reserved-ish words.
            $pdo->exec("ALTER TABLE `$table` ADD COLUMN `$column` $definition");
            $added[] = "$table.$column";
        }
    }

    seed_masters($pdo);

    $pdo->prepare('INSERT INTO app_meta (k, v) VALUES ("schema_version", ?) ON DUPLICATE KEY UPDATE v = VALUES(v)')
        ->execute([(string) SCHEMA_VERSION]);

    return ['ran' => true, 'added' => $added];
}

function current_schema_version(PDO $pdo): ?int
{
    try {
        $stmt = $pdo->query('SELECT v FROM app_meta WHERE k = "schema_version" LIMIT 1');
        $value = $stmt->fetchColumn();
        return $value === false ? null : (int) $value;
    } catch (PDOException $e) {
        // app_meta itself does not exist yet: a brand new database.
        return null;
    }
}

function create_table_sql(string $table, array $spec): string
{
    $parts = [];
    foreach ($spec['columns'] as $column => $definition) {
        $parts[] = "`$column` $definition";
    }
    if (!empty($spec['primary'])) {
        $parts[] = 'PRIMARY KEY ' . $spec['primary'];
    }
    foreach ($spec['keys'] ?? [] as $key) {
        $parts[] = $key;
    }

    return "CREATE TABLE IF NOT EXISTS `$table` (\n  " . implode(",\n  ", $parts) .
        "\n) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4";
}

/** INSERT IGNORE, so a firm that renamed or deleted a head keeps its changes. */
function seed_masters(PDO $pdo): void
{
    $account = $pdo->prepare('INSERT IGNORE INTO accounts (id, name, kind, holder) VALUES (?, ?, ?, ?)');
    foreach (SEED_ACCOUNTS as $row) {
        $account->execute($row);
    }

    $category = $pdo->prepare('INSERT IGNORE INTO categories (id, name, unit, tracks_inventory) VALUES (?, ?, ?, ?)');
    foreach (SEED_CATEGORIES as $row) {
        $category->execute($row);
    }
}
