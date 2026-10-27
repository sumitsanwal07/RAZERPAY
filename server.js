require("dotenv").config();

const express = require("express");
const Razorpay = require("razorpay");
const crypto = require("crypto");
const path = require("path");

const app = express();
const PORT = Number(process.env.PORT || 3000);
const BASE_URL = process.env.APP_BASE_URL || `http://localhost:${PORT}`;
const KEY_ID = process.env.RAZORPAY_KEY_ID;
const KEY_SECRET = process.env.RAZORPAY_KEY_SECRET;
const WEBHOOK_SECRET = process.env.RAZORPAY_WEBHOOK_SECRET;
const PRODUCT_NAME = process.env.PRODUCT_NAME || "Website Access";
const PRICE_PAISE = Number(process.env.PRODUCT_PRICE_PAISE || 49900);

// Demo-only storage. Use a persistent database before production.
const orders = new Map();
const paidOrders = new Set();

const razorpayConfigured = () =>
  KEY_ID && KEY_SECRET && !KEY_ID.includes("REPLACE_ME") &&
  !KEY_SECRET.includes("REPLACE_ME");

function safeEqualHex(a, b) {
  if (typeof a !== "string" || typeof b !== "string" || a.length !== b.length) return false;
  try {
    return crypto.timingSafeEqual(Buffer.from(a, "hex"), Buffer.from(b, "hex"));
  } catch {
    return false;
  }
}

// Webhook needs the exact raw bytes for signature validation; register BEFORE express.json().
app.post("/api/razorpay/webhook", express.raw({ type: "application/json" }), (req, res) => {
  if (!WEBHOOK_SECRET) return res.status(503).send("Webhook secret is not configured");

  const signature = req.get("x-razorpay-signature") || "";
  const expected = crypto
    .createHmac("sha256", WEBHOOK_SECRET)
    .update(req.body)
    .digest("hex");

  if (!safeEqualHex(signature, expected)) {
    return res.status(400).send("Invalid webhook signature");
  }

  let event;
  try {
    event = JSON.parse(req.body.toString("utf8"));
  } catch {
    return res.status(400).send("Invalid JSON");
  }

  // Only mark an order paid on a captured/paid event. Verify order, amount and currency.
  if (event.event === "payment.captured" || event.event === "order.paid") {
    const payment = event.payload?.payment?.entity;
    const orderEntity = event.payload?.order?.entity;
    const orderId = payment?.order_id || orderEntity?.id;
    const order = orderId ? orders.get(orderId) : null;

    if (order && (!payment || (
      payment.status === "captured" &&
      payment.amount === order.amount &&
      payment.currency === "INR" &&
      payment.order_id === orderId
    ))) {
      paidOrders.add(orderId);
      order.status = "paid";
      order.paymentId = payment?.id || order.paymentId || null;
    }
  }

  // Keep idempotent: repeated webhooks are safe to process.
  return res.status(200).json({ received: true });
});

app.use(express.json({ limit: "20kb" }));
app.use(express.static(path.join(__dirname, "public"), { extensions: ["html"] }));

function requireRazorpay(req, res, next) {
  if (!razorpayConfigured()) {
    return res.status(503).json({
      error: "Razorpay keys are not configured. Copy .env.example to .env and add Test Mode keys."
    });
  }
  req.razorpay = new Razorpay({ key_id: KEY_ID, key_secret: KEY_SECRET });
  next();
}

// Server determines price. Browser cannot set its own trusted amount.
app.post("/api/create-order", requireRazorpay, async (req, res) => {
  try {
    const amount = PRICE_PAISE;
    if (!Number.isInteger(amount) || amount < 100) {
      return res.status(500).json({ error: "Invalid server product price configuration" });
    }

    const order = await req.razorpay.orders.create({
      amount,
      currency: "INR",
      receipt: `rcpt_${crypto.randomBytes(8).toString("hex")}`,
      notes: { product: PRODUCT_NAME }
    });

    orders.set(order.id, {
      amount,
      currency: "INR",
      status: "created",
      createdAt: Date.now(),
      paymentId: null
    });

    res.json({
      keyId: KEY_ID,
      orderId: order.id,
      amount: order.amount,
      currency: order.currency,
      productName: PRODUCT_NAME
    });
  } catch (err) {
    console.error("Create order failed:", err.message);
    res.status(502).json({ error: "Could not create payment order. Please try again." });
  }
});

// Verify Checkout signature server-side, then fetch payment from Razorpay and check captured status.
app.post("/api/verify-payment", requireRazorpay, async (req, res) => {
  try {
    const { razorpay_order_id: orderId, razorpay_payment_id: paymentId, razorpay_signature: signature } = req.body || {};
    const order = orders.get(orderId);

    if (!order || !orderId || !paymentId || !signature) {
      return res.status(400).json({ verified: false, error: "Missing or unknown payment details" });
    }

    const expected = crypto
      .createHmac("sha256", KEY_SECRET)
      .update(`${orderId}|${paymentId}`)
      .digest("hex");

    if (!safeEqualHex(signature, expected)) {
      return res.status(400).json({ verified: false, error: "Payment signature verification failed" });
    }

    // Ask Razorpay for authoritative payment status; do not trust browser callback alone.
    const payment = await req.razorpay.payments.fetch(paymentId);
    if (
      payment.order_id !== orderId ||
      payment.amount !== order.amount ||
      payment.currency !== "INR" ||
      payment.status !== "captured"
    ) {
      return res.status(409).json({
        verified: false,
        status: payment.status || "pending",
        error: "Payment is not captured yet or does not match this order."
      });
    }

    paidOrders.add(orderId);
    order.status = "paid";
    order.paymentId = paymentId;
    return res.json({ verified: true, nextUrl: `/success.html?order_id=${encodeURIComponent(orderId)}` });
  } catch (err) {
    console.error("Verify payment failed:", err.message);
    return res.status(502).json({ verified: false, error: "Could not confirm payment with Razorpay. Please retry." });
  }
});

// The next page asks the server; a URL alone does not grant access.
app.get("/api/order-status", async (req, res) => {
  const orderId = String(req.query.order_id || "");
  if (!orderId || !paidOrders.has(orderId)) {
    return res.status(403).json({ paid: false, error: "Payment not confirmed" });
  }
  res.json({ paid: true });
});

app.get("/health", (_req, res) => res.json({ ok: true }));

app.listen(PORT, () => {
  console.log(`Payment demo running at ${BASE_URL}`);
  if (!razorpayConfigured()) console.warn("Add Razorpay test keys to .env before testing payments.");
});
