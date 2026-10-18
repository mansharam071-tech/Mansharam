import { useEffect, useState } from "react";
import { Routes, Route, Navigate, NavLink, useNavigate, useLocation } from "react-router-dom";
import { LayoutDashboard, ListChecks, Map, Percent, ShieldCheck, Users, Wallet, Bell, Search, LogOut, Siren } from "lucide-react";
import { toast } from "sonner";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import axios from "axios";
import { aapi, errMsg, session, usePoll, fmtDT } from "@/lib/api";
import ADashboard from "./ADashboard";
import ABookings from "./ABookings";
import ACities from "./ACities";
import APricing from "./APricing";
import AKyc from "./AKyc";
import APartners from "./APartners";
import AFinance from "./AFinance";

const NAV = [
  { to: "/admin", icon: LayoutDashboard, label: "Dashboard", end: true },
  { to: "/admin/bookings", icon: ListChecks, label: "Live Bookings" },
  { to: "/admin/cities", icon: Map, label: "Geofencing & Cities" },
  { to: "/admin/pricing", icon: Percent, label: "Surge & Promos" },
  { to: "/admin/kyc", icon: ShieldCheck, label: "KYC Queue" },
  { to: "/admin/partners", icon: Users, label: "Partners & SOS" },
  { to: "/admin/finance", icon: Wallet, label: "Financials" },
];

const Login = ({ onDone }) => {
  const [f, setF] = useState({ email: "", password: "" });
  const submit = async (e) => {
    e.preventDefault();
    try {
      const { data } = await axios.post(`${process.env.REACT_APP_BACKEND_URL}/api/auth/admin/login`, f);
      session.set("admin", data);
      onDone(data);
    } catch (er) { toast.error(errMsg(er)); }
  };
  return (
    <div className="grid min-h-screen place-items-center bg-[#0F172A] phone-bg p-6">
      <form onSubmit={submit} className="w-full max-w-sm rounded-3xl bg-white p-8 shadow-2xl" data-testid="admin-login-form">
        <p className="text-xs font-bold uppercase tracking-[0.25em] text-[#F59E0B]">HomeServe Ops</p>
        <h1 className="font-heading mt-2 text-3xl font-extrabold">Admin console</h1>
        <Input data-testid="admin-login-email" className="mt-6 h-11" placeholder="Email" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} />
        <Input data-testid="admin-login-password" className="mt-3 h-11" type="password" placeholder="Password" value={f.password} onChange={(e) => setF({ ...f, password: e.target.value })} />
        <Button data-testid="admin-login-submit" type="submit" className="mt-5 h-11 w-full bg-[#1E3A8A] font-bold">Sign in</Button>
      </form>
    </div>
  );
};

const GlobalSearch = () => {
  const [q, setQ] = useState("");
  const [r, setR] = useState(null);
  const nav = useNavigate();
  useEffect(() => {
    if (q.length < 2) { setR(null); return; }
    const t = setTimeout(() => aapi.get("/admin/search", { params: { q } }).then((x) => setR(x.data)), 300);
    return () => clearTimeout(t);
  }, [q]);
  const go = (path) => { setQ(""); nav(path); };
  return (
    <div className="relative w-96" onBlur={() => setTimeout(() => setR(null), 200)}>
      <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
      <Input data-testid="admin-global-search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search booking ID, phone, partner, city…" className="pl-9" />
      {r && (
        <div className="absolute z-50 mt-1 w-full rounded-xl border bg-white p-2 text-sm shadow-lg" data-testid="admin-search-results">
          {[...r.bookings.map((b) => ({ k: b.id, t: `Booking ${b.booking_no}`, s: b.status, p: `/admin/bookings?q=${b.booking_no}` })),
            ...r.users.map((u) => ({ k: u.id, t: `${u.name} (${u.phone})`, s: u.role, p: u.role === "partner" ? "/admin/partners" : `/admin/bookings?q=${u.phone}` })),
            ...r.cities.map((c) => ({ k: c.id, t: c.city_name, s: "city", p: "/admin/cities" }))].map((x) => (
            <button key={x.k} onClick={() => go(x.p)} className="flex w-full justify-between rounded-lg px-2 py-1.5 text-left hover:bg-slate-50"><span>{x.t}</span><span className="text-xs uppercase text-slate-400">{x.s}</span></button>
          ))}
          {!r.bookings.length && !r.users.length && !r.cities.length && <p className="p-2 text-slate-400">No results</p>}
        </div>
      )}
    </div>
  );
};

const Notifications = () => {
  const [alerts, setAlerts] = useState([]);
  usePoll(() => aapi.get("/admin/alerts").then((r) => setAlerts(r.data)).catch(() => {}), 10000);
  const sos = alerts.filter((a) => a.type === "sos").length;
  return (
    <Popover>
      <PopoverTrigger data-testid="admin-notifications-btn" className="relative grid h-10 w-10 place-items-center rounded-xl border bg-white">
        {sos ? <Siren className="h-5 w-5 text-[#EF4444]" /> : <Bell className="h-5 w-5" />}
        {alerts.length > 0 && <span data-testid="admin-notifications-count" className="absolute -right-1 -top-1 grid h-5 min-w-5 place-items-center rounded-full bg-[#EF4444] px-1 text-[10px] font-bold text-white">{alerts.length}</span>}
      </PopoverTrigger>
      <PopoverContent align="end" className="max-h-96 w-96 overflow-y-auto p-2">
        {alerts.map((a) => (
          <div key={a.id} className="rounded-lg p-2 hover:bg-slate-50">
            <p className={`text-sm font-semibold ${a.severity === "critical" || a.severity === "high" ? "text-[#EF4444]" : "text-[#EAB308]"}`}>{a.title}</p>
            <p className="text-xs text-slate-500">{a.detail} · {fmtDT(a.at)}</p>
          </div>
        ))}
        {!alerts.length && <p className="p-3 text-sm text-slate-400">All clear</p>}
      </PopoverContent>
    </Popover>
  );
};

export default function AdminApp() {
  const [sess, setSess] = useState(session.get("admin"));
  const nav = useNavigate();
  const loc = useLocation();
  if (loc.pathname === "/admin/login") return sess ? <Navigate to="/admin" replace /> : <Login onDone={(d) => { setSess(d); nav("/admin"); }} />;
  if (!sess) return <Navigate to="/admin/login" replace />;
  const logout = () => { session.clear("admin"); setSess(null); nav("/admin/login"); };
  const title = NAV.find((n) => (n.end ? loc.pathname === n.to : loc.pathname.startsWith(n.to)))?.label;
  return (
    <div className="min-h-screen bg-[#F8FAFC]">
      <aside className="fixed inset-y-0 left-0 z-40 flex w-[240px] flex-col bg-[#0F172A] text-slate-300" data-testid="admin-sidebar">
        <div className="px-6 py-6">
          <p className="font-heading text-2xl font-extrabold text-white">Home<span className="text-[#F59E0B]">Serve</span></p>
          <p className="text-[11px] font-semibold uppercase tracking-widest text-slate-500">Operations console</p>
        </div>
        <nav className="flex-1 space-y-1 px-3">
          {NAV.map((n) => (
            <NavLink key={n.to} to={n.to} end={n.end} data-testid={`admin-nav-${n.label.split(" ")[0].toLowerCase()}`}
              className={({ isActive }) => `flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors ${isActive ? "bg-[#1E3A8A] text-white" : "hover:bg-[#1E293B] hover:text-white"}`}>
              <n.icon className="h-4.5 w-4.5" />{n.label}
            </NavLink>
          ))}
        </nav>
        <p className="px-6 py-4 text-[11px] text-slate-500">Common API · v1.0</p>
      </aside>
      <div className="pl-[240px]">
        <header className="sticky top-0 z-30 flex h-16 items-center justify-between border-b bg-white/90 px-8 backdrop-blur-md">
          <h1 className="font-heading text-[18px] font-semibold" data-testid="admin-page-title">{title}</h1>
          <div className="flex items-center gap-3">
            <GlobalSearch />
            <Notifications />
            <DropdownMenu>
              <DropdownMenuTrigger data-testid="admin-profile-menu" className="flex items-center gap-2 rounded-xl border bg-white px-3 py-1.5 text-sm font-semibold">
                <span className="grid h-7 w-7 place-items-center rounded-full bg-[#F59E0B] text-xs font-bold text-slate-900">OA</span>{sess.user?.name}
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem disabled>{sess.user?.email}</DropdownMenuItem>
                <DropdownMenuItem data-testid="admin-logout-btn" onClick={logout}><LogOut className="mr-2 h-4 w-4" /> Logout</DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </header>
        <main className="p-8">
          <Routes>
            <Route index element={<ADashboard />} />
            <Route path="bookings" element={<ABookings />} />
            <Route path="cities" element={<ACities />} />
            <Route path="pricing" element={<APricing />} />
            <Route path="kyc" element={<AKyc />} />
            <Route path="partners" element={<APartners />} />
            <Route path="finance" element={<AFinance />} />
          </Routes>
        </main>
      </div>
    </div>
  );
}
