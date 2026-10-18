import { useState } from "react";
import { Link } from "react-router-dom";
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, PieChart, Pie, Cell, Legend } from "recharts";
import { CalendarCheck, Activity, IndianRupee, Users, AlertOctagon, TrendingUp, TrendingDown } from "lucide-react";
import { toast } from "sonner";
import { aapi, inr, usePoll, fmtDT, errMsg } from "@/lib/api";

const COLORS = ["#1E3A8A", "#F59E0B", "#22C55E", "#EF4444", "#0EA5E9", "#8B5CF6", "#EAB308", "#64748B"];

const Kpi = ({ icon: I, label, value, sub, tone, testid }) => (
  <div className="rise rounded-2xl border bg-white p-5" data-testid={testid}>
    <div className="flex items-center justify-between">
      <p className="text-sm font-medium text-slate-500">{label}</p>
      <span className="grid h-9 w-9 place-items-center rounded-xl" style={{ background: `${tone}1A`, color: tone }}><I className="h-5 w-5" /></span>
    </div>
    <p className="font-heading mt-3 text-3xl font-extrabold">{value}</p>
    <div className="mt-1 text-xs text-slate-500">{sub}</div>
  </div>
);

const Alerts = ({ alerts, reload }) => {
  const act = async (a) => {
    try {
      if (a.type === "sos") await aapi.post(`/admin/sos/${a.ref}/resolve`);
      else if (a.type === "cod_limit") await aapi.post(`/admin/partners/${a.ref}/settle-cod`);
      else if (a.type === "consecutive_rejections") await aapi.post(`/admin/partners/${a.ref}/reset-rejections`);
      toast.success("Action recorded");
      reload();
    } catch (e) { toast.error(errMsg(e)); }
  };
  const label = { sos: "Resolve", cod_limit: "Mark COD settled", consecutive_rejections: "Reset counter" };
  return (
    <div className="rounded-2xl border border-red-100 bg-white p-5" data-testid="fraud-alerts-widget">
      <p className="flex items-center gap-2 text-[18px] font-semibold"><AlertOctagon className="h-5 w-5 text-[#EF4444]" /> Fraud & quality red alerts <span className="rounded-full bg-red-100 px-2 text-xs font-bold text-[#EF4444]">{alerts.length}</span></p>
      <div className="mt-3 max-h-[340px] space-y-2 overflow-y-auto pr-1">
        {alerts.length === 0 && <p className="text-sm text-slate-400">No active alerts</p>}
        {alerts.map((a) => (
          <div key={a.id} data-testid={`alert-${a.type}-${a.ref}`} className={`flex items-start gap-3 rounded-xl border-l-4 p-3 ${a.severity === "medium" ? "border-[#EAB308] bg-yellow-50/60" : "border-[#EF4444] bg-red-50/60"}`}>
            <div className="flex-1">
              <p className="text-sm font-semibold">{a.title}</p>
              <p className="text-xs text-slate-500">{a.detail} · {fmtDT(a.at)}</p>
            </div>
            {label[a.type] && <button data-testid={`alert-action-${a.id}`} onClick={() => act(a)} className="shrink-0 rounded-lg border bg-white px-2 py-1 text-xs font-semibold hover:border-[#1E3A8A]">{label[a.type]}</button>}
          </div>
        ))}
      </div>
    </div>
  );
};

export default function ADashboard() {
  const [d, setD] = useState(null);
  const [range, setRange] = useState("daily");
  const load = () => aapi.get("/admin/dashboard").then((r) => setD(r.data)).catch(() => {});
  usePoll(load, 15000);
  if (!d) return <p className="text-sm text-slate-500">Loading dashboard…</p>;
  const k = d.kpis;
  const up = (k.bookings_change_pct ?? 0) >= 0;
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-4 gap-5">
        <Kpi testid="kpi-today-bookings" icon={CalendarCheck} tone="#1E3A8A" label="Today's bookings" value={k.today_bookings}
          sub={<span className={`flex items-center gap-1 font-semibold ${up ? "text-[#22C55E]" : "text-[#EF4444]"}`}>{up ? <TrendingUp className="h-3.5 w-3.5" /> : <TrendingDown className="h-3.5 w-3.5" />}{k.bookings_change_pct ?? "–"}% vs yesterday ({k.yesterday_bookings})</span>} />
        <Kpi testid="kpi-live-jobs" icon={Activity} tone="#F59E0B" label="Active live jobs" value={k.active_live_jobs} sub={`En route & in progress · ${k.assigned_jobs} assigned · ${k.pending_jobs} pending`} />
        <Kpi testid="kpi-today-revenue" icon={IndianRupee} tone="#22C55E" label="Today's gross revenue" value={inr(k.today_revenue)} sub={`Commission earned ${inr(k.today_commission)}`} />
        <Kpi testid="kpi-online-partners" icon={Users} tone="#0EA5E9" label="Active online partners" value={k.online_partners} sub={`of ${k.total_partners} verified partners`} />
      </div>
      <div className="grid grid-cols-3 gap-5">
        <div className="col-span-2 rounded-2xl border bg-white p-5">
          <div className="flex items-center justify-between">
            <p className="text-[18px] font-semibold">Revenue & booking trends</p>
            <div className="flex rounded-lg bg-slate-100 p-1">
              {["daily", "weekly"].map((r) => <button key={r} data-testid={`trend-range-${r}`} onClick={() => setRange(r)} className={`rounded-md px-3 py-1 text-xs font-semibold capitalize ${range === r ? "bg-white shadow-sm" : "text-slate-500"}`}>{r}</button>)}
            </div>
          </div>
          <div className="mt-4 h-72" data-testid="trend-line-chart">
            <ResponsiveContainer>
              <LineChart data={d[range]}>
                <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" />
                <XAxis dataKey="label" tick={{ fontSize: 11 }} />
                <YAxis yAxisId="l" tick={{ fontSize: 11 }} tickFormatter={(v) => `₹${(v / 1000).toFixed(0)}k`} />
                <YAxis yAxisId="r" orientation="right" tick={{ fontSize: 11 }} />
                <Tooltip formatter={(v, n) => (n === "Revenue" ? inr(v) : v)} />
                <Legend />
                <Line yAxisId="l" type="monotone" dataKey="revenue" name="Revenue" stroke="#1E3A8A" strokeWidth={3} dot={false} />
                <Line yAxisId="r" type="monotone" dataKey="bookings" name="Bookings" stroke="#F59E0B" strokeWidth={3} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
        <div className="rounded-2xl border bg-white p-5">
          <p className="text-[18px] font-semibold">Category revenue</p>
          <div className="mt-2 h-72" data-testid="category-pie-chart">
            <ResponsiveContainer>
              <PieChart>
                <Pie data={d.category_breakdown} dataKey="value" nameKey="name" innerRadius={55} outerRadius={90} paddingAngle={2}>
                  {d.category_breakdown.map((c, i) => <Cell key={c.name} fill={COLORS[i % COLORS.length]} />)}
                </Pie>
                <Tooltip formatter={(v) => inr(v)} />
                <Legend wrapperStyle={{ fontSize: 11 }} />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>
      <div className="grid grid-cols-3 gap-5">
        <div className="col-span-2"><Alerts alerts={d.alerts} reload={load} /></div>
        <div className="rounded-2xl border bg-white p-5">
          <p className="text-[18px] font-semibold">Quick actions</p>
          <div className="mt-3 space-y-2 text-sm">
            <Link to="/admin/bookings?status=pending" className="block rounded-xl bg-yellow-50 p-3 font-semibold text-yellow-800">{k.pending_jobs} unassigned bookings → assign</Link>
            <Link to="/admin/kyc" className="block rounded-xl bg-blue-50 p-3 font-semibold text-[#1E3A8A]">Review KYC queue →</Link>
            <Link to="/admin/finance" className="block rounded-xl bg-green-50 p-3 font-semibold text-green-800">Generate weekly settlements →</Link>
          </div>
        </div>
      </div>
    </div>
  );
}
