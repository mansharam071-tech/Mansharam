import { useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, BadgeCheck, MessageCircle, Star, Loader2, FileText, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { AlertDialog, AlertDialogContent, AlertDialogHeader, AlertDialogTitle, AlertDialogDescription, AlertDialogFooter } from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { capi, errMsg, inr, usePoll } from "@/lib/api";
import { Stepper, StatusBadge } from "@/components/common/Shared";
import { TrackMap } from "@/components/common/Maps";
import { ChatDialog, CallButton, InvoiceDialog } from "@/components/common/BookingTools";
import { useCust } from "./CustomerApp";
import { payWithRazorpay } from "@/lib/razorpay";

const stepOf = (b) => ({ pending: 0, assigned: 1, en_route: b.arrived_at ? 2 : 1, in_progress: 3, completed: 4 }[b.status] ?? 0);

const RateCard = ({ b, onDone }) => {
  const [rating, setRating] = useState(0);
  const [tip, setTip] = useState(0);
  const [review, setReview] = useState("");
  const submit = async () => {
    try {
      await capi.post(`/customer/bookings/${b.id}/rate`, { rating, review, tip });
      toast.success("Thanks for your feedback!");
      onDone();
    } catch (e) { toast.error(errMsg(e)); }
  };
  return (
    <div className="rounded-2xl border border-amber-200 bg-amber-50/60 p-4" data-testid="rate-card">
      <p className="text-sm font-bold">Rate your experience</p>
      <div className="mt-2 flex gap-1">
        {[1, 2, 3, 4, 5].map((n) => (
          <button key={n} data-testid={`rate-star-${n}`} onClick={() => setRating(n)}>
            <Star className={`h-8 w-8 ${n <= rating ? "fill-[#F59E0B] text-[#F59E0B]" : "text-slate-300"}`} />
          </button>
        ))}
      </div>
      <p className="mt-3 text-xs font-semibold text-slate-600">Add a tip (100% goes to partner)</p>
      <div className="mt-1.5 flex gap-2">
        {[0, 20, 50, 100].map((t) => (
          <button key={t} data-testid={`tip-${t}`} onClick={() => setTip(t)} className={`rounded-full border px-3 py-1 text-xs font-bold ${tip === t ? "border-[#1E3A8A] bg-[#1E3A8A] text-white" : "bg-white"}`}>{t ? inr(t) : "No tip"}</button>
        ))}
      </div>
      <Textarea data-testid="rate-review-input" className="mt-3 bg-white" placeholder="Write a review (optional)" value={review} onChange={(e) => setReview(e.target.value)} />
      <Button data-testid="rate-submit-btn" disabled={!rating} onClick={submit} className="mt-3 w-full bg-[#1E3A8A]">Submit</Button>
    </div>
  );
};

export default function CTracking() {
  const { id } = useParams();
  const nav = useNavigate();
  const { refreshCart, user } = useCust();
  const [b, setB] = useState(null);
  const [chat, setChat] = useState(false);
  const [invoice, setInvoice] = useState(false);
  const load = async () => {
    try { setB((await capi.get(`/customer/bookings/${id}`)).data); } catch (e) { toast.error(errMsg(e)); }
  };
  usePoll(load, 3000, [id]);
  if (!b) return <div className="p-6 text-sm text-slate-500">Loading…</div>;
  const pendingExtra = b.extras.find((e) => e.status === "pending");
  const respond = async (approve) => {
    try {
      await capi.post(`/customer/bookings/${b.id}/extras/${pendingExtra.id}`, null, { params: { approve } });
      toast.success(approve ? "Extra charge approved" : "Extra charge declined");
      load();
    } catch (e) { toast.error(errMsg(e)); }
  };
  const cancel = async () => {
    if (!window.confirm("Cancel this booking? Fees apply as per policy.")) return;
    try {
      const { data } = await capi.post(`/customer/bookings/${b.id}/cancel`);
      toast.success(`Cancelled · fee ${inr(data.fee)} · refund ${inr(data.refund)} to wallet`);
      load();
    } catch (e) { toast.error(errMsg(e)); }
  };
  const payBalance = async () => {
    try {
      const { data } = await capi.post(`/customer/bookings/${b.id}/pay-balance`);
      await payWithRazorpay(data.razorpay, { user, method: b.payment_method, description: `Balance ${b.booking_no}` });
      toast.success("Payment successful");
      load();
    } catch (e) { toast.error(e.response ? errMsg(e) : e.message); }
  };
  const rebook = async () => {
    await capi.post(`/customer/bookings/${b.id}/rebook`);
    await refreshCart();
    nav("/app/checkout");
  };
  const p = b.pricing;
  const live = ["assigned", "en_route", "in_progress"].includes(b.status);
  return (
    <div className="relative flex min-h-full flex-col">
      <div className="relative h-[45%] min-h-[300px]">
        <TrackMap testid="tracking-map" className="h-[300px] w-full" dest={b.address.location} partner={b.partner_id && b.status !== "completed" ? b.live_location : null} />
        <button data-testid="tracking-back-btn" onClick={() => nav("/app/bookings")} className="absolute left-4 top-4 z-[500] grid h-9 w-9 place-items-center rounded-full bg-white shadow"><ArrowLeft className="h-5 w-5" /></button>
        {b.eta_min != null && b.status === "en_route" && !b.arrived_at && (
          <span data-testid="tracking-eta" className="absolute right-4 top-4 z-[500] rounded-full bg-[#0F172A] px-3 py-1.5 text-xs font-bold text-white">Arriving in ~{b.eta_min} min</span>
        )}
      </div>
      <div className="-mt-6 flex-1 space-y-4 rounded-t-3xl bg-white px-4 pb-8 pt-5 shadow-[0_-8px_30px_rgba(15,23,42,.08)]" data-testid="tracking-bottom-sheet">
        <div className="mx-auto h-1 w-10 rounded-full bg-slate-300" />
        <div className="flex items-center justify-between">
          <span className="font-mono text-xs font-bold text-slate-500">{b.booking_no}</span>
          <StatusBadge status={b.status} testid="tracking-status" />
        </div>
        {b.status !== "cancelled" && <Stepper testid="tracking-stepper" steps={["Confirmed", "En Route", "Job Started", "Completed"]} current={stepOf(b)} />}
        {b.status === "pending" && (
          <div className="flex items-center gap-3 rounded-2xl bg-blue-50 p-4 text-sm text-[#1E3A8A]" data-testid="tracking-finding-partner">
            <Loader2 className="h-5 w-5 animate-spin" /> Finding the best verified partner near you…
          </div>
        )}
        {b.partner && (
          <div className="flex items-center gap-3 rounded-2xl border p-3" data-testid="tracking-partner-card">
            <img src={b.partner.avatar} alt="" className="h-12 w-12 rounded-full object-cover" />
            <div className="flex-1">
              <p className="flex items-center gap-1 text-[15px] font-bold">{b.partner.name} {b.partner.verified && <BadgeCheck className="h-4 w-4 text-[#22C55E]" />}</p>
              <p className="flex items-center gap-1 text-xs text-slate-500"><Star className="h-3 w-3 fill-[#F59E0B] text-[#F59E0B]" />{b.partner.rating} · {b.partner.jobs_done} jobs · Verified</p>
            </div>
            {live && (
              <div className="flex gap-1.5">
                <CallButton api={capi} bookingId={b.id} className="h-9 px-2.5" label="" />
                <Button data-testid="tracking-chat-btn" variant="outline" className="h-9 px-2.5" onClick={() => setChat(true)}><MessageCircle className="h-4 w-4" /></Button>
              </div>
            )}
          </div>
        )}
        {["assigned", "en_route"].includes(b.status) && (
          <div className="flex items-center justify-between rounded-2xl bg-[#0F172A] p-4 text-white" data-testid="tracking-start-otp">
            <div className="flex items-center gap-2 text-sm"><ShieldCheck className="h-5 w-5 text-[#22C55E]" /> Share Start OTP</div>
            <span className="font-mono text-2xl font-bold tracking-[0.3em]">{b.start_otp}</span>
          </div>
        )}
        {b.status === "in_progress" && (
          <div className="flex items-center justify-between rounded-2xl bg-[#0F172A] p-4 text-white" data-testid="tracking-end-otp">
            <div className="flex items-center gap-2 text-sm"><ShieldCheck className="h-5 w-5 text-[#F59E0B]" /> End OTP (share when done)</div>
            <span className="font-mono text-2xl font-bold tracking-[0.3em]">{b.end_otp}</span>
          </div>
        )}
        {b.extras.length > 0 && (
          <div className="rounded-2xl border p-3">
            <p className="text-sm font-bold">Extra parts / charges</p>
            {b.extras.map((e) => (
              <div key={e.id} className="mt-1.5 flex justify-between text-sm"><span>{e.name}</span><span className={e.status === "approved" ? "text-[#22C55E]" : e.status === "rejected" ? "text-[#EF4444] line-through" : "text-[#EAB308]"}>{inr(e.amount)} · {e.status}</span></div>
            ))}
          </div>
        )}
        <div className="space-y-1 rounded-2xl bg-slate-50 p-4 text-sm">
          {b.lines.map((l) => <div key={l.service_id} className="flex justify-between"><span>{l.name} ×{l.qty}</span><span>{inr(l.line_total)}</span></div>)}
          {p.surge_amount > 0 && <div className="flex justify-between text-[#EAB308]"><span>Surge {p.surge_multiplier}x</span><span>{inr(p.surge_amount)}</span></div>}
          {p.discount > 0 && <div className="flex justify-between text-[#22C55E]"><span>Discount</span><span>-{inr(p.discount)}</span></div>}
          {p.extras_total > 0 && <div className="flex justify-between"><span>Approved extras</span><span>{inr(p.extras_total)}</span></div>}
          <div className="flex justify-between text-slate-500"><span>GST 18%</span><span>{inr(p.gst)}</span></div>
          <div className="flex justify-between border-t pt-1.5 font-bold"><span>Total ({b.payment_method.toUpperCase()} · {b.payment_status})</span><span data-testid="tracking-total">{inr(p.total)}</span></div>
        </div>
        {b.payment_status === "balance_due" && (
          <div className="flex items-center justify-between rounded-2xl border-2 border-[#F59E0B] bg-amber-50 p-3" data-testid="tracking-balance-due">
            <span className="text-sm font-semibold">Balance due for approved extras</span>
            <Button data-testid="tracking-pay-balance-btn" onClick={payBalance} className="bg-[#F59E0B] font-bold text-slate-900 hover:bg-[#D97706]">
              Pay balance {inr(p.total - (b.amount_paid || 0))}
            </Button>
          </div>
        )}
        {b.status === "completed" && (
          <div className="grid grid-cols-2 gap-2">
            <Button data-testid="tracking-invoice-btn" variant="outline" onClick={() => setInvoice(true)}><FileText className="mr-1.5 h-4 w-4" /> GST Invoice</Button>
            <Button data-testid="tracking-rebook-btn" className="bg-[#1E3A8A]" onClick={rebook}>Re-book</Button>
          </div>
        )}
        {b.status === "completed" && !b.rating && <RateCard b={b} onDone={load} />}
        {b.rating && <p className="text-center text-sm text-slate-500">You rated {b.rating}★{b.tip ? ` · tipped ${inr(b.tip)}` : ""}</p>}
        {b.status === "cancelled" && <p data-testid="tracking-cancel-info" className="rounded-xl bg-red-50 p-3 text-sm text-[#EF4444]">Cancelled · fee {inr(b.cancellation?.fee)} · refunded {inr(b.cancellation?.refund)} to wallet</p>}
        {["payment_pending", "pending", "assigned", "en_route"].includes(b.status) && (
          <button data-testid="tracking-cancel-btn" onClick={cancel} className="w-full py-2 text-sm font-semibold text-[#EF4444]">Cancel booking</button>
        )}
      </div>
      <ChatDialog api={capi} bookingId={b.id} open={chat} onOpenChange={setChat} me="customer" />
      <InvoiceDialog api={capi} bookingId={b.id} open={invoice} onOpenChange={setInvoice} />
      <AlertDialog open={!!pendingExtra}>
        <AlertDialogContent className="max-w-sm" data-testid="extra-approval-dialog">
          <AlertDialogHeader>
            <AlertDialogTitle>Approve extra charge?</AlertDialogTitle>
            <AlertDialogDescription>
              {b.partner?.name} requested <b>{pendingExtra?.name}</b> for <b>{inr(pendingExtra?.amount)}</b> (+18% GST). It will be added to your bill only if you approve.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="gap-2">
            <Button data-testid="extra-reject-btn" variant="outline" className="border-[#EF4444] text-[#EF4444]" onClick={() => respond(false)}>Decline</Button>
            <Button data-testid="extra-approve-btn" className="bg-[#22C55E] hover:bg-green-600" onClick={() => respond(true)}>Approve</Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
