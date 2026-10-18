import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, Star, Clock, Check, X, Minus, Plus } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { capi, inr } from "@/lib/api";
import { useCust } from "./CustomerApp";
import { addToCart } from "./CHome";

export default function CServiceDetail() {
  const { id } = useParams();
  const { address, refreshCart, cartCount } = useCust();
  const [s, setS] = useState(null);
  const [qty, setQty] = useState(1);
  const [addons, setAddons] = useState([]);
  const [added, setAdded] = useState(false);
  const nav = useNavigate();
  useEffect(() => {
    capi.get(`/catalog/services/${id}`, { params: { pincode: address?.pincode } }).then((r) => setS(r.data));
  }, [id, address?.pincode]);
  if (!s) return <div className="p-6 text-sm text-slate-500">Loading…</div>;
  const unit = s.city_price || s.price;
  const total = (unit + s.addons.filter((a) => addons.includes(a.id)).reduce((x, a) => x + a.price, 0)) * qty;
  const toggle = (aid) => setAddons((x) => (x.includes(aid) ? x.filter((y) => y !== aid) : [...x, aid]));
  const add = async () => {
    await addToCart(s.id, refreshCart, addons, qty);
    setAdded(true);
  };
  return (
    <div className="min-h-full bg-white">
      <div className="relative h-56">
        <img src={s.image} alt={s.name} className="h-full w-full object-cover" />
        <button data-testid="service-detail-back-btn" onClick={() => nav(-1)} className="absolute left-4 top-4 grid h-9 w-9 place-items-center rounded-full bg-white/90 shadow">
          <ArrowLeft className="h-5 w-5" />
        </button>
      </div>
      <div className="space-y-5 px-4 pb-32 pt-4">
        <div>
          <h1 data-testid="service-detail-name" className="font-heading text-2xl font-bold leading-tight">{s.name}</h1>
          <p className="mt-1.5 flex items-center gap-3 text-sm text-slate-600">
            <span className="flex items-center gap-1"><Star className="h-4 w-4 fill-[#F59E0B] text-[#F59E0B]" />{s.rating} · {s.reviews_count.toLocaleString("en-IN")} reviews</span>
            <span className="flex items-center gap-1"><Clock className="h-4 w-4" />{s.duration_min} min</span>
          </p>
          <p className="mt-2 text-lg font-bold">{inr(unit)} {s.city_price && <span className="ml-1 text-xs font-medium text-slate-400 line-through">{inr(s.price)}</span>}</p>
        </div>
        <div className="rounded-2xl border border-green-100 bg-green-50/50 p-4">
          <h3 className="text-sm font-bold">What's included</h3>
          <ul className="mt-2 space-y-1.5">{s.inclusions.map((x) => <li key={x} className="flex gap-2 text-sm text-slate-700"><Check className="h-4 w-4 shrink-0 text-[#22C55E]" />{x}</li>)}</ul>
        </div>
        <div className="rounded-2xl border border-red-100 bg-red-50/40 p-4">
          <h3 className="text-sm font-bold">Not included</h3>
          <ul className="mt-2 space-y-1.5">{s.exclusions.map((x) => <li key={x} className="flex gap-2 text-sm text-slate-600"><X className="h-4 w-4 shrink-0 text-[#EF4444]" />{x}</li>)}</ul>
        </div>
        {s.addons.length > 0 && (
          <div>
            <h3 className="text-sm font-bold">Add-ons</h3>
            <div className="mt-2 space-y-2">
              {s.addons.map((a) => (
                <label key={a.id} className="flex items-center justify-between rounded-xl border border-slate-200 p-3">
                  <span className="flex items-center gap-2.5 text-sm"><Checkbox data-testid={`addon-${a.id}`} checked={addons.includes(a.id)} onCheckedChange={() => toggle(a.id)} />{a.name}</span>
                  <span className="text-sm font-semibold">+{inr(a.price)}</span>
                </label>
              ))}
            </div>
          </div>
        )}
        <div className="flex items-center justify-between rounded-xl border border-slate-200 p-3">
          <span className="text-sm font-semibold">Quantity</span>
          <div className="flex items-center gap-3">
            <button data-testid="qty-minus-btn" onClick={() => setQty((q) => Math.max(1, q - 1))} className="grid h-8 w-8 place-items-center rounded-lg border"><Minus className="h-4 w-4" /></button>
            <span data-testid="qty-value" className="w-5 text-center font-bold">{qty}</span>
            <button data-testid="qty-plus-btn" onClick={() => setQty((q) => q + 1)} className="grid h-8 w-8 place-items-center rounded-lg border border-[#1E3A8A] text-[#1E3A8A]"><Plus className="h-4 w-4" /></button>
          </div>
        </div>
        <div>
          <h3 className="text-sm font-bold">Customer reviews</h3>
          {s.reviews.map((r) => (
            <div key={r.name} className="mt-2 rounded-xl bg-slate-50 p-3">
              <p className="text-sm font-semibold">{r.name} <span className="text-[#F59E0B]">{"★".repeat(r.rating)}</span></p>
              <p className="text-sm text-slate-600">{r.text}</p>
            </div>
          ))}
        </div>
      </div>
      <div className="sticky bottom-0 flex items-center justify-between gap-3 border-t border-slate-200 bg-white px-4 py-3">
        <div>
          <p className="text-xs text-slate-500">{qty} × item{addons.length ? " + add-ons" : ""}</p>
          <p data-testid="service-detail-total" className="text-lg font-bold">{inr(total)}</p>
        </div>
        {added || cartCount > 0 ? (
          <div className="flex gap-2">
            {!added && <button data-testid="service-detail-add-btn" onClick={add} className="rounded-xl border border-[#1E3A8A] px-4 py-3 text-sm font-bold text-[#1E3A8A]">Add</button>}
            <button data-testid="service-detail-checkout-btn" onClick={() => nav("/app/checkout")} className="rounded-xl bg-[#F59E0B] px-5 py-3 text-sm font-bold text-slate-900">Proceed to Checkout</button>
          </div>
        ) : (
          <button data-testid="service-detail-add-btn" onClick={add} className="rounded-xl bg-[#1E3A8A] px-6 py-3 text-sm font-bold text-white">Add to cart</button>
        )}
      </div>
    </div>
  );
}
