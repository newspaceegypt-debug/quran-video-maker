const { spawn } = require("child_process");
const fs = require("fs");
const fsp = require("fs/promises");
const os = require("os");
const path = require("path");
const formidable = require("formidable");
const formidableFn = typeof formidable === "function" ? formidable : formidable.formidable;
const IncomingForm = formidable.IncomingForm;

let ffmpegPath = "";
try {
  ffmpegPath = require("@ffmpeg-installer/ffmpeg").path || "";
} catch (err) {
  ffmpegPath = "";
}

function resolveFfmpegBin() {
  return process.env.FFMPEG_BIN || ffmpegPath || "";
}

function canExecute(filePath) {
  if (!filePath) return false;
  try {
    fs.accessSync(filePath, fs.constants.X_OK);
    return true;
  } catch {
    return false;
  }
}

function setCors(res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
}

function parseForm(req) {
  return new Promise((resolve, reject) => {
    const form =
      typeof formidableFn === "function"
        ? formidableFn({
            multiples: false,
            keepExtensions: true,
            uploadDir: os.tmpdir(),
            maxFileSize: 1024 * 1024 * 1024,
          })
        : new IncomingForm({
            multiples: false,
            keepExtensions: true,
            uploadDir: os.tmpdir(),
            maxFileSize: 1024 * 1024 * 1024,
          });
    form.parse(req, (err, fields, files) => {
      if (err) {
        reject(err);
        return;
      }
      resolve({ fields, files });
    });
  });
}

function pickField(value) {
  if (Array.isArray(value)) return value[0];
  return value;
}

function pickFile(files) {
  if (!files) return null;
  const file = files.video;
  if (!file) return null;
  return Array.isArray(file) ? file[0] : file;
}

function runFfmpeg(bin, args) {
  return new Promise((resolve, reject) => {
    const proc = spawn(bin, args, { stdio: ["ignore", "ignore", "pipe"] });
    let stderr = "";
    proc.stderr.on("data", (chunk) => {
      if (stderr.length < 4000) {
        stderr += chunk.toString();
      }
    });
    proc.on("error", reject);
    proc.on("close", (code) => {
      if (code === 0) resolve();
      else reject(new Error(stderr || `FFmpeg exited with code ${code}`));
    });
  });
}

async function safeUnlink(filePath) {
  if (!filePath) return;
  try {
    await fsp.unlink(filePath);
  } catch {
    // ignore
  }
}

module.exports = async (req, res) => {
  setCors(res);

  if (req.method === "GET") {
    const url = new URL(req.url, "http://localhost");
    if (url.searchParams.get("debug") === "1") {
      const ffmpegBin = resolveFfmpegBin();
      res.statusCode = 200;
      res.setHeader("Content-Type", "application/json; charset=utf-8");
      res.end(
        JSON.stringify({
          ok: true,
          node: process.version,
          tmp: os.tmpdir(),
          formidable: {
            type: typeof formidable,
            fnType: typeof formidableFn,
            hasIncomingForm: typeof IncomingForm === "function",
          },
          ffmpeg: {
            env: process.env.FFMPEG_BIN || "",
            path: ffmpegPath,
            resolved: ffmpegBin,
            exists: Boolean(ffmpegBin && fs.existsSync(ffmpegBin)),
            executable: Boolean(ffmpegBin && canExecute(ffmpegBin)),
          },
        })
      );
      return;
    }
    res.statusCode = 405;
    res.end("Method not allowed");
    return;
  }

  if (req.method === "OPTIONS") {
    res.statusCode = 204;
    res.end();
    return;
  }

  if (req.method !== "POST") {
    res.statusCode = 405;
    res.end("Method not allowed");
    return;
  }

  let inputPath = "";
  let outputPath = "";

  try {
    const { fields, files } = await parseForm(req);
    const file = pickFile(files);
    if (!file) {
      res.statusCode = 400;
      res.end("Missing video file");
      return;
    }

    inputPath = file.filepath || file.path || "";
    if (!inputPath) {
      res.statusCode = 400;
      res.end("Upload missing file path");
      return;
    }

    const startValue = parseFloat(pickField(fields.start) || "0");
    const durationValue = parseFloat(pickField(fields.duration) || "0");
    const start = Number.isFinite(startValue) && startValue > 0 ? startValue : 0;
    const duration = Number.isFinite(durationValue) && durationValue > 0 ? durationValue : 0;

    outputPath = path.join(os.tmpdir(), `quran-reel-${Date.now()}.mp4`);

    const ffmpegBin = resolveFfmpegBin();
    if (!ffmpegBin) {
      res.statusCode = 500;
      res.end("FFmpeg not available");
      return;
    }

    const args = ["-hide_banner", "-y", "-i", inputPath];
    if (start > 0) args.push("-ss", String(start));
    if (duration > 0) args.push("-t", String(duration));
    args.push(
      "-c:v",
      "libx264",
      "-preset",
      "veryfast",
      "-crf",
      "23",
      "-pix_fmt",
      "yuv420p",
      "-c:a",
      "aac",
      "-b:a",
      "128k",
      "-movflags",
      "+faststart",
      outputPath
    );

    await runFfmpeg(ffmpegBin, args);

    const stat = await fsp.stat(outputPath);
    res.setHeader("Content-Type", "video/mp4");
    res.setHeader("Content-Disposition", 'attachment; filename="quran-reel.mp4"');
    res.setHeader("Content-Length", String(stat.size));
    res.setHeader("Cache-Control", "no-store");

    const stream = fs.createReadStream(outputPath);
    const cleanup = async () => {
      await safeUnlink(inputPath);
      await safeUnlink(outputPath);
    };
    res.on("close", cleanup);
    res.on("finish", cleanup);
    stream.on("error", async () => {
      await cleanup();
      if (!res.headersSent) {
        res.statusCode = 500;
      }
      res.end("Failed to stream output");
    });
    stream.pipe(res);
  } catch (err) {
    await safeUnlink(inputPath);
    await safeUnlink(outputPath);
    const message =
      (err && (err.stack || err.message)) ||
      (typeof err === "string" ? err : "FFmpeg failed");
    console.error("FFmpeg failed:", message);
    res.statusCode = 500;
    res.end(message);
  }
};
