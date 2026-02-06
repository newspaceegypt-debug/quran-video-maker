# Quran Video Backend

Backend server لتوليد فيديوهات القرآن باستخدام FFmpeg

## التثبيت المحلي

```bash
cd backend
npm install
npm start
```

## النشر على Render

### الخطوات:

1. **إنشاء حساب على Render:**
   - اذهب إلى https://render.com
   - سجل دخول بحساب GitHub

2. **إنشاء Web Service جديد:**
   - اضغط "New +" → "Web Service"
   - اختر "Build and deploy from a Git repository"
   - اربط حساب GitHub واختر الـ repository

3. **الإعدادات:**
   - **Name:** quran-video-backend
   - **Environment:** Node
   - **Build Command:** `cd backend && npm install`
   - **Start Command:** `cd backend && npm start`
   - **Plan:** Free

4. **إضافة Buildpack لـ FFmpeg:**
   - في "Environment" → "Add Environment Variable"
   - Key: `FFMPEG_PATH`
   - Value: `/usr/bin/ffmpeg`

5. **Deploy:**
   - اضغط "Create Web Service"
   - انتظر حتى ينتهي النشر (5-10 دقائق)

6. **نسخ الـ URL:**
   - بعد النشر، انسخ الـ URL (مثلاً: `https://quran-video-backend.onrender.com`)
   - استبدله في Frontend في ملف `index.html`:
     ```javascript
     const SERVER_URL = 'https://quran-video-backend.onrender.com/api/export';
     ```

## ملاحظات:

- الخطة المجانية على Render تنام بعد 15 دقيقة من عدم الاستخدام
- أول طلب بعد النوم قد يأخذ 30-60 ثانية
- الخطة المجانية محدودة بـ 750 ساعة/شهر
