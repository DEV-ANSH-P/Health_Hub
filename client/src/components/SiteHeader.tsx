import { Link, useLocation } from "wouter";
import { Leaf, ShoppingBag, Sparkles, UserRound } from "lucide-react";
import { useCartCount } from "@/lib/cart";

export default function SiteHeader() {
  const [location] = useLocation();
  const cartCount = useCartCount();
  const links = [
    ["/", "Home"],
    ["/products", "Products"],
    ["/experts", "Experts"],
    ["/guidance", "Guidance"],
    ["/care", "Care"],
    ["/admin", "Admin"],
  ];
  const renderLinks = (mobile = false) => links.map(([href, label]) => {
    const active = href === "/" ? location === "/" : location.startsWith(href);
    return <Link key={href} href={href} aria-current={active ? "page" : undefined} className={`${mobile ? "shrink-0 px-2" : "px-2.5"} rounded-full py-2 text-xs font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#d79a32] ${active ? "bg-[#e9f1e4] text-[#173d32]" : "text-[#173d32]/75 hover:bg-[#e9f1e4] hover:text-[#173d32]"}`}>{label}</Link>;
  });
  return <header className="site-header sticky top-0 z-30 border-b border-[#173d32]/10 bg-[#f7f3eb]/80 backdrop-blur-2xl">
    <div className="pointer-events-none absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-[#173d32] via-[#d79a32] to-[#a36d21]" />
    <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-5 py-3 lg:px-10">
      <Link href="/" aria-label="Health Hub home" className="group flex shrink-0 items-center gap-2.5 rounded-2xl px-2 py-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#d79a32]"><span className="grid h-9 w-9 place-items-center rounded-xl bg-gradient-to-br from-[#173d32] to-[#39715a] text-[#f7f3eb] shadow-lg shadow-[#173d32]/15 transition-transform duration-300 group-hover:rotate-[-8deg]"><Leaf className="h-5 w-5 text-[#f5ca73]" /></span><span><span className="block font-display text-xl font-bold leading-none tracking-tight text-[#173d32]">HEALTH HUB</span><span className="mt-1 flex items-center gap-1 text-[9px] font-bold uppercase tracking-[.2em] text-[#a36d21]"><Sparkles className="h-3 w-3" /> Live well</span></span></Link>
      <nav aria-label="Primary navigation" className="hidden items-center gap-1 rounded-full border border-[#173d32]/10 bg-white/55 p-1 shadow-sm xl:flex">{renderLinks()}</nav>
      <nav aria-label="Primary navigation" className="flex max-w-[58vw] items-center gap-1 overflow-x-auto rounded-full border border-[#173d32]/10 bg-white/55 p-1 shadow-sm xl:hidden">{renderLinks(true)}</nav>
      <div className="flex shrink-0 items-center gap-2">
        <Link href="/account" aria-label="Open account" className={`group grid h-10 w-10 place-items-center rounded-xl border shadow-sm transition duration-300 hover:-translate-y-0.5 hover:shadow-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#d79a32] ${location.startsWith("/account") ? "border-[#d79a32] bg-[#f9e6bd] text-[#173d32]" : "border-[#173d32]/10 bg-white/70 text-[#173d32]"}`}><UserRound className="h-4 w-4 transition-transform group-hover:scale-110" /></Link>
        <Link href="/checkout" aria-label={`Open basket${cartCount ? `, ${cartCount} items` : ""}`} className="group relative grid h-10 w-10 place-items-center rounded-xl bg-gradient-to-br from-[#173d32] to-[#39715a] text-white shadow-lg shadow-[#173d32]/15 transition duration-300 hover:-translate-y-0.5 hover:shadow-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#d79a32]"><ShoppingBag className="h-4 w-4 transition-transform group-hover:scale-110" />{cartCount > 0 && <span className="absolute -right-2 -top-2 grid min-h-5 min-w-5 place-items-center rounded-full bg-[#d79a32] px-1 text-[10px] font-bold text-[#173d32] ring-2 ring-[#f7f3eb]">{cartCount}</span>}</Link>
      </div>
    </div>
  </header>;
}
