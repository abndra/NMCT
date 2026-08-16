# دليل النشر الكامل (خطوة بخطوة)

## 1) إصلاح خطأ قواعد Firebase
الخطأ `Line 72: Expected '{'` سببه سطر تعليق `"//"` داخل القواعد — Firebase لا يقبل التعليقات.
تم حذفه. الآن:

1. افتح Firebase Console → Realtime Database → **Rules**.
2. امسح كل المحتوى الموجود.
3. الصق محتوى ملف `database.rules.json` كاملاً (موجود في المشروع).
4. اضغط **Publish**. يجب أن تختفي رسالة الخطأ ورسالة "rules are public".

## 2) إضافة نفسك كمدير (مهم جداً)
بدون هذه الخطوة لن تستطيع الكتابة من لوحة التحكم.

1. Firebase Console → **Authentication** → Users → أنشئ حساب بريد/كلمة مرور لنفسك (أو سجّل دخول من الموقع مرة).
2. انسخ **User UID** الخاص بك.
3. Realtime Database → **Data** → اضغط `+` على الجذر وأنشئ:
   - المفتاح: `admins`
   - بداخله مفتاح: `<الـ UID الذي نسخته>` وقيمته: `true` (اختر النوع boolean أو اكتب true).
4. احفظ. الآن حسابك مدير.

## 3) متغيرات البيئة في Netlify
Netlify → Site configuration → **Environment variables** → Add:

```
VITE_FIREBASE_API_KEY=...
VITE_FIREBASE_AUTH_DOMAIN=nmct-xxxx.firebaseapp.com
VITE_FIREBASE_DATABASE_URL=https://nmct-xxxx-default-rtdb.firebaseio.com
VITE_FIREBASE_PROJECT_ID=nmct-xxxx
VITE_FIREBASE_STORAGE_BUCKET=nmct-xxxx.appspot.com
VITE_FIREBASE_MESSAGING_SENDER_ID=...
VITE_FIREBASE_APP_ID=...
```
تجدها في Firebase Console → ⚙️ Project settings → Your apps → SDK setup and configuration → Config.

## 4) النشر على Netlify
الطريقة الأسهل (سحب وإفلات المصدر عبر Git):
1. ارفع مجلد المشروع إلى GitHub.
2. Netlify → Add new site → Import from Git → اختر المستودع.
3. الإعدادات تُقرأ تلقائياً من `netlify.toml`:
   - Build command: `bun run build:static`
   - Publish directory: `dist-static`
4. Deploy.

بدون Git:
1. شغّل محلياً: `bun install` ثم `bun run build:static`
2. انقل `dist-static/spa/index.html` إلى `dist-static/index.html`
3. اسحب مجلد `dist-static` إلى صفحة Netlify → Deploys → Drag & drop.
   (مع هذه الطريقة يجب أن تكون المتغيرات موجودة وقت البناء المحلي في ملف `.env`.)

## 5) بعد النشر — تحقق سريع
- افتح الموقع → صفحة الدفع → رقم الهاتف يبدأ بـ 🇴🇲 +968.
- سجّل دخول بحساب المدير → لوحة التحكم → أضف مخزون حقيقي للمنتج الرقمي.
- اطلب المنتج → من اللوحة اضغط "تم التسليم" → يصل الكود في "طلباتي" وعلى واتساب.
