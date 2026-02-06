const express = require('express');
const cors = require('cors');
const { createCanvas } = require('canvas');
const ffmpeg = require('fluent-ffmpeg');
const fs = require('fs');
const path = require('path');
const https = require('https');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json({ limit: '100mb' }));

// دالة لتحميل الصوت من URL
function downloadFile(url, dest) {
    return new Promise((resolve, reject) => {
        const file = fs.createWriteStream(dest);
        https.get(url, (response) => {
            response.pipe(file);
            file.on('finish', () => file.close(resolve));
        }).on('error', (err) => {
            fs.unlink(dest, () => { });
            reject(err);
        });
    });
}

// Endpoint للتصدير
app.post('/api/export', async (req, res) => {
    let tempDir;
    try {
        const { clips, settings } = req.body;
        console.log(`📥 استقبال طلب: ${clips.length} آيات`);

        tempDir = path.join(__dirname, 'temp', Date.now().toString());
        fs.mkdirSync(tempDir, { recursive: true });

        const fps = 30;
        const W = settings.width;
        const H = settings.height;
        let frameIndex = 0;

        // تحميل الصوت
        let audioPath = null;
        if (clips[0].audio) {
            audioPath = path.join(tempDir, 'audio.mp3');
            await downloadFile(clips[0].audio, audioPath);
            console.log('✅ تم تحميل الصوت');
        }

        // رسم الإطارات
        for (let i = 0; i < clips.length; i++) {
            const clip = clips[i];
            const duration = i < clips.length - 1 ? clips[i + 1].syncTime - clip.syncTime : 5;
            const frameCount = Math.ceil(duration * fps);

            for (let f = 0; f < frameCount; f++) {
                const canvas = createCanvas(W, H);
                const ctx = canvas.getContext('2d');

                // خلفية متدرجة
                const gradient = ctx.createLinearGradient(0, 0, 0, H);
                gradient.addColorStop(0, '#0a0a0a');
                gradient.addColorStop(0.5, '#1a1a2e');
                gradient.addColorStop(1, '#16213e');
                ctx.fillStyle = gradient;
                ctx.fillRect(0, 0, W, H);

                const minDim = Math.min(W, H);

                // النص العربي
                if (settings.showArabicText) {
                    ctx.fillStyle = '#ffffff';
                    ctx.font = `bold ${Math.floor(minDim * 0.06)}px Arial`;
                    ctx.textAlign = 'center';
                    ctx.textBaseline = 'middle';

                    const words = clip.ar.split(' ');
                    const maxWidth = W * 0.85;
                    let lines = [];
                    let currentLine = '';

                    for (let word of words) {
                        const testLine = currentLine + word + ' ';
                        if (ctx.measureText(testLine).width > maxWidth && currentLine !== '') {
                            lines.push(currentLine);
                            currentLine = word + ' ';
                        } else {
                            currentLine = testLine;
                        }
                    }
                    lines.push(currentLine);

                    const lineHeight = minDim * 0.08;
                    const startY = H / 2 - (lines.length * lineHeight) / 2;
                    lines.forEach((line, idx) => {
                        ctx.fillText(line.trim(), W / 2, startY + idx * lineHeight);
                    });
                }

                // الترجمة
                if (settings.showTranslation && clip.translation) {
                    ctx.fillStyle = '#10b981';
                    ctx.font = `${Math.floor(minDim * 0.025)}px Arial`;
                    ctx.fillText(clip.translation, W / 2, H * 0.7);
                }

                // رقم الآية
                if (settings.showAyahNumber) {
                    ctx.fillStyle = '#10b981';
                    ctx.font = `bold ${Math.floor(minDim * 0.03)}px Arial`;
                    ctx.fillText(`﴿ ${clip.number} ﴾`, W / 2, H * 0.85);
                }

                // اسم القارئ
                if (settings.showReciterName && settings.reciterName) {
                    ctx.fillStyle = '#ffffff';
                    ctx.font = `${Math.floor(minDim * 0.02)}px Arial`;
                    ctx.fillText(settings.reciterName, W / 2, H * 0.92);
                }

                const framePath = path.join(tempDir, `frame${String(frameIndex).padStart(6, '0')}.jpg`);
                fs.writeFileSync(framePath, canvas.toBuffer('image/jpeg', { quality: 0.95 }));
                frameIndex++;
            }
            console.log(`✅ آية ${i + 1}/${clips.length}`);
        }

        // FFmpeg
        const outputPath = path.join(tempDir, 'output.mp4');
        await new Promise((resolve, reject) => {
            let command = ffmpeg()
                .input(path.join(tempDir, 'frame%06d.jpg'))
                .inputFPS(fps)
                .videoCodec('libx264')
                .outputOptions(['-pix_fmt yuv420p', '-preset fast', '-crf 23']);

            if (audioPath && fs.existsSync(audioPath)) {
                command.input(audioPath).audioCodec('aac').audioBitrate('192k').outputOptions('-shortest');
            }

            command.output(outputPath)
                .on('progress', (p) => console.log(`⏳ ${p.percent?.toFixed(1) || 0}%`))
                .on('end', resolve)
                .on('error', reject)
                .run();
        });

        console.log('✅ تم إنشاء الفيديو');
        res.sendFile(outputPath, () => {
            setTimeout(() => {
                if (tempDir && fs.existsSync(tempDir)) {
                    fs.rmSync(tempDir, { recursive: true, force: true });
                }
            }, 10000);
        });

    } catch (error) {
        console.error('❌ خطأ:', error);
        if (tempDir && fs.existsSync(tempDir)) {
            fs.rmSync(tempDir, { recursive: true, force: true });
        }
        res.status(500).json({ error: error.message });
    }
});

app.get('/health', (req, res) => {
    res.json({ status: 'ok' });
});

app.listen(PORT, () => {
    console.log(`🚀 السيرفر على المنفذ ${PORT}`);
});
