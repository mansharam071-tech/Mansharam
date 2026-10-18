import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Slider } from "@/components/ui/slider";
import { Button } from "@/components/ui/button";
import { aapi, errMsg, fmtDT, fmtDate, inr } from "@/lib/api";
import { InvoiceDialog } from "@/components/common/BookingTools";

const Commission = ({ cats }) => {
  const [c, setC] = useState(null);
  useEffect(() => { aapi.get("/admin/commission").then((r) => setC(r.data)); }, []);
  if (!c) return null;
  const save = async () => {
    try { setC((await aapi.put("/admin/commission", { default_rate: c.default_rate, category_rates: c.category_rates })).data); toast.success("Commission rules saved"); } catch (e) { toast.error(errMsg(e)); }
  };
  const Row = ({ label, v, onV, testid }) => (
    <div className="flex items-center gap-4"><span className="w-40 text-sm">{label}</span>
      <Slider data-testid={testid} min={15} max={20} step={0.5} value={[v * 100]} onValueChange={([x]) => onV(x / 100)} className="flex-1" />
      <span className="w-14 text-right font-mono text-sm font-bold">{(v * 100).toFixed(1)}%</span></div>
  );
  return (
    <div className="rounded-2xl border bg-white p-5" data-testid="commission-engine">
      <p className="text-[18px] font-semibold">Commission engine</p>
      <p className="text-xs text-slate-500">Rule-based deduction (15–20%) on taxable job value. Highest category rate in a booking applies.</p>
      <div className="mt-4 space-y-3">
        <Row label="Default rate" testid="commission-default-slider" v={c.default_rate} onV={(v) => setC({ ...c, default_rate: v })} />
        {cats.map((k) => <Row key={k.id} label={k.name} testid={`commission-slider-${k.id}`} v={c.category_rates[k.id] ?? c.default_rate} onV={(v) => setC({ ...c, category_rates: { ...c.category_rates, [k.id]: v } })} />)}
      </div>
      <Button data-testid="commission-save-btn" onClick={save} className="mt-4 bg-[#1E3A8A]">Save rules</Button>
    </div>
  );
};

const CommInvoice = ({ s, onClose }) => (
  <Dialog open={!!s} onOpenChange={onClose}>
    <DialogContent className="max-w-md" data-testid="settlement-invoice-dialog">
      <DialogHeader><DialogTitle>Commission tax invoice</DialogTitle></DialogHeader>
      {s && (
        <div className="space-y-1.5 text-sm" id="invoice-print">
          <div className="flex justify-between"><b>HomeServe Technologies Pvt. Ltd.</b><span className="font-mono text-xs">{s.gst_invoice_no}</span></div>
          <p className="text-xs text-slate-500">GSTIN [placeholder] · Billed to {s.partner_name} · {fmtDate(s.period_start)} → {fmtDate(s.period_end)}</p>
          {[["Jobs", s.jobs], ["Gross job value", inr(s.gross)], ["Platform commission", inr(s.commission)], ["GST on commission (18%)", inr(s.commission_gst)], ["Partner earnings", inr(s.earnings)], ["Tips", inr(s.tips)], ["Penalties", `- ${inr(s.penalties)}`]].map(([k, v]) => <div key={k} className="flex justify-between border-b py-1"><span>{k}</span><span>{v}</span></div>)}
          <div className="flex justify-between pt-1 text-base font-bold"><span>Net payable to partner</span><span>{inr(s.net_payable)}</span></div>
          <Button onClick={() => window.print()} className="mt-2 w-full bg-[#1E3A8A]">Download / Print</Button>
        </div>
      )}
    </DialogContent>
  </Dialog>
);

export default function AFinance() {
  const [cats, setCats] = useState([]);
  const [stl, setStl] = useState([]);
  const [inv, setInv] = useState([]);
  const [view, setView] = useState(null);
  const [bInv, setBInv] = useState(null);
  const load = () => { aapi.get("/admin/settlements").then((r) => setStl(r.data)); aapi.get("/admin/invoices").then((r) => setInv(r.data)); };
  useEffect(() => { load(); aapi.get("/catalog/home").then((r) => setCats(r.data.categories)); }, []);
  const gen = async () => { try { const { data } = await aapi.post("/admin/settlements/generate"); toast.success(`${data.created} settlement(s) generated`); load(); } catch (e) { toast.error(errMsg(e)); } };
  const rel = async (s) => { try { await aapi.post(`/admin/settlements/${s.id}/release`); toast.success(`Released ${inr(s.net_payable)} to ${s.partner_name}`); load(); } catch (e) { toast.error(errMsg(e)); } };
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-5">
        <Commission cats={cats} />
        <div className="rounded-2xl border bg-white p-5">
          <div className="flex items-center justify-between"><p className="text-[18px] font-semibold">Weekly partner settlements</p>
            <Button data-testid="generate-settlements-btn" onClick={gen} className="bg-[#F59E0B] font-bold text-slate-900 hover:bg-[#D97706]">Generate this week</Button></div>
          <div className="mt-3 max-h-[420px] space-y-2 overflow-y-auto">
            {stl.length === 0 && <p className="text-sm text-slate-400">No settlements yet — click generate.</p>}
            {stl.map((s) => (
              <div key={s.id} className="flex items-center gap-3 rounded-xl border p-3 text-sm" data-testid={`settlement-${s.id}`}>
                <div className="flex-1"><p className="font-semibold">{s.partner_name} <span className="text-xs font-normal text-slate-400">· {s.jobs} jobs · {fmtDate(s.period_start)}→{fmtDate(s.period_end)}</span></p>
                  <p className="text-xs text-slate-500">Commission {inr(s.commission)} · penalties {inr(s.penalties)} · tips {inr(s.tips)}</p></div>
                <span className="font-bold">{inr(s.net_payable)}</span>
                <button data-testid={`settlement-invoice-${s.id}`} onClick={() => setView(s)} className="text-xs font-semibold text-[#1E3A8A]">GST inv.</button>
                {s.status === "pending" ? <button data-testid={`settlement-release-${s.id}`} onClick={() => rel(s)} className="rounded-lg bg-[#22C55E] px-3 py-1 text-xs font-bold text-white">Release</button>
                  : <span className="text-xs font-bold text-[#22C55E]">RELEASED</span>}
              </div>
            ))}
          </div>
        </div>
      </div>
      <div className="rounded-2xl border bg-white p-5">
        <p className="text-[18px] font-semibold">Auto-generated customer GST invoices</p>
        <table className="mt-3 w-full text-sm" data-testid="invoices-table">
          <thead className="text-left text-xs uppercase text-slate-500"><tr><th className="py-2">Invoice</th><th>Booking</th><th>City</th><th>Taxable</th><th>GST</th><th>Total</th><th>Date</th><th /></tr></thead>
          <tbody>
            {inv.slice(0, 25).map((b) => (
              <tr key={b.id} className="border-t">
                <td className="py-2 font-mono text-xs font-bold">{b.invoice_no}</td><td className="font-mono text-xs">{b.booking_no}</td><td>{b.city_name}</td>
                <td>{inr(b.pricing.taxable)}</td><td>{inr(b.pricing.gst)}</td><td className="font-semibold">{inr(b.pricing.total)}</td><td className="text-xs text-slate-500">{fmtDT(b.completed_at)}</td>
                <td><button data-testid={`invoice-view-${b.id}`} onClick={() => setBInv(b.id)} className="text-xs font-semibold text-[#1E3A8A]">View</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <CommInvoice s={view} onClose={() => setView(null)} />
      {bInv && <InvoiceDialog api={aapi} bookingId={bInv} open={!!bInv} onOpenChange={() => setBInv(null)} />}
    </div>
  );
}
