import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { papi, errMsg, inr } from "@/lib/api";
import { StatusBadge, Empty } from "@/components/common/Shared";

const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const pad = (n) => String(n).padStart(2, "0");

const Calendar = () => {
  const [m, setM] = useState(() => { const d = new Date(); return { y: d.getFullYear(), mo: d.getMonth() }; });
  const [jobs, setJobs] = useState([]);
  const [sel, setSel] = useState(null);
  const key = `${m.y}-${pad(m.mo + 1)}`;
  useEffect(() => { papi.get("/partner/calendar", { params: { month: key } }).then((r) => setJobs(r.data)); }, [key]);
  const first = (new Date(m.y, m.mo, 1).getDay() + 6) % 7;
  const total = new Date(m.y, m.mo + 1, 0).getDate();
  const shift = (d) => setM(({ y, mo }) => { const n = new Date(y, mo + d, 1); return { y: n.getFullYear(), mo: n.getMonth() }; });
  const byDay = (d) => jobs.filter((j) => j.slot_date === `${key}-${pad(d)}`);
  return (
    <div className="rounded-2xl bg-white p-4" data-testid="partner-calendar">
      <div className="flex items-center justify-between">
        <button data-testid="calendar-prev" onClick={() => shift(-1)}><ChevronLeft className="h-5 w-5" /></button>
        <p className="font-bold">{new Date(m.y, m.mo).toLocaleDateString("en-IN", { month: "long", year: "numeric" })}</p>
        <button data-testid="calendar-next" onClick={() => shift(1)}><ChevronRight className="h-5 w-5" /></button>
      </div>
      <div className="mt-3 grid grid-cols-7 gap-1 text-center text-[11px] font-bold text-slate-400">{DAYS.map((d) => <span key={d}>{d[0]}</span>)}</div>
      <div className="mt-1 grid grid-cols-7 gap-1">
        {Array.from({ length: first }).map((_, i) => <span key={`e${i}`} />)}
        {Array.from({ length: total }, (_, i) => i + 1).map((d) => {
          const n = byDay(d).length;
          return (
            <button key={d} data-testid={`calendar-day-${d}`} onClick={() => setSel(d)}
              className={`relative h-10 rounded-lg text-sm font-bold ${sel === d ? "bg-[#0F172A] text-white" : n ? "bg-blue-50 text-[#1E3A8A]" : "bg-[#F4F5F7]"}`}>
              {d}{n > 0 && <span className="absolute right-1 top-0.5 text-[9px] text-[#F59E0B]">{n}</span>}
            </button>
          );
        })}
      </div>
      {sel && (
        <div className="mt-3 space-y-1.5">
          {byDay(sel).length === 0 && <p className="text-xs text-slate-500">No jobs on this day</p>}
          {byDay(sel).map((j) => <div key={j.id} className="flex justify-between text-xs"><span>{j.slot_time} · {j.lines[0]?.name}</span><StatusBadge status={j.status} /></div>)}
        </div>
      )}
    </div>
  );
};

const ShiftPlanner = ({ initial }) => {
  const [s, setS] = useState(initial || { start: "09:00", end: "19:00", off_days: [] });
  const save = async () => {
    try { await papi.put("/partner/profile", { shift: s }); toast.success("Shift saved"); } catch (e) { toast.error(errMsg(e)); }
  };
  return (
    <div className="rounded-2xl bg-white p-4" data-testid="shift-planner">
      <p className="text-sm font-bold">Working hours & weekly off</p>
      <div className="mt-2 grid grid-cols-2 gap-2">
        <label className="text-xs font-semibold">Start<input data-testid="shift-start-input" type="time" value={s.start} onChange={(e) => setS({ ...s, start: e.target.value })} className="mt-1 h-11 w-full rounded-xl border-2 px-2" /></label>
        <label className="text-xs font-semibold">End<input data-testid="shift-end-input" type="time" value={s.end} onChange={(e) => setS({ ...s, end: e.target.value })} className="mt-1 h-11 w-full rounded-xl border-2 px-2" /></label>
      </div>
      <div className="mt-3 flex flex-wrap gap-1.5">
        {DAYS.map((d) => {
          const off = s.off_days.includes(d);
          return <button key={d} data-testid={`shift-off-${d}`} onClick={() => setS({ ...s, off_days: off ? s.off_days.filter((x) => x !== d) : [...s.off_days, d] })}
            className={`rounded-full border-2 px-3 py-1.5 text-xs font-bold ${off ? "border-[#EF4444] bg-red-50 text-[#EF4444]" : "border-slate-200"}`}>{d}{off ? " · Off" : ""}</button>;
        })}
      </div>
      <Button data-testid="shift-save-btn" onClick={save} className="mt-3 h-12 w-full bg-[#0F172A] font-bold">Save schedule</Button>
    </div>
  );
};

export default function PSchedule() {
  const [tab, setTab] = useState("upcoming");
  const [jobs, setJobs] = useState([]);
  const [me, setMe] = useState(null);
  useEffect(() => { papi.get("/partner/jobs", { params: { scope: tab } }).then((r) => setJobs(r.data)); }, [tab]);
  useEffect(() => { papi.get("/auth/me").then((r) => setMe(r.data)); }, []);
  return (
    <div className="space-y-4 p-4 pb-28">
      <h1 className="font-heading text-2xl font-bold">Schedule</h1>
      <Calendar />
      {me && <ShiftPlanner initial={me.shift} />}
      <div className="flex gap-2">
        {["upcoming", "history"].map((t) => <button key={t} data-testid={`jobs-tab-${t}`} onClick={() => setTab(t)} className={`rounded-full px-4 py-2 text-xs font-bold capitalize ${tab === t ? "bg-[#0F172A] text-white" : "bg-white"}`}>{t}</button>)}
      </div>
      <div className="space-y-2">
        {jobs.length === 0 && <Empty text="No jobs here" testid="jobs-empty" />}
        {jobs.slice(0, 30).map((j) => (
          <Link key={j.id} to={`/partner/job/${j.id}`} data-testid={`job-list-item-${j.id}`} className="block rounded-2xl bg-white p-3">
            <div className="flex justify-between"><span className="font-mono text-xs font-bold">{j.booking_no}</span><StatusBadge status={j.status} /></div>
            <p className="mt-1 text-sm font-bold">{j.lines.map((l) => l.name).join(", ")}</p>
            <p className="text-xs text-slate-500">{j.slot_date} · {j.slot_time} · {inr(j.partner_earning ?? j.pricing.taxable * 0.82)}</p>
          </Link>
        ))}
      </div>
    </div>
  );
}
