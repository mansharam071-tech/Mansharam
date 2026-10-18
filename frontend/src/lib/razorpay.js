import { capi } from "@/lib/api";

const loadScript = () =>
  new Promise((res, rej) => {
    if (window.Razorpay) return res();
    const s = document.createElement("script");
    s.src = "https://checkout.razorpay.com/v1/checkout.js";
    s.onload = res;
    s.onerror = () => rej(new Error("Could not load Razorpay checkout"));
    document.body.appendChild(s);
  });

export const payWithRazorpay = async (order, { user, method, description }) => {
  await loadScript();
  return new Promise((resolve, reject) => {
    const fail = async (reason) => {
      await capi.post("/payments/cancel", { order_id: order.order_id, reason }).catch(() => {});
      reject(new Error(reason));
    };
    const rzp = new window.Razorpay({
      key: order.key_id,
      amount: order.amount,
      currency: order.currency,
      order_id: order.order_id,
      name: "HomeServe",
      description,
      prefill: { name: user?.name || "", email: user?.email || "", contact: user?.phone ? `+91${user.phone}` : "", method },
      theme: { color: "#1E3A8A" },
      handler: async (resp) => {
        try {
          const { data } = await capi.post("/payments/verify", resp);
          resolve(data);
        } catch (e) {
          reject(new Error(e?.response?.data?.detail || "Payment verification failed"));
        }
      },
      modal: { ondismiss: () => fail("Payment cancelled") },
    });
    rzp.on("payment.failed", (r) => fail(r?.error?.description || "Payment failed"));
    rzp.open();
  });
};
