import { useEffect, useState } from "react";
import { Plus, Undo2, Trash2, Upload, Save, X, Code2, Pencil } from "lucide-react";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { aapi, errMsg, inr } from "@/lib/api";
import { GeofenceMap } from "@/components/common/Maps";

const toPayload = (c) => ({
  city_name: c.city_name, state: c.state, is_active: c.is_active, pincodes: c.pincodes, polygon: c.polygon || [],
  center: c.center, surge_pricing: c.surge_pricing, assigned_services: c.assigned_services,
});

export const PincodeChips = ({ value, onChange, testid = "pincode-chip-input" }) => {
  const [t, setT] = useState("");
  const add = () => {
    const parts = t.split(/[\s,]+/).filter((x) => /^\d{6}$/.test(x));
    if (!parts.length) return toast.error("Enter valid 6-digit pincodes");
    onChange([...new Set([...value, ...parts])]);
    setT("");
  };
  return (
    <div className="flex min-h-[44px] flex-wrap items-center gap-1.5 rounded-xl border bg-white p-2" data-testid={testid}>
      {value.map((p) => (
        <span key={p} className="flex items-center gap-1 rounded-full bg-blue-50 px-2.5 py-1 font-mono text-xs font-bold text-[#1E3A8A]" data-testid={`pincode-chip-${p}`}>
          {p}<button onClick={() => onChange(value.filter((x) => x !== p))}><X className="h-3 w-3" /></button>
        </span>
      ))}
      <input data-testid={`${testid}-field`} value={t} onChange={(e) => setT(e.target.value)} onKeyDown={(e) => (e.key === "Enter" || e.key === ",") && (e.preventDefault(), add())}
        placeholder="Type pincode + Enter" className="min-w-[140px] flex-1 bg-transparent text-sm outline-none" />
    </div>
  );
};

const CityModal = ({ open, city, services, onClose }) => {
  const blank = { city_name: "", state: "", is_active: true, pincodes: [], polygon: [], surge_pricing: { is_active: false, multiplier: 1.0, reason: "" }, assigned_services: [] };
  const [f, setF] = useState(blank);
  useEffect(() => { if (open) setF(city ? { ...city } : blank); // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, city]);
  const assigned = (sid) => f.assigned_services.find((a) => a.service_id === sid);
  const toggleSvc = (s) => setF({ ...f, assigned_services: assigned(s.id) ? f.assigned_services.filter((a) => a.service_id !== s.id) : [...f.assigned_services, { service_id: s.id, city_price: s.price }] });
  const setPrice = (sid, v) => setF({ ...f, assigned_services: f.assigned_services.map((a) => (a.service_id === sid ? { ...a, city_price: Number(v) } : a)) });
  const save = async () => {
    try {
      if (city) await aapi.put(`/admin/cities/${city.id}`, toPayload(f));
      else await aapi.post("/admin/cities", toPayload(f));
      toast.success(city ? "City updated" : `${f.city_name} launched!`);
      onClose(true);
    } catch (e) { toast.error(errMsg(e)); }
  };
  const sp = f.surge_pricing;
  return (
    <Dialog open={open} onOpenChange={() => onClose(false)}>
      <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto" data-testid="city-launch-modal">
        <DialogHeader><DialogTitle>{city ? `Edit ${city.city_name}` : "Launch a new city"}</DialogTitle></DialogHeader>
        <div className="grid grid-cols-2 gap-3">
          <Input data-testid="city-name-input" placeholder="City name" value={f.city_name} onChange={(e) => setF({ ...f, city_name: e.target.value })} />
          <Input data-testid="city-state-input" placeholder="State" value={f.state} onChange={(e) => setF({ ...f, state: e.target.value })} />
        </div>
        <div className="flex items-center justify-between rounded-xl border p-3 text-sm font-semibold">Active status <Switch data-testid="city-active-switch" checked={f.is_active} onCheckedChange={(v) => setF({ ...f, is_active: v })} /></div>
        <PincodeChips value={f.pincodes} onChange={(v) => setF({ ...f, pincodes: v })} testid="city-modal-pincodes" />
        <div className="rounded-xl border p-3">
          <div className="flex items-center justify-between text-sm font-semibold">City surge pricing <Switch data-testid="city-surge-switch" checked={sp.is_active} onCheckedChange={(v) => setF({ ...f, surge_pricing: { ...sp, is_active: v } })} /></div>
          {sp.is_active && (
            <div className="mt-2 grid grid-cols-3 gap-2">
              <Input data-testid="city-surge-multiplier" type="number" step="0.1" min="1" max="3" value={sp.multiplier} onChange={(e) => setF({ ...f, surge_pricing: { ...sp, multiplier: Number(e.target.value) } })} />
              <Input data-testid="city-surge-reason" className="col-span-2" placeholder="Reason (Rain / Peak Demand)" value={sp.reason} onChange={(e) => setF({ ...f, surge_pricing: { ...sp, reason: e.target.value } })} />
            </div>
          )}
        </div>
        <div>
          <p className="text-sm font-semibold">Assigned services & custom city base price</p>
          <div className="mt-2 max-h-56 space-y-1.5 overflow-y-auto">
            {services.map((s) => (
              <div key={s.id} className="flex items-center gap-3 rounded-lg border p-2">
                <Checkbox data-testid={`city-svc-${s.id}`} checked={!!assigned(s.id)} onCheckedChange={() => toggleSvc(s)} />
                <span className="flex-1 text-sm">{s.name} <span className="text-xs text-slate-400">base {inr(s.price)}</span></span>
                {assigned(s.id) && <Input data-testid={`city-price-${s.id}`} type="number" className="h-8 w-24" value={assigned(s.id).city_price} onChange={(e) => setPrice(s.id, e.target.value)} />}
              </div>
            ))}
          </div>
        </div>
        <Button data-testid="city-save-btn" disabled={!f.city_name || !f.state} onClick={save} className="bg-[#1E3A8A]">{city ? "Save changes" : "Launch city"}</Button>
      </DialogContent>
    </Dialog>
  );
};

export default function ACities() {
  const [cities, setCities] = useState([]);
  const [services, setServices] = useState([]);
  const [selId, setSelId] = useState(null);
  const [draft, setDraft] = useState(null);
  const [modal, setModal] = useState({ open: false, city: null });
  const [json, setJson] = useState(false);
  const load = async () => {
    const { data } = await aapi.get("/admin/cities");
    setCities(data);
    const cur = data.find((c) => c.id === (selId || data[0]?.id));
    if (cur) { setSelId(cur.id); setDraft({ ...cur }); }
  };
  useEffect(() => { load(); aapi.get("/admin/services").then((r) => setServices(r.data)); // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const pick = (c) => { setSelId(c.id); setDraft({ ...c }); };
  const save = async () => {
    try { await aapi.put(`/admin/cities/${draft.id}`, toPayload({ ...draft, center: undefined })); toast.success("Geofence & pincodes saved"); load(); } catch (e) { toast.error(errMsg(e)); }
  };
  const csv = async (file) => {
    const text = await file.text();
    try {
      const { data } = await aapi.post(`/admin/cities/${draft.id}/pincodes/bulk`, { csv_text: text });
      toast.success(`${data.added} new pincodes added from CSV`);
      load();
    } catch (e) { toast.error(errMsg(e)); }
  };
  const del = async (c) => { if (window.confirm(`Delete ${c.city_name}?`)) { await aapi.delete(`/admin/cities/${c.id}`); setSelId(null); load(); } };
  const jsonView = draft && { city_name: draft.city_name, state: draft.state, is_active: draft.is_active, pincodes: draft.pincodes, surge_pricing: draft.surge_pricing, assigned_services: draft.assigned_services };
  return (
    <div className="grid grid-cols-[300px_1fr] gap-5">
      <div className="space-y-3">
        <Button data-testid="open-city-launch-btn" onClick={() => setModal({ open: true, city: null })} className="w-full bg-[#F59E0B] font-bold text-slate-900 hover:bg-[#D97706]"><Plus className="mr-1 h-4 w-4" /> Launch new city</Button>
        {cities.map((c) => (
          <button key={c.id} data-testid={`city-card-${c.id}`} onClick={() => pick(c)} className={`w-full rounded-2xl border bg-white p-4 text-left transition-colors ${selId === c.id ? "border-[#1E3A8A] ring-2 ring-blue-100" : ""}`}>
            <div className="flex items-center justify-between"><p className="font-semibold">{c.city_name}</p>
              <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase ${c.is_active ? "bg-green-100 text-green-700" : "bg-slate-100 text-slate-500"}`}>{c.is_active ? "Active" : "Inactive"}</span></div>
            <p className="text-xs text-slate-500">{c.state} · {c.pincodes.length} pincodes · {c.assigned_services.length} services</p>
            {c.surge_pricing?.is_active && <p className="mt-1 text-xs font-semibold text-[#EAB308]">Surge {c.surge_pricing.multiplier}x · {c.surge_pricing.reason}</p>}
          </button>
        ))}
      </div>
      {draft && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div><p className="text-[18px] font-semibold">{draft.city_name} geofence</p><p className="text-xs text-slate-500">Click on the map to drop polygon vertices. {draft.polygon?.length || 0} points.</p></div>
            <div className="flex gap-2">
              <Button data-testid="geofence-undo-btn" variant="outline" size="sm" onClick={() => setDraft({ ...draft, polygon: draft.polygon.slice(0, -1) })}><Undo2 className="mr-1 h-4 w-4" />Undo</Button>
              <Button data-testid="geofence-clear-btn" variant="outline" size="sm" onClick={() => setDraft({ ...draft, polygon: [] })}><Trash2 className="mr-1 h-4 w-4" />Clear</Button>
              <Button data-testid="city-edit-btn" variant="outline" size="sm" onClick={() => setModal({ open: true, city: draft })}><Pencil className="mr-1 h-4 w-4" />Edit config</Button>
              <Button data-testid="city-json-btn" variant="outline" size="sm" onClick={() => setJson(true)}><Code2 className="mr-1 h-4 w-4" />JSON</Button>
              <Button data-testid="city-delete-btn" variant="outline" size="sm" className="text-[#EF4444]" onClick={() => del(draft)}><Trash2 className="h-4 w-4" /></Button>
              <Button data-testid="geofence-save-btn" size="sm" className="bg-[#1E3A8A]" onClick={save}><Save className="mr-1 h-4 w-4" />Save</Button>
            </div>
          </div>
          <div className="h-[420px] overflow-hidden rounded-2xl border">
            <GeofenceMap testid="geofence-map" polygon={draft.polygon || []} center={cities.find((c) => c.id === draft.id)?.center} onChange={(polygon) => setDraft({ ...draft, polygon })}
              others={cities.filter((c) => c.id !== draft.id).map((c) => c.polygon || [])} />
          </div>
          <div className="rounded-2xl border bg-white p-4">
            <div className="flex items-center justify-between"><p className="text-sm font-semibold">Pincode mapping</p>
              <label className="flex cursor-pointer items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-semibold hover:border-[#1E3A8A]" data-testid="pincode-csv-upload">
                <Upload className="h-3.5 w-3.5" /> CSV bulk upload<input type="file" accept=".csv,text/csv,.txt" hidden onChange={(e) => e.target.files[0] && csv(e.target.files[0])} />
              </label></div>
            <div className="mt-2"><PincodeChips value={draft.pincodes} onChange={(v) => setDraft({ ...draft, pincodes: v })} /></div>
            <p className="mt-1 text-[11px] text-slate-400">Press Save to persist chip edits. CSV upload merges any 6-digit pincodes found in the file.</p>
          </div>
        </div>
      )}
      <CityModal open={modal.open} city={modal.city} services={services} onClose={(ok) => { setModal({ open: false, city: null }); ok && load(); }} />
      <Dialog open={json} onOpenChange={setJson}>
        <DialogContent className="max-w-lg" data-testid="city-json-dialog">
          <DialogHeader><DialogTitle>City & dynamic config JSON</DialogTitle></DialogHeader>
          <pre className="max-h-[60vh] overflow-auto rounded-xl bg-[#0F172A] p-4 text-xs text-green-300">{JSON.stringify(jsonView, null, 2)}</pre>
        </DialogContent>
      </Dialog>
    </div>
  );
}
