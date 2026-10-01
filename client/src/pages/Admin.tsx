import { useEffect, useMemo, useState } from "react";
import { CheckCircle2, Clock3, PackageCheck, ShoppingCart, Users } from "lucide-react";
import { toast } from "sonner";
import SiteHeader from "@/components/SiteHeader";
import { Button } from "@/components/ui/button";
import { featuredProducts } from "./Home";
import { formatINR } from "@/lib/currency";

type Submission = { id: string; name: string; category: string; submitter: string; status: "pending" | "approved" | "rejected" };
type Order = { id: string; email: string; customer?: string; address?: string; items: string[]; total: number; status: string; paymentMethod?: string; paymentStatus?: string; paymentReference?: string; createdAt: string };
const seed: Submission[] = featuredProducts.slice(0, 5).map((p, i) => ({ id: String(p.id), name: p.name, category: p.category, submitter: i % 2 ? "Greenleaf Collective" : "Community partner", status: i < 3 ? "approved" : "pending" }));
const orderStatuses = ["awaiting_payment", "paid", "confirmed", "packed", "shipped", "delivered", "cancelled"];

export default function Admin() {
  const [rows, setRows] = useState<Submission[]>(seed);
  const [orders, setOrders] = useState<Order[]>([]);
  useEffect(() => {
    fetch("/api/admin/products").then((r) => r.ok ? r.json() : null).then((data) => data?.products && setRows(data.products)).catch(() => undefined);
    fetch("/api/admin/orders").then((r) => r.ok ? r.json() : null).then((data) => data?.orders && setOrders(data.orders)).catch(() => undefined);
  }, []);
  const updateProduct = async (id: string, status: Submission["status"]) => {
    setRows((current) => current.map((row) => row.id === id ? { ...row, status } : row));
    const response = await fetch(`/api/admin/products/${id}/status`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status }) });
    if (!response.ok) toast.error("Product status could not be updated."); else toast.success(`Product ${status}`);
  };
  const updateOrder = async (id: string, status: string) => {
    const response = await fetch(`/api/admin/orders/${id}/status`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status }) });
    if (!response.ok) { toast.error("Order status could not be updated."); return; }
    setOrders((current) => current.map((order) => order.id === id ? { ...order, status } : order));
    toast.success(`Order marked ${status}`);
  };
  const verifyOrderPayment = async (order: Order) => {
    if (!window.confirm(`Confirm that you checked the merchant account and received ${formatINR(order.total)} for order #${order.id.slice(-8)}?`)) return;
    const response = await fetch(`/api/admin/orders/${encodeURIComponent(order.id)}/payment-status`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ paymentStatus: "paid" }),
    });
    if (!response.ok) { toast.error("Payment could not be verified."); return; }
    setOrders((current) => current.map((entry) => entry.id === order.id
      ? { ...entry, paymentStatus: "paid", status: entry.paymentMethod === "upi_qr_manual" ? "confirmed" : entry.status }
      : entry));
    toast.success("Payment marked received after manual verification.");
  };
  const pending = rows.filter((r) => r.status === "pending").length;
  const openOrders = useMemo(() => orders.filter((order) => !["delivered", "cancelled"].includes(order.status)).length, [orders]);
  return <div className="min-h-screen bg-[#f4f1e9] text-[#173d32]"><SiteHeader /><main className="mx-auto max-w-7xl px-5 py-12 lg:px-10">
    <p className="text-xs font-bold uppercase tracking-[.25em] text-[#b07926]">Operations</p><h1 className="mt-2 font-display text-5xl">Admin dashboard</h1><p className="mt-3 text-[#173d32]/65">Manage product approvals and fulfil customer order requests from one place.</p>
    <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">{[[<PackageCheck />, "Live products", rows.filter((r) => r.status === "approved").length], [<Clock3 />, "Awaiting review", pending], [<ShoppingCart />, "Open orders", openOrders], [<Users />, "Total orders", orders.length]].map(([icon, label, value]) => <div key={String(label)} className="rounded-2xl border border-[#173d32]/10 bg-white p-5"><div className="flex items-center gap-2 text-[#b07926]">{icon}<span className="text-xs font-bold uppercase tracking-wider">{label}</span></div><p className="mt-3 font-display text-4xl">{value}</p></div>)}</div>
    <section className="mt-8 overflow-hidden rounded-3xl border border-[#173d32]/10 bg-white"><div className="border-b border-[#173d32]/10 p-6"><h2 className="flex items-center gap-2 font-display text-2xl"><ShoppingCart className="h-5 w-5 text-[#b07926]" /> Order requests</h2><p className="mt-1 text-sm text-[#173d32]/60">Verify direct UPI transfers against your bank account before marking them paid.</p></div><div className="overflow-x-auto"><table className="w-full min-w-[940px] text-left text-sm"><thead className="bg-[#f7f3eb] text-xs uppercase tracking-wider text-[#173d32]/60"><tr><th className="p-4">Order</th><th className="p-4">Customer</th><th className="p-4">Items</th><th className="p-4">Total</th><th className="p-4">Fulfilment</th><th className="p-4">Payment</th><th className="p-4">Update</th></tr></thead><tbody>{orders.map((order) => <tr key={order.id} className="border-t border-[#173d32]/8"><td className="p-4 font-semibold">#{order.id.slice(-8)}<p className="mt-1 text-xs font-normal text-[#173d32]/50">{new Date(order.createdAt).toLocaleString()}</p></td><td className="p-4"><b>{order.customer || "Guest customer"}</b><p className="text-xs text-[#173d32]/55">{order.email}</p><p className="max-w-[180px] truncate text-xs text-[#173d32]/55">{order.address}</p></td><td className="max-w-[220px] p-4 text-[#173d32]/70">{order.items.join(", ")}</td><td className="p-4 font-semibold">{formatINR(order.total)}</td><td className="p-4"><span className="rounded-full bg-[#e4f1df] px-3 py-1 text-xs font-bold">{order.status}</span></td>    <td className="p-4 text-xs">{order.paymentMethod === "cash_on_delivery" ? "Cash on delivery" : order.paymentMethod === "upi_qr_manual" ? "Direct UPI QR" : "Razorpay"}<p className="mt-1 text-[#173d32]/55">{order.paymentStatus === "reported" ? "Reported · verify bank transfer" : order.paymentStatus === "pending" ? order.paymentMethod === "cash_on_delivery" ? "Due on delivery" : "Awaiting transfer" : "Paid"}</p>{order.paymentReference && <p className="mt-1 break-all text-[#173d32]/55">UPI ref: {order.paymentReference}</p>}</td><td className="p-4"><div className="flex flex-col gap-2"><select disabled={order.paymentMethod === "upi_qr_manual" && order.paymentStatus !== "paid"} value={order.status} onChange={(event) => updateOrder(order.id, event.target.value)} className="rounded-xl border border-[#173d32]/15 bg-white px-3 py-2 text-xs font-semibold disabled:opacity-50">{orderStatuses.map((status) => <option key={status}>{status}</option>)}</select>{((order.paymentMethod === "upi_qr_manual" && order.paymentStatus === "reported") || (order.paymentMethod === "cash_on_delivery" && order.paymentStatus === "pending")) && <Button size="sm" variant="outline" onClick={() => void verifyOrderPayment(order)}>Verify & mark received</Button>}</div></td></tr>)}</tbody></table>{!orders.length && <div className="p-10 text-center text-sm text-[#173d32]/55">No order requests yet. New checkout orders will appear here.</div>}</div></section>
    <section className="mt-8 overflow-hidden rounded-3xl border border-[#173d32]/10 bg-white"><div className="border-b border-[#173d32]/10 p-6"><h2 className="font-display text-2xl">Product submissions</h2></div><div className="overflow-x-auto"><table className="w-full text-left text-sm"><thead className="bg-[#f7f3eb] text-xs uppercase tracking-wider text-[#173d32]/60"><tr><th className="p-4">Product</th><th className="p-4">Category</th><th className="p-4">Contributor</th><th className="p-4">Status</th><th className="p-4">Actions</th></tr></thead><tbody>{rows.map((row) => <tr key={row.id} className="border-t border-[#173d32]/8"><td className="p-4 font-semibold">{row.name}</td><td className="p-4">{row.category}</td><td className="p-4 text-[#173d32]/60">{row.submitter}</td><td className="p-4"><span className="rounded-full bg-[#e4f1df] px-3 py-1 text-xs font-bold">{row.status}</span></td><td className="flex gap-2 p-4">{row.status !== "approved" && <Button size="sm" onClick={() => updateProduct(row.id, "approved")}>Approve</Button>}{row.status !== "rejected" && <Button size="sm" variant="outline" onClick={() => updateProduct(row.id, "rejected")}>Reject</Button>}</td></tr>)}</tbody></table></div></section>
  </main></div>;
}
