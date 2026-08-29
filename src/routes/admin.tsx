import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import {
  ArrowLeft,
  ArrowRight,
  Boxes,
  Check,
  Download,
  FolderTree,

  LayoutDashboard,
  Megaphone,
  PackageCheck,
  Pencil,
  Percent,
  Plus,
  Server,
  Settings2,
  ShieldCheck,
  Trash2,
  TrendingUp,
  Users,
  Wallet,
  Bell,
  X,
} from "lucide-react";
import { Layout } from "@/components/site/Layout";
import { OrdersPanel } from "@/components/admin/OrdersPanel";
import { TopupsPanel } from "@/components/admin/TopupsPanel";
import { UsersPanel } from "@/components/admin/UsersPanel";
import { Button } from "@/components/ui/button";
import { useI18n } from "@/lib/i18n";
import { useCategories, useProducts, useSettings } from "@/hooks/use-store-data";
import { priceText } from "@/components/site/ProductCard";
import { ImageUploader } from "@/components/site/ImageUploader";
import { CLOUD_ACCOUNTS, getActiveCloudId, setActiveCloudId } from "@/lib/uploads";
import { downloadWhatsappServerZip } from "@/lib/zip";

import { useAuth, GoogleMark } from "@/lib/auth";
import {
  isAdminUid,
  addProduct,
  updateProduct,
  deleteProduct,
  hideProduct,
  addCategory,
  updateCategory,
  deleteCategory,
  onOrdersChange,
  acceptOrder,
  rejectOrder,
  deleteOrder,
  addAnnouncement,
  deleteAnnouncement,
  onAnnouncementsChange,
  addDiscountCode,
  deleteDiscountCode,
  onDiscountCodesChange,
  updateSettings,
  readPaymentMethods,
  savePaymentMethods,
  ensurePaymentMethods,
  type PaymentMethod,

  waServerStatus,
  waServerControl,
  sendWhatsAppTest,
  DEFAULT_COUNTRY_CODE,
  normalizeWaServerUrl,
  onOrdersSeenAtChange,
  markOrdersSeen,

  availableStock,
  isLowStock,
  isOutOfStock,
  seedDemoData,
  formatOrderNo,
  onProductsChange,
  unitList,
  onProductUnitsChange,
  getUnits,
  syncProductStock,
  syncAllDigitalProductStocks,
  addStockUnits,
  deleteStockUnit,
  updateStockUnit,
  migrateCodesToUnits,
  type StockUnit,
  type Order,
  type Product,
  type Category,
  type Announcement,
  type DiscountCode,
} from "@/lib/db";

export const Route = createFileRoute("/admin")({
  head: () => ({
    meta: [
      { title: "لوحة التحكم | NMCT" },
      { name: "description", content: "لوحة تحكم NMCT لإدارة المنتجات والطلبات والعروض." },
      { property: "og:title", content: "لوحة التحكم | NMCT" },
      { property: "og:description", content: "إدارة منتجات وطلبات متجر NMCT." },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: AdminPage,
});

const TABS = [
  "home",
  "products",
  "categories",
  "orders",
  "topups",
  "users",
  "coupons",
  "news",
  "settings",
  "clouds",
] as const;
type Tab = (typeof TABS)[number];

const TAB_LABELS: Record<Tab, [string, string]> = {
  home: ["الرئيسية", "Overview"],
  products: ["المنتجات", "Products"],
  categories: ["الأقسام", "Categories"],
  orders: ["الطلبات", "Orders"],
  topups: ["طلبات الشحن", "Top-ups"],
  users: ["المستخدمون", "Users"],
  coupons: ["أكواد الخصم", "Coupons"],
  news: ["الإعلانات", "Announcements"],
  settings: ["الإعدادات", "Settings"],
  clouds: ["قواعد الصور", "Image DBs"],
};

const TAB_ICONS: Record<Tab, React.ReactNode> = {
  home: <LayoutDashboard />,
  products: <Boxes />,
  categories: <FolderTree />,
  orders: <PackageCheck />,
  topups: <Wallet />,
  users: <Users />,
  coupons: <Percent />,
  news: <Megaphone />,
  settings: <Settings2 />,
  clouds: <Server />,
};

const HOME_SECTIONS = [
  { key: "bestseller", ar: "الأكثر طلباً", en: "Most wanted" },
  { key: "offer", ar: "عروض اليوم", en: "Today's deals" },
  { key: "new", ar: "وصل حديثاً", en: "New arrivals" },
] as const;

const inputCls =
  "h-12 w-full rounded-xl border border-border bg-background/60 px-3 text-sm outline-none focus:border-primary";
const cardCls = "rounded-2xl glass-panel p-5 space-y-3";

/** Counts orders created after the last time the admin opened the orders tab. */
function useNewOrdersCount() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [seenAt, setSeenAt] = useState(0);
  useEffect(() => onOrdersChange(setOrders), []);
  useEffect(() => onOrdersSeenAtChange(setSeenAt), []);
  return useMemo(
    () => orders.filter((o) => Number(o.createdAt) > seenAt).length,
    [orders, seenAt],
  );
}

function AdminPage() {

  const { lang } = useI18n();
  const { user, loading, signIn, signOut } = useAuth();
  const [allowed, setAllowed] = useState<boolean | null>(null);
  const [tab, setTab] = useState<Tab>("home");
  const newOrders = useNewOrdersCount();

  useEffect(() => {
    if (tab === "orders" && newOrders > 0) void markOrdersSeen();
  }, [tab, newOrders]);


  useEffect(() => {
    let alive = true;
    if (!user) {
      setAllowed(null);
      return;
    }
    void isAdminUid(user.uid).then((ok) => alive && setAllowed(ok));
    return () => {
      alive = false;
    };
  }, [user]);

  if (!user || allowed !== true)
    return (
      <Layout>
        <section className="mx-auto flex min-h-[72vh] max-w-md items-center px-4 py-16">
          <div className="w-full rounded-2xl border border-border bg-card/90 p-7 shadow-2xl backdrop-blur-xl">
            <div className="mx-auto grid size-14 place-items-center rounded-xl bg-primary text-primary-foreground">
              <ShieldCheck />
            </div>
            <h1 className="mt-5 text-center font-display text-3xl">
              {lang === "ar" ? "لوحة التحكم" : "Admin panel"}
            </h1>
            {!user ? (
              <>
                <p className="mt-2 text-center text-sm text-muted-foreground">
                  {lang === "ar"
                    ? "الدخول للوحة التحكم بحساب جوجل المصرّح له فقط"
                    : "Sign in with an authorized Google account"}
                </p>
                <button
                  onClick={() => void signIn()}
                  disabled={loading}
                  className="mt-6 inline-flex h-12 w-full items-center justify-center gap-3 rounded-xl border border-border bg-background font-display transition-colors hover:border-primary disabled:opacity-60"
                >
                  <GoogleMark />
                  {lang === "ar" ? "المتابعة بحساب جوجل" : "Continue with Google"}
                </button>
              </>
            ) : allowed === null ? (
              <p className="mt-4 text-center text-sm text-muted-foreground">
                {lang === "ar" ? "جارٍ التحقق..." : "Checking..."}
              </p>
            ) : (
              <>
                <p className="mt-3 text-center text-sm text-destructive">
                  {lang === "ar"
                    ? "هذا الحساب غير مصرّح له بالدخول للوحة التحكم."
                    : "This account is not allowed in the admin panel."}
                </p>
                <p className="mt-4 text-center text-xs text-muted-foreground">
                  {lang === "ar" ? "معرّف حسابك (UID)" : "Your account UID"}
                </p>
                <button
                  onClick={() => {
                    void navigator.clipboard?.writeText(user.uid);
                    toast.success(lang === "ar" ? "تم نسخ المعرّف" : "UID copied");
                  }}
                  dir="ltr"
                  className="mt-1 w-full truncate rounded-xl border border-border bg-background/60 px-3 py-2 font-tech text-xs"
                >
                  {user.uid}
                </button>
                <Button variant="ghost" onClick={() => void signOut()} className="mt-3 h-11 w-full">
                  {lang === "ar" ? "تسجيل الخروج" : "Sign out"}
                </Button>
              </>
            )}
          </div>
        </section>
      </Layout>
    );

  return (
    <Layout>
      <section className="mx-auto max-w-7xl px-4 py-8 pb-28 lg:pb-8">
        <div className="flex flex-wrap items-end justify-between gap-4 border-b border-border pb-6">
          <div>
            <p className="font-tech text-xs text-primary">NMCT CONTROL</p>
            <h1 className="mt-1 font-display text-3xl">
              {lang === "ar" ? "لوحة التحكم" : "Admin panel"}
            </h1>
          </div>
        </div>

        <div className="mt-6 grid gap-6 lg:grid-cols-[230px_1fr]">
          <nav className="hidden gap-2 lg:flex lg:flex-col">
            {TABS.map((tb) => (
              <Button
                key={tb}
                variant={tab === tb ? "default" : "ghost"}
                onClick={() => setTab(tb)}
                className="h-11 shrink-0 justify-start font-display"
              >
                {TAB_ICONS[tb]}
                {TAB_LABELS[tb][lang === "ar" ? 0 : 1]}
                {tb === "orders" && newOrders > 0 && (
                  <span className="ms-auto rounded-full bg-destructive px-2 py-0.5 font-tech text-[11px] text-white">
                    +{newOrders}
                  </span>
                )}
              </Button>

            ))}
          </nav>

          <div className="min-w-0">
            {tab === "home" && <HomeTab onGo={setTab} />}
            {tab === "products" && <ProductsTab />}
            {tab === "categories" && <CategoriesTab />}
            {tab === "orders" && <OrdersTab />}
            {tab === "topups" && <TopupsPanel />}
            {tab === "users" && <UsersPanel />}
            {tab === "coupons" && <CouponsTab />}
            {tab === "news" && <NewsTab />}
            {tab === "settings" && <SettingsTab />}
            {tab === "clouds" && <CloudsTab />}
          </div>
        </div>
      </section>

      {/* mobile tab bar */}
      <nav className="fixed inset-x-0 bottom-0 z-40 flex gap-1 overflow-x-auto border-t border-border bg-background/95 px-2 py-2 backdrop-blur-xl lg:hidden">
        {TABS.map((tb) => (
          <button
            key={tb}
            onClick={() => setTab(tb)}
            className={`relative flex min-w-16 shrink-0 flex-col items-center gap-1 rounded-xl px-3 py-1.5 text-[10px] ${
              tab === tb ? "bg-primary/15 text-primary" : "text-muted-foreground"
            }`}
          >
            {tb === "orders" && newOrders > 0 && (
              <span className="absolute end-1 top-0 rounded-full bg-destructive px-1.5 font-tech text-[10px] text-white">
                +{newOrders}
              </span>
            )}
            <span className="[&_svg]:size-5">{TAB_ICONS[tb]}</span>
            {TAB_LABELS[tb][lang === "ar" ? 0 : 1]}

          </button>
        ))}
      </nav>
    </Layout>
  );
}

/* ---------------- full-screen editor shell ---------------- */
function EditorScreen({
  title,
  onClose,
  onSave,
  saving,
  children,
}: {
  title: string;
  onClose: () => void;
  onSave: () => void;
  saving?: boolean;
  children: React.ReactNode;
}) {
  const { lang, dir } = useI18n();
  const BackIcon = dir === "rtl" ? ArrowRight : ArrowLeft;
  useEffect(() => {
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = "";
    };
  }, []);
  return (
    <div className="fixed inset-0 z-90 overflow-y-auto bg-background">
      <div className="sticky top-0 z-10 flex items-center gap-3 border-b border-border bg-background/95 px-4 py-3 backdrop-blur-xl">
        <button
          onClick={onClose}
          className="inline-flex h-11 items-center gap-2 rounded-xl border border-border bg-card px-4 font-display text-sm hover:border-primary hover:text-primary"
        >
          <BackIcon className="size-4" />
          {lang === "ar" ? "رجوع" : "Back"}
        </button>
        <h2 className="min-w-0 flex-1 truncate font-display text-lg">{title}</h2>
        <button
          onClick={onSave}
          disabled={saving}
          className="inline-flex h-11 items-center gap-2 rounded-xl bg-primary px-5 font-display text-sm text-primary-foreground disabled:opacity-60"
        >
          <Check className="size-4" />
          {lang === "ar" ? "حفظ" : "Save"}
        </button>
      </div>
      <div className="mx-auto max-w-3xl space-y-4 px-4 py-6 pb-24">{children}</div>
    </div>
  );
}

function UnitsManager({
  product,
  lang,
  onAvailableChange,
}: {
  product: Product;
  lang: string;
  onAvailableChange: (count: number) => void;
}) {
  const ar = lang === "ar";
  const [items, setItems] = useState<StockUnit[]>([]);
  const [mode, setMode] = useState<"image" | "text">("text");
  const [bulk, setBulk] = useState("");
  const [imgs, setImgs] = useState<string[]>([]);
  const [filter, setFilter] = useState<"all" | "available" | "sold" | "disabled">("all");
  const [busy, setBusy] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [editVal, setEditVal] = useState("");

  useEffect(() => {
    const unsub = onProductUnitsChange(product.id, setItems);
    return () => unsub();
  }, [product.id]);

  const available = items.filter(
    (u) => u.status !== "sold" && u.status !== "disabled",
  ).length;
  const sold = items.filter((u) => u.status === "sold").length;
  const disabled = items.filter((u) => u.status === "disabled").length;
  const shown = items.filter((u) =>
    filter === "all"
      ? true
      : filter === "sold"
        ? u.status === "sold"
        : filter === "disabled"
          ? u.status === "disabled"
          : u.status !== "sold" && u.status !== "disabled",
  );

  useEffect(() => {
    onAvailableChange(available);
  }, [available, onAvailableChange]);

  async function addRows() {
    const rows =
      mode === "image"
        ? imgs.map((src) => ({ image: src, kind: "image" as const }))
        : bulk.trim()
          ? [{ code: bulk.replace(/\s+$/, ""), kind: "text" as const }]
          : [];
    if (!rows.length) return;
    setBusy(true);
    try {
      await addStockUnits(product.id, rows);
      setBulk("");
      setImgs([]);
      toast.success(ar ? `تمت إضافة ${rows.length} وحدة` : `${rows.length} units added`);
    } finally {
      setBusy(false);
    }
  }

  async function saveEdit(u: StockUnit) {
    await updateStockUnit(product.id, u.id || "", { code: editVal });
    setEditId(null);
    toast.success(ar ? "تم التعديل" : "Updated");
  }

  const modes = [
    { key: "text" as const, ar: "نص", en: "Text" },
    { key: "image" as const, ar: "صورة", en: "Image" },
  ];

  return (
    <div className="space-y-4 rounded-2xl border border-accent/40 bg-accent/5 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="font-display text-sm">
          {ar ? "محتوى المنتج الرقمي (نص / صورة)" : "Digital content (text / image)"}
        </p>
        <div className="flex flex-wrap gap-1.5">
          {[
            { k: "all" as const, ar: "الكل", en: "All", v: items.length },
            { k: "available" as const, ar: "متوفر", en: "Available", v: available },
            { k: "sold" as const, ar: "تم استخدامه", en: "Used", v: sold },
            { k: "disabled" as const, ar: "معطّل", en: "Disabled", v: disabled },
          ].map((f) => (
            <button
              key={f.k}
              type="button"
              onClick={() => setFilter(f.k)}
              className={`h-8 rounded-full border px-3 font-tech text-[11px] ${
                filter === f.k
                  ? "border-primary bg-primary/15 text-primary"
                  : "border-border text-muted-foreground"
              }`}
            >
              {(ar ? f.ar : f.en) + " · " + f.v}
            </button>
          ))}
        </div>
      </div>

      <div className="flex gap-1.5">
        {modes.map((m) => (
          <button
            key={m.key}
            type="button"
            onClick={() => setMode(m.key)}
            className={`h-10 flex-1 rounded-xl border text-sm ${
              mode === m.key
                ? "border-accent bg-accent/15 text-accent"
                : "border-border bg-background/50 text-muted-foreground"
            }`}
          >
            {ar ? m.ar : m.en}
          </button>
        ))}
      </div>

      {mode === "image" ? (
        <div className="space-y-2">
          <p className="text-xs text-muted-foreground">
            {ar ? "كل صورة = وحدة مخزون واحدة." : "Each image is one stock unit."}
          </p>
          <ImageUploader images={imgs} onChange={setImgs} folder="nmct_stock" />
        </div>
      ) : (
        <div className="space-y-2">
          <p className="text-xs text-muted-foreground">
            {ar
              ? "كل ما تكتبه هنا = وحدة واحدة (حتى لو عدة أسطر). أضِف وحدة ثم اكتب التالية."
              : "Everything you type here is ONE unit (multi-line allowed)."}
          </p>
          <textarea
            className={inputCls + " min-h-32 py-3"}
            value={bulk}
            onChange={(e) => setBulk(e.target.value)}
            placeholder={ar ? "محتوى الوحدة (يمكن أن يكون عدة أسطر)" : "Unit content (multi-line)"}
          />
        </div>
      )}


      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          disabled={busy}
          onClick={() => void addRows()}
          className="inline-flex h-10 items-center gap-1.5 rounded-xl bg-primary px-4 font-display text-sm text-primary-foreground disabled:opacity-60"
        >
          <Plus className="size-4" /> {ar ? "إضافة للمخزون" : "Add to stock"}
        </button>
        {!items.length && ((product.codes || []).length > 0 || (product.stock || 0) > 0) && (
          <button
            type="button"
            onClick={() => void migrateCodesToUnits(product.id)}
            className="h-10 rounded-xl border border-accent px-4 font-display text-sm text-accent"
          >
            {ar ? "تحويل المخزون القديم" : "Migrate old stock"}
          </button>
        )}
      </div>

      {shown.length > 0 && (
        <div className="max-h-96 space-y-2 overflow-auto pe-1">
          {shown.map((u) => {
            const used = u.status === "sold";
            const off = u.status === "disabled";
            return (
              <div
                key={u.id}
                className={`flex items-center gap-2 rounded-xl border p-2 text-xs ${
                  used || off
                    ? "border-border/60 bg-muted/30 opacity-80"
                    : "border-border bg-background/60"
                }`}
              >
                <span
                  className={`shrink-0 rounded-lg px-2 py-1 font-display ${
                    used
                      ? "bg-destructive/15 text-destructive"
                      : off
                        ? "bg-muted text-muted-foreground"
                        : "bg-primary/15 text-primary"
                  }`}
                >
                  {used
                    ? ar
                      ? "تم استخدامه"
                      : "Used"
                    : off
                      ? ar
                        ? "معطّل"
                        : "Disabled"
                      : ar
                        ? "موجود"
                        : "Available"}
                </span>

                {u.image ? (
                  <a href={u.image} target="_blank" rel="noreferrer" className="shrink-0">
                    <img src={u.image} alt="" className="size-10 rounded-lg object-cover" />
                  </a>
                ) : editId === u.id ? (
                  <textarea
                    className="min-h-20 min-w-0 flex-1 rounded-lg border border-primary bg-background p-2 font-tech"
                    value={editVal}
                    onChange={(e) => setEditVal(e.target.value)}
                  />
                ) : (
                  <span className="min-w-0 flex-1 whitespace-pre-line break-words font-tech line-clamp-4">
                    {u.code || u.label || "—"}
                  </span>
                )}
                {u.image && <span className="min-w-0 flex-1 truncate text-muted-foreground">IMG</span>}

                {used && (
                  <span className="hidden max-w-40 truncate text-muted-foreground sm:block">
                    {u.buyerName || u.buyerEmail || u.buyerUid || ""}
                  </span>
                )}

                <div className="flex shrink-0 items-center gap-1">
                  {editId === u.id ? (
                    <button
                      type="button"
                      onClick={() => void saveEdit(u)}
                      className="rounded-lg border border-primary p-1.5 text-primary"
                      aria-label="save"
                    >
                      <Check className="size-3.5" />
                    </button>
                  ) : (
                    !u.image && (
                      <button
                        type="button"
                        onClick={() => {
                          setEditId(u.id || null);
                          setEditVal(u.code || u.label || "");
                        }}
                        className="rounded-lg border border-border p-1.5 text-muted-foreground"
                        aria-label="edit"
                      >
                        <Pencil className="size-3.5" />
                      </button>
                    )
                  )}
                  {!used && (
                    <button
                      type="button"
                      onClick={() =>
                        void updateStockUnit(product.id, u.id || "", {
                          status: off ? "available" : "disabled",
                        }).then(() =>
                          toast.success(
                            off
                              ? ar
                                ? "تم تفعيل الوحدة"
                                : "Unit enabled"
                              : ar
                                ? "تم تعطيل الوحدة"
                                : "Unit disabled",
                          ),
                        )
                      }
                      className={`rounded-lg border p-1.5 ${
                        off ? "border-primary text-primary" : "border-border text-muted-foreground"
                      }`}
                      aria-label="toggle"
                    >
                      {off ? <Check className="size-3.5" /> : <X className="size-3.5" />}
                    </button>
                  )}
                  {used && (
                    <button
                      type="button"
                      onClick={() =>
                        void updateStockUnit(product.id, u.id || "", {
                          status: "available",
                          orderId: "",
                          buyerUid: "",
                          buyerName: "",
                          buyerEmail: "",
                          soldAt: 0,
                        }).then(() => toast.success(ar ? "تمت إعادة الوحدة" : "Unit restored"))
                      }
                      className="rounded-lg border border-border p-1.5 text-muted-foreground"
                      aria-label="restore"
                    >
                      <ArrowLeft className="size-3.5" />
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => void deleteStockUnit(product.id, u.id || "")}
                    className="rounded-lg border border-destructive/50 p-1.5 text-destructive"
                    aria-label="delete"
                  >
                    <Trash2 className="size-3.5" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function Labeled({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs text-muted-foreground">{label}</span>
      {children}
    </label>
  );
}

/* ---------------- overview ---------------- */
function HomeTab({ onGo }: { onGo: (t: Tab) => void }) {
  const { lang } = useI18n();
  const { products } = useProducts();
  const categories = useCategories();
  const [orders, setOrders] = useState<Order[]>([]);
  useEffect(() => onOrdersChange(setOrders), []);

  const revenue = useMemo(
    () => orders.filter((o) => o.status !== "rejected").reduce((s, o) => s + (o.total || 0), 0),
    [orders],
  );
  const pending = orders.filter((o) => o.status === "pending").length;

  const stats = [
    { icon: <Boxes />, label: lang === "ar" ? "المنتجات" : "Products", value: products.length },
    {
      icon: <FolderTree />,
      label: lang === "ar" ? "الأقسام" : "Categories",
      value: categories.length,
    },
    { icon: <PackageCheck />, label: lang === "ar" ? "الطلبات" : "Orders", value: orders.length },
    { icon: <Users />, label: lang === "ar" ? "قيد المراجعة" : "Pending", value: pending },
  ];

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {stats.map((s) => (
          <div key={s.label} className="rounded-2xl glass-panel p-4">
            <span className="grid size-10 place-items-center rounded-xl bg-primary/15 text-primary">
              {s.icon}
            </span>
            <p className="mt-3 font-display text-2xl">{s.value}</p>
            <p className="text-xs text-muted-foreground">{s.label}</p>
          </div>
        ))}
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="rounded-2xl glass-panel p-5">
          <div className="flex items-center gap-2 text-accent">
            <TrendingUp className="size-4" />
            <span className="font-display text-sm">
              {lang === "ar" ? "إجمالي المبيعات" : "Total revenue"}
            </span>
          </div>
          <p className="mt-2 font-display text-3xl text-primary">{priceText(revenue, lang)}</p>
        </div>
        <div className="rounded-2xl glass-panel p-5">
          <p className="font-display text-sm">
            {lang === "ar" ? "إجراءات سريعة" : "Quick actions"}
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <Button size="sm" onClick={() => onGo("products")}>
              <Plus /> {lang === "ar" ? "منتج" : "Product"}
            </Button>
            <Button size="sm" variant="outline" onClick={() => onGo("categories")}>
              <Plus /> {lang === "ar" ? "قسم" : "Category"}
            </Button>
            <Button size="sm" variant="outline" onClick={() => onGo("orders")}>
              <PackageCheck /> {lang === "ar" ? "الطلبات" : "Orders"}
            </Button>
          </div>
        </div>
      </div>

      <div className="space-y-2">
        <h3 className="font-display text-lg">{lang === "ar" ? "أحدث الطلبات" : "Latest orders"}</h3>
        {orders.slice(0, 5).map((o) => (
          <div
            key={o.id}
            className="flex items-center gap-3 rounded-2xl border border-border bg-card p-3 text-sm"
          >
            <span className="font-tech text-accent">#{formatOrderNo(o)}</span>
            <span className="min-w-0 flex-1 truncate text-muted-foreground">{o.customerName}</span>
            <span className="font-display text-primary">{priceText(o.total, lang)}</span>
          </div>
        ))}
        {orders.length === 0 && (
          <p className="py-10 text-center text-sm text-muted-foreground">
            {lang === "ar" ? "لا توجد طلبات" : "No orders"}
          </p>
        )}
      </div>
    </div>
  );
}

/* ---------------- products ---------------- */
type ProductDraft = {
  name: string;
  nameEn: string;
  price: string;
  oldPrice: string;
  platform: string;
  categoryId: string;
  description: string;
  descriptionEn: string;
  images: string[];
  sizes: { name: string; price?: number }[];
  sections: string[];
  stock: string;
  lowStockAt: string;
  digital: boolean;
  accountProduct: boolean;
  codes: string;
  
  deliveryText: string;
};

const emptyDraft: ProductDraft = {
  name: "",
  nameEn: "",
  price: "",
  oldPrice: "",
  platform: "",
  categoryId: "",
  description: "",
  descriptionEn: "",
  images: [],
  sizes: [],
  sections: [],
  stock: "",
  lowStockAt: "",
  digital: false,
  accountProduct: false,
  codes: "",
  
  deliveryText: "",
};

function ProductsTab() {
  const { products } = useProducts();
  const categories = useCategories();
  const { lang } = useI18n();
  const [editing, setEditing] = useState<Product | "new" | null>(null);
  const [draft, setDraft] = useState<ProductDraft>(emptyDraft);
  const [saving, setSaving] = useState(false);
  const [q, setQ] = useState("");
  const [digitalStockCount, setDigitalStockCount] = useState(0);

  useEffect(() => {
    if (!products.length) return;
    void syncAllDigitalProductStocks(products).catch((error) => {
      console.error("[stock] automatic repair failed:", error);
    });
  }, [products]);

  function open(p: Product | "new") {
    setEditing(p);
    setDigitalStockCount(p === "new" ? 0 : availableStock(p));
    setDraft(
      p === "new"
        ? emptyDraft
        : {
            name: p.name || "",
            nameEn: p.nameEn || "",
            price: String(p.price ?? ""),
            oldPrice: p.oldPrice ? String(p.oldPrice) : "",
            platform: p.platform || "",
            categoryId: p.categoryId || "",
            description: p.description || "",
            descriptionEn: p.descriptionEn || "",
            images: p.images?.length ? p.images : p.image ? [p.image] : [],
            sizes: p.sizes || [],
            sections: p.sections || [],
            stock: p.stock === undefined || p.stock === null ? "" : String(p.stock),
            lowStockAt: p.lowStockAt ? String(p.lowStockAt) : "",
            digital: p.digital === true,
            accountProduct: p.accountProduct === true,
            codes: (p.codes || []).join("\n"),
            
            deliveryText: p.deliveryText || "",
          },
    );
  }

  async function save() {
    if (!draft.name.trim() || !draft.price) {
      toast.error(lang === "ar" ? "أكمل الاسم والسعر" : "Fill name and price");
      return;
    }
    setSaving(true);
    const payload = {
      name: draft.name,
      nameEn: draft.nameEn,
      price: Number(draft.price),
      oldPrice: draft.oldPrice ? Number(draft.oldPrice) : 0,
      image: draft.images[0] || "",
      images: draft.images,
      platform: draft.platform,
      categoryId: draft.categoryId,
      description: draft.description,
      descriptionEn: draft.descriptionEn,
      sizes: draft.sizes,
      sections: draft.sections,
      lowStockAt: draft.lowStockAt === "" ? 5 : Number(draft.lowStockAt),
      digital: draft.digital,
      accountProduct: draft.accountProduct,
      
      deliveryText: draft.deliveryText,
      // codes are NEVER stored on the public product node anymore
      codes: [],
      stock: 0,
    } as Omit<Product, "id"> & { codes: string[]; stock: number };
    const typedCodes = draft.digital
      ? draft.codes
          .split("\n")
          .map((c) => c.trim())
          .filter(Boolean)
      : [];
    payload.stock = payload.digital
      ? typedCodes.length
      : draft.stock === ""
        ? 0
        : Number(draft.stock);
    try {
      let pid = editing !== "new" && editing ? editing.id : "";
      if (pid && draft.digital) {
        const privateUnits = await getUnits(pid);
        if (Object.keys(privateUnits).length > 0) {
          // Never trust a stale/missing public unitCount. The private vault is
          // authoritative, so normal product saves must not reset stock to 0.
          delete (payload as Partial<Product>).stock;
          delete (payload as Partial<Product>).codes;
        }
      }
      if (editing === "new") {
        pid = (await addProduct({ ...payload, hidden: false, soldCount: 0, createdAt: Date.now() })) || "";
      } else if (editing) {
        await updateProduct(editing.id, payload);
      }
      // move any typed codes into the private stock vault
      if (pid && typedCodes.length) {
        await addStockUnits(
          pid,
          typedCodes.map((c) => ({ code: c })),
        );
      }
      if (pid && draft.digital) await syncProductStock(pid);
      toast.success(lang === "ar" ? "تم الحفظ" : "Saved");
      setEditing(null);
    } catch {
      toast.error(lang === "ar" ? "تعذر الحفظ" : "Save failed");
    } finally {
      setSaving(false);
    }
  }


  const filtered = products.filter((p) => p.name?.toLowerCase().includes(q.toLowerCase()));
  const outCount = products.filter((p) => isOutOfStock(p)).length;
  const lowCount = products.filter((p) => isLowStock(p)).length;
  const totalUnits = products.reduce((n, p) => n + availableStock(p), 0);

  return (
    <div className="space-y-4">
      <div className="flex gap-2">
        <input
          className={inputCls}
          placeholder={lang === "ar" ? "بحث..." : "Search..."}
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
        <button
          onClick={() => open("new")}
          className="inline-flex h-12 shrink-0 items-center gap-2 rounded-xl bg-primary px-5 font-display text-sm text-primary-foreground"
        >
          <Plus className="size-4" />
          {lang === "ar" ? "منتج جديد" : "New"}
        </button>
      </div>

      <div className="grid grid-cols-3 gap-2">
        {[
          { ar: "قطع متوفرة", en: "Units", v: totalUnits, cls: "text-primary" },
          { ar: "قارب النفاد", en: "Low", v: lowCount, cls: "text-amber-500" },
          { ar: "نفذ", en: "Out", v: outCount, cls: "text-destructive" },
        ].map((k) => (
          <div key={k.en} className="rounded-2xl border border-border bg-card p-3 text-center">
            <p className={`font-display text-xl ${k.cls}`}>{k.v}</p>
            <p className="text-[11px] text-muted-foreground">{lang === "ar" ? k.ar : k.en}</p>
          </div>
        ))}
      </div>

      {products.length === 0 && (
        <button
          onClick={async () => {
            await seedDemoData();
            toast.success(lang === "ar" ? "تمت إضافة البيانات التجريبية" : "Demo data added");
          }}
          className="h-12 w-full rounded-xl border border-accent font-display text-sm text-accent"
        >
          {lang === "ar" ? "إضافة المنتجات والتصنيفات التجريبية" : "Add demo catalogue"}
        </button>
      )}

      <div className="grid gap-3 sm:grid-cols-2">
        {filtered.map((p) => (
          <div
            key={p.id}
            className="flex items-center gap-3 rounded-2xl border border-border bg-card p-3"
          >
            {p.image && <img src={p.image} alt="" className="size-16 rounded-xl object-cover" />}
            <div className="min-w-0 flex-1">
              <p className="truncate font-display text-sm">{p.name}</p>
              <p className="font-tech text-xs text-primary">{priceText(p.price, lang)}</p>
              <div className="mt-1 flex flex-wrap items-center gap-1.5">
                <span
                  className={`rounded-full px-2 py-0.5 font-tech text-[10px] ${
                    isOutOfStock(p)
                      ? "bg-destructive/15 text-destructive"
                      : isLowStock(p)
                        ? "bg-amber-500/15 text-amber-500"
                        : "bg-primary/15 text-primary"
                  }`}
                >
                  {lang === "ar" ? "المخزون" : "Stock"}: {availableStock(p)}
                </span>
                {p.digital && (
                  <span className="rounded-full bg-accent/15 px-2 py-0.5 font-tech text-[10px] text-accent">
                    {lang === "ar" ? "رقمي" : "digital"}
                  </span>
                )}
                {p.hidden && (
                  <span className="text-[10px] text-muted-foreground">
                    {lang === "ar" ? "مخفي" : "hidden"}
                  </span>
                )}
              </div>
            </div>
            <div className="flex flex-col gap-1">
              <button
                onClick={() => open(p)}
                className="grid size-8 place-items-center rounded-lg border border-border"
              >
                <Pencil className="size-3.5" />
              </button>
              <button
                onClick={() => hideProduct(p.id, !p.hidden)}
                className="grid size-8 place-items-center rounded-lg border border-border text-[10px]"
              >
                {p.hidden ? "👁" : "🚫"}
              </button>
              <button
                onClick={() => deleteProduct(p.id)}
                className="grid size-8 place-items-center rounded-lg border border-destructive text-destructive"
              >
                <Trash2 className="size-3.5" />
              </button>
            </div>
          </div>
        ))}
      </div>

      {editing && (
        <EditorScreen
          title={editing === "new" ? (lang === "ar" ? "منتج جديد" : "New product") : draft.name}
          onClose={() => setEditing(null)}
          onSave={save}
          saving={saving}
        >
          <div className={cardCls}>
            <Labeled label={lang === "ar" ? "الاسم" : "Name"}>
              <input
                className={inputCls}
                value={draft.name}
                onChange={(e) => setDraft({ ...draft, name: e.target.value })}
              />
            </Labeled>
            <Labeled label="Name (EN)">
              <input
                className={inputCls}
                value={draft.nameEn}
                onChange={(e) => setDraft({ ...draft, nameEn: e.target.value })}
              />
            </Labeled>
            <div className="grid grid-cols-2 gap-3">
              <Labeled label={lang === "ar" ? "السعر" : "Price"}>
                <input
                  className={inputCls}
                  inputMode="decimal"
                  value={draft.price}
                  onChange={(e) => setDraft({ ...draft, price: e.target.value })}
                />
              </Labeled>
              <Labeled label={lang === "ar" ? "قبل الخصم" : "Old price"}>
                <input
                  className={inputCls}
                  inputMode="decimal"
                  value={draft.oldPrice}
                  onChange={(e) => setDraft({ ...draft, oldPrice: e.target.value })}
                />
              </Labeled>
            </div>
          </div>

          <div className={cardCls}>
            <p className="font-display text-sm">{lang === "ar" ? "الصور" : "Images"}</p>
            <ImageUploader
              images={draft.images}
              onChange={(v) => setDraft({ ...draft, images: v })}
              folder="nmct_products"
            />
          </div>

          <div className={cardCls}>
            <Labeled label={lang === "ar" ? "المنصة" : "Platform"}>
              <input
                className={inputCls}
                placeholder="PS5 / Xbox / PC"
                value={draft.platform}
                onChange={(e) => setDraft({ ...draft, platform: e.target.value })}
              />
            </Labeled>
            <Labeled label={lang === "ar" ? "القسم" : "Category"}>
              <select
                className={inputCls}
                value={draft.categoryId}
                onChange={(e) => setDraft({ ...draft, categoryId: e.target.value })}
              >
                <option value="">—</option>
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </Labeled>
          </div>

          <div className={cardCls}>
            <p className="font-display text-sm">
              {lang === "ar" ? "المخزون والتسليم" : "Stock & delivery"}
            </p>
            <div className="grid grid-cols-2 gap-3">
              <Labeled label={lang === "ar" ? "الكمية المتوفرة" : "Stock quantity"}>
                <input
                  className={inputCls}
                  inputMode="numeric"
                  placeholder="0"
                  disabled={draft.digital}
                  value={
                    draft.digital
                      ? String(
                          editing === "new"
                            ? draft.codes.split("\n").filter((c) => c.trim()).length
                            : digitalStockCount,
                        )
                      : draft.stock
                  }
                  onChange={(e) => setDraft({ ...draft, stock: e.target.value })}
                />
              </Labeled>
              <Labeled label={lang === "ar" ? "تنبيه عند الوصول لـ" : "Low stock at"}>
                <input
                  className={inputCls}
                  inputMode="numeric"
                  placeholder="5"
                  value={draft.lowStockAt}
                  onChange={(e) => setDraft({ ...draft, lowStockAt: e.target.value })}
                />
              </Labeled>
            </div>
            {draft.digital && (
              <p className="text-xs text-accent">
                {lang === "ar"
                  ? "المنتج رقمي: المخزون يُحسب تلقائياً من عدد الوحدات المتبقية."
                  : "Digital product: stock is derived from the remaining units."}
              </p>
            )}
            <label className="flex items-center gap-3 rounded-xl border border-border bg-background/40 p-3">
              <input
                type="checkbox"
                className="size-4 accent-[var(--color-primary)]"
                checked={draft.digital}
                onChange={(e) => setDraft({ ...draft, digital: e.target.checked })}
              />
              <span className="text-sm">
                {lang === "ar" ? "منتج رقمي (تسليم تلقائي بعد القبول)" : "Digital product (auto delivery)"}
              </span>
            </label>
            {draft.digital && (
              <p className="text-xs text-muted-foreground">
                {lang === "ar"
                  ? "بمجرد قبول الطلب تُخصَّص وحدة من المخزون للعميل وتظهر له داخل صفحة طلباتي."
                  : "On acceptance a unit is assigned to the buyer and shown on their Orders page."}
              </p>
            )}

            <label className="flex items-center gap-3 rounded-xl border border-accent/40 bg-accent/5 p-3">
              <input
                type="checkbox"
                className="size-4 accent-[var(--color-primary)]"
                checked={draft.accountProduct}
                onChange={(e) => setDraft({ ...draft, accountProduct: e.target.checked })}
              />
              <span className="text-sm">
                {lang === "ar"
                  ? "حسابات (يحتاج موافقتك دائماً + تسليم نص يدوي)"
                  : "Accounts (always needs your approval + manual text delivery)"}
              </span>
            </label>
            {draft.accountProduct && (
              <p className="text-xs text-accent">
                {lang === "ar"
                  ? "أي طلب يحتوي هذا المنتج ينتظر موافقتك — حتى لو دفع الزبون من رصيد المحفظة — وتسلّمه أنت نصاً من لوحة الطلبات."
                  : "Any order containing this product waits for your approval — even when paid from the wallet — and you deliver the text yourself."}
              </p>
            )}



            {!draft.digital && (
              <Labeled
                label={
                  lang === "ar"
                    ? "المحتوى الذي يصل الزبون بعد تغيير الحالة إلى تم الاستلام"
                    : "Content delivered to the buyer when marked received"
                }
              >
                <textarea
                  className={inputCls + " min-h-24 py-3"}
                  value={draft.deliveryText}
                  onChange={(e) => setDraft({ ...draft, deliveryText: e.target.value })}
                />
              </Labeled>
            )}

            {draft.digital &&
              (editing !== "new" && editing ? (
                <UnitsManager
                  product={editing}
                  lang={lang}
                  onAvailableChange={setDigitalStockCount}
                />
              ) : (
                <p className="text-xs text-accent">
                  {lang === "ar"
                    ? "احفظ المنتج أولاً ثم افتحه لإضافة النصوص أو الصور."
                    : "Save the product first, then reopen it to add texts or images."}
                </p>
              ))}
          </div>

          <div className={cardCls}>
            <p className="font-display text-sm">
              {lang === "ar" ? "أقسام الصفحة الرئيسية" : "Home sections"}
            </p>
            <p className="text-xs text-muted-foreground">
              {lang === "ar"
                ? "اختر القوائم التي يظهر فيها المنتج في الصفحة الرئيسية."
                : "Choose which home page lists show this product."}
            </p>
            <div className="flex flex-wrap gap-2">
              {HOME_SECTIONS.map((sec) => {
                const on = draft.sections.includes(sec.key);
                return (
                  <button
                    key={sec.key}
                    type="button"
                    onClick={() =>
                      setDraft({
                        ...draft,
                        sections: on
                          ? draft.sections.filter((k) => k !== sec.key)
                          : [...draft.sections, sec.key],
                      })
                    }
                    className={`h-11 rounded-xl border px-4 text-sm ${
                      on
                        ? "border-primary bg-primary text-primary-foreground"
                        : "border-border bg-background/60 text-muted-foreground"
                    }`}
                  >
                    {lang === "ar" ? sec.ar : sec.en}
                  </button>
                );
              })}
            </div>
          </div>

          <div className={cardCls}>
            <div className="flex items-center justify-between">
              <p className="font-display text-sm">
                {lang === "ar" ? "الخيارات / الأحجام" : "Variants"}
              </p>
              <button
                onClick={() =>
                  setDraft({ ...draft, sizes: [...draft.sizes, { name: "", price: 0 }] })
                }
                className="inline-flex h-9 items-center gap-1 rounded-lg border border-accent px-3 text-xs text-accent"
              >
                <Plus className="size-3.5" /> {lang === "ar" ? "إضافة" : "Add"}
              </button>
            </div>
            {draft.sizes.map((s, i) => (
              <div key={i} className="flex gap-2">
                <input
                  className={inputCls}
                  placeholder={lang === "ar" ? "الاسم" : "Name"}
                  value={s.name}
                  onChange={(e) => {
                    const next = [...draft.sizes];
                    next[i] = { ...s, name: e.target.value };
                    setDraft({ ...draft, sizes: next });
                  }}
                />
                <input
                  className={inputCls}
                  placeholder={lang === "ar" ? "السعر" : "Price"}
                  inputMode="decimal"
                  value={s.price ?? ""}
                  onChange={(e) => {
                    const next = [...draft.sizes];
                    next[i] = { ...s, price: Number(e.target.value) || 0 };
                    setDraft({ ...draft, sizes: next });
                  }}
                />
                <button
                  onClick={() =>
                    setDraft({ ...draft, sizes: draft.sizes.filter((_, j) => j !== i) })
                  }
                  className="grid size-12 shrink-0 place-items-center rounded-xl border border-destructive text-destructive"
                >
                  <X className="size-4" />
                </button>
              </div>
            ))}
          </div>

          <div className={cardCls}>
            <Labeled label={lang === "ar" ? "الوصف" : "Description"}>
              <textarea
                rows={4}
                className="w-full rounded-xl border border-border bg-background/60 px-3 py-2 text-sm outline-none focus:border-primary"
                value={draft.description}
                onChange={(e) => setDraft({ ...draft, description: e.target.value })}
              />
            </Labeled>
            <Labeled label="Description (EN)">
              <textarea
                rows={3}
                className="w-full rounded-xl border border-border bg-background/60 px-3 py-2 text-sm outline-none focus:border-primary"
                value={draft.descriptionEn}
                onChange={(e) => setDraft({ ...draft, descriptionEn: e.target.value })}
              />
            </Labeled>
          </div>
        </EditorScreen>
      )}
    </div>
  );
}

/* ---------------- categories ---------------- */
function CategoriesTab() {
  const categories = useCategories();
  const { lang } = useI18n();
  const [editing, setEditing] = useState<Category | "new" | null>(null);
  const [name, setName] = useState("");
  const [nameEn, setNameEn] = useState("");
  const [imgs, setImgs] = useState<string[]>([]);

  function open(c: Category | "new") {
    setEditing(c);
    setName(c === "new" ? "" : c.name || "");
    setNameEn(c === "new" ? "" : c.nameEn || "");
    setImgs(c === "new" ? [] : c.image ? [c.image] : []);
  }

  async function save() {
    if (!name.trim()) return;
    const payload = { name, nameEn, image: imgs[0] || "" };
    if (editing === "new") await addCategory({ ...payload, hidden: false });
    else if (editing) await updateCategory(editing.id, payload);
    toast.success(lang === "ar" ? "تم الحفظ" : "Saved");
    setEditing(null);
  }

  return (
    <div className="space-y-4">
      <button
        onClick={() => open("new")}
        className="inline-flex h-12 items-center gap-2 rounded-xl bg-primary px-5 font-display text-sm text-primary-foreground"
      >
        <Plus className="size-4" /> {lang === "ar" ? "قسم جديد" : "New category"}
      </button>
      <div className="grid gap-3 sm:grid-cols-2">
        {categories.map((c) => (
          <div
            key={c.id}
            className="flex items-center gap-3 rounded-2xl border border-border bg-card p-3"
          >
            {c.image && <img src={c.image} alt="" className="size-12 rounded-xl object-cover" />}
            <span className="min-w-0 flex-1 truncate font-display text-sm">{c.name}</span>
            <button
              onClick={() => open(c)}
              className="grid size-9 place-items-center rounded-lg border border-border"
            >
              <Pencil className="size-4" />
            </button>
            <button
              onClick={() => deleteCategory(c.id)}
              className="grid size-9 place-items-center rounded-lg border border-destructive text-destructive"
            >
              <Trash2 className="size-4" />
            </button>
          </div>
        ))}
      </div>

      {editing && (
        <EditorScreen
          title={editing === "new" ? (lang === "ar" ? "قسم جديد" : "New category") : name}
          onClose={() => setEditing(null)}
          onSave={save}
        >
          <div className={cardCls}>
            <Labeled label={lang === "ar" ? "اسم القسم" : "Name"}>
              <input className={inputCls} value={name} onChange={(e) => setName(e.target.value)} />
            </Labeled>
            <Labeled label="Name (EN)">
              <input
                className={inputCls}
                value={nameEn}
                onChange={(e) => setNameEn(e.target.value)}
              />
            </Labeled>
            <ImageUploader
              images={imgs}
              onChange={setImgs}
              folder="nmct_categories"
              multiple={false}
            />
          </div>
        </EditorScreen>
      )}
    </div>
  );
}

/* ---------------- orders ---------------- */
function OrdersTab() {
  return <OrdersPanel />;
}

/* ---------------- coupons ---------------- */
function CouponsTab() {
  const { lang } = useI18n();
  const [codes, setCodes] = useState<DiscountCode[]>([]);
  const [code, setCode] = useState("");
  const [percent, setPercent] = useState("");
  const [amount, setAmount] = useState("");
  useEffect(() => onDiscountCodesChange(setCodes), []);
  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <div className={cardCls}>
        <Labeled label={lang === "ar" ? "الكود" : "Code"}>
          <input className={inputCls} value={code} onChange={(e) => setCode(e.target.value)} />
        </Labeled>
        <div className="grid grid-cols-2 gap-3">
          <Labeled label={lang === "ar" ? "نسبة %" : "Percent %"}>
            <input
              className={inputCls}
              inputMode="decimal"
              value={percent}
              onChange={(e) => setPercent(e.target.value)}
            />
          </Labeled>
          <Labeled label={lang === "ar" ? "مبلغ ثابت" : "Fixed amount"}>
            <input
              className={inputCls}
              inputMode="decimal"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
            />
          </Labeled>
        </div>
        <button
          onClick={async () => {
            if (!code.trim()) return;
            await addDiscountCode({
              code: code.trim().toUpperCase(),
              percent: Number(percent) || 0,
              amount: Number(amount) || 0,
              active: true,
              usedCount: 0,
            });
            setCode("");
            setPercent("");
            setAmount("");
            toast.success(lang === "ar" ? "تمت الإضافة" : "Added");
          }}
          className="h-12 w-full rounded-xl bg-primary font-display text-primary-foreground"
        >
          {lang === "ar" ? "إضافة" : "Add"}
        </button>
      </div>
      <div className="space-y-3">
        {codes.map((c) => (
          <div
            key={c.id}
            className="flex items-center gap-3 rounded-2xl border border-border bg-card p-3"
          >
            <span className="flex-1 font-tech">{c.code}</span>
            <span className="text-sm text-accent">
              {c.percent ? `${c.percent}%` : priceText(c.amount || 0, lang)}
            </span>
            <button
              onClick={() => deleteDiscountCode(c.id)}
              className="grid size-9 place-items-center rounded-lg border border-destructive text-destructive"
            >
              <Trash2 className="size-4" />
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ---------------- announcements ---------------- */
function NewsTab() {
  const { lang } = useI18n();
  const [items, setItems] = useState<Announcement[]>([]);
  const [text, setText] = useState("");
  const [textEn, setTextEn] = useState("");
  useEffect(() => onAnnouncementsChange(setItems), []);
  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <div className={cardCls}>
        <Labeled label={lang === "ar" ? "نص الإعلان" : "Announcement"}>
          <input className={inputCls} value={text} onChange={(e) => setText(e.target.value)} />
        </Labeled>
        <Labeled label="Announcement (EN)">
          <input className={inputCls} value={textEn} onChange={(e) => setTextEn(e.target.value)} />
        </Labeled>
        <button
          onClick={async () => {
            if (!text.trim()) return;
            await addAnnouncement(text, textEn);
            setText("");
            setTextEn("");
            toast.success(lang === "ar" ? "تمت الإضافة" : "Added");
          }}
          className="h-12 w-full rounded-xl bg-primary font-display text-primary-foreground"
        >
          {lang === "ar" ? "إضافة" : "Add"}
        </button>
      </div>
      <div className="space-y-3">
        {items.map((a) => (
          <div
            key={a.id}
            className="flex items-center gap-3 rounded-2xl border border-border bg-card p-3"
          >
            <span className="flex-1 text-sm">{a.text}</span>
            <button
              onClick={() => deleteAnnouncement(a.id)}
              className="grid size-9 place-items-center rounded-lg border border-destructive text-destructive"
            >
              <Trash2 className="size-4" />
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ---------------- settings (bank) ---------------- */
function SettingsTab() {
  const { lang } = useI18n();
  const settings = useSettings();
  const bank = (settings["bank"] as Record<string, string> | undefined) || {};
  const [name, setName] = useState("");
  const [account, setAccount] = useState("");
  const [holder, setHolder] = useState("");
  const [image, setImage] = useState("");
  const [notify, setNotify] = useState("");
  const [cc, setCc] = useState(DEFAULT_COUNTRY_CODE);
  const waSrv = (settings["whatsappServer"] as Record<string, string> | undefined) || {};
  const [waUrl, setWaUrl] = useState("");
  const [waToken, setWaToken] = useState("");
  const [waState, setWaState] = useState("");

  async function waControl(action: "restart" | "logout") {
    setWaState("...");
    try {
      await waServerControl({ url: waUrl.trim(), token: waToken.trim() }, action);
      setWaState(
        action === "restart"
          ? lang === "ar"
            ? "تمت إعادة التشغيل ✅"
            : "Restarted ✅"
          : lang === "ar"
            ? "تم تسجيل الخروج، افتح صفحة QR ✅"
            : "Logged out, open the QR page ✅",
      );
    } catch {
      setWaState(lang === "ar" ? "تعذر تنفيذ الأمر ❌" : "Command failed ❌");
    }
  }


  useEffect(() => {
    setNotify(String(settings["notifyWhatsapp"] || ""));
  }, [settings["notifyWhatsapp"]]);

  useEffect(() => {
    const saved = String(settings["countryCode"] || "").replace(/\D/g, "");
    setCc(saved || DEFAULT_COUNTRY_CODE);
  }, [settings["countryCode"]]);

  useEffect(() => {
    setWaUrl(waSrv["url"] || "");
    setWaToken(waSrv["token"] || "");
  }, [waSrv["url"], waSrv["token"]]);

  useEffect(() => {
    setName(bank["name"] || "بنك مسقط");
    setAccount(bank["account"] || "97825550");
    setHolder(bank["holder"] || "NMCT");
    setImage(bank["image"] || "");
  }, [bank["name"], bank["account"], bank["holder"], bank["image"]]);

  return (
    <div className="max-w-xl space-y-4">
      <div className={cardCls}>
        <div className="flex items-center gap-2">
          <span className="grid size-9 place-items-center rounded-xl bg-primary/15 text-primary">
            <Wallet className="size-4" />
          </span>
          <h2 className="font-display text-lg">
            {lang === "ar" ? "بيانات التحويل البنكي" : "Bank transfer details"}
          </h2>
        </div>
        <Labeled label={lang === "ar" ? "اسم البنك" : "Bank name"}>
          <input className={inputCls} value={name} onChange={(e) => setName(e.target.value)} />
        </Labeled>
        <Labeled label={lang === "ar" ? "رقم الحساب" : "Account number"}>
          <input
            className={inputCls}
            dir="ltr"
            value={account}
            onChange={(e) => setAccount(e.target.value)}
          />
        </Labeled>
        <Labeled label={lang === "ar" ? "اسم صاحب الحساب" : "Account holder"}>
          <input className={inputCls} value={holder} onChange={(e) => setHolder(e.target.value)} />
        </Labeled>
        <Labeled
          label={
            lang === "ar"
              ? "صورة الحساب البنكي (تظهر في صفحة الدفع)"
              : "Bank account image (shown at checkout)"
          }
        >
          <ImageUploader
            images={image ? [image] : []}
            onChange={(next) => setImage(next[0] || "")}
            folder="nmct_bank"
            multiple={false}
          />
        </Labeled>
        <button
          onClick={async () => {
            await updateSettings("bank", { name, account, holder, image });
            toast.success(lang === "ar" ? "تم الحفظ" : "Saved");
          }}
          className="h-12 w-full rounded-xl bg-primary font-display text-primary-foreground"
        >
          {lang === "ar" ? "حفظ" : "Save"}
        </button>
      </div>

      <PaymentMethodsCard />

      <div className={cardCls}>
        <div className="flex items-center gap-2">
          <span className="grid size-9 place-items-center rounded-xl bg-primary/15 text-primary">
            <Bell className="size-4" />
          </span>
          <h2 className="font-display text-lg">
            {lang === "ar" ? "إشعارات الطلبات على واتساب" : "Order notifications (WhatsApp)"}
          </h2>
        </div>
        <p className="text-xs text-muted-foreground">
          {lang === "ar"
            ? "أدخل رقم الواتساب الذي تريد استقبال الطلبات الجديدة عليه (مع رمز الدولة، مثال: 96897329207)."
            : "WhatsApp number that receives new orders (with country code)."}
        </p>
        <Labeled label={lang === "ar" ? "رقم الواتساب للإشعارات" : "Notification number"}>
          <input
            className={inputCls}
            dir="ltr"
            placeholder="96897329207"
            value={notify}
            onChange={(e) => setNotify(e.target.value)}
          />
        </Labeled>
        <Labeled label={lang === "ar" ? "رمز الدولة الافتراضي" : "Default country code"}>
          <input
            className={inputCls}
            dir="ltr"
            placeholder="968"
            value={cc}
            onChange={(e) => setCc(e.target.value.replace(/\D/g, ""))}
          />
        </Labeled>
        <button
          onClick={async () => {
            await updateSettings("notifyWhatsapp", notify.replace(/\D/g, ""));
            await updateSettings("countryCode", cc.replace(/\D/g, "") || DEFAULT_COUNTRY_CODE);
            toast.success(lang === "ar" ? "تم الحفظ" : "Saved");
          }}
          className="h-12 w-full rounded-xl bg-primary font-display text-primary-foreground"
        >
          {lang === "ar" ? "حفظ" : "Save"}
        </button>
      </div>

      <div className={cardCls}>
        <div className="flex items-center gap-2">
          <span className="grid size-9 place-items-center rounded-xl bg-primary/15 text-primary">
            <Server className="size-4" />
          </span>
          <h2 className="font-display text-lg">
            {lang === "ar" ? "سيرفر الواتساب (Railway)" : "WhatsApp server (Railway)"}
          </h2>
        </div>
        <p className="text-xs text-muted-foreground">
          {lang === "ar"
            ? "عند ضبط رابط السيرفر والتوكن تُرسل كل الرسائل تلقائياً: تنبيه لك بكل طلب جديد، رسالة شكر للعميل، وتسليم المحتوى الرقمي عند قبول الطلب."
            : "When configured, the bot sends everything automatically: new-order alerts, customer thank-you, and digital delivery on acceptance."}
        </p>

        <Labeled label={lang === "ar" ? "رابط السيرفر" : "Server URL"}>
          <input
            className={inputCls}
            dir="ltr"
            placeholder="https://my-bot.up.railway.app"
            value={waUrl}
            onChange={(e) => setWaUrl(e.target.value)}
          />
        </Labeled>
        <Labeled label={lang === "ar" ? "التوكن (Bearer)" : "Token (Bearer)"}>
          <input
            className={inputCls}
            dir="ltr"
            value={waToken}
            onChange={(e) => setWaToken(e.target.value)}
          />
        </Labeled>
        <div className="flex flex-wrap gap-2">
          <button
            onClick={async () => {
              await updateSettings("whatsappServer", { url: waUrl.trim(), token: waToken.trim() });
              toast.success(lang === "ar" ? "تم الحفظ" : "Saved");
            }}
            className="h-12 flex-1 rounded-xl bg-primary font-display text-primary-foreground"
          >
            {lang === "ar" ? "حفظ" : "Save"}
          </button>
          <button
            onClick={async () => {
              setWaState("...");
              try {
                const st = await waServerStatus({ url: waUrl.trim(), token: waToken.trim() });
                const tokenBad =
                  st.tokenOk === false
                    ? lang === "ar"
                      ? " — ⚠️ التوكن غير مطابق للسيرفر، لن تُرسل أي رسالة"
                      : " — ⚠️ token mismatch, messages will fail"
                    : "";
                const delivery = st.autoDelivery
                  ? lang === "ar"
                    ? " — التسليم الفوري مُفعّل ⚡"
                    : " — instant delivery ON ⚡"
                  : lang === "ar"
                    ? " — التسليم الفوري غير مُفعّل (أضف FIREBASE_DB_SECRET في متغيرات Railway)"
                    : " — instant delivery OFF (set FIREBASE_DB_SECRET on Railway)";
                setWaState(
                  (st.connected
                    ? lang === "ar"
                      ? "متصل ✅"
                      : "Connected ✅"
                    : String(st.status || (lang === "ar" ? "غير متصل" : "Disconnected"))) +
                    tokenBad +
                    delivery,
                );
              } catch {
                setWaState(lang === "ar" ? "تعذر الوصول للسيرفر ❌" : "Unreachable ❌");
              }
            }}
            className="h-12 rounded-xl border border-border px-5 font-display text-sm"
          >
            {lang === "ar" ? "فحص الحالة" : "Check status"}
          </button>
        </div>
        <div className="flex flex-wrap gap-2">
          <a
            href={waUrl ? normalizeWaServerUrl(waUrl) + "/qr" : "#"}
            target="_blank"
            rel="noreferrer"
            className="inline-flex h-11 items-center rounded-xl border border-accent px-4 font-display text-sm text-accent"
          >
            {lang === "ar" ? "ربط واتساب (QR)" : "Link WhatsApp (QR)"}
          </a>
          <button
            onClick={() => void waControl("restart")}
            className="h-11 rounded-xl border border-border px-4 font-display text-sm"
          >
            {lang === "ar" ? "إعادة تشغيل" : "Restart"}
          </button>
          <button
            onClick={() => {
              if (
                window.confirm(
                  lang === "ar"
                    ? "تسجيل خروج الجلسة؟ ستحتاج لمسح QR من جديد."
                    : "Log out the session? You'll need to scan a new QR.",
                )
              )
                void waControl("logout");
            }}
            className="h-11 rounded-xl border border-destructive px-4 font-display text-sm text-destructive"
          >
            {lang === "ar" ? "تسجيل خروج الجلسة" : "Log out session"}
          </button>
        </div>
        <button
          onClick={async () => {
            const to = notify.replace(/\D/g, "");
            if (!to) {
              toast.error(lang === "ar" ? "أدخل رقم الإشعارات أولاً" : "Set the notification number first");
              return;
            }
            setWaState("...");
            const r = await sendWhatsAppTest({ url: waUrl.trim(), token: waToken.trim() }, to);
            setWaState(
              r.ok
                ? lang === "ar"
                  ? "تم إرسال رسالة تجريبية ✅"
                  : "Test message sent ✅"
                : (lang === "ar" ? "فشل الإرسال: " : "Send failed: ") + (r.error || ""),
            );
            if (r.ok) toast.success(lang === "ar" ? "تم الإرسال" : "Sent");
            else toast.error(r.error || "");
          }}
          className="h-11 w-full rounded-xl border border-primary px-4 font-display text-sm text-primary"
        >
          {lang === "ar" ? "إرسال رسالة تجريبية" : "Send test message"}
        </button>
        {waState && <p className="text-sm text-primary">{waState}</p>}

        <div className="rounded-xl border border-border p-4">
          <p className="font-display text-sm">
            {lang === "ar" ? "ملفات السيرفر (للنشر على GitHub)" : "Server files (to publish on GitHub)"}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            {lang === "ar"
              ? "حمّل الملفات كملف ZIP (index.js, package.json, README.md, railway.json, Procfile, .gitignore) ثم ارفعها كما هي لمستودع GitHub وانشرها على Railway."
              : "Download the files as a ZIP, push them to a GitHub repo, then deploy on Railway."}
          </p>
          <button
            onClick={async () => {
              try {
                await downloadWhatsappServerZip();
                toast.success(lang === "ar" ? "تم التحميل" : "Downloaded");
              } catch {
                toast.error(lang === "ar" ? "تعذر تحميل الملفات" : "Download failed");
              }
            }}
            className="mt-3 inline-flex h-11 items-center gap-2 rounded-xl bg-accent px-5 font-display text-sm text-accent-foreground"
          >
            <Download className="size-4" />
            {lang === "ar" ? "تحميل ملفات السيرفر (ZIP)" : "Download server files (ZIP)"}
          </button>
        </div>
      </div>

    </div>
  );
}

/* ---------------- clouds ---------------- */
function CloudsTab() {
  const { lang } = useI18n();
  const [active, setActive] = useState<string>("");
  useEffect(() => setActive(getActiveCloudId()), []);
  return (
    <div className="grid gap-4 md:grid-cols-3">
      {CLOUD_ACCOUNTS.map((a) => {
        const on = a.id === active;
        return (
          <div
            key={a.id}
            className={`rounded-2xl border p-5 ${on ? "border-primary bg-primary/10" : "border-border bg-card"}`}
          >
            <h3 className="font-display text-lg">{lang === "ar" ? a.label : a.labelEn}</h3>
            <p className="mt-1 font-tech text-xs text-muted-foreground">{a.cloudName}</p>
            <button
              onClick={() => {
                setActiveCloudId(a.id);
                setActive(a.id);
                toast.success(lang === "ar" ? "تم التفعيل" : "Activated");
              }}
              className={`mt-4 h-10 w-full rounded-xl font-display text-sm ${
                on ? "bg-primary text-primary-foreground" : "border border-border"
              }`}
            >
              {on ? (lang === "ar" ? "مفعّلة" : "Active") : lang === "ar" ? "تفعيل" : "Activate"}
            </button>
          </div>
        );
      })}
    </div>
  );
}

/* ---------------- settings: payment methods ---------------- */
function PaymentMethodsCard() {
  const { lang } = useI18n();
  const settings = useSettings();
  const [items, setItems] = useState<PaymentMethod[]>([]);
  const saved = settings["paymentMethods"];

  useEffect(() => {
    void ensurePaymentMethods();
  }, []);

  useEffect(() => {
    setItems(readPaymentMethods(settings));
  }, [JSON.stringify(saved ?? null)]);

  function patch(i: number, next: Partial<PaymentMethod>) {
    setItems((list) => list.map((m, idx) => (idx === i ? { ...m, ...next } : m)));
  }
  function patchField(i: number, fi: number, next: Partial<{ label: string; value: string }>) {
    setItems((list) =>
      list.map((m, idx) =>
        idx === i ? { ...m, fields: m.fields.map((f, j) => (j === fi ? { ...f, ...next } : f)) } : m,
      ),
    );
  }

  return (
    <div className={cardCls}>
      <div className="flex items-center gap-2">
        <span className="grid size-9 place-items-center rounded-xl bg-primary/15 text-primary">
          <Wallet className="size-4" />
        </span>
        <h2 className="font-display text-lg">
          {lang === "ar" ? "طرق الدفع" : "Payment methods"}
        </h2>
      </div>
      <p className="text-xs text-muted-foreground">
        {lang === "ar"
          ? "الطرق المفعّلة تظهر للزبون في صفحة الدفع مع إمكانية نسخ كل سطر."
          : "Active methods appear at checkout with copyable lines."}
      </p>

      {items.map((m, i) => (
        <div key={m.id} className="space-y-2 rounded-2xl border border-border p-3">
          <div className="flex items-center gap-2">
            <input
              className={inputCls}
              value={m.name}
              onChange={(e) => patch(i, { name: e.target.value })}
            />
            <button
              onClick={() => patch(i, { active: m.active === false })}
              className={`h-11 shrink-0 rounded-xl border px-3 text-xs ${
                m.active === false ? "border-border text-muted-foreground" : "border-primary text-primary"
              }`}
            >
              {m.active === false
                ? lang === "ar"
                  ? "موقوفة"
                  : "Off"
                : lang === "ar"
                  ? "مفعّلة"
                  : "On"}
            </button>
          </div>
          <div className="grid gap-2 sm:grid-cols-2">
            <input
              className={inputCls}
              dir="ltr"
              placeholder="English name"
              value={m.nameEn || ""}
              onChange={(e) => patch(i, { nameEn: e.target.value })}
            />
            <select
              className={inputCls}
              value={m.currency || "OMR"}
              onChange={(e) => patch(i, { currency: e.target.value as "OMR" | "USDT" })}
            >
              <option value="OMR">OMR — ر.ع</option>
              <option value="USDT">USDT</option>
            </select>
          </div>
          {m.fields.map((f, fi) => (
            <div key={fi} className="grid gap-2 sm:grid-cols-2">
              <input
                className={inputCls}
                value={f.label}
                onChange={(e) => patchField(i, fi, { label: e.target.value })}
              />
              <div className="flex gap-2">
                <input
                  className={inputCls}
                  dir="ltr"
                  value={f.value}
                  onChange={(e) => patchField(i, fi, { value: e.target.value })}
                />
                <button
                  onClick={() =>
                    patch(i, { fields: m.fields.filter((_, j) => j !== fi) })
                  }
                  className="h-11 shrink-0 rounded-xl border border-border px-3 text-xs text-muted-foreground"
                >
                  ✕
                </button>
              </div>
            </div>
          ))}
          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => patch(i, { fields: [...m.fields, { label: "", value: "" }] })}
              className="h-10 rounded-xl border border-border px-3 text-xs"
            >
              {lang === "ar" ? "إضافة سطر" : "Add line"}
            </button>
            <button
              onClick={() => setItems((list) => list.filter((_, j) => j !== i))}
              className="h-10 rounded-xl border border-destructive/50 px-3 text-xs text-destructive"
            >
              {lang === "ar" ? "حذف الطريقة" : "Delete method"}
            </button>
          </div>
          <Labeled label={lang === "ar" ? "شعار مخصص (اختياري)" : "Custom logo (optional)"}>
            <ImageUploader
              images={m.logo ? [m.logo] : []}
              onChange={(next) => patch(i, { logo: next[0] || "" })}
              folder="nmct_payments"
              multiple={false}
            />
          </Labeled>
        </div>
      ))}

      <div className="flex flex-wrap gap-2">
        <button
          onClick={() =>
            setItems((list) => [
              ...list,
              {
                id: "pm_" + Date.now(),
                name: lang === "ar" ? "طريقة دفع جديدة" : "New method",
                currency: "OMR",
                active: true,
                fields: [{ label: "", value: "" }],
              },
            ])
          }
          className="h-11 rounded-xl border border-border px-4 text-sm"
        >
          {lang === "ar" ? "إضافة طريقة دفع" : "Add payment method"}
        </button>
        <button
          onClick={async () => {
            await savePaymentMethods(items);
            toast.success(lang === "ar" ? "تم الحفظ" : "Saved");
          }}
          className="h-11 flex-1 rounded-xl bg-primary font-display text-primary-foreground"
        >
          {lang === "ar" ? "حفظ طرق الدفع" : "Save payment methods"}
        </button>
      </div>
    </div>
  );
}
