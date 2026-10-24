import { test } from "node:test";
import assert from "node:assert/strict";
process.env.FIREBASE_DB_SECRET = "x";
const { pickMatch } = await import("../src/verifier.js");
const { parseBankNotification } = await import("../src/parser.js");

const msg = "Your SAVINGS a/c XXXXXXX33424 is CREDITED OMR 55.4 on 16-10-2026 on account of Mobile Payment From ALI SAUD SALIM /78470054. Available balance in your a/c is OMR 210.576.";
const now = Date.now();
const t = { id: "a", status: "verifying", amount: 55, bankRef: "96878470054", createdAt: now - 60_000 };
const m = { id: "g1", receivedAt: now, ...parseBankNotification(msg) };

test("parses the real SIB alert", () => {
  assert.equal(m.amount, 55.4);
  assert.equal(m.reference, "78470054");
});
test("ordered 55 but transferred 55.4 from the same number → matched", () => {
  assert.equal(pickMatch(t, [m], now + 600_000, new Set(), [t])?.id, "g1");
});
test("an already used transfer is never reused", () => {
  assert.equal(pickMatch(t, [m], now + 600_000, new Set(["g1"]), [t]), null);
});
test("transfer from another number with different amount → not matched", () => {
  const other = { ...m, id: "g2", reference: "91156556", amount: 2.4 };
  assert.equal(pickMatch(t, [other], now + 600_000, new Set(), [t]), null);
});
test("expired order still catches a transfer that arrived late (within 60 min)", () => {
  const e = { ...t, status: "expired", createdAt: now - 30 * 60_000 };
  assert.equal(pickMatch(e, [m], e.createdAt + 600_000, new Set(), [e])?.id, "g1");
});
test("order moved to manual review (Gmail was down) is auto-approved once the transfer is found", () => {
  const p = { ...t, status: "pending", manualReason: "google-token: invalid_grant", createdAt: now - 20 * 60_000 };
  assert.equal(pickMatch(p, [m], p.createdAt + 600_000, new Set(), [p])?.id, "g1");
});
test("Gmail search only looks at messages since the oldest pending order", async () => {
  const { defaultQuery } = await import("../src/gmail.js");
  assert.match(defaultQuery(1_800_000_000_000), /after:1800000000/);
});
