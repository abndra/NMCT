import { resolveImage } from "@/lib/assets";
import { demoCategories, demoProducts } from "@/lib/seed-data";
import {
  ref,
  set,
  get,
  push,
  update,
  remove,
  onValue,
  runTransaction,
  query,
  orderByChild,
  equalTo,
} from "firebase/database";
import {
  GoogleAuthProvider,
  signInWithPopup,
  getRedirectResult,
  signOut,
  onAuthStateChanged,
  type User,
} from "firebase/auth";
import { getDb, getFbAuth } from "./firebase";
import { getDeviceId, phoneKey, rememberOrderId, rememberPhone } from "./device";

/* ============================ TYPES ============================ */
export type Product = {
  id: string;
  name: string;
  nameEn?: string;
  description?: string;
  descriptionEn?: string;
  price: number;
  oldPrice?: number | undefined;
  image?: string;
  images?: string[];
  category?: string;
  categoryId?: string;
  platform?: string;
  sizes?: { name: string; price?: number }[];
  addons?: { name: string; price?: number }[];
  hidden?: boolean;
  featured?: boolean;
  /** Home page sections this product appears in: bestseller | offer | new */
  sections?: string[];
  soldCount?: number;
  stock?: number;
  /** Digital product: delivered automatically over WhatsApp once accepted. */
  digital?: boolean;
  /** Pool of unused codes for digital products (one per unit). */
  codes?: string[];
  /** "ستوك": unit-by-unit inventory where each unit is a code, an image or a text. */
  stockMode?: boolean;
  /** Delivered to the buyer when the product has no unit inventory. */
  deliveryText?: string;
  /** Unit-by-unit inventory: every single piece is tracked on its own. */
  units?: Record<string, StockUnit>;
  /** Number of tracked stock units (public counter, the units themselves are private). */
  unitCount?: number;
  /** Warn / show "آخر القطع" when the available stock drops to this number. */
  lowStockAt?: number;
  createdAt?: number;
};

/** One single physical/digital piece of a product. */
export type StockUnit = {
  id?: string;
  /** The digital code / serial handed to the buyer (optional for physical units). */
  code?: string;
  /** Image handed to the buyer (stock image unit). */
  image?: string;
  /** Unit kind: code | image | text */
  kind?: "code" | "image" | "text";
  label?: string;
  /** available = sellable, sold = handed to a buyer, disabled = kept but not sellable */
  status: "available" | "sold" | "disabled";
  orderId?: string;
  orderNumber?: number;
  buyerUid?: string;
  buyerName?: string;
  buyerEmail?: string;
  soldAt?: number;
  createdAt?: number;
};

export type Category = {
  id: string;
  name: string;
  nameEn?: string;
  image?: string;
  icon?: string;
  parentId?: string | null;
  hidden?: boolean;
};

export type OrderItem = {
  id: string;
  name: string;
  price: number;
  qty: number;
  image?: string;
  size?: string;
  addons?: string[];
};

export type Order = {
  id: string;
  orderNumber?: number;
  username?: string;
  uid?: string;
  customerName?: string;
  phone?: string;
  email?: string;
  note?: string;
  items: OrderItem[];
  total: number;
  currency?: string;
  discountCode?: string;
  discountAmount?: number;
  subtotal?: number;
  country?: string;
  countryName?: string;
  governorate?: string;
  city?: string;
  streetAddress?: string;
  deliveryMethod?: "home" | "office" | "digital" | string;
  deliveryFee?: number;
  paymentMethod?: "bank" | "cod" | string;
  senderName?: string;
  receiptImage?: string;
  receiptImages?: string[];
  paymentProof?: string;
  paymentMethodName?: string;
  paymentCurrency?: string;
  amountToPay?: string;
  cardNumber?: string;
  cardNumbers?: string[];

  status?: string;
  statusText?: string;
  accepted?: boolean;
  rejected?: boolean;
  rejectionReason?: string;
  deviceId?: string;
  phoneKey?: string;
  statusHistory?: { status: string; at: number }[];
  /** Digital codes handed to the customer once the order was accepted. */
  deliveredCodes?: DeliveredCode[];
  deliveredAt?: number;
  updatedAt?: number;
  createdAt: number;
};

export type DeliveredCode = {
  productId: string;
  productName: string;
  code: string;
  image?: string;
  kind?: "code" | "image" | "text";
  unitId?: string;
};


export type Review = {
  id: string;
  name: string;
  rating: number;
  text: string;
  approved?: boolean;
  productId?: string;
  createdAt?: number;
};

/** Fisher-Yates: used to hand out a random stock unit to each buyer. */
function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j] as T, a[i] as T];
  }
  return a;
}


export type Announcement = { id: string; text: string; textEn?: string; active?: boolean };
export type DiscountCode = {
  id: string;
  code: string;
  percent?: number;
  amount?: number;
  active?: boolean;
  maxUses?: number;
  usedCount?: number;
};

/* ============================ HELPERS ============================ */
function listFromSnap<T>(snap: { exists: () => boolean; val: () => Record<string, unknown> }): T[] {
  if (!snap.exists()) return [];
  const data = snap.val() || {};
  return Object.entries(data).map(([id, val]) => ({ id, ...(val as object) })) as T[];
}

export type Unsub = () => void;

/* ============================ AUTH ============================ */
const DEFAULT_AVATAR = "https://api.dicebear.com/9.x/bottts-neutral/svg?seed=nmct";

export async function signInWithGoogle() {
  const auth = getFbAuth();
  const provider = new GoogleAuthProvider();
  provider.setCustomParameters({ prompt: "select_account" });

  // Start the popup as the very first asynchronous operation. Safari and iOS
  // revoke the click's user-activation permission after any preceding await,
  // which previously caused either a silent failure or a lost redirect result.
  // Firebase's browser default is durable local persistence, so no persistence
  // operation is needed before opening the account chooser.
  const res = await signInWithPopup(auth, provider);
  await saveUser(res.user);
  return res.user;
}

export async function handleRedirectResult() {
  try {
    const res = await getRedirectResult(getFbAuth());
    if (res?.user) {
      await saveUser(res.user);
      return res.user;
    }
  } catch (error) {
    console.warn("Google redirect authentication failed", error);
  }
  return null;
}

async function saveUser(fbUser: User) {
  const db = getDb();
  const userRef = ref(db, "users/" + fbUser.uid);
  const profile = {
    uid: fbUser.uid,
    name: fbUser.displayName || "Player",
    email: fbUser.email || "",
    photo: fbUser.photoURL || DEFAULT_AVATAR,
    online: true,
    lastSeen: Date.now(),
  };

  // Authentication must not fail merely because optional profile storage is
  // unavailable. Realtime Database rules can be deployed independently from
  // Firebase Auth, so keep this synchronization best-effort.
  try {
    const snap = await get(userRef);
    const existing = (snap.exists() ? snap.val() : {}) as { banned?: boolean };
    if (existing.banned) {
      await signOut(getFbAuth());
      throw new Error("banned");
    }
    await update(userRef, profile);
  } catch (error) {
    if ((error as Error)?.message === "banned") throw error;
    console.warn("Unable to synchronize Firebase user profile", error);
  }
  return profile;
}

export function onAuthChange(cb: (u: User | null) => void) {
  return onAuthStateChanged(getFbAuth(), cb);
}

export async function logoutUser(uid?: string) {
  if (uid) {
    try {
      await update(ref(getDb(), "users/" + uid), { online: false, lastSeen: Date.now() });
    } catch {
      /* ignore */
    }
  }
  await signOut(getFbAuth());
}

/* ============================ PRODUCTS ============================ */
export function onProductsChange(cb: (items: Product[]) => void): Unsub {
  return onValue(ref(getDb(), "products"), (snap) => {
    const items: Product[] = listFromSnap<Product>(snap).map((p) => ({
      ...p,
      price: Number(p.price) || 0,
      oldPrice: p.oldPrice ? Number(p.oldPrice) : undefined,
      soldCount: Number(p.soldCount) || 0,
      ...(p.image ? { image: resolveImage(p.image) as string } : {}),
      ...(p.images ? { images: p.images.map((u) => resolveImage(u) as string) } : {}),
    }));
    items.sort((a, b) => String(b.id).localeCompare(String(a.id)));
    cb(items);
  });
}
export async function addProduct(product: Omit<Product, "id">) {
  const r = push(ref(getDb(), "products"));
  await set(r, { ...product, createdAt: Date.now(), hidden: false });
  return r.key;
}
export async function updateProduct(id: string, data: Partial<Product>) {
  await update(ref(getDb(), "products/" + id), data);
}
export async function deleteProduct(id: string) {
  await remove(ref(getDb(), "products/" + id));
}
export async function hideProduct(id: string, hidden: boolean) {
  await update(ref(getDb(), "products/" + id), { hidden });
}

/* ============================ CATEGORIES ============================ */
export function onCategoriesChange(cb: (items: Category[]) => void): Unsub {
  return onValue(ref(getDb(), "categories"), (snap) =>
    cb(
      listFromSnap<Category>(snap).map((c) =>
        c.image ? { ...c, image: resolveImage(c.image) as string } : c,
      ),
    ),
  );
}
export async function addCategory(category: Omit<Category, "id">) {
  const r = push(ref(getDb(), "categories"));
  await set(r, { ...category, hidden: false, createdAt: Date.now() });
  return r.key;
}
export async function updateCategory(id: string, data: Partial<Category>) {
  await update(ref(getDb(), "categories/" + id), data);
}
export async function deleteCategory(id: string) {
  await remove(ref(getDb(), "categories/" + id));
}

/* ============================ ORDERS ============================ */
/** Order lifecycle — single source of truth for admin + customer views. */
export const ORDER_STATUSES = [
  { key: "pending", ar: "قيد الإنتظار", en: "Pending" },
  { key: "delivered", ar: "تم الاستلام", en: "Received" },
] as const;

export type OrderStatusKey = (typeof ORDER_STATUSES)[number]["key"];

export function statusLabel(status: string | undefined, lang = "ar") {
  const found = ORDER_STATUSES.find((s) => s.key === status);
  if (found) return lang === "en" ? found.en : found.ar;
  // legacy values stored before the status rework
  if (status === "rejected") return lang === "en" ? "Rejected" : "مرفوض";
  if (status === "reviewing" || status === "accepted" || status === "preparing" || status === "shipped")
    return lang === "en" ? "Pending" : "قيد الإنتظار";
  return status || (lang === "en" ? "Pending" : "قيد الإنتظار");
}

/** Normalizes legacy rows so old orders behave like new ones. */
function normalizeOrder(o: Order): Order {
  const legacyPending = ["reviewing", "accepted", "preparing", "shipped"];
  const raw = o.status || "pending";
  const status = legacyPending.includes(raw) ? "pending" : raw;
  return {
    ...o,
    status,
    statusText: statusLabel(status, "ar"),
    phoneKey: o.phoneKey || phoneKey(o.phone),
  };
}

export async function createOrder(order: Omit<Order, "id" | "createdAt">) {
  const db = getDb();
  let orderNumber = 1;
  try {
    const res = await runTransaction(ref(db, "orders_counter"), (cur) =>
      typeof cur === "number" ? cur + 1 : 1,
    );
    const v = res.snapshot.val();
    if (typeof v === "number" && v > 0) orderNumber = v;
  } catch {
    orderNumber = Math.floor(Date.now() / 1000) % 100000000;
  }
  const now = Date.now();
  const orderRef = push(ref(db, "orders"));
  await set(orderRef, {
    ...order,
    orderNumber,
    status: "pending",
    statusText: "قيد الإنتظار",
    createdAt: now,
    accepted: false,
    rejected: false,
    rejectionReason: "",
    deviceId: order.deviceId || getDeviceId(),
    phoneKey: phoneKey(order.phone),
    statusHistory: [{ status: "pending", at: now }],
  });
  const id = orderRef.key as string;
  rememberOrderId(id);
  rememberPhone(String(order.phone || ""));
  return { id, orderNumber };
}

export function formatOrderNo(o: Pick<Order, "id" | "orderNumber">) {
  if (o?.orderNumber && o.orderNumber > 0) return String(o.orderNumber).padStart(8, "0");
  return String(o?.id || "")
    .slice(-8)
    .toUpperCase();
}

export function onOrdersChange(
  cb: (items: Order[]) => void,
  onError?: (err: Error) => void,
): Unsub {
  return onValue(
    ref(getDb(), "orders"),
    (snap) => {
      const items = listFromSnap<Order>(snap)
        .filter((o) => o && typeof o === "object" && Array.isArray(o.items))
        .map(normalizeOrder)
        .sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
      cb(items);
    },
    (err) => {
      console.error("[orders] read failed:", err);
      onError?.(err as Error);
    },
  );
}

export function onOrderChange(id: string, cb: (order: Order | null) => void): Unsub {
  return onValue(ref(getDb(), "orders/" + id), (snap) =>
    cb(snap.exists() ? normalizeOrder({ id, ...(snap.val() as object) } as Order) : null),
  );
}

export function onUserOrdersChange(uid: string, cb: (items: Order[]) => void): Unsub {
  return onOrdersChange((items) => cb(items.filter((o) => o.uid === uid || o.username === uid)));
}

/**
 * Customer-facing tracking: matches by this device, by any order placed from
 * it, and by any phone number the customer searched for (last 8 digits).
 */
export function onMyOrdersChange(
  opts: { deviceId?: string; orderIds?: string[]; phones?: string[]; uid?: string },
  cb: (items: Order[]) => void,
): Unsub {
  const db = getDb();
  const found = new Map<string, Order>();
  const emit = () =>
    cb([...found.values()].sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0)));
  const take = (items: Order[]) => {
    for (const o of items) found.set(o.id, o);
    emit();
  };
  const subs: Unsub[] = [];
  const byChild = (child: string, value: string) =>
    subs.push(
      onValue(
        query(ref(db, "orders"), orderByChild(child), equalTo(value)),
        (snap) =>
          take(
            listFromSnap<Order>(snap)
              .filter((o) => o && typeof o === "object" && Array.isArray(o.items))
              .map(normalizeOrder),
          ),
        () => {},
      ),
    );

  if (opts.uid) byChild("uid", opts.uid);
  if (opts.deviceId) byChild("deviceId", opts.deviceId);
  for (const p of opts.phones || []) {
    const k = phoneKey(p);
    if (k.length >= 5) byChild("phoneKey", k);
  }
  for (const id of opts.orderIds || []) {
    subs.push(
      onValue(
        ref(db, "orders/" + id),
        (snap) => {
          if (snap.exists()) take([normalizeOrder({ id, ...(snap.val() as object) } as Order)]);
        },
        () => {},
      ),
    );
  }
  if (!subs.length) emit();
  return () => subs.forEach((u) => u());
}

export function onOrdersByPhoneChange(phone: string, cb: (items: Order[]) => void): Unsub {
  return onMyOrdersChange({ phones: [phone] }, cb);
}

export async function updateOrderStatus(id: string, status: string, statusText?: string) {
  const at = Date.now();
  const orderRef = ref(getDb(), "orders/" + id);
  const snap = await get(orderRef);
  const prev = (snap.exists() ? snap.val() : {}) as Order;
  const history = Array.isArray(prev.statusHistory) ? prev.statusHistory : [];
  await update(orderRef, {
    status,
    statusText: statusText || statusLabel(status, "ar"),
    accepted: status !== "pending" && status !== "rejected",
    rejected: status === "rejected",
    updatedAt: at,
    statusHistory: [...history, { status, at }],
  });
}

/**
 * Pulls one code per purchased unit for every digital product in the order and
 * stores them on the order. Also decrements stock for every item.
 * Returns the codes that were allocated (empty when nothing is digital).
 */
/** Auto-generated demo codes from the sample catalogue: never hand these to a buyer. */
const DEMO_CODE_RE = /^(ESIM3|ESIM30|IOSP|ACC)-\d{3,5}-\d{3}$/i;

export type FulfillReport = {
  codes: DeliveredCode[];
  /** Products that had no real inventory left in the dashboard. */
  missing: { productId: string; productName: string; qty: number }[];
};

export async function fulfillOrder(id: string): Promise<DeliveredCode[]> {
  return (await fulfillOrderWithReport(id)).codes;
}

export async function fulfillOrderWithReport(id: string): Promise<FulfillReport> {
  const db = getDb();
  const snap = await get(ref(db, "orders/" + id));
  if (!snap.exists()) return { codes: [], missing: [] };
  const order = { id, ...(snap.val() as object) } as Order;
  if (Array.isArray(order.deliveredCodes) && order.deliveredCodes.length) {
    return { codes: order.deliveredCodes, missing: [] };
  }
  const delivered: DeliveredCode[] = [];
  const missing: FulfillReport["missing"] = [];
  for (const item of order.items || []) {
    const qty = Math.max(1, Number(item.qty) || 1);
    const pRef = ref(db, "products/" + item.id);
    const pSnap = await get(pRef);
    if (!pSnap.exists()) continue;
    const product = pSnap.val() as Product;

    // ---- unit-tracked inventory (preferred) ----
    const unitsMap = await getUnits(item.id);
    if (Object.keys(unitsMap).length) {
      // random allocation: every buyer gets a random unused unit from the pool
      const free = shuffle(availableUnits({ units: unitsMap })).slice(0, qty);
      if (free.length < qty)
        missing.push({ productId: item.id, productName: item.name, qty: qty - free.length });
      const now = Date.now();
      for (const u of free) {
        await update(stockRef(item.id, u.id), {
          status: "sold",
          orderId: id,
          orderNumber: order.orderNumber || 0,
          buyerUid: order.uid || "",
          buyerName: order.customerName || order.username || "",
          buyerEmail: order.email || "",
          soldAt: now,
        });
        if (u.code || u.image)
          delivered.push({
            productId: item.id,
            productName: item.name,
            code: u.code || "",
            image: u.image || "",
            kind: u.kind || (u.image ? "image" : "code"),
            unitId: u.id || "",
          });
      }
      const fresh = await getUnits(item.id);
      await update(pRef, {
        stock: availableUnits({ units: fresh }).length,
        unitCount: Object.keys(fresh).length,
        soldCount: (Number(product.soldCount) || 0) + qty,
      });
      continue;
    }


    // stock always goes down, digital or not
    const updates: Partial<Product> = {
      stock: Math.max(0, (Number(product.stock) || 0) - qty),
      soldCount: (Number(product.soldCount) || 0) + qty,
    };
    if (product.digital) {
      // only real inventory entered in the dashboard, never sample/demo codes
      const pool = shuffle(
        (Array.isArray(product.codes) ? product.codes : []).filter(
          (c) => c && !DEMO_CODE_RE.test(String(c).trim()),
        ),
      );
      let handed = 0;
      for (let i = 0; i < qty; i++) {
        const code = pool.shift();
        if (!code) break;
        handed++;
        const isImage = /^https?:\/\/\S+\.(png|jpe?g|webp|gif|svg)(\?\S*)?$/i.test(code);
        delivered.push({
          productId: item.id,
          productName: item.name,
          code: isImage ? "" : code,
          image: isImage ? code : "",
          kind: isImage ? "image" : "code",
        });
      }
      updates.codes = pool;
      // for digital products the code pool IS the stock
      updates.stock = pool.length;
      if (handed < qty)
        missing.push({ productId: item.id, productName: item.name, qty: qty - handed });
    } else if (product.deliveryText) {

      for (let i = 0; i < qty; i++) {
        delivered.push({ productId: item.id, productName: item.name, code: product.deliveryText });
      }
    }
    await update(pRef, updates);
  }
  // Every item must leave a trace on the customer's "My orders" page, even when
  // it is a normal (non-digital) product handed over on WhatsApp.
  for (const item of order.items || []) {
    if (delivered.some((d) => d.productId === item.id)) continue;
    const pSnap = await get(ref(db, "products/" + item.id));
    const product = (pSnap.exists() ? pSnap.val() : {}) as Product;
    delivered.push({
      productId: item.id,
      productName: item.name,
      code:
        product.deliveryText ||
        "تم تسليم هذا المنتج ✅ — أُرسلت التفاصيل أيضاً على الواتساب. لأي استفسار راسلنا.",
      kind: "text",
    });
  }
  if (delivered.length) {
    await update(ref(db, "orders/" + id), { deliveredCodes: delivered, deliveredAt: Date.now() });
  }
  return { codes: delivered, missing };
}

export async function acceptOrder(id: string) {
  await updateOrderStatus(id, "delivered");
  return await fulfillOrder(id);
}

/** Marks the order as received by the customer and hands over one stock unit each. */
export async function deliverOrder(id: string): Promise<FulfillReport> {
  const report = await fulfillOrderWithReport(id);
  await updateOrderStatus(id, "delivered");
  return report;
}

/** Puts a delivered order back to pending and returns its units to the stock. */
export async function revertOrderToPending(id: string) {
  await restoreOrderStock(id);
  await updateOrderStatus(id, "pending");
}

/** Restores digital codes + stock when an accepted order is later rejected. */
export async function restoreOrderStock(id: string) {
  const db = getDb();
  const snap = await get(ref(db, "orders/" + id));
  if (!snap.exists()) return;
  const order = { id, ...(snap.val() as object) } as Order;
  for (const item of order.items || []) {
    const qty = Math.max(1, Number(item.qty) || 1);
    const pRef = ref(db, "products/" + item.id);
    const pSnap = await get(pRef);
    if (!pSnap.exists()) continue;
    const product = pSnap.val() as Product;

    const unitsMap = await getUnits(item.id);
    if (Object.keys(unitsMap).length) {
      for (const u of unitList({ units: unitsMap })) {
        if (u.orderId !== id) continue;
        await update(stockRef(item.id, u.id), {
          status: "available",
          orderId: "",
          orderNumber: 0,
          buyerUid: "",
          buyerName: "",
          buyerEmail: "",
          soldAt: 0,
        });
      }
      const fresh = await getUnits(item.id);
      await update(pRef, {
        stock: availableUnits({ units: fresh }).length,
        unitCount: Object.keys(fresh).length,
        soldCount: Math.max(0, (Number(product.soldCount) || 0) - qty),
      });
      continue;
    }

    const back = (order.deliveredCodes || [])
      .filter((d) => d.productId === item.id)
      .map((d) => d.code);
    const restoredCodes = [...(product.codes || []), ...back];
    await update(pRef, {
      stock: product.digital ? restoredCodes.length : (Number(product.stock) || 0) + qty,
      soldCount: Math.max(0, (Number(product.soldCount) || 0) - qty),
      ...(product.digital ? { codes: restoredCodes } : {}),
    });
  }
  await update(ref(db, "orders/" + id), { deliveredCodes: [], deliveredAt: 0 });
}

export async function rejectOrder(id: string, reason: string) {
  await update(ref(getDb(), "orders/" + id), { rejectionReason: reason || "" });
  await updateOrderStatus(id, "rejected");
}

export async function deleteOrder(id: string) {
  await remove(ref(getDb(), "orders/" + id));
}

/* ============================ REVIEWS ============================ */
export function onReviewsChange(cb: (items: Review[]) => void): Unsub {
  return onValue(ref(getDb(), "reviews"), (snap) => cb(listFromSnap<Review>(snap)));
}
export async function addReview(review: Omit<Review, "id">) {
  const r = push(ref(getDb(), "reviews"));
  await set(r, { ...review, approved: review.approved === true, createdAt: Date.now() });
  return r.key;
}
export async function approveReview(id: string) {
  await update(ref(getDb(), "reviews/" + id), { approved: true });
}
export async function deleteReview(id: string) {
  await remove(ref(getDb(), "reviews/" + id));
}

/* ============================ DISCOUNTS ============================ */
export function onDiscountCodesChange(cb: (items: DiscountCode[]) => void): Unsub {
  return onValue(ref(getDb(), "discountCodes"), (snap) => cb(listFromSnap<DiscountCode>(snap)));
}
export async function addDiscountCode(code: Omit<DiscountCode, "id">) {
  const r = push(ref(getDb(), "discountCodes"));
  await set(r, { ...code, active: true, usedCount: 0, createdAt: Date.now() });
  return r.key;
}
export async function deleteDiscountCode(id: string) {
  await remove(ref(getDb(), "discountCodes/" + id));
}
export async function validateDiscountCode(code: string): Promise<DiscountCode | null> {
  const snap = await get(ref(getDb(), "discountCodes"));
  const all = listFromSnap<DiscountCode>(snap);
  const found = all.find(
    (c) =>
      String(c.code || "").toLowerCase() ===
      String(code || "")
        .trim()
        .toLowerCase(),
  );
  if (!found || found.active === false) return null;
  if (found.maxUses && (found.usedCount || 0) >= found.maxUses) return null;
  return found;
}
export async function incrementDiscountUsage(id: string) {
  await runTransaction(
    ref(getDb(), "discountCodes/" + id + "/usedCount"),
    (cur) => (typeof cur === "number" ? cur : 0) + 1,
  );
}

/* ============================ ANNOUNCEMENTS / SETTINGS ============================ */
export function onAnnouncementsChange(cb: (items: Announcement[]) => void): Unsub {
  return onValue(ref(getDb(), "announcements"), (snap) => cb(listFromSnap<Announcement>(snap)));
}
export async function addAnnouncement(text: string, textEn?: string) {
  const r = push(ref(getDb(), "announcements"));
  await set(r, { text, textEn: textEn || "", active: true, createdAt: Date.now() });
  return r.key;
}
export async function deleteAnnouncement(id: string) {
  await remove(ref(getDb(), "announcements/" + id));
}
export function onSettingsChange(cb: (s: Record<string, unknown>) => void): Unsub {
  return onValue(ref(getDb(), "settings"), (snap) => cb(snap.exists() ? snap.val() : {}));
}
export async function updateSettings(key: string, value: unknown) {
  await set(ref(getDb(), "settings/" + key), value);
}

/* ============================ PAYMENT METHODS ============================ */
export type PaymentField = { label: string; value: string };
export type PaymentMethod = {
  id: string;
  name: string;
  nameEn?: string;
  /** Bundled logo key: bank | binance | usdt | ooredoo */
  icon?: string;
  /** Custom uploaded logo (wins over `icon`). */
  logo?: string;
  /** Currency the customer transfers in. */
  currency?: "OMR" | "USDT" | "OOREDOO";
  note?: string;
  noteEn?: string;
  fields: PaymentField[];
  active?: boolean;
  /** Customer may send an Ooredoo card instead of a transfer receipt. */
  allowCard?: boolean;
};

export const DEFAULT_PAYMENT_METHODS: PaymentMethod[] = [
  {
    id: "bank",
    name: "تحويل بنكي — بنك مسقط",
    nameEn: "Bank transfer — Bank Muscat",
    icon: "bank",
    currency: "OMR",
    active: true,
    fields: [
      { label: "اسم البنك", value: "بنك مسقط" },
      { label: "رقم الحساب", value: "97825550" },
      { label: "اسم صاحب الحساب", value: "NMCT" },
    ],
  },
  {
    id: "binance",
    name: "Binance — USDT",
    nameEn: "Binance — USDT",
    icon: "binance",
    currency: "USDT",
    active: true,
    note: "حوّل المبلغ بعملة USDT عبر شبكة BEP20 أو مباشرة على Binance ID.",
    noteEn: "Send USDT over the BEP20 network or directly to the Binance ID.",
    fields: [
      { label: "Binance ID", value: "781255983" },
      { label: "BEP20 Address", value: "0x1f6faf573c33de490f89068b4557714b977613b5" },
      { label: "العملة / Currency", value: "USDT" },
    ],
  },
  {
    id: "ooredoo",
    name: "أوريدو — تحويل رصيد",
    nameEn: "Ooredoo — balance transfer",
    icon: "ooredoo",
    currency: "OOREDOO",
    active: true,
    allowCard: true,
    note: "التسعيرة: 750 بيسة بنكية = 1 ريال أوريدو. حوّل الرصيد على الرقم ثم ارفع إيصال التحويل، أو أرسل بطاقة أوريدو (صورة الرسالة أو رقم البطاقة) بدون إيصال.",
    noteEn:
      "Rate: 750 bank baisa = 1 Ooredoo rial. Transfer the balance to the number and upload the receipt, or send an Ooredoo card (photo or card number) instead.",
    fields: [
      { label: "رقم التحويل", value: "94052992" },
      { label: "التسعيرة", value: "750 بيسة بنك = 1 ريال أوريدو" },
    ],
  },
];


export function readPaymentMethods(settings: Record<string, unknown>): PaymentMethod[] {
  const raw = settings["paymentMethods"];
  const list = Array.isArray(raw)
    ? (raw as PaymentMethod[])
    : raw && typeof raw === "object"
      ? (Object.values(raw as Record<string, PaymentMethod>) as PaymentMethod[])
      : [];
  const clean = list
    .filter((m) => m && m.id && m.name)
    .map((m) => ({ ...m, fields: Array.isArray(m.fields) ? m.fields : [] }));
  const base = clean.length ? clean : DEFAULT_PAYMENT_METHODS;
  // Built-in methods added later stay available even for stores saved before them.
  const merged = [...base, ...DEFAULT_PAYMENT_METHODS.filter((d) => !base.some((m) => m.id === d.id))];
  return merged.filter((m) => m.active !== false);
}

export async function savePaymentMethods(methods: PaymentMethod[]) {
  await set(ref(getDb(), "settings/paymentMethods"), methods);
}

/** Writes the built-in methods once, and adds any newly bundled ones (e.g. Ooredoo). */
export async function ensurePaymentMethods() {
  const snap = await get(ref(getDb(), "settings/paymentMethods"));
  if (!snap.exists()) {
    await savePaymentMethods(DEFAULT_PAYMENT_METHODS);
    return;
  }
  const raw = snap.val();
  const current: PaymentMethod[] = Array.isArray(raw) ? raw : Object.values(raw || {});
  const missing = DEFAULT_PAYMENT_METHODS.filter((d) => !current.some((m) => m?.id === d.id));
  if (missing.length) await savePaymentMethods([...current, ...missing]);
}



/* ============================ USERS / VISITS ============================ */
export function onUsersChange(cb: (items: { id: string }[]) => void): Unsub {
  return onValue(ref(getDb(), "users"), (snap) => cb(listFromSnap(snap)));
}
export async function banUser(uid: string, banned: boolean) {
  await update(ref(getDb(), "users/" + uid), { banned });
}
export async function trackVisit(page: string) {
  try {
    const today = new Date().toISOString().split("T")[0];
    const db = getDb();
    await runTransaction(
      ref(db, "visits/" + today + "/count"),
      (c) => (typeof c === "number" ? c : 0) + 1,
    );
    await runTransaction(
      ref(db, "visits/" + today + "/pages/" + page),
      (c) => (typeof c === "number" ? c : 0) + 1,
    );
  } catch {
    /* ignore */
  }
}

/* ============================ ADMIN ============================ */
/**
 * Supports both shapes in Realtime Database:
 *   admin: { key: "123" }
 *   admin: { wtn: { user: "wtn", key: "123" } }
 */
/** Google accounts allowed into the admin panel (UIDs). */
export const ADMIN_UIDS: string[] = [
  "acRbPLo68QUy6KuX39QwYtOAius2",
  "0sbeBxzfneV9ugg4QrEMFhSqB8A3",
  "RomacPc4tENsaLcuj8qDnhsCyAu2",
];

/** True when this Google account may open the admin panel. */
export async function isAdminUid(uid: string | undefined | null) {
  const id = String(uid || "").trim();
  if (!id) return false;
  if (ADMIN_UIDS.includes(id)) return true;
  try {
    const snap = await get(ref(getDb(), "admin/uids"));
    if (!snap.exists()) return false;
    const val = snap.val();
    const list = Array.isArray(val) ? val : Object.values(val || {});
    return list.map((v) => String(v).trim()).includes(id);
  } catch {
    return false;
  }
}

/** True when the database rules recognise this account (admins/{uid} === true). */
export async function isDbAdmin(uid: string | undefined | null) {
  const id = String(uid || "").trim();
  if (!id) return false;
  try {
    const snap = await get(ref(getDb(), "admins/" + id));
    return snap.exists() && snap.val() === true;
  } catch {
    return false;
  }
}

/**
 * Registers the current account inside `admins/{uid}` so the database rules
 * allow reading orders and stock. Works for accounts already listed in
 * ADMIN_UIDS / admin/uids, or as first-admin bootstrap when the node is empty.
 */
export async function claimAdmin(uid: string | undefined | null) {
  const id = String(uid || "").trim();
  if (!id) return false;
  try {
    await set(ref(getDb(), "admins/" + id), true);
    return true;
  } catch (e) {
    console.error("[admins] claim failed:", e);
    return false;
  }
}



export async function adminLogin(key: string) {
  const snap = await get(ref(getDb(), "admin"));
  if (!snap.exists()) return false;
  const val = snap.val();
  const k = String(key || "").trim();
  if (!k) return false;

  function containsKey(node: unknown, field = ""): boolean {
    if (typeof node === "string" || typeof node === "number") {
      return (
        (field === "key" || field === "password" || field === "accessKey" || field === "") &&
        String(node).trim() === k
      );
    }
    if (!node || typeof node !== "object") return false;
    return Object.entries(node as Record<string, unknown>).some(([name, child]) =>
      containsKey(child, name),
    );
  }
  return containsKey(val);
}

/* ============================ STOCK ============================ */
/**
 * Secret inventory (codes / images) lives OUTSIDE the public products node so
 * database rules can keep it admin-only. Path: stock/{productId}/{unitId}
 */
export function stockPath(productId: string, unitId?: string) {
  return `stock/${productId}` + (unitId ? `/${unitId}` : "");
}
function stockRef(productId: string, unitId?: string) {
  return ref(getDb(), stockPath(productId, unitId));
}
export async function getUnits(productId: string): Promise<Record<string, StockUnit>> {
  const snap = await get(stockRef(productId));
  return snap.exists() ? (snap.val() as Record<string, StockUnit>) : {};
}
/** Live inventory of one product (admin only — rules block everyone else). */
export function onProductUnitsChange(productId: string, cb: (units: StockUnit[]) => void) {
  return onValue(stockRef(productId), (snap) =>
    cb(unitList({ units: snap.exists() ? (snap.val() as Record<string, StockUnit>) : {} })),
  );
}

/** Turns the units map into a sorted array. */
export function unitList(p: Pick<Product, "units">): StockUnit[] {
  const map = p?.units || {};
  return Object.entries(map)
    .map(([id, u]) => ({ ...(u as StockUnit), id }))
    .sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0));
}

export function availableUnits(p: Pick<Product, "units">): StockUnit[] {
  return unitList(p).filter((u) => u.status !== "sold" && u.status !== "disabled");
}

export function soldUnits(p: Pick<Product, "units">): StockUnit[] {
  return unitList(p).filter((u) => u.status === "sold");
}

/** Units a customer can actually buy right now (unit inventory is the source of truth). */
export function availableStock(
  p: Pick<Product, "digital" | "codes" | "stock" | "units">,
): number {
  if (p.units && Object.keys(p.units).length) return availableUnits(p).length;
  if (p.digital && Array.isArray(p.codes) && p.codes.length) return p.codes.length;
  return Math.max(0, Number(p.stock) || 0);
}

/** Adds pieces to a product, one row per unit. */
export async function addStockUnits(
  productId: string,
  units: { code?: string; label?: string; image?: string; kind?: StockUnit["kind"] }[],
) {
  const db = getDb();
  const now = Date.now();
  for (const u of units) {
    const r = push(stockRef(productId));
    await set(r, {
      code: u.code || "",
      label: u.label || "",
      image: u.image || "",
      kind: u.kind || (u.image ? "image" : "code"),
      status: "available",
      createdAt: now,
    });
  }
  await syncProductStock(productId);
}

export async function updateStockUnit(productId: string, unitId: string, data: Partial<StockUnit>) {
  await update(stockRef(productId, unitId), data);
  await syncProductStock(productId);
}

export async function deleteStockUnit(productId: string, unitId: string) {
  await remove(stockRef(productId, unitId));
  await syncProductStock(productId);
}

/** Keeps products/{id}/stock in sync with the number of available units. */
export async function syncProductStock(productId: string) {
  const units = await getUnits(productId);
  const total = Object.keys(units).length;
  if (!total) return;
  await update(ref(getDb(), "products/" + productId), {
    stock: availableUnits({ units }).length,
    unitCount: total,
    // never mirror secret codes into the public products node
    codes: [],
  });
}

/** One-time migration: turns a legacy codes[] pool into tracked units. */
export async function migrateCodesToUnits(productId: string) {
  const snap = await get(ref(getDb(), "products/" + productId));
  if (!snap.exists()) return;
  const p = snap.val() as Product;
  if (Object.keys(await getUnits(productId)).length) return;
  const legacy = Array.isArray(p.codes) ? p.codes : [];
  const count = legacy.length || Math.max(0, Number(p.stock) || 0);
  const rows = Array.from({ length: count }, (_, i) => ({ code: legacy[i] || "" }));
  if (rows.length) await addStockUnits(productId, rows);
}

export function isOutOfStock(p: Pick<Product, "digital" | "codes" | "stock" | "units">) {
  return availableStock(p) <= 0;
}

/** True when stock is running out (defaults to 5 units or less). */
export function isLowStock(
  p: Pick<Product, "digital" | "codes" | "stock" | "lowStockAt" | "units">,
) {
  const left = availableStock(p);
  return left > 0 && left <= Math.max(1, Number(p.lowStockAt) || 5);
}

export type StockState = "out" | "low" | "ok";
export function stockState(p: Product): StockState {
  if (isOutOfStock(p)) return "out";
  if (isLowStock(p)) return "low";
  return "ok";
}

export function stockLabel(p: Product, lang: "ar" | "en") {
  const left = availableStock(p);
  if (left <= 0) return lang === "ar" ? "نفذت الكمية" : "Out of stock";
  if (isLowStock(p))
    return lang === "ar" ? `آخر ${left} قطع` : `Only ${left} left`;
  return lang === "ar" ? `متوفر · ${left}` : `In stock · ${left}`;
}

/* ============================ SEEDING ============================ */
export async function seedDemoData() {
  const db = getDb();
  const createdAt = Date.now();
  const categories = Object.fromEntries(
    Object.entries(demoCategories).map(([id, c]) => [id, { ...c, createdAt }]),
  );
  const products = Object.fromEntries(
    Object.entries(demoProducts).map(([id, p]) => [
      id,
      { ...p, createdAt, stock: p.codes.length },
    ]),
  );
  await update(ref(db), { categories, products });
}


/* ============================ ADMIN "NEW ORDERS" BADGE ============================ */
/** Timestamp of the last time the admin opened the orders tab. */
export function onOrdersSeenAtChange(cb: (t: number) => void): Unsub {
  return onValue(ref(getDb(), "settings/ordersSeenAt"), (snap) =>
    cb(snap.exists() ? Number(snap.val()) || 0 : 0),
  );
}

export async function markOrdersSeen() {
  await set(ref(getDb(), "settings/ordersSeenAt"), Date.now());
}

/* ============================ WHATSAPP NOTIFICATIONS ============================ */
export const STORE_NAME = "NMCT";

/** Admin WhatsApp number (settings/notifyWhatsapp), managed from the admin settings tab. */
export function onNotifyNumberChange(cb: (n: string) => void): Unsub {
  return onValue(ref(getDb(), "settings/notifyWhatsapp"), (snap) =>
    cb(snap.exists() ? String(snap.val()) : ""),
  );
}

export async function getNotifyNumber(): Promise<string> {
  const snap = await get(ref(getDb(), "settings/notifyWhatsapp"));
  return snap.exists() ? String(snap.val()) : "";
}

/** Default dialling code, editable from the admin settings (settings/countryCode). */
export const DEFAULT_COUNTRY_CODE = "968";

export function onCountryCodeChange(cb: (c: string) => void): Unsub {
  return onValue(ref(getDb(), "settings/countryCode"), (snap) =>
    cb(snap.exists() ? String(snap.val()).replace(/\D/g, "") || DEFAULT_COUNTRY_CODE : DEFAULT_COUNTRY_CODE),
  );
}

export async function getCountryCode(): Promise<string> {
  try {
    const snap = await get(ref(getDb(), "settings/countryCode"));
    const v = snap.exists() ? String(snap.val()).replace(/\D/g, "") : "";
    return v || DEFAULT_COUNTRY_CODE;
  } catch {
    return DEFAULT_COUNTRY_CODE;
  }
}

/** Prefixes a local number with the store dialling code (default +968). */
export function waNumber(phone: string | undefined, cc: string = DEFAULT_COUNTRY_CODE) {
  const raw = String(phone || "").trim();
  let digits = raw.replace(/\D/g, "");
  if (!digits) return "";
  const code = String(cc || DEFAULT_COUNTRY_CODE).replace(/\D/g, "") || DEFAULT_COUNTRY_CODE;
  // Already an international number: +9689xxxxxxx / 009689xxxxxxx
  const international = raw.startsWith("+") || digits.startsWith("00");
  if (digits.startsWith("00")) digits = digits.slice(2);
  if (international) return digits;
  // Local number: drop trunk zeros then prefix the selected dialling code.
  if (digits.startsWith(code) && digits.length > code.length) return digits;
  return code + digits.replace(/^0+/, "");
}

export function waLink(phone: string | undefined, text: string) {
  return `https://wa.me/${waNumber(phone)}?text=${encodeURIComponent(text)}`;
}

const money = (n: number | undefined) => `${(Number(n) || 0).toFixed(2)} ر.ع`;

function itemLines(order: Order) {
  return (order.items || []).map(
    (i, idx) =>
      `  ${idx + 1}. ${i.name}${i.size ? ` (${i.size})` : ""} × ${i.qty} — ${money(i.price * i.qty)}`,
  );
}

/** Message sent to the store owner when a new order lands. */
export function adminOrderMessage(order: Pick<Order, "items" | "total" | "customerName" | "phone" | "paymentMethod" | "receiptImage" | "note" | "discountCode" | "discountAmount" | "deliveryFee">, orderNo: string) {
  return [
    `🟢 *طلب جديد — ${STORE_NAME}*`,
    "━━━━━━━━━━━━━━",
    `🆔 *رقم الطلب:* ${orderNo}`,
    `👤 *العميل:* ${order.customerName || "-"}`,
    `📱 *الهاتف:* ${order.phone || "-"}`,
    "━━━━━━━━━━━━━━",
    "🧾 *المنتجات:*",
    ...itemLines(order as Order),
    "━━━━━━━━━━━━━━",
    ...(order.discountCode ? [`🏷️ *كود الخصم:* ${order.discountCode} (-${money(order.discountAmount)})`] : []),
    `💰 *الإجمالي:* ${money(order.total)}`,
    `💳 *الدفع:* ${order.paymentMethod === "bank" ? "تحويل بنكي" : "عند الاستلام"}`,
    ...(order.receiptImage ? [`🧾 *الإيصال:* ${order.receiptImage}`] : []),
    ...(order.note ? [`🗒️ *ملاحظة:* ${order.note}`] : []),
    "━━━━━━━━━━━━━━",
    `🕒 ${new Date().toLocaleString("ar-EG", { dateStyle: "medium", timeStyle: "short" })}`,
  ].join("\n");
}

/** Thank-you message sent to the customer right after placing the order. */
export function customerOrderMessage(order: Pick<Order, "items" | "total" | "customerName" | "paymentMethod" | "deliveryFee" | "discountCode" | "discountAmount">, orderNo: string) {
  return [
    `شكراً لطلبك من *${STORE_NAME}* 💚`,
    "━━━━━━━━━━━━━━",
    `مرحباً ${order.customerName || ""}، تم استلام طلبك بنجاح.`,
    `🆔 *رقم الطلب:* ${orderNo}`,
    "",
    "🧾 *تفاصيل الطلب:*",
    ...itemLines(order as Order),
    "━━━━━━━━━━━━━━",
    ...(order.discountCode ? [`🏷️ الخصم: -${money(order.discountAmount)}`] : []),
    `💰 *الإجمالي:* ${money(order.total)}`,
    `💳 *الدفع:* ${order.paymentMethod === "bank" ? "تحويل بنكي" : "عند الاستلام"}`,
    "",
    "سنراجع طلبك وسيصلك المحتوى فور القبول. شكراً لثقتك 💚",
  ].join("\n");
}

/** Message delivered to the customer with their digital content. */
export function customerCodesMessage(orderNo: string, codes: DeliveredCode[]) {
  return [
    `✅ *تم قبول طلبك في ${STORE_NAME}*`,
    `🆔 رقم الطلب: ${orderNo}`,
    "━━━━━━━━━━━━━━",
    "📦 *محتوى طلبك:*",
    ...codes.flatMap((c) => [
      "",
      `• ${c.productName}`,
      ...(c.code ? [c.code] : []),
      ...(c.image ? [`🖼️ ${c.image}`] : []),
    ]),
    "",
    "━━━━━━━━━━━━━━",
    `شكراً لثقتك بـ ${STORE_NAME} 💚`,
  ].join("\n");
}

/** Message sent to the customer for non-digital orders once accepted. */
export function customerAcceptedMessage(orderNo: string) {
  return [
    `✅ *تم قبول طلبك في ${STORE_NAME}*`,
    `🆔 رقم الطلب: ${orderNo}`,
    "",
    "سنتواصل معك لإتمام التسليم في أقرب وقت.",
    `شكراً لثقتك 💚`,
  ].join("\n");
}

/* ---- Railway WhatsApp bot (Baileys: POST /send with bearer token) ---- */
export type WaServer = { url: string; token: string };

export function normalizeWaServerUrl(raw: string) {
  let base = String(raw || "").trim();
  if (!base) return "";
  if (!/^https?:\/\//i.test(base)) base = "https://" + base;
  try {
    return new URL(base).origin;
  } catch {
    return base
      .replace(/[?#].*$/, "")
      .replace(/\/+$/, "")
      .replace(/\/(status|send|qr|restart|logout)$/i, "");
  }
}

export async function getWaServer(): Promise<WaServer | null> {
  const snap = await get(ref(getDb(), "settings/whatsappServer"));
  if (!snap.exists()) return null;
  const v = snap.val() as WaServer;
  return v && v.url ? v : null;
}

export type WaStatus = {
  connected?: boolean;
  status?: string;
  qr?: string;
  error?: string;
  /** false when the saved token is rejected by the server (HTTP 401). */
  tokenOk?: boolean;
};

/** Confirms the token is the one the Railway server was deployed with. */
async function waTokenOk(base: string, token: string): Promise<boolean> {
  try {
    const res = await fetch(base + "/send", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: "Bearer " + token },
      body: "{}",
    });
    return res.status !== 401 && res.status !== 403;
  } catch {
    return false;
  }
}

/** Checks whether the Railway bot session is connected (returns the QR when not). */
export async function waServerStatus(srv: WaServer): Promise<WaStatus> {
  const base = normalizeWaServerUrl(srv.url);
  const res = await fetch(base + "/status", {
    headers: { Authorization: "Bearer " + srv.token },
  });
  if (!res.ok) throw new Error("HTTP " + res.status);
  const st = (await res.json()) as WaStatus;
  return { ...st, tokenOk: await waTokenOk(base, srv.token) };
}

/** restart = keep the session, logout = drop it and show a fresh QR. */
export async function waServerControl(srv: WaServer, action: "restart" | "logout") {
  const base = normalizeWaServerUrl(srv.url);
  const res = await fetch(base + "/" + action, {
    method: "POST",
    headers: { Authorization: "Bearer " + srv.token },
  });
  if (!res.ok) throw new Error("HTTP " + res.status);
  return (await res.json().catch(() => ({}))) as { ok?: boolean; message?: string };
}

export type WaResult = { ok: boolean; error?: string };

/**
 * Sends a WhatsApp message through the Railway bot.
 * Never throws: it reports the failure so the UI can show it instead of failing silently.
 */
export async function sendWhatsApp(
  phone: string,
  message: string,
  srv?: WaServer | null,
  cc?: string,
): Promise<WaResult> {
  const code = cc || (await getCountryCode());
  const to = waNumber(phone, code);
  if (!to) return { ok: false, error: "رقم الهاتف غير صحيح" };
  try {
    const server = srv ?? (await getWaServer());
    if (!server?.url || !server.token)
      return { ok: false, error: "لم يتم ضبط سيرفر الواتساب في الإعدادات" };
    const res = await fetch(normalizeWaServerUrl(server.url) + "/send", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: "Bearer " + server.token },
      body: JSON.stringify({ to, message }),
    });
    if (res.ok) return { ok: true };
    if (res.status === 401 || res.status === 403)
      return { ok: false, error: "التوكن غير مطابق للسيرفر (401)" };
    if (res.status === 503) return { ok: false, error: "الواتساب غير مرتبط — امسح رمز QR" };
    return { ok: false, error: "فشل الإرسال (" + res.status + ")" };
  } catch (e) {
    return { ok: false, error: "تعذر الوصول للسيرفر: " + (e instanceof Error ? e.message : "خطأ") };
  }
}

/** Settings button: makes sure the whole chain really works. */
export async function sendWhatsAppTest(srv: WaServer, phone: string): Promise<WaResult> {
  return sendWhatsApp(
    phone,
    `🔔 رسالة تجريبية من ${STORE_NAME} — إشعارات الطلبات تعمل بنجاح ✅`,
    srv,
  );
}

export type NotifyResult = { admin: WaResult; customer: WaResult };

/** New order: notifies the store owner and thanks the customer. */
export async function notifyNewOrder(
  order: Omit<Order, "id" | "createdAt">,
  orderNo: string,
): Promise<NotifyResult> {
  const none: WaResult = { ok: false, error: "غير مُفعّل" };
  try {
    const [srv, admin, cc] = await Promise.all([
      getWaServer(),
      getNotifyNumber(),
      getCountryCode(),
    ]);
    if (!srv) return { admin: none, customer: none };
    const [a, c] = await Promise.all([
      admin
        ? sendWhatsApp(admin, adminOrderMessage(order as Order, orderNo), srv, cc)
        : Promise.resolve<WaResult>({ ok: false, error: "لا يوجد رقم إشعارات" }),
      order.phone
        ? sendWhatsApp(order.phone, customerOrderMessage(order as Order, orderNo), srv, cc)
        : Promise.resolve<WaResult>({ ok: false, error: "لا يوجد رقم للعميل" }),
    ]);
    return { admin: a, customer: c };
  } catch (e) {
    const err: WaResult = { ok: false, error: e instanceof Error ? e.message : "خطأ" };
    return { admin: err, customer: err };
  }
}

/**
 * Accepted order: delivers the digital content, or a plain confirmation when the
 * product is a normal (non-digital) one.
 */
export async function notifyOrderDelivered(
  order: Order,
  codes: DeliveredCode[],
): Promise<WaResult> {
  try {
    const srv = await getWaServer();
    if (!srv) return { ok: false, error: "لم يتم ضبط سيرفر الواتساب" };
    if (!order.phone) return { ok: false, error: "لا يوجد رقم للعميل" };
    const orderNo = formatOrderNo(order);
    const msg = codes.length
      ? customerCodesMessage(orderNo, codes)
      : customerAcceptedMessage(orderNo);
    return await sendWhatsApp(order.phone, msg, srv);
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "خطأ" };
  }
}

/** Rejected order: lets the customer know. */
export async function notifyOrderRejected(order: Order, reason: string): Promise<WaResult> {
  try {
    const srv = await getWaServer();
    if (!srv) return { ok: false, error: "لم يتم ضبط سيرفر الواتساب" };
    if (!order.phone) return { ok: false, error: "لا يوجد رقم للعميل" };
    return await sendWhatsApp(
      order.phone,
      [
        `❌ نعتذر، تم رفض طلبك رقم ${formatOrderNo(order)} في ${STORE_NAME}.`,
        ...(reason ? [`السبب: ${reason}`] : []),
        "للاستفسار راسلنا على الواتساب.",
      ].join("\n"),
      srv,
    );
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "خطأ" };
  }
}
