<?php
/**
 * Does this host execute PHP?
 *
 * Vite copies public/ into dist/ untouched, so this file lands wherever the
 * deployment publishes. If the host runs PHP, it answers with JSON. If it does
 * not, the browser shows this source or downloads it — and that is the answer.
 *
 * It exists because the Node server is not being started on this deployment,
 * and PHP is the other thing Hostinger runs. Whether it executes decides which
 * backend can work here.
 *
 * Deliberately minimal: a version string and two extension flags. No phpinfo(),
 * no paths, no configuration — nothing worth harvesting.
 */

header('Content-Type: application/json');
header('Cache-Control: no-store');

echo json_encode([
    'php'       => true,
    'version'   => PHP_VERSION,
    'pdo_mysql' => extension_loaded('pdo_mysql'),
    'fileinfo'  => extension_loaded('fileinfo'),
]);
