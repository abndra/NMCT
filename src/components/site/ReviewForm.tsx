import { useState } from "react";
import { toast } from "sonner";
import { Loader2, Star } from "lucide-react";

import { Button } from "@/components/ui/button";
import { useI18n } from "@/lib/i18n";
import { addReview } from "@/lib/db";

/** نموذج تقييم من 5 نجوم + تعليق — لا يُنشر إلا بعد موافقة الإدارة. */
export function ReviewForm() {
  const { lang } = useI18n();
  const ar = lang === "ar";
  const [name, setName] = useState("");
  const [rating, setRating] = useState(5);
  const [hover, setHover] = useState(0);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (name.trim().length < 2) {
      toast.error(ar ? "أدخل اسمك" : "Enter your name");
      return;
    }
    if (text.trim().length < 3) {
      toast.error(ar ? "اكتب تعليقك" : "Write your comment");
      return;
    }
    setBusy(true);
    try {
      await addReview({ name: name.trim(), rating, text: text.trim(), approved: false });
      setDone(true);
      setName("");
      setText("");
      setRating(5);
      toast.success(ar ? "تم إرسال تقييمك للمراجعة" : "Review sent for approval");
    } catch (err) {
      toast.error((ar ? "تعذر الإرسال: " : "Could not send: ") + (err as Error).message);
    }
    setBusy(false);
  }

  return (
    <form onSubmit={submit} className="rounded-2xl glass-panel p-5">
      <h3 className="font-display text-lg">{ar ? "أضف تقييمك" : "Leave a review"}</h3>
      <p className="mt-1 text-xs text-muted-foreground">
        {ar
          ? "تقييمك يظهر في الموقع بعد موافقة الإدارة."
          : "Your review appears once an admin approves it."}
      </p>

      <div className="mt-4 flex gap-1">
        {[1, 2, 3, 4, 5].map((n) => (
          <button
            key={n}
            type="button"
            onClick={() => setRating(n)}
            onMouseEnter={() => setHover(n)}
            onMouseLeave={() => setHover(0)}
            aria-label={`${n}`}
            className="p-1"
          >
            <Star
              className={`size-7 ${
                n <= (hover || rating) ? "fill-accent text-accent" : "text-muted-foreground"
              }`}
            />
          </button>
        ))}
      </div>

      <input
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder={ar ? "اسمك" : "Your name"}
        className="mt-4 h-12 w-full rounded-xl border border-border bg-background/60 px-3 text-sm outline-none focus:border-primary"
      />
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        rows={4}
        placeholder={ar ? "اكتب تعليقك..." : "Write your comment..."}
        className="mt-3 w-full rounded-xl border border-border bg-background/60 p-3 text-sm outline-none focus:border-primary"
      />

      <Button type="submit" disabled={busy} className="mt-4 h-12 w-full font-display">
        {busy && <Loader2 className="animate-spin" />}
        {ar ? "إرسال التقييم" : "Submit review"}
      </Button>

      {done && (
        <p className="mt-3 text-center text-xs text-primary">
          {ar ? "شكراً! تقييمك بانتظار الموافقة." : "Thanks! Your review awaits approval."}
        </p>
      )}
    </form>
  );
}
