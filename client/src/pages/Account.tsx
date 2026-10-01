import { useEffect, useState } from "react";
import { CalendarDays, LogOut, Package, UserRound } from "lucide-react";
import { Link } from "wouter";
import SiteHeader from "@/components/SiteHeader";
import { Button } from "@/components/ui/button";
import { formatINR } from "@/lib/currency";
type Profile = { name: string; email: string };
type Order = { id: string; items?: string[]; total: number; paymentMethod?: string; paymentStatus?: string };
type Appointment = { id: string; expert: string; mode: string; date: string };
export default function Account() {
  const [profile, setProfile] = useState<Profile | null>(null); const [orders, setOrders] = useState<Order[]>([]); const [appointments, setAppointments] = useState<Appointment[]>([]);
  useEffect(() => {
    fetch("/api/auth/me")
      .then((response) => response.ok ? response.json() : null)
      .then((payload) => {
        const p = payload?.user as Profile | undefined;
        if (!p) return;
        setProfile(p);
        return Promise.all([
          fetch(`/api/orders?email=${encodeURIComponent(p.email)}`).then((r) => r.json()),
          fetch(`/api/appointments?email=${encodeURIComponent(p.email)}`).then((r) => r.json()),
        ]);
      })
      .then((result) => {
        if (!result) return;
        const [ordersPayload, appointmentsPayload] = result;
        setOrders(Array.isArray(ordersPayload.orders) ? ordersPayload.orders : []);
        setAppointments(Array.isArray(appointmentsPayload.bookings) ? appointmentsPayload.bookings : []);
      })
      .catch(() => setProfile(null));
  }, []);
  const logout = async () => {
    await fetch("/api/auth/logout", { method: "POST" });
    localStorage.removeItem("herbal-health-user");
    setProfile(null);
    setOrders([]);
    setAppointments([]);
  };
  return <div className="min-h-screen bg-[#f4f1e9] text-[#173d32]"><SiteHeader /><main className="mx-auto max-w-6xl px-5 py-12 lg:px-10"><p className="text-xs font-bold uppercase tracking-[.25em] text-[#b07926]">Your space</p><h1 className="mt-3 font-display text-5xl">Account</h1>{!profile ? <div className="mt-8 rounded-3xl bg-white p-8 text-center shadow-sm"><UserRound className="mx-auto h-10 w-10 text-[#b07926]" /><h2 className="mt-4 font-display text-3xl">Your wellness journey starts here.</h2><p className="mx-auto mt-3 max-w-md text-[#173d32]/65">Sign in to view orders, appointments and saved details.</p><Link href="/?auth=login" className="mt-6 inline-block"><Button>Login / Sign up</Button></Link></div> : <><div className="mt-8 flex flex-wrap items-center justify-between gap-4 rounded-3xl bg-[#173d32] p-7 text-white"><div><p className="text-sm text-white/60">Welcome back</p><h2 className="mt-1 font-display text-3xl">{profile.name}</h2><p className="mt-2 text-sm text-white/70">{profile.email}</p></div><Button variant="outline" className="border-white/30 bg-transparent text-white hover:bg-white/10" onClick={logout}><LogOut className="h-4 w-4" /> Sign out</Button></div><div className="mt-8 grid gap-6 md:grid-cols-2"><section className="rounded-3xl border border-[#173d32]/10 bg-white p-6"><h2 className="flex items-center gap-2 font-display text-2xl"><Package className="h-5 w-5 text-[#b07926]" /> Orders</h2>{orders.length ? orders.map((o) => <div key={o.id} className="mt-4 border-t pt-4 text-sm"><b>Order #{o.id}</b><p className="text-[#173d32]/60">{o.items?.join(", ")} · ₹{o.total}</p><p className="mt-1 text-xs text-[#173d32]/55">{o.paymentMethod === "cash_on_delivery" ? "Cash on delivery" : o.paymentMethod === "upi_qr_manual" ? "Direct UPI QR" : "Online payment"} · {o.paymentStatus === "reported" ? "transfer reported; awaiting verification" : o.paymentStatus === "pending" ? o.paymentMethod === "cash_on_delivery" ? "payment due on delivery" : "awaiting transfer" : "paid"}</p></div>) : <p className="mt-5 text-sm text-[#173d32]/55">No orders yet.</p>}</section><section className="rounded-3xl border border-[#173d32]/10 bg-white p-6"><h2 className="flex items-center gap-2 font-display text-2xl"><CalendarDays className="h-5 w-5 text-[#b07926]" /> Appointments</h2>{appointments.length ? appointments.map((a) => <div key={a.id} className="mt-4 border-t pt-4 text-sm"><b>{a.expert}</b><p className="text-[#173d32]/60">{a.mode} · {new Date(a.date).toLocaleDateString()}</p></div>) : <p className="mt-5 text-sm text-[#173d32]/55">No appointments yet.</p>}</section></div></>}</main></div>;
}
