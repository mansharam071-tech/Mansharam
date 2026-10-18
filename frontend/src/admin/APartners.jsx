import { useState } from "react";
import { toast } from "sonner";
import { aapi, errMsg, fmtDT, inr, usePoll } from "@/lib/api";

export default function APartners() {
  const [ps, setPs] = useState([]);
  const [sos, setSos] = useState([]);
  const [payouts, setPayouts] = useState([]);
  const load = () => {
    aapi.get("/admin/partners").then((r) => setPs(r.data)).catch(() => {});
    aapi.get("/admin/sos").then((r) => setSos(r.data)).catch(() => {});
    aapi.get("/admin/payouts").then((r) => setPayouts(r.data)).catch(() => {});
  };
  usePoll(load, 8000);
  const post = async (url, msg) => { try { await aapi.post(url); toast.success(msg); load(); } catch (e) { toast.error(errMsg(e)); } };
  return (
    <div className="space-y-6">
      {sos.some((s) => s.status === "open") && (
        <div className="rounded-2xl border-2 border-[#EF4444] bg-red-50 p-4" data-testid="sos-alerts-panel">
          <p className="font-semibold text-[#EF4444]">Active SOS emergencies</p>
          {sos.filter((s) => s.status === "open").map((s) => (
            <div key={s.id} className="mt-2 flex items-center justify-between rounded-xl bg-white p-3 text-sm" data-testid={`sos-${s.id}`}>
              <span><b>{s.partner_name}</b> · {s.phone} · {fmtDT(s.created_at)} · {s.location ? `${s.location.lat.toFixed(4)}, ${s.location.lng.toFixed(4)}` : "no GPS"}</span>
              <button data-testid={`sos-resolve-${s.id}`} onClick={() => post(`/admin/sos/${s.id}/resolve`, "SOS resolved")} className="rounded-lg bg-[#EF4444] px-3 py-1 text-xs font-bold text-white">Mark resolved</button>
            </div>
          ))}
        </div>
      )}
      <div className="overflow-hidden rounded-2xl border bg-white">
        <table className="w-full text-sm" data-testid="partners-table">
          <thead className="bg-slate-50 text-left text-xs uppercase text-slate-500"><tr><th className="p-3">Partner</th><th>Status</th><th>KYC</th><th>Rating / Jobs</th><th>COD cash</th><th>Rejections</th><th>Pending / Wallet</th><th /></tr></thead>
          <tbody>
            {ps.map((p) => (
              <tr key={p.id} className="border-t" data-testid={`partner-row-${p.id}`}>
                <td className="p-3"><p className="font-semibold">{p.name || "—"}</p><p className="text-xs text-slate-400">{p.phone}</p></td>
                <td><span className={`inline-flex items-center gap-1.5 text-xs font-semibold ${p.is_online ? "text-[#22C55E]" : "text-slate-400"}`}><span className={`h-2 w-2 rounded-full ${p.is_online ? "bg-[#22C55E]" : "bg-slate-300"}`} />{p.is_online ? "Online" : "Offline"}</span></td>
                <td className="text-xs font-semibold uppercase">{p.kyc_status}</td>
                <td>★ {p.rating} · {p.jobs_done}</td>
                <td className={p.cod_blocked ? "font-bold text-[#EF4444]" : ""}>{inr(p.cod_cash)} / {inr(p.cod_limit)}</td>
                <td className={p.consecutive_rejections >= 3 ? "font-bold text-[#EAB308]" : ""}>{p.consecutive_rejections}</td>
                <td className="text-xs">{inr(p.pending_earnings)} / {inr(p.wallet_balance)}</td>
                <td className="space-x-1 pr-3 text-right">
                  {p.cod_cash > 0 && <button data-testid={`settle-cod-${p.id}`} onClick={() => post(`/admin/partners/${p.id}/settle-cod`, "COD cash marked remitted")} className="rounded-lg border px-2 py-1 text-xs font-semibold">Settle COD</button>}
                  {p.consecutive_rejections > 0 && <button data-testid={`reset-rej-${p.id}`} onClick={() => post(`/admin/partners/${p.id}/reset-rejections`, "Counter reset")} className="rounded-lg border px-2 py-1 text-xs font-semibold">Reset</button>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="rounded-2xl border bg-white p-5">
        <p className="text-[18px] font-semibold">Payout withdrawal requests</p>
        {payouts.length === 0 && <p className="mt-2 text-sm text-slate-400">No requests</p>}
        {payouts.map((x) => (
          <div key={x.id} className="mt-2 flex items-center justify-between rounded-xl border p-3 text-sm" data-testid={`admin-payout-${x.id}`}>
            <span><b>{x.partner_name}</b> · {inr(x.amount)} → {x.bank?.bank_name} {x.bank?.account_no} · {fmtDT(x.created_at)}</span>
            {x.status === "requested" ? <button data-testid={`payout-pay-${x.id}`} onClick={() => post(`/admin/payouts/${x.id}/pay`, "Payout marked paid")} className="rounded-lg bg-[#22C55E] px-3 py-1 text-xs font-bold text-white">Mark paid</button>
              : <span className="text-xs font-bold text-[#22C55E]">PAID · {x.utr}</span>}
          </div>
        ))}
      </div>
    </div>
  );
}
