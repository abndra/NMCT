/* All site imagery is hosted on the third image database (Cloudinary: lk3acghf).
   The NMCT background + logo live locally / on Lovable assets. */
import bg from "@/assets/nmct-bg.jpg";
import logoImg from "@/assets/nmct-logo.png";
import catEsim from "@/assets/cat-esim.jpg";
import catApps from "@/assets/cat-apps.jpg";
import pEsim3 from "@/assets/p-esim-3.jpg";
import pEsim30 from "@/assets/p-esim-30.jpg";
import pIosPlus from "@/assets/p-ios-plus.jpg";
import pAccount from "@/assets/p-account.jpg";

const CDN = "https://res.cloudinary.com/lk3acghf/image/upload";

export const siteBackground = bg;
export const siteLogo = logoImg;

export const IMG = {
  logo: siteLogo,
  categoryConsoleGames: `${CDN}/v1786617767/gamepit/glr9pnomj897gzd7bccn.jpg`,
  categoryDigitalCards: `${CDN}/v1786617768/gamepit/ryhwwbebpaxjopdg2xca.jpg`,
  heroArena: `${CDN}/v1786617770/gamepit/v9ldj456ihj4r8uexnma.jpg`,
  productController: `${CDN}/v1786617771/gamepit/palxlalrp30yzoep2zhe.jpg`,
  productDesertOps: `${CDN}/v1786617772/gamepit/f7mmt1sxavhvxmqf2d3f.jpg`,
  productGiftCard: `${CDN}/v1786617772/gamepit/zbe7p3mhu88fpeettyhi.jpg`,
  productHeadset: `${CDN}/v1786617773/gamepit/ebigkzi5by9jcov6dj8o.jpg`,
  productIronArena: `${CDN}/v1786617774/gamepit/zxdkr9khsprg1xosttwu.jpg`,
  productNeonDrift: `${CDN}/v1786617775/gamepit/pkk0ne79zenpxlw38ema.jpg`,
  categoryEsim: catEsim,
  categoryApps: catApps,
  productEsim3: pEsim3,
  productEsim30: pEsim30,
  productIosPlus: pIosPlus,
  productAccount: pAccount,
} as const;

const byFilename: Record<string, string> = {
  "gamepit-logo.png": IMG.logo,
  "nmct-logo.png": IMG.logo,
  "category-console-games.jpg": IMG.categoryConsoleGames,
  "category-digital-cards.jpg": IMG.categoryDigitalCards,
  "hero-arena.jpg": IMG.heroArena,
  "product-neon-drift.jpg": IMG.productNeonDrift,
  "product-iron-arena.jpg": IMG.productIronArena,
  "product-desert-ops.jpg": IMG.productDesertOps,
  "product-gift-card.jpg": IMG.productGiftCard,
  "product-headset.jpg": IMG.productHeadset,
  "product-controller.jpg": IMG.productController,
  "gamepit-bg.jpg": bg,
  "nmct-bg.jpg": bg,
  "cat-esim.jpg": catEsim,
  "cat-apps.jpg": catApps,
  "p-esim-3.jpg": pEsim3,
  "p-esim-30.jpg": pEsim30,
  "p-ios-plus.jpg": pIosPlus,
  "p-account.jpg": pAccount,
};

/** Maps legacy CDN pointer URLs from the previous project to the current hosted images. */
export function resolveImage(url?: string): string | undefined {
  if (!url) return url;
  if (!url.startsWith("/__l5e/")) return url;
  const filename = url.split("/").pop() ?? "";
  return byFilename[filename] ?? url;
}
