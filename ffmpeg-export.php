<?php
declare(strict_types=1);

header("Access-Control-Allow-Origin: *");
header("Access-Control-Allow-Headers: Content-Type");
header("Access-Control-Allow-Methods: POST, OPTIONS");

if ($_SERVER["REQUEST_METHOD"] === "OPTIONS") {
    http_response_code(204);
    exit;
}

if ($_SERVER["REQUEST_METHOD"] !== "POST") {
    http_response_code(405);
    echo "Method not allowed";
    exit;
}

if (!function_exists("exec")) {
    http_response_code(500);
    echo "exec is disabled";
    exit;
}

$ffmpeg = getenv("FFMPEG_BIN");
if (!$ffmpeg) {
    $ffmpeg = "ffmpeg";
}

$checkCmd = escapeshellcmd($ffmpeg) . " -version";
$checkOutput = [];
$checkCode = 0;
@exec($checkCmd . " 2>&1", $checkOutput, $checkCode);
if ($checkCode !== 0) {
    http_response_code(500);
    echo "FFmpeg not available";
    exit;
}

function uploadErrorMessage(int $code): string
{
    switch ($code) {
        case UPLOAD_ERR_INI_SIZE:
        case UPLOAD_ERR_FORM_SIZE:
            return "Upload too large";
        case UPLOAD_ERR_PARTIAL:
            return "Upload incomplete";
        case UPLOAD_ERR_NO_FILE:
            return "No file uploaded";
        case UPLOAD_ERR_NO_TMP_DIR:
            return "Missing temp directory";
        case UPLOAD_ERR_CANT_WRITE:
            return "Failed to write uploaded file";
        case UPLOAD_ERR_EXTENSION:
            return "Upload blocked by extension";
        default:
            return "Upload error";
    }
}

if (!isset($_FILES["video"])) {
    http_response_code(400);
    echo "Missing video file";
    exit;
}

if ($_FILES["video"]["error"] !== UPLOAD_ERR_OK) {
    http_response_code(400);
    echo uploadErrorMessage((int)$_FILES["video"]["error"]);
    exit;
}

set_time_limit(0);

$tmpInput = tempnam(sys_get_temp_dir(), "qreel_");
if ($tmpInput === false) {
    http_response_code(500);
    echo "Temp file error";
    exit;
}
$inputPath = $tmpInput . ".webm";
@rename($tmpInput, $inputPath);

if (!move_uploaded_file($_FILES["video"]["tmp_name"], $inputPath)) {
    http_response_code(400);
    echo "Failed to move uploaded file";
    @unlink($inputPath);
    exit;
}

$tmpOutput = tempnam(sys_get_temp_dir(), "qreel_");
if ($tmpOutput === false) {
    http_response_code(500);
    echo "Temp file error";
    @unlink($inputPath);
    exit;
}
$outputPath = $tmpOutput . ".mp4";
@rename($tmpOutput, $outputPath);

register_shutdown_function(function () use ($inputPath, $outputPath): void {
    if (is_file($inputPath)) {
        @unlink($inputPath);
    }
    if (is_file($outputPath)) {
        @unlink($outputPath);
    }
});

$start = isset($_POST["start"]) ? (float)$_POST["start"] : 0.0;
$duration = isset($_POST["duration"]) ? (float)$_POST["duration"] : 0.0;
$fps = isset($_POST["fps"]) ? (float)$_POST["fps"] : 30.0;
$start = max(0.0, $start);
$duration = max(0.0, $duration);
$fps = max(30.0, min(60.0, $fps));

function formatSeconds(float $value): string
{
    $value = max(0.0, $value);
    $formatted = number_format($value, 3, ".", "");
    return rtrim(rtrim($formatted, "0"), ".");
}

$cmd = escapeshellcmd($ffmpeg) . " -hide_banner -y -i " . escapeshellarg($inputPath);
if ($start > 0.0) {
    $cmd .= " -ss " . escapeshellarg(formatSeconds($start));
}
if ($duration > 0.0) {
    $cmd .= " -t " . escapeshellarg(formatSeconds($duration));
}
$cmd .= " -c:v libx264 -preset veryfast -crf 23 -r " . escapeshellarg(formatSeconds($fps)) . " -vsync cfr -pix_fmt yuv420p";
$cmd .= " -c:a aac -b:a 128k -movflags +faststart " . escapeshellarg($outputPath);

$output = [];
$code = 0;
@exec($cmd . " 2>&1", $output, $code);

if ($code !== 0 || !is_file($outputPath)) {
    http_response_code(500);
    echo "FFmpeg failed";
    exit;
}

header("Content-Type: video/mp4");
header("Content-Disposition: attachment; filename=\"quran-reel.mp4\"");
header("Content-Length: " . filesize($outputPath));
header("Cache-Control: no-store");
readfile($outputPath);
