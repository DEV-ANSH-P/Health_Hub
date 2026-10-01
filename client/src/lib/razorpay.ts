export type RazorpayOrder = {
  keyId: string;
  razorpayOrderId: string;
  amount: number;
  currency: string;
  name: string;
  description: string;
  prefill: { name: string; email: string };
};

export type RazorpayResult = {
  razorpay_payment_id: string;
  razorpay_order_id: string;
  razorpay_signature: string;
};

export type RazorpayPaymentMethod = "card" | "upi";

type RazorpayOptions = Omit<RazorpayOrder, "keyId" | "razorpayOrderId"> & {
  key: string;
  order_id: string;
  config: {
    display: {
      blocks: {
        selected: {
          name: string;
          instruments: { method: RazorpayPaymentMethod }[];
        };
      };
      sequence: ["block.selected"];
      preferences: { show_default_blocks: false };
    };
  };
  handler: (result: RazorpayResult) => void;
  modal: { ondismiss: () => void };
  theme: { color: string };
};

declare global {
  interface Window {
    Razorpay?: new (options: RazorpayOptions) => { open: () => void };
  }
}

let scriptPromise: Promise<void> | null = null;

async function loadRazorpay() {
  if (window.Razorpay) return;
  if (!scriptPromise) {
    scriptPromise = new Promise<void>((resolve, reject) => {
      const script = document.createElement("script");
      script.src = "https://checkout.razorpay.com/v1/checkout.js";
      script.async = true;
      script.onload = () => resolve();
      script.onerror = () => {
        scriptPromise = null;
        reject(new Error("Could not load Razorpay Checkout. Check your connection and try again."));
      };
      document.body.appendChild(script);
    });
  }
  await scriptPromise;
  if (!window.Razorpay) throw new Error("Razorpay Checkout did not initialize.");
}

export async function openRazorpayCheckout(order: RazorpayOrder, method: RazorpayPaymentMethod): Promise<RazorpayResult> {
  await loadRazorpay();
  const { keyId, razorpayOrderId, ...checkoutOrder } = order;
  return new Promise<RazorpayResult>((resolve, reject) => {
    const checkout = new window.Razorpay!({
      ...checkoutOrder,
      key: keyId,
      order_id: razorpayOrderId,
      config: {
        display: {
          blocks: {
            selected: {
              name: method === "upi" ? "UPI and QR" : "Card",
              instruments: [{ method }],
            },
          },
          sequence: ["block.selected"],
          preferences: { show_default_blocks: false },
        },
      },
      theme: { color: "#173d32" },
      handler: resolve,
      modal: { ondismiss: () => reject(new Error("Payment window closed before payment completed.")) },
    });
    checkout.open();
  });
}
