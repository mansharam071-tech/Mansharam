import { useEffect, useState } from "react";
import { Plus, Trash2, CloudRain, Clock, Flame } from "lucide-react";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { aapi, errMsg, inr } from "@/lib/api";

const TRIG = { weather: { icon: CloudRain, label: "Weather" }, peak_hours: { icon: Clock, label: "Peak hours" }, high_demand: { icon: Flame, label: "High demand zone" } };
const Sel = ({ value, onChange, children, testid }) => (
  <select data-testid={testid} value={value} onChange={(e) => onChange(e.target.value)} className="h-10 w-full rounded-md border bg-white px-3 text-sm">{children}</select>
);

const SurgeDialog = ({ open, onClose, cities }) => {
  const [f, setF] = useState({ name: "", trigger: "peak_hours", multiplier: 1.2, city_id: "all", start_hour: 18, end_hour: 21, weather: "Rain", is_active: true });
  const save = async () => {
    try { await aapi.post("/admin/surge-rules", { ...f, multiplier: Number(f.multiplier), start_hour: Number(f.start_hour), end_hour: Number(f.end_hour) }); toast.success("Surge rule created"); onClose(true); }
    catch (e) { toast.error(errMsg(e)); }
  };
  return (
    <Dialog open={open} onOpenChange={() => onClose(false)}>
      <DialogContent className="max-w-md" data-testid="surge-dialog">
        <DialogHeader><DialogTitle>New surge rule</DialogTitle></DialogHeader>
        <Input data-testid="surge-name-input" placeholder="Rule name" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} />
        <Sel testid="surge-trigger-select" value={f.trigger} onChange={(v) => setF({ ...f, trigger: v })}>{Object.entries(TRIG).map(([k, t]) => <option key={k} value={k}>{t.label}</option>)}</Sel>
        <div className="flex flex-wrap gap-2">
          {[1.2, 1.5, 1.8, 2.0].map((m) => <button key={m} data-testid={`surge-mult-${m}`} onClick={() => setF({ ...f, multiplier: m })} className={`rounded-full border px-3 py-1 text-xs font-bold ${Number(f.multiplier) === m ? "border-[#1E3A8A] bg-[#1E3A8A] text-white" : ""}`}>{m}x</button>)}
          <Input data-testid="surge-multiplier-input" type="number" step="0.1" className="h-8 w-24" value={f.multiplier} onChange={(e) => setF({ ...f, multiplier: e.target.value })} />
        </div>
        <Sel testid="surge-city-select" value={f.city_id} onChange={(v) => setF({ ...f, city_id: v })}><option value="all">All cities</option>{cities.map((c) => <option key={c.id} value={c.id}>{c.city_name}</option>)}</Sel>
        {f.trigger === "peak_hours" && (
          <div className="grid grid-cols-2 gap-2">
            <Input data-testid="surge-start-hour" type="number" min="0" max="23" value={f.start_hour} onChange={(e) => setF({ ...f, start_hour: e.target.value })} placeholder="Start hour" />
            <Input data-testid="surge-end-hour" type="number" min="1" max="24" value={f.end_hour} onChange={(e) => setF({ ...f, end_hour: e.target.value })} placeholder="End hour" />
          </div>
        )}
        {f.trigger === "weather" && <Sel testid="surge-weather-select" value={f.weather} onChange={(v) => setF({ ...f, weather: v })}>{["Rain", "Heatwave", "Storm", "Fog"].map((w) => <option key={w}>{w}</option>)}</Sel>}
        <Button data-testid="surge-save-btn" disabled={!f.name} onClick={save} className="bg-[#1E3A8A]">Create rule</Button>
      </DialogContent>
    </Dialog>
  );
};

const CouponDialog = ({ open, onClose, cities, cats }) => {
  const [f, setF] = useState({ code: "", description: "", discount_type: "percent", value: 50, max_discount: 100, min_order: 0, city_ids: [], category_ids: [], usage_limit: 1000, first_order_only: false, valid_till: "", is_active: true });
  const tog = (k, id) => setF({ ...f, [k]: f[k].includes(id) ? f[k].filter((x) => x !== id) : [...f[k], id] });
  const save = async () => {
    try {
      await aapi.post("/admin/coupons", { ...f, value: Number(f.value), max_discount: f.max_discount ? Number(f.max_discount) : null, min_order: Number(f.min_order), usage_limit: f.usage_limit ? Number(f.usage_limit) : null, valid_till: f.valid_till || null });
      toast.success(`Coupon ${f.code} created`); onClose(true);
    } catch (e) { toast.error(errMsg(e)); }
  };
  return (
    <Dialog open={open} onOpenChange={() => onClose(false)}>
      <DialogContent className="max-h-[90vh] max-w-lg overflow-y-auto" data-testid="coupon-dialog">
        <DialogHeader><DialogTitle>Create promo code</DialogTitle></DialogHeader>
        <div className="grid grid-cols-2 gap-2">
          <Input data-testid="coupon-code-input" placeholder="CODE e.g. FIRST50" value={f.code} onChange={(e) => setF({ ...f, code: e.target.value.toUpperCase() })} />
          <Sel testid="coupon-type-select" value={f.discount_type} onChange={(v) => setF({ ...f, discount_type: v })}><option value="percent">% off</option><option value="flat">Flat ₹ off</option></Sel>
          <Input data-testid="coupon-value-input" type="number" placeholder="Value" value={f.value} onChange={(e) => setF({ ...f, value: e.target.value })} />
          <Input data-testid="coupon-max-input" type="number" placeholder="Max discount ₹" value={f.max_discount ?? ""} onChange={(e) => setF({ ...f, max_discount: e.target.value })} />
          <Input data-testid="coupon-min-order-input" type="number" placeholder="Min order ₹" value={f.min_order} onChange={(e) => setF({ ...f, min_order: e.target.value })} />
          <Input data-testid="coupon-usage-limit-input" type="number" placeholder="Usage limit" value={f.usage_limit ?? ""} onChange={(e) => setF({ ...f, usage_limit: e.target.value })} />
          <Input data-testid="coupon-valid-till-input" type="date" value={f.valid_till} onChange={(e) => setF({ ...f, valid_till: e.target.value })} />
          <label className="flex items-center gap-2 text-sm"><Switch data-testid="coupon-first-order-switch" checked={f.first_order_only} onCheckedChange={(v) => setF({ ...f, first_order_only: v })} />First order only</label>
        </div>
        <Input data-testid="coupon-desc-input" placeholder="Description" value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} />
        <p className="text-xs font-semibold text-slate-500">Target cities (none = all)</p>
        <div className="flex flex-wrap gap-1.5">{cities.map((c) => <button key={c.id} data-testid={`coupon-city-${c.id}`} onClick={() => tog("city_ids", c.id)} className={`rounded-full border px-2.5 py-1 text-xs font-semibold ${f.city_ids.includes(c.id) ? "border-[#1E3A8A] bg-blue-50" : ""}`}>{c.city_name}</button>)}</div>
        <p className="text-xs font-semibold text-slate-500">Target categories (none = all)</p>
        <div className="flex flex-wrap gap-1.5">{cats.map((c) => <button key={c.id} data-testid={`coupon-cat-${c.id}`} onClick={() => tog("category_ids", c.id)} className={`rounded-full border px-2.5 py-1 text-xs font-semibold ${f.category_ids.includes(c.id) ? "border-[#F59E0B] bg-amber-50" : ""}`}>{c.name}</button>)}</div>
        <Button data-testid="coupon-save-btn" disabled={!f.code || !f.value} onClick={save} className="bg-[#F59E0B] font-bold text-slate-900 hover:bg-[#D97706]">Create coupon</Button>
      </DialogContent>
    </Dialog>
  );
};

export default function APricing() {
  const [rules, setRules] = useState([]);
  const [coupons, setCoupons] = useState([]);
  const [cities, setCities] = useState([]);
  const [cats, setCats] = useState([]);
  const [dlg, setDlg] = useState(null);
  const load = () => { aapi.get("/admin/surge-rules").then((r) => setRules(r.data)); aapi.get("/admin/coupons").then((r) => setCoupons(r.data)); };
  useEffect(() => { load(); aapi.get("/admin/cities").then((r) => setCities(r.data)); aapi.get("/catalog/home").then((r) => setCats(r.data.categories)); }, []);
  const cityName = (id) => (id === "all" ? "All cities" : cities.find((c) => c.id === id)?.city_name || id);
  const toggleRule = async (r, v) => { try { await aapi.put(`/admin/surge-rules/${r.id}`, { ...r, is_active: v }); load(); } catch (e) { toast.error(errMsg(e)); } };
  const toggleCoupon = async (c, v) => { const { id, used_count, created_at, ...rest } = c; await aapi.put(`/admin/coupons/${id}`, { ...rest, is_active: v }); load(); };
  return (
    <div className="space-y-8">
      <section>
        <div className="flex items-center justify-between"><div><p className="text-[18px] font-semibold">Surge pricing rules engine</p><p className="text-xs text-slate-500">Highest active multiplier applies at checkout (city surge + matching rules).</p></div>
          <Button data-testid="open-surge-dialog-btn" onClick={() => setDlg("surge")} className="bg-[#1E3A8A]"><Plus className="mr-1 h-4 w-4" />New rule</Button></div>
        <div className="mt-4 grid grid-cols-3 gap-4">
          {rules.map((r) => { const T = TRIG[r.trigger]; return (
            <div key={r.id} className={`rounded-2xl border bg-white p-5 ${r.is_active ? "border-[#F59E0B]" : ""}`} data-testid={`surge-rule-${r.id}`}>
              <div className="flex items-center justify-between"><span className="flex items-center gap-2 text-xs font-bold uppercase text-slate-500"><T.icon className="h-4 w-4 text-[#F59E0B]" />{T.label}</span>
                <Switch data-testid={`surge-toggle-${r.id}`} checked={r.is_active} onCheckedChange={(v) => toggleRule(r, v)} /></div>
              <p className="mt-3 font-semibold">{r.name}</p>
              <p className="font-heading text-3xl font-extrabold text-[#1E3A8A]">{r.multiplier}x</p>
              <p className="text-xs text-slate-500">{cityName(r.city_id)}{r.trigger === "peak_hours" ? ` · ${r.start_hour}:00–${r.end_hour}:00 IST` : r.weather ? ` · ${r.weather}` : ""}</p>
              <button data-testid={`surge-delete-${r.id}`} onClick={async () => { await aapi.delete(`/admin/surge-rules/${r.id}`); load(); }} className="mt-2 text-xs text-[#EF4444]"><Trash2 className="inline h-3.5 w-3.5" /> Delete</button>
            </div>); })}
        </div>
      </section>
      <section>
        <div className="flex items-center justify-between"><p className="text-[18px] font-semibold">Coupon & promo code engine</p>
          <Button data-testid="open-coupon-dialog-btn" onClick={() => setDlg("coupon")} className="bg-[#F59E0B] font-bold text-slate-900 hover:bg-[#D97706]"><Plus className="mr-1 h-4 w-4" />New coupon</Button></div>
        <div className="mt-4 overflow-hidden rounded-2xl border bg-white">
          <table className="w-full text-sm" data-testid="coupons-table">
            <thead className="bg-slate-50 text-left text-xs uppercase text-slate-500"><tr><th className="p-3">Code</th><th>Offer</th><th>Targeting</th><th>Usage</th><th>Valid till</th><th>Active</th><th /></tr></thead>
            <tbody>
              {coupons.map((c) => (
                <tr key={c.id} className="border-t" data-testid={`coupon-row-${c.code}`}>
                  <td className="p-3 font-mono font-bold">{c.code}</td>
                  <td>{c.discount_type === "percent" ? `${c.value}% off${c.max_discount ? ` up to ${inr(c.max_discount)}` : ""}` : `${inr(c.value)} off`}{c.min_order ? ` · min ${inr(c.min_order)}` : ""}{c.first_order_only ? " · 1st order" : ""}</td>
                  <td className="text-xs text-slate-500">{c.city_ids.length ? c.city_ids.map(cityName).join(", ") : "All cities"} · {c.category_ids.length ? c.category_ids.map((id) => cats.find((x) => x.id === id)?.name).join(", ") : "All categories"}</td>
                  <td>{c.used_count}/{c.usage_limit || "∞"}</td>
                  <td className="text-xs">{c.valid_till || "-"}</td>
                  <td><Switch data-testid={`coupon-toggle-${c.code}`} checked={c.is_active} onCheckedChange={(v) => toggleCoupon(c, v)} /></td>
                  <td><button data-testid={`coupon-delete-${c.code}`} onClick={async () => { await aapi.delete(`/admin/coupons/${c.id}`); load(); }}><Trash2 className="h-4 w-4 text-slate-400" /></button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
      <SurgeDialog open={dlg === "surge"} cities={cities} onClose={(ok) => { setDlg(null); ok && load(); }} />
      <CouponDialog open={dlg === "coupon"} cities={cities} cats={cats} onClose={(ok) => { setDlg(null); ok && load(); }} />
    </div>
  );
}
