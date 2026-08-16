# تأمين قاعدة البيانات + النشر على Netlify

## 1) رفع قواعد الحماية
1. افتح Firebase Console → Realtime Database → **Rules**.
2. الصق محتوى الملف `database.rules.json` كاملاً ثم **Publish**.

## 2) تحديد المدراء (مهم جداً)
القواعد تعتمد على عقدة `admins` داخل قاعدة البيانات. أضفها يدوياً من الكونسول:

```json
"admins": {
  "acRbPLo68QUy6KuX39QwYtOAius2": true,
  "0sbeBxzfneV9ugg4QrEMFhSqB8A3": true,
  "RomacPc4tENsaLcuj8qDnhsCyAu2": true
}
```
أي UID غير موجود هنا لا يستطيع الكتابة على المنتجات أو الطلبات أو رؤية المخزون.

## 3) ماذا صار محمياً؟
- **المخزون السري** (الأكواد/الصور) انتقل من `products/{id}/units` إلى مسار مستقل `stock/{productId}` وقراءته وكتابته **للمدير فقط**.
- لم تعد الأكواد تُنسخ إطلاقاً داخل عقدة المنتجات العامة (`products/{id}/codes` تبقى فارغة).
- **الطلبات**: القائمة الكاملة للمدير فقط. العميل يقرأ فقط عبر استعلام مطابق تماماً (uid الخاص به / معرّف جهازه / رقم هاتفه).
- **الحالة والأكواد المُسلَّمة** لا يمكن تعديلها إلا من حساب مدير؛ الزائر يستطيع إنشاء طلب بحالة `pending` فقط.
- **المستخدمون**: كل مستخدم يقرأ ملفه فقط، والحظر (`banned`) للمدير فقط.
- **أكواد الخصم**: للمسجلين فقط، والإنشاء/الحذف للمدير.
- الإحصائيات والزيارات: كتابة عدّاد فقط، والقراءة للمدير.

> ملاحظة: الدخول للوحة التحكم عبر مفتاح نصي (`admin/key`) لم يعد مقروءاً للعامة — استخدم تسجيل الدخول بجوجل بحساب موجود في `admins`.

## 4) متغيرات Netlify (اختيارية)
Site settings → Environment variables:

| المتغير | مثال |
| --- | --- |
| `VITE_FIREBASE_API_KEY` | AIza… |
| `VITE_FIREBASE_AUTH_DOMAIN` | your-app.firebaseapp.com |
| `VITE_FIREBASE_DATABASE_URL` | https://your-app-default-rtdb.firebaseio.com |
| `VITE_FIREBASE_PROJECT_ID` | your-app |
| `VITE_FIREBASE_STORAGE_BUCKET` | your-app.firebasestorage.app |
| `VITE_FIREBASE_MESSAGING_SENDER_ID` | 4782… |
| `VITE_FIREBASE_APP_ID` | 1:478…:web:… |
| `VITE_FIREBASE_MEASUREMENT_ID` | G-XXXX |

بدون هذه المتغيرات يستخدم المشروع إعدادات مشروعك الحالي تلقائياً.

## 5) النشر
Netlify يبني تلقائياً بالأمر الموجود في `netlify.toml`:

```
bun run build:static
```
مجلد النشر: `dist-static`.

## 6) قبل الإطلاق
- في Firebase Authentication → Settings → **Authorized domains** أضف دومين Netlify.
- في Firebase → App Check (اختياري لكنه ينصح به) لمنع الاستخدام الآلي.
