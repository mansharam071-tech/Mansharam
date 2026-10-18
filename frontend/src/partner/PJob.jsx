import { useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, Navigation, MessageCircle, Plus } from "lucide-react";
import { toast } from "sonner";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { papi, errMsg, inr, usePoll } from "@/lib/api";
import { Stepper, StatusBadge } from "@/components/common/Shared";
import { TrackMap } from "@/components/common/Maps";
import { ChatDialog, CallButton, InvoiceDialog } from "@/components/common/BookingTools";

const stepOf = (b) => (b.status === "completed" ? 4 : b.status === "in_progress" ? 2 : b.arrived_at ? 1 : 0);
const Big = ({ children, className = "", ...p }) => (
  <button {...p} className={`h-14 w-full rounded-2xl text-base font-extrabold disabled:opacity-50 ${className}`}>{children}</button>
);

export default function PJob() {
  const { id } = useParams();
  const nav = useNavigate();
  const [b, setB] = useState(null);
  const [otp, setOtp] = useState("");
  const [extra, setExtra] = useState({ name: "", amount: "" });
  const [chat, setChat] = useState(false);
  const [bill, setBill] = useState(false);
  const load = async () => { try { setB((await papi.get(`/partner/jobs/${id}`)).data); } catch (e) { toast.error(errMsg(e)); } };
  usePoll(load, 4000, [id]);
  const act = async (path, body, msg) => {
    try {
      await papi.post(`/partner/jobs/${id}/${path}`, body);
      toast.success(msg);
      setOtp("");
      load();
      return true;
    } catch (e) { toast.error(errMsg(e)); return false; }
  };
  if (!b) return <div className="p-6 text-sm">Loading…</div>;
  const dest = b.address.location;
  const gmaps = `https://www.google.com/maps/dir/?api=1&destination=${dest?.lat},${dest?.lng}`;
  const pendingExtras = b.extras.filter((e) => e.status === "pending");
  return (
    <div className="flex min-h-full flex-col bg-white">
      <div className="flex items-center gap-3 border-b-2 px-4 py-3">
        <button data-testid="job-back-btn" onClick={() => nav("/partner")}><ArrowLeft className="h-6 w-6" /></button>
        <div className="flex-1"><p className="font-mono text-xs font-bold text-slate-500">{b.booking_no}</p><p className="font-heading text-lg font-bold leading-tight">{b.lines.map((l) => `${l.name} ×${l.qty}`).join(", ")}</p></div>
        <StatusBadge status={b.status} testid="job-status" />
      </div>
      <div className="p-4"><Stepper testid="job-stepper" steps={["Arrived", "Start (OTP)", "In Progress", "Complete"]} current={stepOf(b)} /></div>
      <TrackMap className="mx-4 h-44 overflow-hidden rounded-2xl" dest={dest} partner={b.live_location} />
      <div className="space-y-3 p-4">
        <div className="rounded-2xl bg-[#F4F5F7] p-4">
          <p className="text-sm font-bold">{b.customer?.name} · {b.address.label}</p>
          <p className="text-sm text-slate-700">{b.address.line} ({b.address.pincode})</p>
          {b.address.landmark && <p className="text-xs text-slate-500">Landmark: {b.address.landmark}</p>}
          {b.address.audio_note && <audio data-testid="job-audio-note" controls src={b.address.audio_note} className="mt-2 h-9 w-full" />}
          <p className="mt-2 text-xs font-semibold text-slate-600">{b.slot_date} · {b.slot_time} · {b.payment_method === "cod" ? `Collect cash ${inr(b.pricing.total)}` : "Prepaid online"}</p>
          <div className="mt-3 grid grid-cols-3 gap-2">
            <a data-testid="job-navigate-link" href={gmaps} target="_blank" rel="noreferrer" className="flex h-11 items-center justify-center rounded-xl bg-[#1E3A8A] text-sm font-bold text-white"><Navigation className="mr-1 h-4 w-4" />Maps</a>
            <CallButton api={papi} bookingId={b.id} className="h-11 rounded-xl border-2 font-bold" />
            <Button data-testid="job-chat-btn" variant="outline" className="h-11 rounded-xl border-2 font-bold" onClick={() => setChat(true)}><MessageCircle className="mr-1 h-4 w-4" />Chat</Button>
          </div>
        </div>
        {b.status === "in_progress" && (
          <div className="rounded-2xl border-2 border-dashed p-4" data-testid="job-extras-section">
            <p className="text-sm font-bold">Request extra spare parts / charges</p>
            <div className="mt-2 flex gap-2">
              <Input data-testid="job-extra-name-input" placeholder="e.g. Capacitor" value={extra.name} onChange={(e) => setExtra({ ...extra, name: e.target.value })} />
              <Input data-testid="job-extra-amount-input" placeholder="₹" className="w-24" inputMode="numeric" value={extra.amount} onChange={(e) => setExtra({ ...extra, amount: e.target.value.replace(/\D/g, "") })} />
              <Button data-testid="job-extra-submit-btn" className="bg-[#F59E0B] text-slate-900" onClick={async () => (await act("extras", { name: extra.name, amount: Number(extra.amount) }, "Sent to customer for approval")) && setExtra({ name: "", amount: "" })}><Plus className="h-4 w-4" /></Button>
            </div>
            {b.extras.map((e) => (
              <div key={e.id} className="mt-2 flex justify-between text-sm" data-testid={`job-extra-${e.id}`}><span>{e.name}</span>
                <span className={`font-bold ${e.status === "approved" ? "text-[#22C55E]" : e.status === "rejected" ? "text-[#EF4444]" : "text-[#EAB308]"}`}>{inr(e.amount)} · {e.status === "pending" ? "awaiting approval" : e.status}</span></div>
            ))}
          </div>
        )}
        <div className="rounded-2xl bg-[#F4F5F7] p-4 text-sm">
          <div className="flex justify-between"><span>Bill (incl. GST)</span><span data-testid="job-bill-total" className="font-bold">{inr(b.pricing.total)}</span></div>
          {b.partner_earning != null && <div className="flex justify-between text-[#22C55E]"><span>Your earning</span><span className="font-bold">{inr(b.partner_earning)}</span></div>}
        </div>
      </div>
      <div className="sticky bottom-0 z-[550] mt-auto space-y-2 border-t-2 bg-white p-4 pr-20">
        {b.status === "assigned" && (
          <div className="grid grid-cols-2 gap-2">
            <Big data-testid="job-start-navigation-btn" className="bg-[#1E3A8A] text-white" onClick={() => { window.open(gmaps, "_blank"); act("navigate", {}, "Navigation started — customer can track you"); }}>Start Navigation</Big>
            <Big data-testid="job-arrived-btn" className="bg-[#0F172A] text-white" onClick={() => act("arrived", {}, "Marked arrived")}>Arrived</Big>
          </div>
        )}
        {b.status === "en_route" && !b.arrived_at && <Big data-testid="job-arrived-btn" className="bg-[#0F172A] text-white" onClick={() => act("arrived", {}, "Marked arrived")}>1 · Arrived at Location</Big>}
        {b.status === "en_route" && b.arrived_at && (
          <div className="flex gap-2">
            <Input data-testid="job-start-otp-input" className="h-14 w-32 text-center text-xl font-bold tracking-[0.4em]" maxLength={4} placeholder="OTP" value={otp} onChange={(e) => setOtp(e.target.value.replace(/\D/g, ""))} />
            <Big data-testid="job-start-btn" disabled={otp.length !== 4} className="bg-[#22C55E] text-white" onClick={() => act("start", { otp }, "Job started")}>2 · Start Job</Big>
          </div>
        )}
        {b.status === "in_progress" && (
          <div className="flex gap-2">
            <Input data-testid="job-end-otp-input" className="h-14 w-32 text-center text-xl font-bold tracking-[0.4em]" maxLength={4} placeholder="OTP" value={otp} onChange={(e) => setOtp(e.target.value.replace(/\D/g, ""))} />
            <Big data-testid="job-complete-btn" disabled={otp.length !== 4 || pendingExtras.length > 0} className="bg-[#F59E0B] text-slate-900"
              onClick={async () => (await act("complete", { otp }, "Job completed — bill generated")) && setBill(true)}>
              {pendingExtras.length ? "Awaiting approval…" : "4 · Complete Job"}
            </Big>
          </div>
        )}
        {b.status === "completed" && <Big data-testid="job-view-bill-btn" className="bg-[#1E3A8A] text-white" onClick={() => setBill(true)}>View Final Bill / GST Invoice</Big>}
      </div>
      <ChatDialog api={papi} bookingId={b.id} open={chat} onOpenChange={setChat} me="partner" />
      <InvoiceDialog api={papi} bookingId={b.id} open={bill} onOpenChange={setBill} />
    </div>
  );
}
