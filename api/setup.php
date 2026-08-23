<?php
declare(strict_types=1);

/**
 * One-time first-login creator.
 *
 * 1. Set 'setup_key' in config.php to a long random string.
 * 2. Visit  https://yourdomain.com/api/setup.php?key=THAT_STRING
 * 3. Fill in the email and password you want to sign in with.
 * 4. Set 'setup_key' back to null. The page then refuses to run at all.
 *
 * Leaving the key set would let anyone who guesses it create a login, so step 4
 * is not optional.
 */

require __DIR__ . '/lib.php';

$configured = config()['setup_key'];
$provided   = $_GET['key'] ?? $_POST['key'] ?? '';

if (!is_string($configured) || $configured === '' || !hash_equals($configured, (string) $provided)) {
    http_response_code(404);
    exit('Not found.');
}

$message = '';
$done    = false;

if (($_SERVER['REQUEST_METHOD'] ?? '') === 'POST') {
    $email    = strtolower(trim((string) ($_POST['email'] ?? '')));
    $password = (string) ($_POST['password'] ?? '');
    $name     = trim((string) ($_POST['name'] ?? 'Kalope Homes'));

    if (!filter_var($email, FILTER_VALIDATE_EMAIL)) {
        $message = 'That does not look like an email address.';
    } elseif (strlen($password) < 10) {
        $message = 'Use a password of at least 10 characters.';
    } else {
        db()->prepare(
            'INSERT INTO users (id, email, password_hash, name, role) VALUES (?, ?, ?, ?, "owner")
             ON DUPLICATE KEY UPDATE password_hash = VALUES(password_hash), name = VALUES(name)'
        )->execute([new_id('usr'), $email, password_hash($password, PASSWORD_DEFAULT), $name]);

        $done    = true;
        $message = "Login ready for $email. Now set 'setup_key' back to null in config.php.";
    }
}
?>
<!doctype html>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Kalope Homes — create the first login</title>
<style>
  body { font: 15px/1.5 system-ui, sans-serif; max-width: 30rem; margin: 8vh auto; padding: 0 1rem; color: #171b21; }
  h1 { font-size: 1.25rem; }
  label { display: block; margin: 1rem 0 .25rem; font-size: .8rem; letter-spacing: .08em; text-transform: uppercase; color: #59636e; }
  input { width: 100%; padding: .55rem .7rem; border: 1px solid #dfe3e7; border-radius: 3px; font: inherit; }
  button { margin-top: 1.25rem; padding: .55rem 1rem; border: 0; border-radius: 3px; background: #1f4fd8; color: #fff; font: inherit; cursor: pointer; }
  .msg { margin-top: 1rem; padding: .7rem .9rem; border-radius: 3px; background: #eaefFD; border: 1px solid #c7d4f7; }
  .done { background: #e6f4ef; border-color: #b9ddd0; }
</style>

<h1>Create the Kalope Homes login</h1>

<?php if ($message !== ''): ?>
  <p class="msg <?= $done ? 'done' : '' ?>"><?= htmlspecialchars($message, ENT_QUOTES) ?></p>
<?php endif; ?>

<?php if (!$done): ?>
<form method="post">
  <input type="hidden" name="key" value="<?= htmlspecialchars((string) $provided, ENT_QUOTES) ?>">
  <label for="name">Company name</label>
  <input id="name" name="name" value="Kalope Homes">
  <label for="email">Email</label>
  <input id="email" name="email" type="email" required autocomplete="username">
  <label for="password">Password</label>
  <input id="password" name="password" type="password" required minlength="10" autocomplete="new-password">
  <button type="submit">Create login</button>
</form>
<?php endif; ?>
