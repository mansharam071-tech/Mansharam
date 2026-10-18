import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { errMsg, fmtDT, inr, usePoll } from "@/lib/api";
import { toast } from "sonner";
import { Phone, Send } from "lucide-react";

export const ChatDialog = ({ api, bookingId, open, onOpenChange, me }) => {
  const [msgs, setMsgs] = useState([]);
  const [text, setText] = useState("");
  usePoll(async () => {
    if (!open) return;
    try {
      const { data } = await api.get(`/bookings/${bookingId}/messages`);
      setMsgs(data);
    } catch (e) { /* ignore */ }
  }, 3000, [open, bookingId]);
  const send = async () => {
    if (!text.trim()) return;
    try {
      const { data } = await api.post(`/bookings/${bookingId}/messages`, { text });
      setMsgs((m) => [...m, data]);
      setText("");
    } catch (e) {
      toast.error(errMsg(e));
    }
  };
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm" data-testid="chat-dialog">
        <DialogHeader><DialogTitle>In-app chat</DialogTitle></DialogHeader>
        <div className="flex h-72 flex-col gap-2 overflow-y-auto rounded-xl bg-slate-50 p-3">
          {msgs.length === 0 && <p className="m-auto text-xs text-slate-400">No messages yet</p>}
          {msgs.map((m) => (
            <div key={m.id} className={`max-w-[80%] rounded-2xl px-3 py-2 text-sm ${m.sender_role === me ? "self-end bg-[#1E3A8A] text-white" : "self-start bg-white text-slate-800 shadow-sm"}`}>
              {m.text}
              <div className="mt-0.5 text-[10px] opacity-60">{fmtDT(m.created_at)}</div>
            </div>
          ))}
        </div>
        <div className="flex gap-2">
          <Input data-testid="chat-input" value={text} onChange={(e) => setText(e.target.value)} onKeyDown={(e) => e.key === "Enter" && send()} placeholder="Type a message" />
          <Button data-testid="chat-send-btn" onClick={send} className="bg-[#1E3A8A]"><Send className="h-4 w-4" /></Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export const CallButton = ({ api, bookingId, className, label = "Call" }) => {
  const [info, setInfo] = useState(null);
  const call = async () => {
    try {
      const { data } = await api.post(`/bookings/${bookingId}/call`);
      setInfo(data);
    } catch (e) {
      toast.error(errMsg(e));
    }
  };
  return (
    <>
      <Button data-testid="masked-call-btn" variant="outline" onClick={call} className={className}><Phone className="mr-1.5 h-4 w-4" />{label}</Button>
      <Dialog open={!!info} onOpenChange={() => setInfo(null)}>
        <DialogContent className="max-w-xs text-center" data-testid="masked-call-dialog">
          <DialogHeader><DialogTitle>Masked call</DialogTitle></DialogHeader>
          <p className="text-2xl font-bold text-[#1E3A8A]">{info?.masked_number}</p>
          <p className="text-sm text-slate-600">Enter PIN <b>{info?.pin}</b> when prompted</p>
          <p className="text-xs text-slate-400">{info?.note}</p>
          <a href={`tel:${info?.masked_number?.replace(/\s/g, "")}`} className="mt-2 rounded-xl bg-[#22C55E] py-2.5 font-semibold text-white">Dial now</a>
        </DialogContent>
      </Dialog>
    </>
  );
};

export const InvoiceDialog = ({ api, bookingId, open, onOpenChange }) => {
  const [inv, setInv] = useState(null);
  usePoll(async () => {
    if (!open) return;
    try {
      const { data } = await api.get(`/bookings/${bookingId}/invoice`);
      setInv(data);
    } catch (e) {
      toast.error(errMsg(e));
    }
  }, 600000, [open, bookingId]);
  const p = inv?.pricing || {};
  const Row = ({ k, v, b }) => (
    <div className={`flex justify-between py-1 text-sm ${b ? "font-bold text-slate-900" : "text-slate-600"}`}><span>{k}</span><span>{v}</span></div>
  );
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md" data-testid="invoice-dialog">
        <DialogHeader><DialogTitle>Tax Invoice</DialogTitle></DialogHeader>
        {inv && (
          <div className="space-y-3 text-sm" id="invoice-print">
            <div className="flex justify-between">
              <div>
                <p className="font-bold">{inv.seller.name}</p>
                <p className="text-xs text-slate-500">GSTIN: {inv.seller.gstin}</p>
              </div>
              <div className="text-right">
                <p data-testid="invoice-number" className="font-mono text-xs font-bold">{inv.invoice_no}</p>
                <p className="text-xs text-slate-500">{fmtDT(inv.date)}</p>
              </div>
            </div>
            <div className="rounded-lg bg-slate-50 p-2 text-xs">
              <b>Bill to:</b> {inv.buyer.name || "Customer"} · {inv.buyer.address} ({inv.buyer.pincode})<br />
              Place of supply: {inv.place_of_supply} · SAC {inv.sac}
            </div>
            <div className="border-y py-2">
              {inv.lines.map((l) => <Row key={l.service_id} k={`${l.name} × ${l.qty}`} v={inr(l.line_total)} />)}
              {inv.extras.map((e) => <Row key={e.id} k={`Extra: ${e.name}`} v={inr(e.amount)} />)}
            </div>
            <Row k="Subtotal" v={inr(p.subtotal)} />
            {p.surge_amount > 0 && <Row k={`Surge (${p.surge_multiplier}x)`} v={inr(p.surge_amount)} />}
            {p.discount > 0 && <Row k={`Discount ${p.coupon_code || ""}`} v={`- ${inr(p.discount)}`} />}
            <Row k="Taxable value" v={inr(p.taxable)} />
            <Row k="CGST 9%" v={inr(p.cgst)} />
            <Row k="SGST 9%" v={inr(p.sgst)} />
            <Row k="Invoice total" v={inr(p.total)} b />
            {inv.tip > 0 && <Row k="Tip to partner (non-taxable)" v={inr(inv.tip)} />}
            <Button data-testid="invoice-print-btn" className="w-full bg-[#1E3A8A]" onClick={() => window.print()}>Download / Print</Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
};
