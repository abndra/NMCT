# دليل النشر على Netlify (خطوة بخطوة)

## 0) سبب فشل آخر نشر — تم إصلاحه
رسالة الخطأ:
`Secrets scanning found secrets in build` + `"AIza***" detected as a likely secret`

السبب: Netlify يظن أن مفتاح Firebase للويب (AIza...) سر مسرّب. في الحقيقة مفتاح Firebase Web
**عام بطبيعته** ويجب أن يكون داخل كود المتصفح، والحماية الحقيقية تأتي من قواعد قاعدة البيانات
(`database.rules.json`) وليس من إخفاء المفتاح.

الحل الجذري (مطبّق داخل `netlify.toml`):
```toml
[build.environment]
  SECRETS_SCAN_ENABLED = "false"
```
لا تحتاج لعمل أي شيء إضافي — فقط انشر النسخة الجديدة.

## 1) مهم جداً: طريقة الربط الصحيحة
- ❌ لا ترفع ملف `nmct-source-ready.zip` نفسه داخل المستودع أو تسحبه إلى Netlify —
  هذا ما سبّب صفحة "Page not found" (تم نشر ملف ZIP فقط بدون موقع).
- ✅ فك ضغط الـ ZIP، ثم ارفع **محتوياته** (المجلدات `src` و `public` و `spa` والملفات
  `package.json` و `netlify.toml` ...) إلى مستودع GitHub، واربط Netlify بالمستودع.
- احذف من المستودع أي ملف `.zip` قديم.

## 2) إعدادات البناء في Netlify
تُقرأ تلقائياً من `netlify.toml`:
- Build command: `bun run build:static && mv dist-static/spa/index.html dist-static/index.html && rmdir dist-static/spa`
- Publish directory: `dist-static`

اترك الحقول فارغة في واجهة Netlify حتى لا تتعارض مع الملف.

## 3) متغيرات البيئة (اختيارية)
المشروع يعمل بدونها لأن القيم الافتراضية لمشروع NMCT مضمّنة. إن أردت توجيهه لمشروع Firebase آخر:

```
VITE_FIREBASE_API_KEY=...
VITE_FIREBASE_AUTH_DOMAIN=nmct-4d2a9.firebaseapp.com
VITE_FIREBASE_DATABASE_URL=https://nmct-4d2a9-default-rtdb.firebaseio.com
VITE_FIREBASE_PROJECT_ID=nmct-4d2a9
VITE_FIREBASE_STORAGE_BUCKET=nmct-4d2a9.firebasestorage.app
VITE_FIREBASE_MESSAGING_SENDER_ID=478244762156
VITE_FIREBASE_APP_ID=1:478244762156:web:b9a7f325a363ceac609789
```

⚠️ لا تكتب قيمة مثل `@secret:GOOGLE_API_KEY` — هذه ليست قيمة صحيحة وستكسر الاتصال.
اكتب المفتاح الحقيقي كاملاً أو احذف المتغير نهائياً.

## 4) قواعد Firebase (الحماية الحقيقية)
1. Firebase Console → Realtime Database → **Rules**.
2. امسح المحتوى والصق محتوى `database.rules.json` كاملاً → **Publish**.
3. Authentication → أنشئ/سجّل حسابك ثم انسخ **User UID**.
4. Realtime Database → Data → أنشئ عقدة `admins` وبداخلها `<UID>` = `true`.

## 5) تحقق بعد النشر
- الصفحة الرئيسية تفتح (ليست 404).
- صفحة الدفع: رمز الدولة الافتراضي 🇴🇲 +968.
- لوحة التحكم: أضف مخزوناً حقيقياً ثم اضغط "تم التسليم" → يصل الكود في "طلباتي" وعلى واتساب.
