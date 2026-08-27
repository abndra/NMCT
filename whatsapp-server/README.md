# سيرفر واتساب NMCT + التسليم الفوري (Railway)

واتساب عادي عبر مسح QR (Baileys) — بدون WhatsApp Business API وبدون أي رسوم لكل رسالة.

> ⚠️ **مهم:** السيرفر الآن **ملف واحد فقط** `index.js` (لا يوجد `deliver.js` ولا أي استيراد محلي).
> إن كان مستودعك على GitHub يحتوي نسخة قديمة، احذف `deliver.js` منه واستبدل `index.js`
> و`package.json` بالنسختين الجديدتين ثم أعد النشر — هذا يحل خطأ
> `Cannot find module '/app/deliver.js'` نهائياً.

## الرفع على Railway
1. حمّل ZIP من لوحة التحكم (يحتوي: `index.js`, `package.json`, `README.md`, `railway.json`, `Procfile`, `.gitignore`) وارفع الملفات **في جذر المستودع** على GitHub ثم Railway › Deploy from GitHub.
2. Variables:
   - `TOKEN` = كلمة سر تخترعها (نفسها تُدخل في لوحة تحكم الموقع).
   - `ADMIN_NUMBER` = رقمك بصيغة دولية بدون + مثال `9689xxxxxxx`
   - `SESSION_DIR` = `/data/session`
   - `FIREBASE_DB_SECRET` = سر قاعدة البيانات (انظر أدناه) — لتفعيل التسليم الفوري.
   - `FIREBASE_DB_URL` (اختياري) = `https://nmct-4d2a9-default-rtdb.firebaseio.com`
   - `FIREBASE_API_KEY` (اختياري) = مفتاح الويب، مضبوط مسبقاً داخل الكود.
   - `STORE_NAME` (اختياري) = اسم المتجر في الرسائل.
3. أضف Volume على المسار `/data` (يحفظ الجلسة فلا يطلب QR بعد كل إعادة تشغيل).
4. افتح `https://<app>.up.railway.app/qr` وامسح الكود من واتساب › الأجهزة المرتبطة.
5. لوحة تحكم الموقع › الإعدادات › ضع الرابط والتوكن ثم «فحص الحالة».

## ⚡ التسليم الفوري — لا يحتاج Service Account
الكود القديم كان يحتاج مفتاح Service Account (ملف JSON)، وفايربيز عندك يرفض توليده
(`Failed to generate a private key`). النسخة الجديدة **لا تحتاجه**؛ تستخدم REST مع:

### من أين تجيب `FIREBASE_DB_SECRET`
Firebase Console › ⚙️ Project settings › **Service accounts** › قسم **Database secrets**
(أسفل الصفحة، قد يظهر باسم Legacy credentials) › اضغط **Show** بجانب السر ثم انسخه.
سلسلة طويلة مثل `xY3k...`. الصقها في Railway باسم `FIREBASE_DB_SECRET`.

ملاحظة: الشيفرة التي أرسلتها من فايربيز (`var admin = require("firebase-admin") ...`)
ليست المفتاح — هي مثال كود فقط، ولا نحتاجها إطلاقاً الآن.

### كيف يعمل
- بعد خصم المبلغ من الرصيد وإنشاء الطلب، يستدعي الموقع `POST /deliver { idToken, orderId }`.
- السيرفر يتحقق من هوية العميل عبر Identity Toolkit، ويتأكد أن الطلب له ومدفوع من الرصيد،
  ثم يحجز القطع من `stock/{productId}` بكتابة شرطية (ETag) فلا تُباع القطعة مرتين،
  ويحدّث الطلب إلى **تم التسليم** مع الأكواد، ويرسل الأكواد للعميل وإشعاراً لك.
- إن لم يُضبط `FIREBASE_DB_SECRET` يرد 501 ويبقى الطلب "مدفوع" في لوحة التحكم للتسليم اليدوي.
- نقص جزئي في المخزون: يُسلَّم المتوفر ويبقى الطلب "جاري إكمال التسليم" ويصلك تنبيه.

## التكلفة
~300–400MB RAM و CPU شبه معدوم ⇒ عملياً 3–5$ شهرياً، والرسائل مجانية بالكامل.
