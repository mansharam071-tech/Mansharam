import { useEffect, useState, useCallback } from "react";
import { useNavigate, Link } from "react-router-dom";
import { ArrowLeft, Minus, Plus, Zap, CalendarDays, Smartphone, CreditCard, Wallet, Banknote, Tag, Info } from "lucide-react";
import { toast } from "sonner";
import { Input } from "@/components/ui/input";
import { capi, errMsg, inr } from "@/lib/api";
import { getLocale } from "@/lib/i18n";
import { payWithRazorpay } from "@/lib/razorpay";
import { Empty } from "@/components/common/Shared";
import { useCust } from "./CustomerApp";

const SLOTS = ["09:00 AM", "10:30 AM", "12:00 PM", "02:00 PM", "03:30 PM", "05:00 PM", "06:30 PM"];
const PAY = [
  { id: "upi", label: "UPI (GPay / PhonePe)", icon: Smartphone },
  { id: "card", label: "Credit / Debit Card", icon: CreditCard },
  { id: "wallet", label: "HomeServe Wallet", icon: Wallet },
  { id: "cod", label: "Cash after service", icon: Banknote },
];
const days = () => Array.from({ length: 5 }, (_, i) => { const d = new Date(); d.setDate(d.getDate() + i); return d; });
const ymd = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

const Line = ({ k, v, cls = "" }) => <div className={`flex justify-between text-sm ${cls}`}><span>{k}</span><span>{v}</span></div>;

export default function CCheckout() {
  const { refreshCart, address, setAddress, user } = useCust();
  const [rzp, setRzp] = useState(false);
  const [cart, setCart] = useState(null);
  const [addrs, setAddrs] = useState([]);
  const [mode, setMode] = useState("instant");
  const [date, setDate] = useState(ymd(new Date()));
  const [slot, setSlot] = useState(null);
  const [pay, setPay] = useState("upi");
  const [coupon, setCoupon] = useState("");
  const [applied, setApplied] = useState("");
  const [coupons, setCoupons] = useState([]);
  const [wallet, setWallet] = useState(0);
  const [policy, setPolicy] = useState([]);
  const [busy, setBusy] = useState(false);
  const nav = useNavigate();

  const load = useCallback(async () => {
    const { data } = await capi.get("/customer/cart", { params: { address_id: address?.id, coupon_code: applied || undefined } });
    setCart(data);
    if (applied && data.coupon_error) { toast.error(data.coupon_error); setApplied(""); }
  }, [address?.id, applied]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    capi.get("/customer/addresses").then((r) => setAddrs(r.data));
    capi.get("/customer/coupons").then((r) => setCoupons(r.data));
    capi.get("/customer/wallet").then((r) => setWallet(r.data.balance));
    capi.get("/policy/cancellation").then((r) => setPolicy(r.data.rules));
    capi.get("/payments/config").then((r) => setRzp(r.data.enabled));
  }, []);

  const setQty = async (l, qty) => {
    await capi.put(`/customer/cart/items/${l.service_id}`, { service_id: l.service_id, qty, addon_ids: l.addons.map((a) => a.id) });
    await Promise.all([load(), refreshCart()]);
  };
  const place = async () => {
    setBusy(true);
    try {
      if ((pay === "upi" || pay === "card") && !rzp) toast.message("Processing demo payment…");
      const { data } = await capi.post("/customer/bookings", {
        address_id: (address || cart.address)?.id, mode, slot_date: mode === "scheduled" ? date : null,
        slot_time: mode === "scheduled" ? slot : null, payment_method: pay, coupon_code: applied || null,
      });
      if (data.razorpay) {
        try {
          await payWithRazorpay(data.razorpay, { user, method: pay, description: `Booking ${data.booking_no}` });
          toast.success("Payment successful");
        } catch (err) {
          toast.error(err.message);
          setBusy(false);
          return;
        }
      }
      await refreshCart();
      toast.success(`Booking ${data.booking_no} confirmed!`);
      nav(`/app/booking/${data.id}`);
    } catch (e) {
      toast.error(errMsg(e));
    }
    setBusy(false);
  };

  if (!cart) return <div className="p-6 text-sm text-slate-500">Loading…</div>;
  const p = cart.pricing;
  const addr = address || cart.address;
  return (
    <div className="min-h-full">
      <div className="sticky top-0 z-10 flex items-center gap-3 border-b bg-white/90 px-4 py-3 backdrop-blur-md">
        <button data-testid="checkout-back-btn" onClick={() => nav(-1)}><ArrowLeft className="h-5 w-5" /></button>
        <h1 className="font-heading text-lg font-semibold">Checkout</h1>
      </div>
      {cart.lines.length === 0 ? (
        <div className="p-4"><Empty text="Your cart is empty" testid="checkout-empty" /><Link to="/app" className="mt-4 block text-center font-semibold text-[#1E3A8A]">Browse services</Link></div>
      ) : (
        <div className="space-y-4 p-4 pb-6">
          <section className="rounded-2xl border bg-white p-4">
            <h3 className="text-sm font-bold">Your services · {cart.lines.length} {cart.lines.length > 1 ? "items" : "item"} (mix any categories)</h3>
            {cart.lines.map((l) => (
              <div key={l.service_id} className="mt-3 flex items-center gap-3" data-testid={`cart-line-${l.service_id}`}>
                <img src={l.image} alt="" className="h-11 w-11 rounded-lg object-cover" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold">{l.name}</p>
                  <p className="text-xs text-slate-500">{l.category_name}{l.addons.length ? ` · +${l.addons.map((a) => a.name).join(", ")}` : ""}</p>
                </div>
                <div className="flex items-center gap-2 rounded-lg border border-[#1E3A8A] px-1.5 py-0.5 text-[#1E3A8A]">
                  <button data-testid={`cart-minus-${l.service_id}`} onClick={() => setQty(l, l.qty - 1)}><Minus className="h-3.5 w-3.5" /></button>
                  <span className="w-4 text-center text-sm font-bold">{l.qty}</span>
                  <button data-testid={`cart-plus-${l.service_id}`} onClick={() => setQty(l, l.qty + 1)}><Plus className="h-3.5 w-3.5" /></button>
                </div>
                <span className="w-16 text-right text-sm font-semibold">{inr(l.line_total)}</span>
              </div>
            ))}
          </section>

          <section className="rounded-2xl border bg-white p-4">
            <h3 className="text-sm font-bold">Service address</h3>
            <div className="mt-2 flex gap-2 overflow-x-auto no-scrollbar">
              {addrs.map((a) => (
                <button key={a.id} data-testid={`checkout-address-${a.id}`} onClick={() => setAddress(a)}
                  className={`min-w-[150px] rounded-xl border p-2.5 text-left ${addr?.id === a.id ? "border-[#1E3A8A] bg-blue-50" : "border-slate-200"}`}>
                  <p className="text-xs font-bold">{a.label} · {a.pincode}</p>
                  <p className="line-clamp-2 text-[11px] text-slate-500">{a.line}</p>
                </button>
              ))}
              <Link to="/app/profile?addAddress=1" data-testid="checkout-add-address" className="grid min-w-[90px] place-items-center rounded-xl border border-dashed text-xs font-semibold text-[#1E3A8A]">+ New</Link>
            </div>
            {!cart.serviceable && <p data-testid="checkout-unserviceable" className="mt-2 text-xs font-semibold text-[#EF4444]">We don't serve this pincode yet. Pick another address.</p>}
          </section>

          <section className="rounded-2xl border bg-white p-4">
            <h3 className="text-sm font-bold">When should we come?</h3>
            <div className="mt-2 grid grid-cols-2 gap-2">
              <button data-testid="checkout-mode-instant" onClick={() => setMode("instant")} className={`rounded-xl border p-3 text-left ${mode === "instant" ? "border-[#F59E0B] bg-amber-50" : ""}`}>
                <Zap className="h-4 w-4 text-[#F59E0B]" /><p className="mt-1 text-sm font-bold">Instant</p><p className="text-[11px] text-slate-500">Arrives in 30-45 min</p>
              </button>
              <button data-testid="checkout-mode-scheduled" onClick={() => setMode("scheduled")} className={`rounded-xl border p-3 text-left ${mode === "scheduled" ? "border-[#1E3A8A] bg-blue-50" : ""}`}>
                <CalendarDays className="h-4 w-4 text-[#1E3A8A]" /><p className="mt-1 text-sm font-bold">Schedule</p><p className="text-[11px] text-slate-500">Pick date & slot</p>
              </button>
            </div>
            {mode === "scheduled" && (
              <>
                <div className="mt-3 flex gap-2 overflow-x-auto no-scrollbar">
                  {days().map((d) => (
                    <button key={ymd(d)} data-testid={`slot-date-${ymd(d)}`} onClick={() => setDate(ymd(d))}
                      className={`min-w-[58px] rounded-xl border px-2 py-2 text-center ${date === ymd(d) ? "border-[#1E3A8A] bg-[#1E3A8A] text-white" : ""}`}>
                      <p className="text-[10px] uppercase">{d.toLocaleDateString(getLocale(), { weekday: "short" })}</p>
                      <p className="text-base font-bold">{d.getDate()}</p>
                    </button>
                  ))}
                </div>
                <div className="mt-2 flex flex-wrap gap-2">
                  {SLOTS.map((s) => (
                    <button key={s} data-testid={`slot-time-${s.replace(/\W/g, "")}`} onClick={() => setSlot(s)}
                      className={`rounded-full border px-3 py-1.5 text-xs font-semibold ${slot === s ? "border-[#1E3A8A] bg-[#1E3A8A] text-white" : "text-slate-600"}`}>{s}</button>
                  ))}
                </div>
              </>
            )}
          </section>

          <section className="rounded-2xl border bg-white p-4">
            <h3 className="flex items-center gap-1.5 text-sm font-bold"><Tag className="h-4 w-4 text-[#F59E0B]" /> Coupons & offers</h3>
            <div className="mt-2 flex gap-2">
              <Input data-testid="checkout-coupon-input" value={coupon} onChange={(e) => setCoupon(e.target.value.toUpperCase())} placeholder="Enter code" />
              <button data-testid="checkout-apply-coupon-btn" onClick={() => setApplied(coupon)} className="shrink-0 whitespace-nowrap rounded-lg bg-[#1E3A8A] px-4 text-sm font-bold text-white">Apply</button>
            </div>
            {p.coupon_code && <p data-testid="checkout-coupon-applied" className="mt-2 text-xs font-semibold text-[#22C55E]">{p.coupon_code} applied · you save {inr(p.discount)} <button className="ml-2 text-[#EF4444]" onClick={() => { setApplied(""); setCoupon(""); }}>Remove</button></p>}
            <div className="mt-2 flex flex-wrap gap-1.5">
              {coupons.map((c) => <button key={c.id} onClick={() => { setCoupon(c.code); setApplied(c.code); }} data-testid={`coupon-chip-${c.code}`} className="rounded-md border border-dashed border-[#F59E0B] bg-amber-50 px-2 py-1 font-mono text-[11px] font-bold">{c.code}</button>)}
            </div>
          </section>

          <section className="rounded-2xl border bg-white p-4">
            <h3 className="text-sm font-bold">Payment method</h3>
            <div className="mt-2 space-y-2">
              {PAY.map((m) => (
                <button key={m.id} data-testid={`pay-${m.id}`} onClick={() => setPay(m.id)}
                  className={`flex w-full items-center gap-3 rounded-xl border p-3 text-left ${pay === m.id ? "border-[#1E3A8A] bg-blue-50" : ""}`}>
                  <m.icon className="h-5 w-5 text-[#1E3A8A]" />
                  <span className="flex-1 text-sm font-semibold">{m.label}</span>
                  {m.id === "wallet" && <span className="text-xs text-slate-500">Bal {inr(wallet)}</span>}
                  <span className={`h-4 w-4 rounded-full border-2 ${pay === m.id ? "border-[#1E3A8A] bg-[#1E3A8A]" : "border-slate-300"}`} />
                </button>
              ))}
            </div>
            {(pay === "upi" || pay === "card") && (
              <p data-testid="checkout-payment-mode-note" className={`mt-2 text-xs font-semibold ${rzp ? "text-[#22C55E]" : "text-[#EAB308]"}`}>
                {rzp ? "Secure payment via Razorpay" : "Demo payment mode (Razorpay keys not configured)"}
              </p>
            )}
          </section>

          <section className="space-y-1.5 rounded-2xl border bg-white p-4" data-testid="checkout-price-breakdown">
            <Line k="Item total" v={inr(p.subtotal)} />
            {p.surge_amount > 0 && <Line k={`Surge ${p.surge_multiplier}x (${cart.surge_reasons.join(", ")})`} v={inr(p.surge_amount)} cls="text-[#EAB308]" />}
            {p.discount > 0 && <Line k="Coupon discount" v={`- ${inr(p.discount)}`} cls="text-[#22C55E]" />}
            <Line k="GST (18%)" v={inr(p.gst)} cls="text-slate-500" />
            <Line k="To pay" v={inr(p.total)} cls="border-t pt-2 text-base font-bold" />
          </section>

          <details className="rounded-2xl border bg-white p-4 text-xs text-slate-600">
            <summary className="flex cursor-pointer items-center gap-1.5 text-sm font-bold text-slate-800"><Info className="h-4 w-4" /> Cancellation policy</summary>
            <ul className="mt-2 list-disc space-y-1 pl-4">{policy.map((r) => <li key={r}>{r}</li>)}</ul>
          </details>
        </div>
      )}
      {cart.lines.length > 0 && (
        <div className="sticky bottom-0 flex items-center justify-between border-t bg-white px-4 py-3">
          <div><p className="text-xs text-slate-500">Total</p><p data-testid="checkout-total" className="text-lg font-bold">{inr(p.total)}</p></div>
          <button data-testid="checkout-place-order-btn" disabled={busy || !cart.serviceable || !addr || (mode === "scheduled" && !slot)} onClick={place}
            className="rounded-xl bg-[#F59E0B] px-6 py-3 text-sm font-bold text-slate-900 disabled:opacity-50">
            {busy ? "Placing…" : pay === "cod" ? "Confirm booking" : `Pay ${inr(p.total)}`}
          </button>
        </div>
      )}
    </div>
  );
}
