import { useEffect, useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { MapPin, Mic, Search, ChevronDown, Plus, Star, ShoppingCart, LocateFixed, RotateCcw } from "lucide-react";
import { toast } from "sonner";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { capi, errMsg, getGPS, inr } from "@/lib/api";
import { CatIcon } from "@/components/common/Shared";
import { useCust } from "./CustomerApp";

export const addToCart = async (service_id, refreshCart, addon_ids = [], qty = 1) => {
  try {
    await capi.post("/customer/cart/items", { service_id, qty, addon_ids });
    await refreshCart();
    toast.success("Added to cart");
  } catch (e) {
    toast.error(errMsg(e));
  }
};

const LocationSheet = ({ open, onOpenChange }) => {
  const { setAddress } = useCust();
  const [list, setList] = useState([]);
  const nav = useNavigate();
  useEffect(() => {
    if (open) capi.get("/customer/addresses").then((r) => setList(r.data));
  }, [open]);
  const gps = async () => {
    try {
      const pos = await getGPS();
      const { data } = await capi.get("/locate", { params: pos });
      if (data.serviceable) toast.success(`You're in ${data.city} (${data.pincode}). Add this as an address.`);
      else toast.warning(`Nearest service city is ${data.city} (${data.distance_km} km away)`);
      nav(`/app/profile?addAddress=1&pincode=${data.pincode || ""}&lat=${pos.lat}&lng=${pos.lng}`);
    } catch (e) {
      toast.error(e.message || errMsg(e));
    }
  };
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="rounded-t-3xl md:inset-x-auto md:left-[calc(50%-196px)] md:w-[392px]">
        <SheetHeader><SheetTitle>Choose service location</SheetTitle></SheetHeader>
        <Button data-testid="location-use-gps-btn" variant="outline" onClick={gps} className="mt-4 w-full justify-start border-[#1E3A8A] text-[#1E3A8A]">
          <LocateFixed className="mr-2 h-4 w-4" /> Use current location (GPS)
        </Button>
        <div className="mt-3 space-y-2">
          {list.map((a) => (
            <button key={a.id} data-testid={`location-address-${a.id}`} onClick={() => { setAddress(a); onOpenChange(false); }}
              className="w-full rounded-xl border border-slate-200 p-3 text-left hover:border-[#1E3A8A]">
              <p className="text-sm font-semibold">{a.label} · {a.pincode}</p>
              <p className="text-xs text-slate-500">{a.line}</p>
            </button>
          ))}
          <Link to="/app/profile?addAddress=1" data-testid="location-add-address-link" className="block text-center text-sm font-semibold text-[#1E3A8A]">+ Add new address / pincode</Link>
        </div>
      </SheetContent>
    </Sheet>
  );
};

const Header = () => {
  const { address } = useCust();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const nav = useNavigate();
  const voice = () => {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) return toast.error("Voice search isn't supported in this browser");
    const r = new SR();
    r.lang = "en-IN";
    r.onresult = (e) => nav(`/app/services?q=${encodeURIComponent(e.results[0][0].transcript)}`);
    r.start();
    toast("Listening… say a service name");
  };
  return (
    <div className="bg-[#1E3A8A] px-4 pb-5 pt-5 text-white">
      <button data-testid="home-location-selector" onClick={() => setOpen(true)} className="flex items-center gap-2 text-left">
        <MapPin className="h-5 w-5 text-[#F59E0B]" />
        <div>
          <p className="flex items-center gap-1 text-[15px] font-bold">{address?.label || "Set location"} <ChevronDown className="h-4 w-4" /></p>
          <p className="max-w-[260px] truncate text-xs text-white/70">{address ? `${address.line} · ${address.pincode}` : "Tap to detect via GPS"}</p>
        </div>
      </button>
      <form onSubmit={(e) => { e.preventDefault(); q.trim() && nav(`/app/services?q=${encodeURIComponent(q)}`); }}
        className="mt-4 flex items-center gap-2 rounded-xl bg-white px-3 text-slate-800">
        <Search className="h-4 w-4 text-slate-400" />
        <input data-testid="home-search-input" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search 'AC repair', 'cleaning'…"
          className="h-11 flex-1 bg-transparent text-[15px] outline-none" />
        <button type="button" data-testid="home-voice-search-btn" onClick={voice}><Mic className="h-5 w-5 text-[#1E3A8A]" /></button>
      </form>
      <LocationSheet open={open} onOpenChange={setOpen} />
    </div>
  );
};

const Banners = ({ banners }) => {
  const [i, setI] = useState(0);
  const nav = useNavigate();
  useEffect(() => {
    const t = setInterval(() => setI((x) => (x + 1) % Math.max(1, banners.length)), 4000);
    return () => clearInterval(t);
  }, [banners.length]);
  if (!banners.length) return null;
  return (
    <div className="px-4 pt-4" data-testid="home-banner-slider">
      <div className="relative h-36 overflow-hidden rounded-2xl">
        {banners.map((b, k) => (
          <button key={b.id} onClick={() => nav(`/app/services?category_id=${b.category_id}`)} data-testid={`home-banner-${b.id}`}
            className={`absolute inset-0 text-left transition-opacity duration-700 ${k === i ? "opacity-100" : "pointer-events-none opacity-0"}`}>
            <img src={b.image} alt="" className="h-full w-full object-cover" />
            <div className="absolute inset-0 bg-gradient-to-r from-[#0F172A]/90 to-transparent p-4">
              <p className="font-heading max-w-[200px] text-xl font-extrabold leading-tight text-white">{b.title}</p>
              <p className="mt-1 text-xs text-white/80">{b.subtitle}</p>
              {b.code && <span className="mt-2 inline-block rounded-md bg-[#F59E0B] px-2 py-0.5 font-mono text-xs font-bold text-slate-900">{b.code}</span>}
            </div>
          </button>
        ))}
      </div>
      <div className="mt-2 flex justify-center gap-1.5">
        {banners.map((b, k) => <span key={b.id} className={`h-1.5 rounded-full transition-[width] ${k === i ? "w-5 bg-[#1E3A8A]" : "w-1.5 bg-slate-300"}`} />)}
      </div>
    </div>
  );
};

const ServiceMini = ({ s, onAdd }) => (
  <div className="w-40 shrink-0 overflow-hidden rounded-2xl border border-slate-200 bg-white">
    <Link to={`/app/service/${s.id}`}><img src={s.image} alt={s.name} className="h-24 w-full object-cover" /></Link>
    <div className="p-2.5">
      <p className="line-clamp-2 h-9 text-[13px] font-semibold leading-tight">{s.name}</p>
      <p className="mt-1 flex items-center gap-1 text-[11px] text-slate-500"><Star className="h-3 w-3 fill-[#F59E0B] text-[#F59E0B]" />{s.rating}</p>
      <div className="mt-1.5 flex items-center justify-between">
        <span className="text-sm font-bold">{inr(s.price)}</span>
        <button data-testid={`trending-add-${s.id}`} onClick={() => onAdd(s.id)} className="flex items-center rounded-lg border border-[#1E3A8A] px-2 py-0.5 text-xs font-bold text-[#1E3A8A] hover:bg-[#1E3A8A] hover:text-white">
          Add <Plus className="ml-0.5 h-3 w-3" />
        </button>
      </div>
    </div>
  </div>
);

export default function CHome() {
  const { refreshCart, cartCount, user } = useCust();
  const [data, setData] = useState({ categories: [], banners: [], trending: [] });
  const [past, setPast] = useState([]);
  const nav = useNavigate();
  useEffect(() => {
    capi.get("/catalog/home").then((r) => setData(r.data));
    capi.get("/customer/bookings").then((r) => setPast(r.data.filter((b) => b.status === "completed").slice(0, 3)));
  }, []);
  const rebook = async (id) => {
    await capi.post(`/customer/bookings/${id}/rebook`);
    await refreshCart();
    toast.success("Added previous services to cart");
  };
  return (
    <div className="pb-24">
      <Header />
      <Banners banners={data.banners} />
      <section className="px-4 pt-5">
        <h2 className="font-heading text-lg font-semibold">Hi {user?.name?.split(" ")[0] || "there"}, what do you need?</h2>
        <div className="mt-3 grid grid-cols-4 gap-x-2 gap-y-4" data-testid="home-category-grid">
          {data.categories.map((c) => (
            <Link key={c.id} to={`/app/services?category_id=${c.id}`} data-testid={`category-${c.id}`} className="flex flex-col items-center gap-1.5 text-center">
              <span className="grid h-14 w-14 place-items-center rounded-2xl bg-white text-[#1E3A8A] shadow-sm ring-1 ring-slate-200 transition-transform hover:-translate-y-0.5">
                <CatIcon name={c.icon} className="h-6 w-6" />
              </span>
              <span className="text-[11px] font-semibold leading-tight text-slate-700">{c.name}</span>
            </Link>
          ))}
        </div>
      </section>
      <section className="pt-6">
        <h2 className="font-heading px-4 text-lg font-semibold">Trending near you</h2>
        <div className="mt-3 flex gap-3 overflow-x-auto px-4 no-scrollbar" data-testid="home-trending-list">
          {data.trending.map((s) => <ServiceMini key={s.id} s={s} onAdd={(id) => addToCart(id, refreshCart)} />)}
        </div>
      </section>
      {past.length > 0 && (
        <section className="px-4 pt-6">
          <h2 className="font-heading text-lg font-semibold">Book again</h2>
          <div className="mt-3 space-y-2">
            {past.map((b) => (
              <div key={b.id} className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-white p-3">
                <img src={b.lines[0]?.image} alt="" className="h-12 w-12 rounded-xl object-cover" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold">{b.lines.map((l) => l.name).join(", ")}</p>
                  <p className="text-xs text-slate-500">{inr(b.pricing.total)} · {b.booking_no}</p>
                </div>
                <Button data-testid={`rebook-${b.id}`} size="sm" variant="outline" onClick={() => rebook(b.id)} className="border-[#1E3A8A] text-[#1E3A8A]">
                  <RotateCcw className="mr-1 h-3.5 w-3.5" /> Re-book
                </Button>
              </div>
            ))}
          </div>
        </section>
      )}
      {cartCount > 0 && (
        <button data-testid="home-view-cart-btn" onClick={() => nav("/app/checkout")}
          className="sticky bottom-3 mx-4 mt-6 flex w-[calc(100%-2rem)] items-center justify-between rounded-2xl bg-[#F59E0B] px-4 py-3.5 font-bold text-slate-900 shadow-lg">
          <span className="flex items-center gap-2"><ShoppingCart className="h-5 w-5" /> {cartCount} item(s) in cart</span>
          <span>View cart →</span>
        </button>
      )}
    </div>
  );
}
