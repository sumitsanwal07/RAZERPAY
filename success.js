const title = document.getElementById("status-title");
const text = document.getElementById("status-text");
const icon = document.getElementById("status-icon");
const continueLink = document.getElementById("continue-link");
const orderId = new URLSearchParams(window.location.search).get("order_id");

(async () => {
  if (!orderId) {
    title.textContent = "Payment not confirmed";
    text.textContent = "No order was supplied. Please return to checkout.";
    icon.textContent = "!";
    icon.classList.add("failure-icon");
    return;
  }
  try {
    const response = await fetch(`/api/order-status?order_id=${encodeURIComponent(orderId)}`);
    const result = await response.json();
    if (!response.ok || !result.paid) throw new Error("Payment not confirmed");
    title.textContent = "Payment confirmed!";
    text.textContent = "Razorpay has confirmed your payment.";
    continueLink.hidden = false;
  } catch {
    title.textContent = "Payment is not confirmed yet";
    text.textContent = "This page stays locked until the server confirms the payment. Please return to checkout or contact support.";
    icon.textContent = "!";
    icon.classList.add("failure-icon");
  }
})();
