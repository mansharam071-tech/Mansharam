import { useEffect, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { ArrowLeft, Star, Clock, Plus, ShoppingCart } from "lucide-react";
import { capi, inr } from "@/lib/api";
import { Empty } from "@/components/common/Shared";
import { useCust } from "./CustomerApp";
import { addToCart } from "./CHome";

export default function CServices() {
  const [sp] = useSearchParams();
  const cat = sp.get("category_id");
  const q = sp.get("q");
  const [list, setList] = useState([]);
  const [cats, setCats] = useState([]);
  const { refreshCart, cartCount } = useCust();
  const nav = useNavigate();
  useEffect(() => {
    capi.get("/catalog/services", { params: { category_id: cat || undefined, q: q || undefined } }).then((r) => setList(r.data));
    capi.get("/catalog/home").then((r) => setCats(r.data.categories));
  }, [cat, q]);
  const title = q ? `Results for "${q}"` : cats.find((c) => c.id === cat)?.name || "All services";
  return (
    <div className="pb-24">
      <div className="sticky top-0 z-10 flex items-center gap-3 border-b border-slate-200 bg-white/90 px-4 py-3 backdrop-blur-md">
        <button data-testid="services-back-btn" onClick={() => nav(-1)}><ArrowLeft className="h-5 w-5" /></button>
        <h1 className="font-heading text-lg font-semibold">{title}</h1>
      </div>
      <div className="flex gap-2 overflow-x-auto px-4 py-3 no-scrollbar">
        {cats.map((c) => (
          <Link key={c.id} to={`/app/services?category_id=${c.id}`} data-testid={`services-chip-${c.id}`}
            className={`shrink-0 rounded-full border px-3 py-1.5 text-xs font-semibold ${c.id === cat ? "border-[#1E3A8A] bg-[#1E3A8A] text-white" : "border-slate-200 bg-white text-slate-600"}`}>
            {c.name}
          </Link>
        ))}
      </div>
      <div className="space-y-3 px-4">
        {list.length === 0 && <Empty text="No services match your search" testid="services-empty" />}
        {list.map((s, i) => (
          <div key={s.id} className="rise flex gap-3 rounded-2xl border border-slate-200 bg-white p-3" style={{ animationDelay: `${i * 0.05}s` }}>
            <div className="min-w-0 flex-1">
              <Link to={`/app/service/${s.id}`} data-testid={`service-card-${s.id}`}>
                <p className="text-[15px] font-semibold leading-snug">{s.name}</p>
              </Link>
              <p className="mt-1 flex items-center gap-2 text-xs text-slate-500">
                <span className="flex items-center gap-0.5"><Star className="h-3 w-3 fill-[#F59E0B] text-[#F59E0B]" />{s.rating} ({(s.reviews_count / 1000).toFixed(1)}k)</span>
                <span className="flex items-center gap-0.5"><Clock className="h-3 w-3" />{s.duration_min} min</span>
              </p>
              <p className="mt-1.5 text-sm font-bold">Starts at {inr(s.price)}</p>
              <ul className="mt-1.5 space-y-0.5">
                {s.inclusions.slice(0, 2).map((x) => <li key={x} className="text-xs text-slate-600"><span className="text-[#22C55E]">✓</span> {x}</li>)}
              </ul>
            </div>
            <div className="flex w-24 flex-col items-center">
              <img src={s.image} alt="" className="h-20 w-24 rounded-xl object-cover" />
              <button data-testid={`service-add-${s.id}`} onClick={() => addToCart(s.id, refreshCart)}
                className="-mt-3 flex items-center rounded-lg border border-[#1E3A8A] bg-white px-3 py-1 text-xs font-bold text-[#1E3A8A] shadow-sm">
                Add <Plus className="ml-0.5 h-3 w-3" />
              </button>
            </div>
          </div>
        ))}
      </div>
      {cartCount > 0 && (
        <button data-testid="services-view-cart-btn" onClick={() => nav("/app/checkout")}
          className="sticky bottom-3 mx-4 mt-6 flex w-[calc(100%-2rem)] items-center justify-between rounded-2xl bg-[#F59E0B] px-4 py-3.5 font-bold text-slate-900 shadow-lg">
          <span className="flex items-center gap-2"><ShoppingCart className="h-5 w-5" /> {cartCount} item(s)</span>
          <span>Checkout →</span>
        </button>
      )}
    </div>
  );
}
