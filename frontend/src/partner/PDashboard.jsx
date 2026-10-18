import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { MapPin, IndianRupee, AlertTriangle, BellRing, ShieldAlert, ChevronRight, Briefcase } from "lucide-react";
import { toast } from "sonner";
import { Switch } from "@/components/ui/switch";
import { Progress } from "@/components/ui/progress";
import { papi, errMsg, inr, usePoll, getGPS, fmtDate } from "@/lib/api";
import { StatusBadge } from "@/components/common/Shared";

const OfferModal = ({ offer, onClose }) => {
  const [left, setLeft] = useState(15);
  const nav = useNavigate();
  useEffect(() => {
    const t = setInterval(() => {
      const s = Math.max(0, Math.round((new Date(offer.expires_at) - Date.now()) / 1000));
      setLeft(s);
      if (s <= 0) { clearInterval(t); onClose(); }
    }, 250);
    return () => clearInterval(t);
  }, [offer, onClose]);
  const act = async (kind) => {
    try {
      await papi.post(`/partner/offers/${offer.booking_id}/${kind}`);
      if (kind === "accept") { toast.success("Job accepted!"); nav(`/partner/job/${offer.booking_id}`); }
      else toast("Job declined");
    } catch (e) { toast.error(errMsg(e)); }
    onClose();
  };
  return (
    <div className="fixed inset-0 z-[700] flex items-end justify-center bg-[#0F172A]/70 md:items-center" data-testid="incoming-job-modal">
      <div className="rise w-full rounded-t-3xl bg-white p-5 md:w-[392px] md:rounded-3xl">
        <div className="flex items-center justify-between">
          <span className="flex items-center gap-2 text-sm font-bold text-[#EF4444]"><BellRing className="h-5 w-5 animate-bounce" /> New job request</span>
          <span data-testid="incoming-job-countdown" className="grid h-12 w-12 place-items-center rounded-full border-4 border-[#F59E0B] text-lg font-extrabold">{left}</span>
        </div>
        <p className="font-heading mt-3 text-2xl font-bold">{offer.category}</p>
        <p className="text-sm text-slate-600">{offer.services.join(", ")}</p>
        <div className="mt-4 grid grid-cols-2 gap-3">
          <div className="rounded-2xl bg-[#F4F5F7] p-3"><MapPin className="h-5 w-5 text-[#1E3A8A]" /><p data-testid="incoming-job-distance" className="mt-1 text-xl font-extrabold">{offer.distance_km} km</p><p className="text-xs text-slate-500">away · {offer.area.slice(0, 28)}</p></div>
          <div className="rounded-2xl bg-green-50 p-3"><IndianRupee className="h-5 w-5 text-[#22C55E]" /><p data-testid="incoming-job-earning" className="mt-1 text-xl font-extrabold">{inr(offer.est_earning)}</p><p className="text-xs text-slate-500">est. earning · {offer.payment_method.toUpperCase()}</p></div>
        </div>
        <p className="mt-3 text-xs text-slate-500">{offer.mode === "instant" ? "Instant job · reach in 30-45 min" : <>Scheduled · {fmtDate(offer.slot_date)} {offer.slot_time}</>}</p>
        <div className="mt-4 grid grid-cols-2 gap-3">
          <button data-testid="incoming-job-decline-btn" onClick={() => act("decline")} className="h-14 rounded-2xl border-2 border-[#EF4444] text-base font-bold text-[#EF4444]">Decline</button>
          <button data-testid="incoming-job-accept-btn" onClick={() => act("accept")} className="h-14 rounded-2xl bg-[#22C55E] text-base font-bold text-white">Accept</button>
        </div>
      </div>
    </div>
  );
};

export default function PDashboard() {
  const [d, setD] = useState(null);
  const [offer, setOffer] = useState(null);
  const load = async () => {
    try {
      const { data } = await papi.get("/partner/dashboard");
      setD(data);
      if (data.offer && !offer) setOffer(data.offer);
    } catch (e) { /* handled by interceptor */ }
  };
  usePoll(load, 4000, [offer?.booking_id]);
  const toggle = async (v) => {
    let location;
    try { location = await getGPS(); } catch (e) { location = undefined; }
    try {
      await papi.post("/partner/status", { is_online: v, location });
      toast.success(v ? "You're online — job alerts on" : "You're offline");
      load();
    } catch (e) { toast.error(errMsg(e)); }
  };
  if (!d) return <div className="p-6 text-sm">Loading…</div>;
  const p = d.profile;
  const job = d.active_job;
  return (
    <div className="space-y-4 p-4 pb-28">
      <div className="flex items-center gap-3">
        <img src={p.avatar || "https://images.unsplash.com/photo-1540569014015-19a7be504e3a?w=200"} alt="" className="h-12 w-12 rounded-full object-cover" />
        <div className="flex-1"><p className="text-xs font-semibold text-slate-500">Namaste,</p><p className="font-heading text-xl font-bold">{p.name || "Partner"}</p></div>
        <span className="rounded-full bg-white px-3 py-1 text-xs font-bold">★ {p.rating || "-"}</span>
      </div>
      <div className={`flex items-center justify-between rounded-2xl p-5 text-white transition-colors ${p.is_online ? "bg-[#22C55E]" : "bg-[#0F172A]"}`} data-testid="partner-availability-card">
        <div><p className="text-xs font-semibold uppercase tracking-widest opacity-80">Availability</p><p data-testid="partner-online-status" className="font-heading text-3xl font-extrabold">{p.is_online ? "ONLINE" : "OFFLINE"}</p></div>
        <Switch data-testid="partner-online-switch" checked={p.is_online} onCheckedChange={toggle} className="scale-150 data-[state=checked]:bg-white/40" />
      </div>
      {p.kyc_status !== "approved" && (
        <Link to="/partner/profile" data-testid="partner-kyc-banner" className="flex items-center gap-3 rounded-2xl border-2 border-[#EAB308] bg-yellow-50 p-4 text-sm font-semibold">
          <ShieldAlert className="h-6 w-6 text-[#EAB308]" /> KYC {p.kyc_status.replace("_", " ")} — complete verification to go online <ChevronRight className="ml-auto h-5 w-5" />
        </Link>
      )}
      {d.doc_alerts.map((a) => (
        <div key={a.type} data-testid={`doc-expiry-alert-${a.type}`} className={`flex items-center gap-3 rounded-2xl p-4 text-sm font-semibold ${a.level === "danger" ? "bg-red-50 text-[#EF4444]" : "bg-yellow-50 text-yellow-800"}`}>
          <AlertTriangle className="h-5 w-5" /> {a.type === "dl" ? "Driving Licence" : "Police Verification"} expires in {a.days_left} days ({fmtDate(a.expiry_date)}). Renew & re-upload.
        </div>
      ))}
      <div className={`rounded-2xl border-2 bg-white p-4 ${d.cod.blocked ? "border-[#EF4444]" : "border-transparent"}`} data-testid="partner-cod-card">
        <div className="flex justify-between text-sm font-bold"><span>Cash in hand (COD)</span><span>{inr(d.cod.cash)} / {inr(d.cod.limit)}</span></div>
        <Progress value={Math.min(100, (d.cod.cash / d.cod.limit) * 100)} className="mt-2 h-3" />
        {d.cod.blocked ? <p data-testid="partner-cod-blocked" className="mt-2 text-xs font-bold text-[#EF4444]">COD limit crossed — new cash jobs paused. Deposit cash with admin to resume.</p>
          : <p className="mt-2 text-xs text-slate-500">New COD jobs pause automatically above {inr(d.cod.limit)}</p>}
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="rounded-2xl bg-white p-4"><p className="text-xs font-semibold text-slate-500">Today's jobs</p><p data-testid="partner-today-jobs" className="font-heading text-3xl font-extrabold">{d.today.jobs}</p></div>
        <div className="rounded-2xl bg-white p-4"><p className="text-xs font-semibold text-slate-500">Today's earnings</p><p data-testid="partner-today-earnings" className="font-heading text-3xl font-extrabold text-[#22C55E]">{inr(d.today.earnings)}</p></div>
      </div>
      <div>
        <p className="font-heading text-lg font-bold">Current job</p>
        {job ? (
          <Link to={`/partner/job/${job.id}`} data-testid="partner-active-job-card" className="mt-2 block rounded-2xl border-2 border-[#1E3A8A] bg-white p-4">
            <div className="flex justify-between"><span className="font-mono text-xs font-bold">{job.booking_no}</span><StatusBadge status={job.status} /></div>
            <p className="mt-2 text-base font-bold">{job.lines.map((l) => l.name).join(", ")}</p>
            <p className="text-sm text-slate-500">{job.address.line}</p>
            <p className="mt-2 text-sm font-bold text-[#1E3A8A]">Open job →</p>
          </Link>
        ) : (
          <div className="mt-2 flex items-center gap-3 rounded-2xl bg-white p-4 text-sm text-slate-500"><Briefcase className="h-5 w-5" />{p.is_online ? "Waiting for job requests…" : "Go online to receive jobs"}</div>
        )}
        {d.upcoming > 0 && <Link to="/partner/schedule" className="mt-2 block text-sm font-bold text-[#1E3A8A]">{d.upcoming} upcoming assigned job(s) →</Link>}
      </div>
      {offer && <OfferModal offer={offer} onClose={() => { setOffer(null); load(); }} />}
    </div>
  );
}
