import { createContext, useContext, useEffect, useState, type ReactNode } from "react";

export type Lang = "ar" | "en";

const dict = {
  ar: {
    brand: "NMCT",
    tagline: "شرائح إنترنت eSIM، تطبيقات بلس، وحسابات رقمية — تسليم فوري",
    heroTitle: "منتجات رقمية أسطورية بين يديك",
    heroSub: "شرائح eSIM لا محدودة، تطبيقات بلس للآيفون والآيباد، حسابات وبطاقات رقمية — تسليم فوري على واتساب بعد الدفع.",
    shopNow: "تسوّق الآن",
    exploreCats: "تصفح الأقسام",
    home: "الرئيسية",
    store: "المتجر",
    orders: "طلباتي",
    wishlist: "المفضلة",
    cart: "السلة",
    checkout: "إتمام الطلب",
    trackOrders: "تتبّع طلباتك",
    trackHint: "أدخل رقم الهاتف الذي استخدمته عند الطلب",
    track: "عرض الطلبات",
    enterPhone: "أدخل رقم الهاتف",
    search: "ابحث عن منتج...",
    categories: "الأقسام",
    mostWanted: "الأكثر طلباً",
    mostWantedSub: "المنتجات الأكثر طلباً هذا الأسبوع",
    newArrivals: "وصل حديثاً",
    dailyOffers: "عروض اليوم",
    allProducts: "كل المنتجات",
    reviews: "آراء العملاء",
    faq: "الأسئلة الشائعة",
    addToCart: "أضف للسلة",
    added: "تمت الإضافة للسلة",
    outOfStock: "غير متوفر",
    total: "الإجمالي",
    subtotal: "المجموع",
    discount: "الخصم",
    emptyCart: "سلتك فارغة",
    continueShopping: "متابعة التسوق",
    qty: "الكمية",
    remove: "حذف",
    name: "الاسم",
    phone: "رقم الهاتف",
    email: "البريد الإلكتروني",
    note: "ملاحظة",
    couponCode: "كود الخصم",
    apply: "تطبيق",
    placeOrder: "تأكيد الطلب",
    orderPlaced: "تم إرسال طلبك بنجاح",
    noOrders: "لا توجد طلبات بهذا الرقم",
    status: "الحالة",
    details: "التفاصيل",
    off: "خصم",
    sold: "طلب",
    currency: "ر.ع",
    rights: "جميع الحقوق محفوظة",
    invalidCoupon: "كود غير صالح",
    couponApplied: "تم تطبيق الخصم",
    fillFields: "يرجى تعبئة الاسم ورقم الهاتف",
    viewAll: "عرض الكل",
    filters: "تصفية",
    sortNew: "الأحدث",
    sortPriceUp: "السعر: الأقل أولاً",
    sortPriceDown: "السعر: الأعلى أولاً",
    sortPopular: "الأكثر طلباً",
    noProducts: "لا توجد منتجات",
    connecting: "جارٍ تحميل المنتجات...",
  },
  en: {
    brand: "NMCT",
    tagline: "Games, discs and top-up cards — at gamer prices",
    heroTitle: "Original game discs & digital top-up cards",
    heroSub: "Latest PS5, Xbox, Nintendo and PC titles — genuine discs and instant top-up cards delivered across Oman.",
    shopNow: "Shop now",
    exploreCats: "Browse categories",
    home: "Home",
    store: "Store",
    orders: "My orders",
    wishlist: "Wishlist",
    cart: "Cart",
    checkout: "Checkout",
    trackOrders: "Track your orders",
    trackHint: "Enter the phone number you used when ordering",
    track: "Show orders",
    enterPhone: "Enter phone number",
    search: "Search for a game...",
    categories: "Categories",
    mostWanted: "Most Wanted",
    mostWantedSub: "What every player is ordering this week",
    newArrivals: "New arrivals",
    dailyOffers: "Today's deals",
    allProducts: "All products",
    reviews: "Player reviews",
    faq: "FAQ",
    addToCart: "Add to cart",
    added: "Added to cart",
    outOfStock: "Out of stock",
    total: "Total",
    subtotal: "Subtotal",
    discount: "Discount",
    emptyCart: "Your cart is empty",
    continueShopping: "Continue shopping",
    qty: "Qty",
    remove: "Remove",
    name: "Name",
    phone: "Phone",
    email: "Email",
    note: "Note",
    couponCode: "Coupon code",
    apply: "Apply",
    placeOrder: "Place order",
    orderPlaced: "Your order was sent successfully",
    noOrders: "No orders for this number",
    status: "Status",
    details: "Details",
    off: "OFF",
    sold: "orders",
    currency: "OMR",
    rights: "All rights reserved",
    invalidCoupon: "Invalid code",
    couponApplied: "Discount applied",
    fillFields: "Please fill in name and phone",
    viewAll: "View all",
    filters: "Filters",
    sortNew: "Newest",
    sortPriceUp: "Price: low to high",
    sortPriceDown: "Price: high to low",
    sortPopular: "Most wanted",
    noProducts: "No products",
    connecting: "Loading products...",
  },
} as const;

export type TKey = keyof (typeof dict)["ar"];

type Ctx = {
  lang: Lang;
  dir: "rtl" | "ltr";
  t: (k: TKey) => string;
  setLang: (l: Lang) => void;
  toggle: () => void;
};

const I18nContext = createContext<Ctx | null>(null);

export function I18nProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Lang>("ar");

  useEffect(() => {
    const saved = (typeof localStorage !== "undefined" && localStorage.getItem("gp_lang")) as Lang | null;
    if (saved === "ar" || saved === "en") setLangState(saved);
  }, []);

  useEffect(() => {
    const dir = lang === "ar" ? "rtl" : "ltr";
    document.documentElement.setAttribute("dir", dir);
    document.documentElement.setAttribute("lang", lang);
    try {
      localStorage.setItem("gp_lang", lang);
    } catch {
      /* ignore */
    }
  }, [lang]);

  const value: Ctx = {
    lang,
    dir: lang === "ar" ? "rtl" : "ltr",
    t: (k) => dict[lang][k] ?? String(k),
    setLang: setLangState,
    toggle: () => setLangState((l) => (l === "ar" ? "en" : "ar")),
  };

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n() {
  const ctx = useContext(I18nContext);
  if (!ctx) throw new Error("useI18n must be used inside I18nProvider");
  return ctx;
}

export function localized<T extends { name: string; nameEn?: string }>(item: T, lang: Lang) {
  return lang === "en" && item.nameEn ? item.nameEn : item.name;
}