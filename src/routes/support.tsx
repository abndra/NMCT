import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import { LifeBuoy, Send, Loader2 } from "lucide-react";

import { Layout } from "@/components/site/Layout";
import { ImageUploader } from "@/components/site/ImageUploader";
import { Button } from "@/components/ui/button";
import { useI18n } from "@/lib/i18n";
import { addSupportTicket } from "@/lib/db";

export const Route = createFileRoute("/support")({
  head: () => ({
    meta: [
      { title: "الدعم الفني | NMCT" },
      {
        name: "description",
        content: "أرسل مشكلتك لفريق دعم NMCT مع صورة ورقم تواصل وسنرد عليك بأسرع وقت.",
      },
      { property: "og:title", content: "الدعم الفني | NMCT" },
      {
        property: "og:description",
        content: "صفحة الدعم في متجر NMCT: أرسل صورة المشكلة ورقم تواصلك ووصف المشكلة.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: SupportPage,
});

const inputCls =
  "h-12 w-full rounded-xl border border-border bg-background/60 px-3 text-sm outline-none focus:border-primary";

function SupportPage() {
  const { lang } = useI18n();
  const ar = lang === "ar";

  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [message, setMessage] = useState("");
  const [images, setImages] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (phone.trim().length < 6) {
      toast.error(ar ? "أدخل رقم تواصل صحيح" : "Enter a valid contact number");
      return;
    }
    if (message.trim().length < 5) {
      toast.error(ar ? "اكتب تفاصيل المشكلة" : "Describe the problem");
      return;
    }
    setBusy(true);
    try {
      await addSupportTicket({
        name: name.trim(),
        phone: phone.trim(),
        message: message.trim(),
        image: images[0] || "",
      });
      setSent(true);
      setName("");
      setPhone("");
      setMessage("");
      setImages([]);
      toast.success(ar ? "تم إرسال المشكلة بنجاح" : "Your request was sent");
    } catch (err) {
      toast.error((ar ? "تعذر الإرسال: " : "Could not send: ") + (err as Error).message);
    }
    setBusy(false);
  }

  return (
    <Layout>
      <section className="mx-auto max-w-2xl px-4 py-12">
        <div className="flex items-center gap-3">
          <span className="grid size-12 place-items-center rounded-xl bg-primary text-primary-foreground">
            <LifeBuoy />
          </span>
          <div>
            <h1 className="font-display text-3xl">{ar ? "الدعم الفني" : "Support"}</h1>
            <p className="text-sm text-muted-foreground">
              {ar
                ? "أرسل مشكلتك مع صورة ورقم تواصل وسنعود إليك بأسرع وقت."
                : "Send your problem with a screenshot and a contact number."}
            </p>
          </div>
        </div>

        {sent && (
          <div className="mt-6 rounded-2xl border border-primary/40 bg-primary/10 p-4 text-sm">
            {ar
              ? "وصلتنا مشكلتك وسيتم التواصل معك على الرقم الذي أدخلته."
              : "We received your request and will contact you on the number you provided."}
          </div>
        )}

        <form onSubmit={submit} className="mt-6 space-y-5 rounded-2xl glass-panel p-5">
          <div className="space-y-2">
            <label className="font-display text-sm">{ar ? "الاسم (اختياري)" : "Name (optional)"}</label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              className={inputCls}
              placeholder={ar ? "اسمك" : "Your name"}
            />
          </div>

          <div className="space-y-2">
            <label className="font-display text-sm">{ar ? "رقم التواصل" : "Contact number"}</label>
            <input
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              dir="ltr"
              inputMode="tel"
              className={inputCls}
              placeholder="+968 ..."
            />
          </div>

          <div className="space-y-2">
            <label className="font-display text-sm">{ar ? "وصف المشكلة" : "Problem details"}</label>
            <textarea
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              rows={5}
              className="w-full rounded-xl border border-border bg-background/60 p-3 text-sm outline-none focus:border-primary"
              placeholder={ar ? "اشرح المشكلة بالتفصيل..." : "Describe your issue..."}
            />
          </div>

          <div className="space-y-2">
            <label className="font-display text-sm">{ar ? "صورة المشكلة" : "Problem screenshot"}</label>
            <ImageUploader images={images} onChange={setImages} folder="nmct/support" multiple={false} />
          </div>

          <Button type="submit" disabled={busy} className="h-12 w-full font-display">
            {busy ? <Loader2 className="animate-spin" /> : <Send />}
            {ar ? "إرسال المشكلة" : "Send request"}
          </Button>
        </form>
      </section>
    </Layout>
  );
}
