import { useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Search, UserCog, XCircle } from "lucide-react";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { aapi, errMsg, fmtDT, inr, usePoll } from "@/lib/api";
import { StatusBadge } from "@/components/common/Shared";

const TABS = ["all", "pending", "assigned", "en_route", "in_progress", "completed", "cancelled"];

const Reassign = ({ booking, onClose }) => {
  const [list, setList] = useState([]);
  const [reason, setReason] = useState("");
  usePoll(() => booking && aapi.get(`/admin/bookings/${booking.id}/candidates`).then((r) => setList(r.data)), 600000, [booking?.id]);
  const assign = async (pid) => {
    try {
      await aapi.post(`/admin/bookings/${booking.id}/reassign`, { partner_id: pid, reason });
      toast.success("Job (re)assigned");
      onClose(true);
    } catch (e) { toast.error(errMsg(e)); }
  };
  return (
    <Dialog open={!!booking} onOpenChange={() => onClose(false)}>
      <DialogContent className="max-w-2xl" data-testid="reassign-dialog">
        <DialogHeader><DialogTitle>Manual / emergency re-assignment · {booking?.booking_no}</DialogTitle></DialogHeader>
        <Input data-testid="reassign-reason-input" placeholder="Reason (e.g. partner unreachable, emergency)" value={reason} onChange={(e) => setReason(e.target.value)} />
        <div className="max-h-96 space-y-2 overflow-y-auto">
          {list.map((p) => (
            <div key={p.id} className="flex items-center gap-3 rounded-xl border p-3" data-testid={`candidate-${p.id}`}>
              <span className={`h-2.5 w-2.5 rounded-full ${p.is_online ? "bg-[#22C55E]" : "bg-slate-300"}`} />
              <div className="flex-1">
                <p className="text-sm font-semibold">{p.name} <span className="text-xs text-slate-400">· {p.phone}</span></p>
                <p className="text-xs text-slate-500">★ {p.rating} · {p.distance_km} km · {p.skill_match ? "Skill match" : "No skill match"}{p.cod_blocked ? " · COD blocked" : ""}</p>
              </div>
              {p.current ? <span className="text-xs font-bold text-[#1E3A8A]">Current</span> :
                <button data-testid={`assign-${p.id}`} onClick={() => assign(p.id)} className="rounded-lg bg-[#1E3A8A] px-3 py-1.5 text-xs font-bold text-white">Assign</button>}
            </div>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default function ABookings() {
  const [sp, setSp] = useSearchParams();
  const status = sp.get("status") || "all";
  const [q, setQ] = useState(sp.get("q") || "");
  const [d, setD] = useState({ bookings: [], counts: {} });
  const [sel, setSel] = useState(null);
  const load = () => aapi.get("/admin/bookings", { params: { status, q: q || undefined } }).then((r) => setD(r.data)).catch(() => {});
  usePoll(load, 5000, [status, q]);
  const total = Object.values(d.counts).reduce((a, b) => a + b, 0);
  const cancel = async (b) => {
    if (!window.confirm(`Cancel ${b.booking_no} with full refund?`)) return;
    try { await aapi.post(`/admin/bookings/${b.id}/cancel`); toast.success("Cancelled & refunded"); load(); } catch (e) { toast.error(errMsg(e)); }
  };
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-4">
        <div className="flex flex-wrap gap-1 rounded-xl border bg-white p-1" data-testid="bookings-status-tabs">
          {TABS.map((t) => (
            <button key={t} data-testid={`bookings-tab-${t}`} onClick={() => setSp({ status: t })}
              className={`rounded-lg px-3 py-1.5 text-xs font-semibold capitalize ${status === t ? "bg-[#1E3A8A] text-white" : "text-slate-600 hover:bg-slate-50"}`}>
              {t.replace("_", " ")} <span className="opacity-70">({t === "all" ? total : d.counts[t] || 0})</span>
            </button>
          ))}
        </div>
        <div className="relative w-80">
          <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
          <Input data-testid="bookings-search-input" className="pl-9" placeholder="Booking ID or customer phone" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
      </div>
      <div className="overflow-hidden rounded-2xl border bg-white">
        <Table data-testid="bookings-table">
          <TableHeader><TableRow className="bg-slate-50">
            <TableHead>Booking</TableHead><TableHead>Customer</TableHead><TableHead>Services</TableHead><TableHead>Partner</TableHead>
            <TableHead>Amount</TableHead><TableHead>Status</TableHead><TableHead>Created</TableHead><TableHead className="text-right">Actions</TableHead>
          </TableRow></TableHeader>
          <TableBody>
            {d.bookings.map((b) => (
              <TableRow key={b.id} data-testid={`booking-row-${b.id}`}>
                <TableCell className="font-mono text-xs font-bold">{b.booking_no}<div className="font-sans text-[11px] font-normal text-slate-400">{b.city_name} · {b.mode}</div></TableCell>
                <TableCell className="text-sm">{b.customer?.name}<div className="text-xs text-slate-400">{b.customer?.phone}</div></TableCell>
                <TableCell className="max-w-[220px] truncate text-sm">{b.lines.map((l) => l.name).join(", ")}</TableCell>
                <TableCell className="text-sm">{b.partner_name || <span className="text-[#EAB308]">Unassigned</span>}</TableCell>
                <TableCell className="text-sm font-semibold">{inr(b.pricing.total)}<div className="text-[11px] font-normal uppercase text-slate-400">{b.payment_method}</div></TableCell>
                <TableCell><StatusBadge status={b.status} /></TableCell>
                <TableCell className="text-xs text-slate-500">{fmtDT(b.created_at)}</TableCell>
                <TableCell className="text-right">
                  {["pending", "assigned", "en_route"].includes(b.status) && (
                    <div className="flex justify-end gap-1">
                      <button data-testid={`reassign-btn-${b.id}`} onClick={() => setSel(b)} className="inline-flex items-center gap-1 rounded-lg border px-2 py-1 text-xs font-semibold hover:border-[#1E3A8A]"><UserCog className="h-3.5 w-3.5" />{b.partner_id ? "Re-assign" : "Assign"}</button>
                      <button data-testid={`admin-cancel-btn-${b.id}`} onClick={() => cancel(b)} className="rounded-lg border px-2 py-1 text-xs text-[#EF4444]"><XCircle className="h-3.5 w-3.5" /></button>
                    </div>
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
        {d.bookings.length === 0 && <p className="p-8 text-center text-sm text-slate-400">No bookings</p>}
      </div>
      <Reassign booking={sel} onClose={(ok) => { setSel(null); ok && load(); }} />
    </div>
  );
}
