import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, CreditCard, Minus, Plus, QrCode, ShoppingBag } from "lucide-react";
import { Link, useLocation } from "wouter";
import SiteHeader from "@/components/SiteHeader";
import { Button } from "@/components/ui/button";
import { featuredProducts, type Product } from "./Home";
import { formatINR } from "@/lib/currency";
import { openRazorpayCheckout, type RazorpayOrder, type RazorpayPaymentMethod } from "@/lib/razorpay";
import { trackAnalyticsEvent } from "@/lib/analytics";
import { useCart } from "@/lib/cart";

type Buyer = { name: string; email: string; address: string };
type CheckoutPaymentMethod = RazorpayPaymentMethod | "cod" | "direct_upi";
type OneTimeQr = { qrCodeId: string; imageUrl: string; accessToken: string; expiresAt: string };
type DirectUpiQr = { orderId: string; imageDataUrl: string; upiUri: string; reportToken: string; amount: number; paymentReference: string; payeeName: string; payeeVpa: string; reported?: boolean; verified?: boolean };
const QR_SESSION_KEY = "health-hub-one-time-qr";
const DIRECT_UPI_SESSION_KEY = "health-hub-direct-upi-qr";

function readSavedQr(): OneTimeQr | null {
  try {
    const value: unknown = JSON.parse(window.sessionStorage.getItem(QR_SESSION_KEY) || "null");
    if (!value || typeof value !== "object") return null;
    const qr = value as Partial<OneTimeQr>;
    if (
      typeof qr.qrCodeId !== "string"
      || typeof qr.imageUrl !== "string"
      || typeof qr.accessToken !== "string"
      || typeof qr.expiresAt !== "string"
    ) return null;
    return qr as OneTimeQr;
  } catch {
    return null;
  }
}

function readSavedDirectUpiQr(): DirectUpiQr | null {
  try {
    const value: unknown = JSON.parse(window.sessionStorage.getItem(DIRECT_UPI_SESSION_KEY) || "null");
    if (!value || typeof value !== "object") return null;
    const qr = value as Partial<DirectUpiQr>;
    if (
      typeof qr.orderId !== "string"
      || typeof qr.imageDataUrl !== "string"
      || typeof qr.upiUri !== "string"
      || typeof qr.reportToken !== "string"
      || typeof qr.amount !== "number"
      || typeof qr.paymentReference !== "string"
      || typeof qr.payeeName !== "string"
      || typeof qr.payeeVpa !== "string"
    ) return null;
    return qr as DirectUpiQr;
  } catch {
    return null;
  }
}

async function responseMessage(response: Response) {
  const payload = await response.json().catch(() => ({}));
  return typeof payload.message === "string" ? payload.message : `Request failed (${response.status}).`;
}

export default function Checkout() {
  const [, navigate] = useLocation();
  const { cart, removeFromCart, addToCart, setCartItems } = useCart(featuredProducts);
  const [buyer, setBuyer] = useState<Buyer>({ name: "", email: "", address: "" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [paymentMethod, setPaymentMethod] = useState<CheckoutPaymentMethod>(() => readSavedDirectUpiQr() ? "direct_upi" : "card");
  const [paymentReady, setPaymentReady] = useState<boolean | null>(null);
  const [paymentSetupMessage, setPaymentSetupMessage] = useState("");
  const [directUpiReady, setDirectUpiReady] = useState<boolean | null>(null);
  const [directUpiSetupMessage, setDirectUpiSetupMessage] = useState("");
  const [orderProof, setOrderProof] = useState<{ razorpay_payment_id: string; razorpay_order_id: string; razorpay_signature: string } | null>(null);
  const [directUpiQr, setDirectUpiQr] = useState<DirectUpiQr | null>(() => readSavedDirectUpiQr());
  const [directUpiBusy, setDirectUpiBusy] = useState(false);
  const [qrCheckout, setQrCheckout] = useState<OneTimeQr | null>(() => readSavedQr());
  const [qrStatus, setQrStatus] = useState<"pending" | "expired" | null>(() => {
    const saved = readSavedQr();
    return saved ? (new Date(saved.expiresAt).getTime() > Date.now() ? "pending" : "expired") : null;
  });
  const [qrBusy, setQrBusy] = useState(false);
  const checkoutForm = useRef<HTMLFormElement>(null);

  const grouped = useMemo(() => featuredProducts
    .map((product) => ({ product, quantity: cart.filter((item) => item.id === product.id).length }))
    .filter((item) => item.quantity > 0), [cart]);
  const total = grouped.reduce((sum, item) => sum + item.product.price * item.quantity, 0);

  useEffect(() => {
    void trackAnalyticsEvent("checkout_started");
    void fetch("/api/config")
      .then(async (response) => {
        if (!response.ok) throw new Error(await responseMessage(response));
        const config = await response.json() as { providers?: { productPayments?: boolean; productPaymentMessage?: string; directUpiQr?: boolean; directUpiQrMessage?: string } };
        setPaymentReady(config.providers?.productPayments === true);
        setDirectUpiReady(config.providers?.directUpiQr === true);
        setDirectUpiSetupMessage(config.providers?.directUpiQrMessage || "");
        if (config.providers?.productPayments !== true && config.providers?.productPaymentMessage) {
          setPaymentSetupMessage(config.providers.productPaymentMessage);
        }
      })
      .catch((configError: unknown) => {
        console.error("Could not check payment setup.", configError);
        setPaymentReady(false);
      });
    void fetch("/api/auth/me")
      .then(async (response) => {
        if (!response.ok) return;
        const payload = await response.json() as { user?: { name?: string; email?: string } };
        setBuyer((current) => ({
          name: current.name || payload.user?.name || "",
          email: current.email || payload.user?.email || "",
          address: current.address,
        }));
      })
      .catch((loadError: unknown) => console.error("Could not load account details for checkout.", loadError));
  }, []);

  useEffect(() => {
    if (!qrCheckout || qrStatus !== "pending") return;
    let disposed = false;
    let polling = false;
    const checkStatus = async () => {
      if (disposed || polling) return;
      polling = true;
      try {
        const response = await fetch(`/api/payments/razorpay/qr-codes/${encodeURIComponent(qrCheckout.qrCodeId)}/status`, {
          headers: { "X-Payment-Token": qrCheckout.accessToken },
        });
        if (!response.ok) throw new Error(await responseMessage(response));
        const result = await response.json() as { status: "pending" | "paid" | "expired" | "failed"; orderId?: string; message?: string };
        if (disposed) return;
        if (result.status === "paid") {
          setSuccess(result.orderId ? `Order #${result.orderId} is placed and payment is verified.` : "Payment verified and your order is placed.");
          setCartItems([]);
          window.sessionStorage.removeItem(QR_SESSION_KEY);
          setQrCheckout(null);
          setQrStatus(null);
        } else if (result.status === "expired" || result.status === "failed") {
          window.sessionStorage.removeItem(QR_SESSION_KEY);
          setQrStatus("expired");
          if (result.message) setError(result.message);
        }
      } catch (statusError) {
        if (!disposed) setError(statusError instanceof Error ? statusError.message : "Could not check QR payment status.");
      } finally {
        polling = false;
      }
    };
    void checkStatus();
    const timer = window.setInterval(() => void checkStatus(), 3000);
    return () => {
      disposed = true;
      window.clearInterval(timer);
    };
  }, [qrCheckout, qrStatus, setCartItems]);

  const changeQuantity = (product: Product, delta: number) => {
    if (directUpiQr) return;
    if (delta > 0) addToCart(product);
    else {
      const index = cart.findIndex((item) => item.id === product.id);
      if (index >= 0) removeFromCart(index);
    }
  };

  const verifyPayment = async (proof: NonNullable<typeof orderProof>) => {
    setError("");
    const response = await fetch("/api/payments/razorpay/verify", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(proof),
    });
    if (!response.ok) throw new Error(await responseMessage(response));
    const receipt = await response.json() as { orderId?: string; message: string };
    setSuccess(receipt.orderId ? `Order #${receipt.orderId} is placed and payment is verified.` : receipt.message);
    setOrderProof(null);
    setCartItems([]);
  };

  const generateOneTimeQr = async () => {
    if (qrBusy || busy || !grouped.length || !checkoutForm.current?.reportValidity()) return;
    setQrBusy(true);
    setError("");
    setQrCheckout(null);
    setQrStatus(null);
    try {
      const response = await fetch("/api/payments/razorpay/qr-codes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          customer: buyer.name.trim(),
          email: buyer.email.trim(),
          address: buyer.address.trim(),
          items: grouped.map(({ product, quantity }) => ({ id: product.id, quantity })),
        }),
      });
      if (!response.ok) throw new Error(await responseMessage(response));
      const qr = await response.json() as OneTimeQr;
      try {
        window.sessionStorage.setItem(QR_SESSION_KEY, JSON.stringify(qr));
      } catch (storageError) {
        console.error("Could not save the QR payment session for this tab.", storageError);
      }
      setQrCheckout(qr);
      setQrStatus("pending");
    } catch (qrError) {
      setError(qrError instanceof Error ? qrError.message : "Could not generate a one-time UPI QR code.");
    } finally {
      setQrBusy(false);
    }
  };

  const generateDirectUpiQr = async () => {
    if (directUpiBusy || busy || directUpiQr || !grouped.length || !checkoutForm.current?.reportValidity()) return;
    setDirectUpiBusy(true);
    setError("");
    try {
      const response = await fetch("/api/payments/upi/qr", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          customer: buyer.name.trim(),
          email: buyer.email.trim(),
          address: buyer.address.trim(),
          items: grouped.map(({ product, quantity }) => ({ id: product.id, quantity })),
        }),
      });
      if (!response.ok) throw new Error(await responseMessage(response));
      const qr = await response.json() as DirectUpiQr;
      setDirectUpiQr(qr);
      try {
        window.sessionStorage.setItem(DIRECT_UPI_SESSION_KEY, JSON.stringify(qr));
      } catch (storageError) {
        console.error("Could not save the direct UPI QR session for this tab.", storageError);
      }
    } catch (qrError) {
      setError(qrError instanceof Error ? qrError.message : "Could not generate a direct UPI QR code.");
    } finally {
      setDirectUpiBusy(false);
    }
  };

  const reportDirectUpiPayment = async () => {
    if (!directUpiQr || directUpiQr.reported || busy) return;
    setBusy(true);
    setError("");
    try {
      const response = await fetch(`/api/payments/upi/qr/${encodeURIComponent(directUpiQr.orderId)}/report`, {
        method: "POST",
        headers: { "X-Payment-Token": directUpiQr.reportToken },
      });
      if (!response.ok) throw new Error(await responseMessage(response));
      const result = await response.json() as { paymentStatus: "reported" | "paid"; message: string };
      const updatedQr = { ...directUpiQr, reported: true, verified: result.paymentStatus === "paid", reportToken: "" };
      setDirectUpiQr(updatedQr);
      window.sessionStorage.setItem(DIRECT_UPI_SESSION_KEY, JSON.stringify(updatedQr));
      setSuccess(`Order #${directUpiQr.orderId}: ${result.message}`);
      setCartItems([]);
    } catch (reportError) {
      setError(reportError instanceof Error ? reportError.message : "Could not report the UPI transfer.");
    } finally {
      setBusy(false);
    }
  };

  const cancelDirectUpiQr = async () => {
    if (!directUpiQr || directUpiQr.reported || busy) return;
    if (!window.confirm("This only closes the order in Health Hub. The UPI QR cannot be revoked; if you already transferred money, contact the merchant instead of cancelling.")) return;
    setBusy(true);
    setError("");
    try {
      const response = await fetch(`/api/payments/upi/qr/${encodeURIComponent(directUpiQr.orderId)}/cancel`, {
        method: "POST",
        headers: { "X-Payment-Token": directUpiQr.reportToken },
      });
      if (!response.ok) throw new Error(await responseMessage(response));
      const result = await response.json() as { message: string };
      window.sessionStorage.removeItem(DIRECT_UPI_SESSION_KEY);
      setDirectUpiQr(null);
      setError(result.message);
    } catch (cancelError) {
      setError(cancelError instanceof Error ? cancelError.message : "Could not cancel the UPI QR order.");
    } finally {
      setBusy(false);
    }
  };

  const placeOrder = async (event?: FormEvent<HTMLFormElement>) => {
    event?.preventDefault();
    if (busy) return;
    if (orderProof) {
      setBusy(true);
      try {
        await verifyPayment(orderProof);
      } catch (verificationError) {
        setError(verificationError instanceof Error ? verificationError.message : "Payment verification failed. Retry verification.");
      } finally {
        setBusy(false);
      }
      return;
    }
    if (!grouped.length) {
      setError("Add a product before checking out.");
      return;
    }
    if (paymentMethod === "cod" && qrCheckout && qrStatus === "pending") {
      setError("An active UPI QR is still awaiting payment. Let it expire before placing a cash-on-delivery order.");
      return;
    }
    if (paymentMethod === "direct_upi") {
      await generateDirectUpiQr();
      return;
    }

    setBusy(true);
    setError("");
    try {
      if (paymentMethod === "cod") {
        const response = await fetch("/api/orders/cash-on-delivery", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            customer: buyer.name.trim(),
            email: buyer.email.trim(),
            address: buyer.address.trim(),
            items: grouped.map(({ product, quantity }) => ({ id: product.id, quantity })),
          }),
        });
        if (!response.ok) throw new Error(await responseMessage(response));
        const result = await response.json() as { message: string };
        setSuccess(result.message);
        setCartItems([]);
        return;
      }
      const orderResponse = await fetch("/api/payments/razorpay/orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          purpose: "order",
          customer: buyer.name.trim(),
          email: buyer.email.trim(),
          address: buyer.address.trim(),
          items: grouped.map(({ product, quantity }) => ({ id: product.id, quantity })),
        }),
      });
      if (!orderResponse.ok) throw new Error(await responseMessage(orderResponse));
      const razorpayOrder = await orderResponse.json() as RazorpayOrder;
      const proof = await openRazorpayCheckout(razorpayOrder, paymentMethod);
      setOrderProof(proof);
      await verifyPayment(proof);
    } catch (checkoutError) {
      const message = checkoutError instanceof Error ? checkoutError.message : "Checkout could not be completed.";
      setError(message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#f4f1e9] text-[#173d32]">
      <SiteHeader />
      <main className="mx-auto max-w-6xl px-5 py-12 lg:px-10">
        <Link href="/products" className="inline-flex items-center gap-2 text-sm font-semibold text-[#173d32]/65 hover:text-[#173d32]"><ArrowLeft className="h-4 w-4" /> Continue shopping</Link>
        <div className="mt-8 grid gap-8 lg:grid-cols-[1.1fr_.9fr]">
          <section>
            <p className="text-xs font-bold uppercase tracking-[.25em] text-[#b07926]">Checkout · secure payment options</p>
            <h1 className="mt-2 font-display text-5xl tracking-tight">Complete your order.</h1>
            <div className="mt-5 rounded-2xl border border-[#a36d21]/20 bg-[#fff8e9] p-4 text-sm leading-6 text-[#173d32]/75">
              No account is required for a basket order. Product names, prices, and availability are sample catalog data and fulfilment is not connected. Razorpay orders are recorded after payment verification; direct UPI transfers stay unpaid until a merchant checks the bank account, and cash-on-delivery orders are due on delivery.
            </div>
            {paymentReady === false && paymentMethod !== "cod" && paymentMethod !== "direct_upi" && (
              <div role="status" className="mt-4 rounded-2xl border border-[#a36d21]/20 bg-white p-4 text-sm leading-6 text-[#173d32]/75">
                Online payment is not configured on this server. {paymentSetupMessage || "Check the server configuration and try again."} No payment will be marked complete without provider verification.
              </div>
            )}

            {!grouped.length && !success ? (
              <div className="mt-8 rounded-3xl border border-[#173d32]/10 bg-white p-10 text-center shadow-sm">
                <ShoppingBag className="mx-auto h-10 w-10 text-[#173d32]/50" />
                <h2 className="mt-4 font-display text-3xl">Your basket is empty</h2>
                <Button className="mt-6" onClick={() => navigate("/products")}>Explore products</Button>
              </div>
            ) : success ? (
              <div role="status" className="mt-8 rounded-3xl border border-[#173d32]/10 bg-white p-8 shadow-sm">
                <h2 className="font-display text-3xl">{paymentMethod === "cod" ? "Order received" : paymentMethod === "direct_upi" ? directUpiQr?.verified ? "Payment verified" : "Payment reported for review" : "Payment complete"}</h2>
                <p className="mt-3 text-sm leading-6 text-[#173d32]/70">{success}</p>
                <Link href="/account" className="mt-5 inline-block font-semibold underline">View your account</Link>
              </div>
            ) : (
              <form ref={checkoutForm} onSubmit={(event) => void placeOrder(event)} className="mt-8 space-y-5 rounded-3xl border border-[#173d32]/10 bg-white p-6 shadow-sm">
                <h2 className="font-display text-2xl">Delivery details</h2>
                <label className="block text-sm font-semibold">Full name
                  <input required maxLength={120} autoComplete="name" value={buyer.name} onChange={(event) => setBuyer((current) => ({ ...current, name: event.target.value }))} className="mt-2 h-11 w-full rounded-xl border border-[#173d32]/15 px-3" />
                </label>
                <label className="block text-sm font-semibold">Email for order receipt
                  <input required type="email" maxLength={254} autoComplete="email" value={buyer.email} onChange={(event) => setBuyer((current) => ({ ...current, email: event.target.value }))} className="mt-2 h-11 w-full rounded-xl border border-[#173d32]/15 px-3" />
                </label>
                <label className="block text-sm font-semibold">Delivery address
                  <textarea required maxLength={500} autoComplete="street-address" rows={3} value={buyer.address} onChange={(event) => setBuyer((current) => ({ ...current, address: event.target.value }))} className="mt-2 w-full rounded-xl border border-[#173d32]/15 p-3" />
                </label>
                <fieldset className="space-y-2">
                  <legend className="text-sm font-semibold">Choose how to pay</legend>
                  <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
                    <button type="button" disabled={Boolean(directUpiQr) && paymentMethod !== "card"} aria-pressed={paymentMethod === "card"} onClick={() => setPaymentMethod("card")} className={`flex items-center gap-3 rounded-xl border p-3 text-left disabled:opacity-50 ${paymentMethod === "card" ? "border-[#173d32] bg-[#edf3ea]" : "border-[#173d32]/15 bg-white"}`}>
                      <CreditCard className="h-5 w-5 shrink-0" />
                      <span><span className="block text-sm font-semibold">Credit or debit card</span><span className="text-xs text-[#173d32]/60">Pay securely by card</span></span>
                    </button>
                    <button type="button" disabled={Boolean(directUpiQr) && paymentMethod !== "upi"} aria-pressed={paymentMethod === "upi"} onClick={() => setPaymentMethod("upi")} className={`flex items-center gap-3 rounded-xl border p-3 text-left disabled:opacity-50 ${paymentMethod === "upi" ? "border-[#173d32] bg-[#edf3ea]" : "border-[#173d32]/15 bg-white"}`}>
                      <QrCode className="h-5 w-5 shrink-0" />
                      <span><span className="block text-sm font-semibold">UPI · Razorpay</span><span className="text-xs text-[#173d32]/60">Gateway checkout</span></span>
                    </button>
                    <button type="button" disabled={Boolean(directUpiQr) && paymentMethod !== "direct_upi"} aria-pressed={paymentMethod === "direct_upi"} onClick={() => setPaymentMethod("direct_upi")} className={`flex items-center gap-3 rounded-xl border p-3 text-left disabled:opacity-50 ${paymentMethod === "direct_upi" ? "border-[#173d32] bg-[#edf3ea]" : "border-[#173d32]/15 bg-white"}`}>
                      <QrCode className="h-5 w-5 shrink-0" />
                      <span><span className="block text-sm font-semibold">Direct UPI QR</span><span className="text-xs text-[#173d32]/60">Manual verification</span></span>
                    </button>
                    <button type="button" disabled={Boolean(directUpiQr) && paymentMethod !== "cod"} aria-pressed={paymentMethod === "cod"} onClick={() => setPaymentMethod("cod")} className={`flex items-center gap-3 rounded-xl border p-3 text-left disabled:opacity-50 ${paymentMethod === "cod" ? "border-[#173d32] bg-[#edf3ea]" : "border-[#173d32]/15 bg-white"}`}>
                      <ShoppingBag className="h-5 w-5 shrink-0" />
                      <span><span className="block text-sm font-semibold">Cash on delivery</span><span className="text-xs text-[#173d32]/60">Pay when delivered</span></span>
                    </button>
                  </div>
                  <p className="text-xs leading-5 text-[#173d32]/60">{paymentMethod === "cod" ? "No online payment is taken now. The order is recorded as payment due on delivery." : paymentMethod === "direct_upi" ? "A UPI QR is generated locally from your configured merchant UPI ID. Transfers are not verified automatically; an administrator must check the bank statement." : "Payment details are entered only in Razorpay Checkout and are not stored by Health Hub. One-time QR generation requires UPI QR support on your Razorpay merchant account."}</p>
                </fieldset>
                {error && <div role="alert" className="rounded-xl bg-red-50 p-3 text-sm leading-6 text-red-800">
                  <p>{error}</p>
                  {orderProof && <button type="button" onClick={() => void placeOrder()} disabled={busy} className="mt-2 font-semibold underline disabled:opacity-60">Retry payment verification</button>}
                </div>}
                <Button type="submit" className="w-full" disabled={busy || !grouped.length || (paymentMethod === "direct_upi" ? directUpiReady !== true || Boolean(directUpiQr) : paymentMethod !== "cod" && paymentReady !== true)}>
                  {busy ? paymentMethod === "cod" ? "Placing order…" : paymentMethod === "direct_upi" ? "Creating UPI QR…" : "Processing securely…" : paymentMethod === "cod" ? `Place order · pay ${formatINR(total)} on delivery` : paymentMethod === "direct_upi" ? directUpiReady !== true ? "Direct UPI QR not configured" : directUpiQr ? `UPI QR created · order #${directUpiQr.orderId.slice(-8)}` : `Generate UPI QR · ${formatINR(total)}` : paymentReady !== true ? "Online payment not configured" : orderProof ? "Verify payment and place order" : `Pay ${formatINR(total)} by ${paymentMethod === "upi" ? "UPI" : "card"}`}
                </Button>
                {paymentMethod === "direct_upi" && !directUpiQr && directUpiReady === false && (
                  <p role="status" className="rounded-xl bg-[#fff8e9] p-3 text-sm leading-5">{directUpiSetupMessage || "Configure the merchant UPI ID in the server environment to accept direct UPI transfers."}</p>
                )}
                {paymentMethod === "upi" && (
                  <Button type="button" variant="outline" className="w-full" disabled={qrBusy || busy || !grouped.length || paymentReady !== true} onClick={() => void generateOneTimeQr()}>
                    {qrBusy ? "Generating one-time QR…" : paymentReady !== true ? "UPI QR payment not configured" : "Generate one-time UPI QR"}
                  </Button>
                )}
                {qrCheckout && qrStatus === "pending" && (
                  <div role="status" className="rounded-2xl border border-[#173d32]/10 bg-[#f7f3eb] p-4 text-center">
                    <p className="font-semibold">Scan with any UPI app to pay {formatINR(total)}</p>
                    <img src={qrCheckout.imageUrl} alt="One-time UPI payment QR code" className="mx-auto mt-3 h-56 w-56 rounded-xl bg-white p-2" />
                    <a href={qrCheckout.imageUrl} target="_blank" rel="noreferrer" className="mt-2 inline-block text-sm font-semibold underline">Open or download this QR code</a>
                    <p className="mt-3 text-sm text-[#173d32]/65">Waiting for payment confirmation… This QR is single-use and expires at {new Date(qrCheckout.expiresAt).toLocaleTimeString()}. You can return to this tab to resume status checks.</p>
                  </div>
                )}
                {qrStatus === "expired" && <p role="status" className="rounded-xl bg-[#fff8e9] p-3 text-sm">This one-time QR has expired. Generate a new QR to try again.</p>}
                {directUpiQr && paymentMethod === "direct_upi" && !success && (
                  <div role="status" className="rounded-2xl border border-[#173d32]/10 bg-[#f7f3eb] p-4 text-center">
                    <p className="font-semibold">Pay {formatINR(directUpiQr.amount)} to {directUpiQr.payeeName}</p>
                    <p className="mt-1 break-all text-xs text-[#173d32]/65">{directUpiQr.payeeVpa} · Order #{directUpiQr.orderId}</p>
                    <p className="mt-1 text-xs text-[#173d32]/65">UPI reference: {directUpiQr.paymentReference}</p>
                    <img src={directUpiQr.imageDataUrl} alt="Direct UPI payment QR code" className="mx-auto mt-3 h-64 w-64 rounded-xl bg-white p-2" />
                    <a href={directUpiQr.upiUri} className="mt-2 inline-block text-sm font-semibold underline">Open UPI app</a>
                    <p className="mx-auto mt-3 max-w-lg text-sm leading-5 text-[#173d32]/65">This direct UPI transfer is not automatically verified. Pay the exact amount and reference above. Do not treat the order as paid until the merchant confirms receipt.</p>
                    <Button type="button" className="mt-4 w-full" disabled={busy || directUpiQr.reported} onClick={() => void reportDirectUpiPayment()}>
                      {busy ? "Submitting report…" : directUpiQr.reported ? "Payment reported · awaiting merchant verification" : "I sent the UPI payment"}
                    </Button>
                    {!directUpiQr.reported && <Button type="button" variant="outline" className="mt-2 w-full" disabled={busy} onClick={() => void cancelDirectUpiQr()}>Cancel this QR order</Button>}
                  </div>
                )}
              </form>
            )}
          </section>

          <aside className="rounded-3xl bg-[#173d32] p-6 text-white">
            <div className="flex items-center justify-between"><h2 className="font-display text-3xl">Your basket</h2><ShoppingBag className="h-5 w-5 text-[#f4cc86]" /></div>
            {!grouped.length ? <p className="mt-8 text-white/65">Your basket is waiting for something good.</p> : <div className="mt-6 space-y-4">{grouped.map(({ product, quantity }) => <div key={product.id} className="rounded-2xl border border-white/10 bg-white/5 p-4"><div className="flex justify-between gap-3"><div><p className="font-semibold">{product.name}</p><p className="mt-1 text-xs text-white/60">{formatINR(product.price)} · {product.unit}</p></div><p className="font-semibold">{formatINR(product.price * quantity)}</p></div><div className="mt-3 flex items-center gap-2"><button type="button" aria-label={`Decrease ${product.name}`} disabled={Boolean(directUpiQr)} onClick={() => changeQuantity(product, -1)} className="rounded-full border border-white/15 p-1 disabled:opacity-40"><Minus className="h-3 w-3" /></button><span className="min-w-6 text-center text-sm">{quantity}</span><button type="button" aria-label={`Increase ${product.name}`} disabled={quantity >= 20 || Boolean(directUpiQr)} onClick={() => changeQuantity(product, 1)} className="rounded-full border border-white/15 p-1 disabled:opacity-40"><Plus className="h-3 w-3" /></button></div></div>)}</div>}
            <div className="mt-8 flex justify-between border-t border-white/15 pt-4 text-lg font-semibold"><span>Total</span><span>{formatINR(total)}</span></div>
          </aside>
        </div>
      </main>
    </div>
  );
}
