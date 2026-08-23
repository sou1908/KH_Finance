<?php
// Copy this file to config.php and fill in your Hostinger details.
// config.php is gitignored — the real credentials must never be committed.

return [
    'db' => [
        // 127.0.0.1, NOT localhost. MariaDB treats user@localhost,
        // user@127.0.0.1 and user@::1 as three separate accounts, and your
        // grant is for one of them. On modern systems "localhost" resolves to
        // IPv6 ::1, which matches no grant — and the failure is
        // ER_ACCESS_DENIED_ERROR, identical to a wrong password.
        //
        // To settle it in seconds: phpMyAdmin → SQL →
        //     SHOW GRANTS FOR CURRENT_USER();
        // whatever follows the @ is the only host that will work. Put that here.
        'host'     => '127.0.0.1',
        'port'     => 3306,

        // hPanel → Databases. Use the FULL prefixed names.
        'name'     => 'uXXXXXXXX_kalope',
        'user'     => 'uXXXXXXXX_kalope',

        // Keep it letters and numbers only. Symbols occasionally get mangled
        // passing through hosting panels, and that is not a problem worth an
        // afternoon.
        'password' => 'YOUR_DATABASE_PASSWORD',

        'charset'  => 'utf8mb4',
    ],

    // Which sites may call this API. The app's origin must be listed exactly,
    // including https://. Remove the localhost line once you are live.
    'allowed_origins' => [
        'https://finance.yourdomain.com',
        'http://localhost:5173',
    ],

    // Bill photos and payment slips.
    //
    // This MUST sit outside the folder you deploy into. A deploy replaces the
    // application directory, and uploads are gitignored — correctly, they hold
    // customer material — so they are not restored by it. Left inside, every
    // deploy silently destroys every bill photo you have.
    //
    // Substitute your real account id; a literal USER here fails only later,
    // the first time somebody uploads something.
    'uploads_dir' => '/home/uXXXXXXXX/kalope-uploads',

    // Any long random string. Changing it logs everyone out.
    'app_secret' => 'CHANGE_ME_TO_A_LONG_RANDOM_STRING',

    // How long a login lasts before it must be repeated.
    'session_days' => 30,

    // Ceiling per uploaded bill photo. Your PHP upload_max_filesize also
    // applies — whichever is smaller wins.
    'max_upload_bytes' => 12 * 1024 * 1024,

    // Visit /api/setup.php?key=THIS once to create the first login, then set it
    // back to null so the endpoint can never be used again.
    'setup_key' => null,
];
