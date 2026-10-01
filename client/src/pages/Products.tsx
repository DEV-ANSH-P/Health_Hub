import { useMemo, useState } from "react";
import { Search, ShoppingBag } from "lucide-react";
import { toast } from "sonner";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import SiteHeader from "@/components/SiteHeader";
import { featuredProducts, type Product } from "./Home";
import { formatINR } from "@/lib/currency";
import { trackAnalyticsEvent } from "@/lib/analytics";
import { useCart } from "@/lib/cart";

export default function Products() {
  const [query, setQuery] = useState(""); const [category, setCategory] = useState("All");
  const { cart, addToCart } = useCart(featuredProducts);
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const categories = ["All", ...Array.from(new Set(featuredProducts.map((p) => p.category)))];
  const items = useMemo(() => featuredProducts.filter((p) => (category === "All" || p.category === category) && `${p.name} ${p.benefit}`.toLowerCase().includes(query.toLowerCase())), [query, category]);
  const add = (product: Product) => {
    const result = addToCart(product);
    if (!result.added) {
      toast.error(`You can add up to 20 ${product.name} items per order.`);
      return;
    }
    toast.success(`${product.name} added to cart`);
  };
  return <div className="min-h-screen bg-[#f4f1e9] text-[#173d32]"><SiteHeader /><main className="mx-auto max-w-7xl px-5 py-12 lg:px-10">
    <div className="mb-10 flex flex-col justify-between gap-5 md:flex-row md:items-end"><div><p className="text-xs font-bold uppercase tracking-[.25em] text-[#b07926]">The apothecary · catalog preview</p><h1 className="mt-2 font-display text-5xl tracking-tight">Products for your rhythm</h1><p className="mt-3 max-w-xl text-[#173d32]/65">Browse sample descriptions, ingredients, and preparation ideas. Product sourcing, stock, fulfilment, and live pricing are not connected.</p></div><Link href="/checkout" className="inline-flex items-center gap-2 self-start rounded-full bg-white px-4 py-2 text-sm font-semibold hover:bg-[#edf3ea]"><ShoppingBag className="h-4 w-4" /> {cart.length} in cart · View basket</Link></div>
    <div className="mb-8 rounded-2xl border border-[#a36d21]/20 bg-[#fff8e9] p-4 text-sm leading-6 text-[#173d32]/75">Names, prices, ingredient lists, and product claims in this catalog are illustrative and may not match a real product or label. This information is not medical advice. Verify the package and consult a qualified clinician or pharmacist about allergies, medication interactions, pregnancy, or health conditions. Do not use herbs or supplements as a substitute for prescribed care.</div>
    <div className="mb-8 flex flex-col gap-3 md:flex-row"><div className="relative flex-1"><Search className="absolute left-3 top-3 h-4 w-4 text-[#173d32]/45" /><Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search products..." className="rounded-full border-[#173d32]/15 bg-white pl-10" /></div><div className="flex flex-wrap gap-2">{categories.map((c) => <button key={c} onClick={() => setCategory(c)} className={`rounded-full px-4 py-2 text-sm font-semibold ${category === c ? "bg-[#173d32] text-white" : "bg-white text-[#173d32]/70"}`}>{c}</button>)}</div></div>
    <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">{items.map((p) => <article key={p.id} className="overflow-hidden rounded-3xl border border-[#173d32]/10 bg-white shadow-sm"><button type="button" className="block h-48 w-full p-5 text-left" style={{ backgroundColor: p.color }} onClick={() => { setSelectedProduct(p); void trackAnalyticsEvent("product_view"); }} aria-label={`View details for ${p.name}`}><img src={p.image} alt={p.name} className="h-full w-full object-contain mix-blend-multiply" /></button><div className="p-5"><span className="text-xs font-bold uppercase tracking-wider text-[#b07926]">{p.category}</span><button type="button" className="mt-2 block text-left font-display text-2xl hover:underline" onClick={() => { setSelectedProduct(p); void trackAnalyticsEvent("product_view"); }}>{p.name}</button><p className="mt-1 text-sm text-[#173d32]/60">{p.benefit}</p><div className="mt-5 flex items-center justify-between"><span className="font-semibold">{formatINR(p.price)} <small className="font-normal text-[#173d32]/50">· {p.unit}</small></span><Button size="sm" onClick={() => add(p)}><ShoppingBag className="h-4 w-4" /> Add</Button></div></div></article>)}</div>
    {!items.length && <div className="rounded-3xl bg-white p-12 text-center text-[#173d32]/60">No products match your search.</div>}
  </main>
  <Dialog open={Boolean(selectedProduct)} onOpenChange={(open) => !open && setSelectedProduct(null)}>
    <DialogContent>
      {selectedProduct && <><DialogHeader><DialogTitle>{selectedProduct.name}</DialogTitle><DialogDescription>{selectedProduct.benefit} · {selectedProduct.unit}</DialogDescription></DialogHeader><div className="grid gap-5 sm:grid-cols-[180px_1fr]"><div className="rounded-2xl p-4" style={{ backgroundColor: selectedProduct.color }}><img src={selectedProduct.image} alt="" className="h-40 w-full object-contain mix-blend-multiply" /></div><div className="space-y-4 text-sm leading-6 text-[#173d32]/70"><p>{selectedProduct.description || selectedProduct.note}</p>{selectedProduct.ingredients && <div><p className="font-semibold text-[#173d32]">Catalog ingredient information</p><p>{selectedProduct.ingredients.join(" · ")}</p><p className="mt-2 text-xs">Confirm the exact ingredients and warnings on the physical product label.</p></div>}{selectedProduct.preparation && <div><p className="font-semibold text-[#173d32]">Preparation idea</p><p>{selectedProduct.preparation}</p></div>}<p className="rounded-xl bg-[#fff8e9] p-3 text-xs">General information only. Ask a clinician or pharmacist about safety, interactions, or suitability for your health needs.</p></div></div><DialogFooter><Button onClick={() => { add(selectedProduct); setSelectedProduct(null); }}>Add to cart · {formatINR(selectedProduct.price)}</Button></DialogFooter></>}
    </DialogContent>
  </Dialog>
  </div>;
}
