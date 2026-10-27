const payButton = document.getElementById("pay-button");
const message = document.getElementById("message");
const productName = document.getElementById("product-name");

function showMessage(text, kind = "") {
  message.textContent = text;
  message.className = `message ${kind}`;
}

payButton.addEventListener("click", async () => {
  payButton.disabled = true;
  showMessage("Creating a secure order…");

  try {
    const orderResponse = await fetch("/api/create-order", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({})
    });
    const order = await orderResponse.json();
    if (!orderResponse.ok) throw new Error(order.error || "Could not start checkout.");

    productName.textContent = order.productName;
    payButton.textContent = `Pay ₹${(order.amount / 100).toFixed(2)} securely`;

    const options = {
      key: order.keyId,
      amount: order.amount,
      currency: order.currency,
      name: order.productName,
      description: "Secure payment",
      order_id: order.orderId,
      theme: { color: "#176b50" },
      handler: async (response) => {
        showMessage("Payment submitted. Confirming with Razorpay…");
        try {
          const verifyResponse = await fetch("/api/verify-payment", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(response)
          });
          const result = await verifyResponse.json();
          if (!verifyResponse.ok || !result.verified) {
            throw new Error(result.error || "Payment is not confirmed yet.");
          }
          window.location.assign(result.nextUrl);
        } catch (err) {
          showMessage(`${err.message} Do not pay again immediately; check payment status or retry verification.`, "error");
          payButton.disabled = false;
        }
      },
      modal: {
        ondismiss: () => {
          showMessage("Checkout closed. You can try again.");
          payButton.disabled = false;
        }
      }
    };

    const checkout = new Razorpay(options);
    checkout.on("payment.failed", (response) => {
      showMessage(response.error?.description || "Payment failed. Please try again.", "error");
      payButton.disabled = false;
    });
    checkout.open();
  } catch (err) {
    showMessage(err.message || "Something went wrong.", "error");
    payButton.disabled = false;
  }
});
