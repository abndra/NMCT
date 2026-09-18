/**
 * NMCT — خدمة التحقق البنكي (Railway)
 * ====================================
 * خدمة API وسيطة مستقلة عن واجهة المتجر:
 *  - تستقبل طلبات التحقق من الموقع
 *  - تتصل بـ Gmail API عبر Google OAuth الرسمي (gmail.readonly فقط)
 *  - تحلّل رسائل إشعارات البنك وتطابقها مع طلبات الشحن
 *  - تقبل الطلب وتضيف الرصيد مرة واحدة، أو تنهي المهلة بعد 3 دقائق
 *
 * لا تسجّل محتوى الرسائل البنكية ولا تخزّن كلمات مرور. راجع README.md للإعداد.
 */
import express from "express";
import cors from "cors";
import { cfg, missingConfig } from "./src/config.js";
import { router } from "./src/routes.js";
import { startLoop } from "./src/verifier.js";

const app = express();
app.disable("x-powered-by");
app.set("trust proxy", 1);

// HTTPS: Railway ينهي TLS قبل الخدمة؛ نرفض أي طلب غير مشفّر في الإنتاج
app.use((req, res, next) => {
  if (process.env.NODE_ENV === "production" && req.headers["x-forwarded-proto"] === "http")
    return res.redirect(301, "https://" + req.headers.host + req.originalUrl);
  next();
});

app.use(
  cors({
    origin: (origin, cb) => {
      if (!origin || !cfg.allowedOrigins.length) return cb(null, true);
      const o = origin.replace(/\/+$/, "");
      cb(null, cfg.allowedOrigins.includes(o) || /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(o));
    },
    methods: ["GET", "POST"],
    allowedHeaders: ["Content-Type", "Authorization"],
  }),
);
app.use(express.json({ limit: "32kb" }));
app.use(router);

app.use((err, _req, res, _next) => {
  console.error("[server]", err?.message || err);
  res.status(500).json({ ok: false, error: "server-error" });
});

app.listen(cfg.port, () => {
  console.log(`[server] nmct-bank-verify listening on :${cfg.port}`);
  const missing = missingConfig();
  if (missing.length) console.warn("[server] missing env vars:", missing.join(", "));
  if (cfg.dbSecret) void startLoop();
  else console.warn("[server] FIREBASE_DB_SECRET not set — verification loop disabled");
});
