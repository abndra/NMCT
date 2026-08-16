import { Link } from "@tanstack/react-router";
import { siteLogo } from "@/lib/assets";
import { useI18n } from "@/lib/i18n";
import { CONTACT, SocialLinks } from "@/components/site/Social";

export function Footer() {
  const { t, lang } = useI18n();
  return (
    <footer className="mt-24 border-t border-border bg-card/40">
      <div className="mx-auto grid max-w-7xl gap-8 px-4 py-12 sm:grid-cols-3">
        <div className="space-y-3">
          <img src={siteLogo} alt="NMCT" className="h-14 w-auto" />
          <p className="max-w-xs text-sm text-muted-foreground">{t("tagline")}</p>
        </div>
        <div className="space-y-2">
          <h3 className="font-display text-lg text-primary">{t("store")}</h3>
          <Link to="/store" className="block text-sm text-muted-foreground hover:text-foreground">
            {t("allProducts")}
          </Link>
          <Link to="/orders" className="block text-sm text-muted-foreground hover:text-foreground">
            {t("orders")}
          </Link>
        </div>
        <div className="space-y-2">
          <h3 className="font-display text-lg text-primary">
            {lang === "ar" ? "تواصل معنا" : "Contact"}
          </h3>
          <a
            href={CONTACT.whatsapp}
            target="_blank"
            rel="noreferrer"
            dir="ltr"
            className="block text-sm text-muted-foreground hover:text-foreground ltr:text-start rtl:text-end"
          >
            WhatsApp: {CONTACT.phone}
          </a>
          <a
            href={CONTACT.instagram}
            target="_blank"
            rel="noreferrer"
            dir="ltr"
            className="block text-sm text-muted-foreground hover:text-foreground ltr:text-start rtl:text-end"
          >
            Instagram: {CONTACT.instagramHandle}
          </a>
          <SocialLinks className="pt-2" />
        </div>
      </div>
      <div className="border-t border-border py-4 text-center font-tech text-xs text-muted-foreground">
        © {new Date().getFullYear()} NMCT — {t("rights")}
      </div>
    </footer>
  );
}