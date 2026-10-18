import { useEffect, useState } from "react";
import { ArrowDownLeft, ArrowUpRight, Plus } from "lucide-react";
import { toast } from "sonner";
import { capi, errMsg, fmtDT, inr } from "@/lib/api";
import { Empty } from "@/components/common/Shared";

export default function CWallet() {
  const [w, setW] = useState({ balance: 0, transactions: [] });
  const load = () => capi.get("/customer/wallet").then((r) => setW(r.data));
  useEffect(() => { load(); }, []);
  const topup = async (amount) => {
    try {
      await capi.post("/customer/wallet/topup", null, { params: { amount } });
      toast.success(`${inr(amount)} added (demo UPI)`);
      load();
    } catch (e) { toast.error(errMsg(e)); }
  };
  return (
    <div className="pb-24">
      <div className="bg-[#1E3A8A] px-5 pb-8 pt-6 text-white">
        <p className="text-xs font-semibold uppercase tracking-widest text-white/60">HomeServe Wallet</p>
        <p data-testid="wallet-balance" className="font-heading mt-2 text-4xl font-extrabold">{inr(w.balance)}</p>
        <p className="mt-1 text-xs text-white/70">Cashbacks, refunds & promo rewards live here</p>
        <div className="mt-5 flex gap-2">
          {[100, 500, 1000].map((a) => (
            <button key={a} data-testid={`wallet-topup-${a}`} onClick={() => topup(a)} className="flex items-center gap-1 rounded-full bg-white/15 px-3 py-1.5 text-xs font-bold hover:bg-white/25">
              <Plus className="h-3 w-3" /> {inr(a)}
            </button>
          ))}
        </div>
      </div>
      <div className="p-4">
        <h2 className="font-heading text-lg font-semibold">Transactions</h2>
        <div className="mt-3 space-y-2">
          {w.transactions.length === 0 && <Empty text="No transactions yet" testid="wallet-empty" />}
          {w.transactions.map((t) => (
            <div key={t.id} className="flex items-center gap-3 rounded-xl border bg-white p-3" data-testid={`wallet-txn-${t.id}`}>
              <span className={`grid h-9 w-9 place-items-center rounded-full ${t.amount >= 0 ? "bg-green-100 text-[#22C55E]" : "bg-red-100 text-[#EF4444]"}`}>
                {t.amount >= 0 ? <ArrowDownLeft className="h-4 w-4" /> : <ArrowUpRight className="h-4 w-4" />}
              </span>
              <div className="min-w-0 flex-1"><p className="truncate text-sm font-semibold">{t.reason}</p><p className="text-[11px] text-slate-400">{fmtDT(t.created_at)}</p></div>
              <span className={`text-sm font-bold ${t.amount >= 0 ? "text-[#22C55E]" : "text-[#EF4444]"}`}>{t.amount >= 0 ? "+" : ""}{inr(t.amount)}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
