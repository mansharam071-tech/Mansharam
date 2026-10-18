import { useEffect, useState } from "react";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from "recharts";
import { Landmark } from "lucide-react";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { papi, errMsg, fmtDT, inr } from "@/lib/api";

export default function PEarnings() {
  const [d, setD] = useState(null);
  const [range, setRange] = useState("daily");
  const [open, setOpen] = useState(false);
  const [amt, setAmt] = useState("");
  const load = () => papi.get("/partner/earnings").then((r) => setD(r.data));
  useEffect(() => { load(); }, []);
  const withdraw = async () => {
    try {
      await papi.post("/partner/withdraw", { amount: Number(amt) });
      toast.success("Withdrawal requested — reaches your bank in 24h");
      setOpen(false); setAmt(""); load();
    } catch (e) { toast.error(errMsg(e)); }
  };
  if (!d) return <div className="p-6 text-sm">Loading…</div>;
  const s = d.summary;
  return (
    <div className="space-y-4 p-4 pb-28">
      <h1 className="font-heading text-2xl font-bold">Earnings</h1>
      <div className="rounded-2xl bg-[#0F172A] p-5 text-white">
        <p className="text-xs font-semibold uppercase tracking-widest text-white/60">Withdrawable balance</p>
        <p data-testid="partner-wallet-balance" className="font-heading text-4xl font-extrabold">{inr(d.wallet_balance)}</p>
        <p className="mt-1 text-xs text-white/70">Pending weekly settlement: {inr(d.pending_earnings)}</p>
        <button data-testid="partner-withdraw-btn" onClick={() => setOpen(true)} className="mt-4 flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-[#F59E0B] font-extrabold text-slate-900">
          <Landmark className="h-5 w-5" /> Withdraw to Bank
        </button>
      </div>
      <div className="rounded-2xl bg-white p-4">
        <div className="flex gap-2">
          {["daily", "weekly"].map((r) => (
            <button key={r} data-testid={`earnings-range-${r}`} onClick={() => setRange(r)} className={`rounded-full px-4 py-1.5 text-xs font-bold capitalize ${range === r ? "bg-[#0F172A] text-white" : "bg-[#F4F5F7]"}`}>{r}</button>
          ))}
        </div>
        <div className="mt-3 h-48" data-testid="earnings-bar-chart">
          <ResponsiveContainer>
            <BarChart data={d[range]}>
              <XAxis dataKey="label" tick={{ fontSize: 11 }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize: 10 }} axisLine={false} tickLine={false} width={40} />
              <Tooltip formatter={(v) => inr(v)} />
              <Bar dataKey="amount" fill="#1E3A8A" radius={[6, 6, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3" data-testid="earnings-breakdown">
        {[["Gross job value", s.gross, ""], ["Commission (15-20%)", -s.commission, "text-[#EF4444]"], ["Penalties", -s.penalties, "text-[#EF4444]"], ["Tips", s.tips, "text-[#22C55E]"]].map(([k, v, c]) => (
          <div key={k} className="rounded-2xl bg-white p-3"><p className="text-xs font-semibold text-slate-500">{k}</p><p className={`text-lg font-extrabold ${c}`}>{inr(v)}</p></div>
        ))}
        <div className="col-span-2 rounded-2xl bg-green-50 p-3"><p className="text-xs font-semibold text-slate-500">Net earnings · {s.jobs} jobs</p><p className="text-2xl font-extrabold text-[#22C55E]">{inr(s.net)}</p></div>
      </div>
      <div className="rounded-2xl bg-white p-4">
        <p className="text-sm font-bold">Penalties</p>
        {d.penalties.length === 0 && <p className="text-xs text-slate-500">No penalties 🎉</p>}
        {d.penalties.map((x) => <div key={x.id} className="mt-1.5 flex justify-between text-sm"><span>{x.reason}</span><span className="font-bold text-[#EF4444]">-{inr(x.amount)}</span></div>)}
      </div>
      <div className="rounded-2xl bg-white p-4">
        <p className="text-sm font-bold">Payout requests</p>
        {d.payouts.map((x) => <div key={x.id} className="mt-1.5 flex justify-between text-sm" data-testid={`payout-${x.id}`}><span>{fmtDT(x.created_at)}</span><span className="font-bold">{inr(x.amount)} · <span className={x.status === "paid" ? "text-[#22C55E]" : "text-[#EAB308]"}>{x.status}</span></span></div>)}
        {d.payouts.length === 0 && <p className="text-xs text-slate-500">No withdrawals yet</p>}
      </div>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-sm" data-testid="withdraw-dialog">
          <DialogHeader><DialogTitle>Withdraw to bank</DialogTitle></DialogHeader>
          <p className="text-sm text-slate-500">Available: {inr(d.wallet_balance)}</p>
          <Input data-testid="withdraw-amount-input" inputMode="numeric" placeholder="Amount" value={amt} onChange={(e) => setAmt(e.target.value.replace(/\D/g, ""))} />
          <Button data-testid="withdraw-submit-btn" disabled={!amt} onClick={withdraw} className="h-12 bg-[#0F172A]">Request withdrawal</Button>
        </DialogContent>
      </Dialog>
    </div>
  );
}
