# NMCT — خدمة التحقق البنكي التلقائي (Railway)

خدمة API وسيطة مستقلة عن الموقع. وظيفتها:

1. استقبال طلبات التحقق من الموقع.
2. الاتصال الآمن بـ Gmail عبر **Google OAuth الرسمي** (صلاحية قراءة فقط `gmail.readonly`).
3. قراءة رسائل إشعارات البنك وتحليلها (المبلغ، المرجع، اسم المحوِّل، التاريخ).
4. مطابقة العملية مع طلب الشحن (نفس المبلغ + نفس المرجع + ضمن النافذة الزمنية).
5. قبول الطلب وإضافة الرصيد **مرة واحدة فقط**، أو إنهاء المهلة بعد 3 دقائق.

> لا تُخزَّن كلمة مرور Gmail أبداً. يُحفظ فقط refresh token **مشفّراً** (AES-256-GCM) في قاعدة البيانات،
> ولا يُسجَّل محتوى أي رسالة بنكية في السجلات.

---

## دورة العمل

```
العميل → إنشاء طلب شحن (status = verifying) → مهلة 3 دقائق
       → الخدمة تفحص Gmail كل 10 ثوانٍ → إشعار مطابق (المبلغ + المرجع)
       → حجز العملية البنكية في bank_verify/used_tx (لا تُستخدم مرتين)
       → status = approved → إضافة الرصيد مرة واحدة → سجل العمليات → تحديث واجهة العميل فوراً

لا يوجد تطابق خلال 3 دقائق → status = expired → لا يُضاف رصيد
```

---

## 1) إنشاء مشروع Google Cloud

1. افتح <https://console.cloud.google.com/> وسجّل بحساب Google الذي **تصله رسائل البنك**.
2. من الأعلى: **Select a project › New project** → اسم مثل `nmct-bank-verify` → **Create**.

## 2) تفعيل Gmail API

1. من القائمة: **APIs & Services › Library**.
2. ابحث عن **Gmail API** → **Enable**.

## 3) شاشة الموافقة (OAuth consent screen)

1. **APIs & Services › OAuth consent screen**.
2. User type: **External** → Create.
3. App name: `NMCT Bank Verify`، بريد الدعم، بريد المطوّر → Save.
4. **Scopes › Add or remove scopes** → أضف: `https://www.googleapis.com/auth/gmail.readonly` → Update → Save.
5. **Test users › Add users** → أضف بريد Gmail الذي تصله رسائل البنك (ما دام التطبيق في وضع Testing يمكن لهذا الحساب فقط الربط — وهذا مناسب تماماً لأنه حسابك أنت).

> ملاحظة: في وضع Testing تنتهي صلاحية الربط بعد 7 أيام في بعض الحالات؛ إن حدث ذلك اضغط "ربط Gmail" مجدداً، أو انشر التطبيق (Publish app) ليصبح الربط دائماً.

## 4) إنشاء OAuth Client

1. **APIs & Services › Credentials › Create credentials › OAuth client ID**.
2. Application type: **Web application**، الاسم: `nmct-bank-verify`.
3. **Authorized redirect URIs › Add URI** وضع:

```
https://<اسم-خدمتك>.up.railway.app/oauth/google/callback
```

(ستعرف الرابط بعد إنشاء الخدمة على Railway في الخطوة 5 — يمكنك الرجوع وإضافته لاحقاً.)

4. **Create** → انسخ **Client ID** و **Client secret**.

## 5) النشر على Railway

1. حمّل ملفات هذا المشروع من لوحة التحكم (زر **تحميل ملفات نظام التحقق**) وارفعها كما هي إلى مستودع GitHub جديد
   (أعد تسمية `gitignore.txt` إلى `.gitignore` و `env.example.txt` إلى `.env.example` — التحميل من اللوحة يفعل ذلك تلقائياً).
2. في <https://railway.app>: **New Project › Deploy from GitHub repo** → اختر المستودع.
3. **Settings › Networking › Generate Domain** → انسخ الرابط (مثل `https://nmct-bank-verify.up.railway.app`).
4. ارجع إلى Google Cloud وأضف `<الرابط>/oauth/google/callback` في Authorized redirect URIs.

## 6) متغيرات البيئة في Railway (Variables)

| المتغير | القيمة |
|---|---|
| `TOKEN` | كلمة سر طويلة تخترعها (نفسها تُكتب في لوحة التحكم) |
| `ENCRYPTION_KEY` | ناتج `openssl rand -hex 32` (64 حرفاً) |
| `GOOGLE_CLIENT_ID` | من الخطوة 4 |
| `GOOGLE_CLIENT_SECRET` | من الخطوة 4 |
| `PUBLIC_URL` | رابط خدمة Railway بدون `/` في النهاية |
| `SITE_URL` | رابط موقعك (مثل `https://nmct.netlify.app`) |
| `FIREBASE_DB_URL` | `https://nmct-4d2a9-default-rtdb.firebaseio.com` |
| `FIREBASE_DB_SECRET` | Firebase › Project settings › Service accounts › **Database secrets** |
| `FIREBASE_API_KEY` | مفتاح الويب (نفسه في الموقع — عام) |
| `VERIFY_WINDOW_MINUTES` | `3` |
| `MATCH_LOOKBACK_MINUTES` | `15` (كم دقيقة قبل إنشاء الطلب نقبل فيها وصول الإشعار) |
| `POLL_INTERVAL_SECONDS` | `10` |
| `GMAIL_SENDER` | (اختياري) بريد البنك المرسِل لتضييق البحث |
| `WA_SERVER_URL` / `WA_TOKEN` | (اختياري) لإرسال واتساب للعميل بعد نجاح الشحن |

بعد الحفظ يعيد Railway النشر تلقائياً. افتح `<الرابط>/health` — يجب أن ترى `{"ok":true,...}`.

## 7) ربط Railway مع الموقع

1. افتح الموقع → **لوحة التحكم › التحقق البنكي**.
2. الصق **رابط الخدمة** و **التوكن** (نفس `TOKEN`) → **حفظ** → **فحص الاتصال**.
   يُحفظ التوكن في مسار يقرؤه الأدمن فقط، بينما يُحفظ الرابط وحده كإعداد عام ليستطيع العميل إخطار الخدمة ببدء التحقق.
3. انشر ملف `database.rules.json` المحدَّث من مشروع الموقع إلى Firebase (Realtime Database › Rules).

## 8) ربط Gmail من لوحة التحكم

1. في نفس القسم اضغط **ربط حساب Gmail**.
2. سيُحوَّل المتصفح إلى Google → اختر الحساب الذي تصله رسائل البنك → وافق على صلاحية **قراءة الرسائل**.
3. تعود إلى لوحة التحكم ويظهر الحساب **متصل** مع البريد.
4. لإلغاء الربط اضغط **إلغاء الربط** (يلغي الصلاحية عند Google ويحذف الرمز المشفّر).

## 9) اختبار عملية تحقق تجريبية

1. في القسم اضغط **فحص قراءة الإشعارات**: يعرض عدد رسائل البنك التي وجدها وقرأها بنجاح (بيانات مقنّعة).
2. أرسل من حساب Gmail المربوط رسالة لنفسك بنص مطابق لرسالة البنك، مثلاً:

```
Your SAVINGS a/c XXXXXXX33424 is CREDITED OMR .001 on 18-09-2026 on account of Mobile Payment from TEST USER /75134243. Available balance in your a/c is OMR 178.453.
```

3. افتح الموقع كعميل → **شحن الرصيد** → المبلغ `0.001` والمرجع `75134243` → إرسال.
4. خلال ثوانٍ تتغير الحالة إلى **مقبول** ويُضاف الرصيد، ويظهر السجل في لوحة التحكم.
5. كرّر نفس الطلب بنفس المرجع: لن يُقبل (العملية مستخدمة) وستنتهي مهلته بعد 3 دقائق.

---

## نقاط الـ API

| الطريقة | المسار | الحماية | الوظيفة |
|---|---|---|---|
| GET | `/health` | عام | فحص الصحة |
| GET | `/status` | Bearer TOKEN | حالة الخدمة و Gmail والإحصائيات |
| POST | `/oauth/google/start` | Bearer TOKEN | يرجع رابط موافقة Google |
| GET | `/oauth/google/callback` | state موقّع | استلام الموافقة وحفظ الربط |
| POST | `/gmail/disconnect` | Bearer TOKEN | إلغاء الربط |
| GET | `/gmail/check` | Bearer TOKEN | اختبار قراءة الإشعارات |
| POST | `/verify/parse-test` | Bearer TOKEN | اختبار المحلّل على نص |
| POST | `/verify/start` | Firebase idToken للعميل | إخطار الخدمة بطلب جديد (تبدأ الفحص فوراً) |

الخدمة أيضاً تفحص قاعدة البيانات دورياً، لذا حتى لو أغلق العميل المتصفح يُستكمل التحقق أو تنتهي المهلة تلقائياً.

## الأمان

- OAuth رسمي وأقل صلاحية ممكنة (`gmail.readonly`) — لا كلمات مرور.
- refresh token مشفّر بـ `ENCRYPTION_KEY`، ولا يُقرأ من الموقع (قواعد Firebase تمنع قراءة `bank_verify/gmail`).
- لا يُسجَّل محتوى الرسائل؛ السجلات تحتوي المبلغ والمرجع المقنّع والاسم الأول فقط.
- كل عملية بنكية (معرّف رسالة Gmail) تُحجز في `bank_verify/used_tx` بكتابة شرطية قبل إضافة الرصيد → لا تكرار.
- تغيير حالة الطلب والرصيد يتم بكتابات شرطية (ETag) → لا إضافة مزدوجة حتى مع القبول اليدوي المتزامن.
- التوكن يُقارن بمقارنة زمنية ثابتة، و`state` الخاص بـ OAuth موقّع HMAC وصالح 10 دقائق فقط.
