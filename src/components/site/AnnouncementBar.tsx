import { useAnnouncements } from "@/hooks/use-store-data";
import { useI18n } from "@/lib/i18n";

export function AnnouncementBar() {
  const items = useAnnouncements();
  const { lang } = useI18n();
  const list = items.map((a) => (lang === "en" && a.textEn ? a.textEn : a.text)).filter(Boolean);
  if (list.length === 0) return null;
  const loop = [...list, ...list];

  return (
    <div className="overflow-hidden border-b border-primary/20 bg-primary/8 py-2">
      <div className="flex w-max animate-marquee gap-10 whitespace-nowrap px-6">
        {loop.map((txt, i) => (
          <span key={i} className="font-display text-sm text-primary">
            {txt}
          </span>
        ))}
      </div>
    </div>
  );
}