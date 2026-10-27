# Razorpay Payment Verification (Node.js + HTML/CSS/JS)

This is a starter project for Razorpay Standard Checkout. The server creates the order, verifies the Checkout signature, fetches the payment from Razorpay, and only returns success when the payment is `captured` and matches the expected order amount/currency. A webhook endpoint validates the signature over the raw request body.

## Requirements
- Node.js 20+
- Razorpay account and API keys from the Razorpay Dashboard
- A public HTTPS URL for production webhooks

## Run locally
1. Extract this folder and open a terminal inside it.
2. Run `npm install`.
3. Copy `.env.example` to `.env`.
4. Add your Razorpay **Test Mode** Key ID and Key Secret in `.env`.
5. Run `npm start`.
6. Open `http://localhost:3000`.

The server-side price is controlled by `PRODUCT_PRICE_PAISE` in `.env` (49900 means ₹499). It deliberately ignores any amount sent from the browser.

## Configure the webhook
1. Deploy to a public HTTPS host.
2. In Razorpay Dashboard, configure a webhook URL:
   `https://YOUR-DOMAIN/api/razorpay/webhook`
3. Subscribe to `payment.captured` and `order.paid` (where available).
4. Set a webhook secret and put the same value in `RAZORPAY_WEBHOOK_SECRET`.
5. Save settings and test with a Test Mode payment before switching to Live Mode.

Webhook events may arrive after the Checkout response. The verify endpoint therefore also fetches the payment directly from Razorpay for immediate confirmation.

## Security notes before production
- Do not expose `RAZORPAY_KEY_SECRET` or `RAZORPAY_WEBHOOK_SECRET` in frontend code.
- Do not commit `.env`.
- This starter uses in-memory Maps for order/payment state. They reset on restart and do not work across multiple server instances. Replace with a persistent database and enforce unique order/payment IDs before production.
- The sample success page is not sufficient to protect real paid content. For actual membership/content, authenticate users and enforce access on server-side routes/APIs. Do not rely on a secret URL or client-side redirect.
- Add rate limiting, CSRF/origin protections appropriate to your deployment, logging/monitoring, refund handling, and a production database migration before going live.
- Test and Live Mode keys differ. Use Test Mode first.

## Flow
`Browser -> POST /api/create-order -> Razorpay Checkout -> POST /api/verify-payment -> server fetches captured payment -> success page checks /api/order-status`

Official docs:
- https://razorpay.com/docs/payments/payment-gateway/web-integration/standard/
- https://razorpay.com/docs/webhooks/
