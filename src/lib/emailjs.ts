/* ============================================================
   NMCT — نظام إشعارات الإيميل (EmailJS)
   ------------------------------------------------------------
   المرجع الوحيد لكل بيانات EmailJS في الموقع.
   المستلم (To Email) يُحدَّد من داخل قالب EmailJS نفسه:
   https://dashboard.emailjs.com/admin/templates
   لذلك لا نرسل من الكود أي حقل to_email — أي إيميل تكتبه في
   حقل "To Email" داخل القالب هو الذي يستلم الإشعارات.
   ============================================================ */
import emailjs from "@emailjs/browser";
import type { Order, OrderItem } from "./db";
import type { TopupRequest } from "./wallet";

export const EMAILJS = {
  SERVICE_ID: "service_tesvz7c",
  PUBLIC_KEY: "RtCOXQMy0AbQ0-VZ6",
  /** القالب الذي يصل للأدمن عند كل طلب جديد */
  TEMPLATE_NEW_ORDER: "nmct_new_order",
  /** القالب الذي يصل للأدمن عند كل طلب شحن رصيد */
  STORE_NAME: "NMCT",
  SITE_URL: "https://nmct.netlify.app",
  STORE_LOGO: "https://nmct.netlify.app/favicon.png",
  FROM_NAME: "NMCT",
};

export type EmailResult = { ok: boolean; error?: string };

let ready = false;
function init() {
  if (ready) return;
  try {
    emailjs.init({ publicKey: EMAILJS.PUBLIC_KEY });
    ready = true;
  } catch {
    /* المكتبة تعمل أيضاً بتمرير المفتاح العام مع كل إرسال */
  }
}

/** مرسل موحّد — يضيف بيانات المتجر تلقائياً لكل رسالة. */
export async function sendEmail(
  templateId: string,
  params: Record<string, string>,
): Promise<EmailResult> {
  if (typeof window === "undefined") return { ok: false, error: "browser only" };
  try {
    init();
    await emailjs.send(
      EMAILJS.SERVICE_ID,
      templateId,
      {
        store_name: EMAILJS.STORE_NAME,
        store_logo: EMAILJS.STORE_LOGO,
        site_url: EMAILJS.SITE_URL,
        from_name: EMAILJS.FROM_NAME,
        orders_url: EMAILJS.SITE_URL + "/admin",
        ...params,
      },
      { publicKey: EMAILJS.PUBLIC_KEY },
    );
    return { ok: true };
  } catch (e) {
    const err = e as { text?: string; message?: string };
    return { ok: false, error: err?.text || err?.message || "فشل إرسال الإيميل" };
  }
}

function money(n: number | undefined) {
  return (Number(n) || 0).toFixed(3) + " ر.ع";
}

function arDate(ts?: number) {
  const d = ts ? new Date(ts) : new Date();
  return d.toLocaleString("ar-EG", {
    year: "numeric",
    month: "long",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function productsList(items: OrderItem[] | undefined) {
  if (!items?.length) return "لا توجد منتجات";
  return items
    .map((i) => {
      const lines = [`▪ ${i.name} × ${i.qty} — ${money(i.price * i.qty)}`];
      if (i.size) lines.push(`   📏 ${i.size}`);
      return lines.join("\n");
    })
    .join("\n");
}

function itemsCount(items: OrderItem[] | undefined) {
  return String((items || []).reduce((s, i) => s + (Number(i.qty) || 0), 0));
}

/** بارامترات قالب الطلب الجديد. */
export function orderEmailParams(order: Order, orderNo: string, statusTitle: string) {
  return {
    status_title: statusTitle,
    order_number: orderNo,
    order_date: arDate(order.createdAt),
    customer_name: order.customerName || order.username || "-",
    sender_name: order.senderName || order.customerName || "-",
    sender_phone: String(order.phone || "-"),
    customer_email: order.email || "-",
    reply_to: order.email || "",
    products_list: productsList(order.items),
    items_count: itemsCount(order.items),
    subtotal_price: money(order.subtotal ?? order.total),
    discount_line: order.discountAmount
      ? `كود ${order.discountCode || "-"} — خصم ${money(order.discountAmount)}`
      : "لا يوجد خصم",
    delivery_line: order.deliveryMethod === "digital" ? "تسليم رقمي فوري" : "توصيل",
    total_price: money(order.total),
    payment_method: order.paymentMethodName || order.paymentMethod || "-",
    amount_to_pay: order.amountToPay ? `${order.amountToPay} ${order.paymentCurrency || ""}` : "-",
    card_numbers: order.cardNumbers?.length ? order.cardNumbers.join(" | ") : "لا يوجد",
    notes: order.note || "لا توجد ملاحظات",
    receipt_image: order.receiptImage || order.paymentProof || "",
    receipt_url: order.receiptImage || order.paymentProof || "",
  };
}

/** إشعار الأدمن بالإيميل عند طلب جديد (دفع مباشر أو من المحفظة). */
export async function emailNewOrder(order: Order, orderNo: string): Promise<EmailResult> {
  const paidFromWallet = (order as Order & { paidFromWallet?: boolean }).paidFromWallet;
  const title = paidFromWallet
    ? "🛒 طلب جديد — مدفوع من الرصيد"
    : "🎉 طلب جديد — بانتظار مراجعة الدفع";
  return sendEmail(EMAILJS.TEMPLATE_NEW_ORDER, orderEmailParams(order, orderNo, title));
}

/** إشعار الأدمن بالإيميل عند طلب شحن رصيد جديد. */
export async function emailNewTopup(
  t: Omit<TopupRequest, "id">,
  no: string,
): Promise<EmailResult> {
  return sendEmail(EMAILJS.TEMPLATE_NEW_ORDER, {
    status_title: "💰 طلب شحن رصيد جديد",
    products_list: `شحن رصيد — ${t.packageName || money(t.amount)}`,
    items_count: "1",
    subtotal_price: money(t.amount),
    total_price: money(t.amount),
    order_number: no,
    order_date: arDate(t.createdAt),
    customer_name: t.userName || "-",
    sender_phone: String(t.phone || "-"),
    customer_email: t.email || "-",
    reply_to: t.email || "",
    amount: money(t.amount),
    package_name: t.packageName || "-",
    payment_method: t.paymentMethodName || t.paymentMethod || "-",
    amount_to_pay: t.amountToPay ? `${t.amountToPay} ${t.paymentCurrency || ""}` : "-",
    card_numbers: t.cardNumbers?.length ? t.cardNumbers.join(" | ") : "لا يوجد",
    notes: t.note || "لا توجد ملاحظات",
    receipt_image: t.receiptImage || "",
    receipt_url: t.receiptImage || "",
  });
}

/** زر الاختبار في لوحة التحكم — يرسل طلباً تجريبياً للإيميل. */
export async function emailTestOrder(): Promise<EmailResult> {
  return sendEmail(EMAILJS.TEMPLATE_NEW_ORDER, {
    status_title: "🧪 رسالة اختبار — طلب تجريبي",
    order_number: "TEST-" + Math.floor(Math.random() * 9000 + 1000),
    order_date: arDate(),
    customer_name: "زبون تجريبي",
    sender_name: "زبون تجريبي",
    sender_phone: "+96897329207",
    customer_email: "test-customer@example.com",
    reply_to: "test-customer@example.com",
    products_list: "▪ اشتراك تجريبي × 1 — 5.000 ر.ع\n   📏 شهر واحد",
    items_count: "1",
    subtotal_price: "5.000 ر.ع",
    discount_line: "لا يوجد خصم",
    delivery_line: "تسليم رقمي فوري",
    total_price: "5.000 ر.ع",
    payment_method: "تحويل بنكي",
    amount_to_pay: "5.000 OMR",
    card_numbers: "لا يوجد",
    notes: "هذه رسالة اختبار من لوحة التحكم ✅",
    receipt_image: "",
    receipt_url: "",
  });
}
