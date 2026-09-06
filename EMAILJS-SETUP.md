# إشعارات الإيميل في NMCT (EmailJS) — دليل كامل

كل طلب جديد (دفع مباشر أو من المحفظة) وكل طلب شحن رصيد يرسل إشعاراً على الإيميل.
**المستلم يُحدَّد من حقل `To Email` داخل قالب EmailJS** — الكود لا يرسل أي عنوان،
فأي إيميل تكتبه في القالب هو الذي يستلم.

## 1) بيانات الحساب المستخدمة في الكود

الملف: `src/lib/emailjs.ts`

| الحقل | القيمة |
|---|---|
| Service ID | `service_tesvz7c` (Gmail) |
| Public Key | `RtCOXQMy0AbQ0-VZ6` |
| Private Key | لا يوضع في المتصفح إطلاقاً — اتركه في لوحة EmailJS فقط |
| قالب الطلبات | `nmct_new_order` |
| قالب شحن الرصيد | `nmct_new_topup` |

مهم في لوحة EmailJS ▸ Account ▸ API Settings:
اتركوا خيار **Use Private Key** مُعطّلاً (لأن الإرسال يتم من المتصفح بالمفتاح العام).
وفي Account ▸ Domains أضِف نطاق موقعك، مثال: `https://nmct.netlify.app`
(وأيضاً `http://localhost:8080` أثناء التجربة).

## 2) القالب الأول — طلب جديد

EmailJS ▸ Email Templates ▸ Create New Template

| الحقل | القيمة |
|---|---|
| Template Name | NMCT — طلب جديد |
| Template ID | `nmct_new_order` |
| Subject | `🎉 طلب جديد #{{order_number}} — {{total_price}}` |
| To Email | **إيميلك** (مثال: you@gmail.com) |
| From Name | `{{from_name}}` |
| From Email | Use default email address |
| Reply To | `{{reply_to}}` |
| Content | الصق كامل محتوى الملف `emailjs-template-new-order.html` في Code Editor |

المتغيرات المتاحة: `store_name`, `store_logo`, `site_url`, `from_name`, `orders_url`,
`status_title`, `order_number`, `order_date`, `customer_name`, `sender_name`,
`sender_phone`, `customer_email`, `reply_to`, `products_list`, `items_count`,
`subtotal_price`, `discount_line`, `delivery_line`, `total_price`, `payment_method`,
`amount_to_pay`, `card_numbers`, `notes`, `receipt_image`, `receipt_url`.

## 3) القالب الثاني — طلب شحن رصيد

| الحقل | القيمة |
|---|---|
| Template Name | NMCT — طلب شحن رصيد |
| Template ID | `nmct_new_topup` |
| Subject | `💰 طلب شحن رصيد #{{order_number}} — {{amount}}` |
| To Email | **إيميلك** |
| From Name | `{{from_name}}` |
| Reply To | `{{reply_to}}` |
| Content | الصق محتوى `emailjs-template-new-topup.html` |

المتغيرات: نفس السابق + `amount`, `package_name`.

## 4) الكود (سكريبت الإشعارات)

- `src/lib/emailjs.ts` — الإعدادات + المرسل الموحّد + بناء بيانات القالب
  (`sendEmail`, `emailNewOrder`, `emailTestOrder`).
- `src/lib/db.ts` ▸ `notifyNewOrder` → يستدعي `emailNewOrder` مع كل طلب جديد.
- `src/lib/wallet.ts` ▸ `notifyWalletOrder` و `notifyNewTopup` → إشعار الإيميل كذلك.
- لوحة التحكم ▸ الإعدادات ▸ قسم «إشعارات الإيميل (EmailJS)» فيه زر **إرسال إيميل تجريبي**.

الإشعار يعمل بالتوازي مع إشعارات الواتساب ولا يؤثر عليها: لو فشل الإيميل يستمر الطلب طبيعياً.

## 5) الاختبار

1. انشر الموقع (أو شغّله محلياً) وافتح لوحة التحكم ▸ الإعدادات.
2. اضغط «إرسال إيميل تجريبي» — يجب أن تصلك رسالة على الإيميل المكتوب في `To Email`.
3. لو ظهر خطأ 403/Forbidden: أضف نطاق الموقع في EmailJS ▸ Account ▸ Domains.
