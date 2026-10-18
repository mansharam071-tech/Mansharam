import { Link } from "react-router-dom";
import { Smartphone, HardHat, LayoutDashboard, ArrowUpRight, Database } from "lucide-react";

const MODS = [
  { to: "/app", icon: Smartphone, tag: "Module 01", title: "Customer App", desc: "Discover services, multi-category cart, live tracking, extra-charge approvals, wallet & GST invoices.", cred: "Mobile OTP login", tid: "portal-customer-link" },
  { to: "/partner", icon: HardHat, tag: "Module 02", title: "Partner App", desc: "KYC, shift planner, 15-sec job alerts, OTP-secured job flow, earnings & SOS.", cred: "Mobile OTP login · KYC onboarding", tid: "portal-partner-link" },
  { to: "/admin", icon: LayoutDashboard, tag: "Module 03", title: "Admin Console", desc: "KPIs, fraud alerts, geofencing, surge & coupons, live bookings, KYC, settlements.", cred: "Email + password (staff only)", tid: "portal-admin-link" },
];

export default function Portal() {
  return (
    <div className="min-h-screen bg-[#0F172A] text-white">
      <div className="mx-auto max-w-6xl px-6 py-14 lg:py-20">
        <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.25em] text-[#F59E0B]">
          <Database className="h-4 w-4" /> One database · One API · Three apps
        </div>
        <h1 className="font-heading mt-5 max-w-3xl text-4xl font-extrabold leading-[1.05] sm:text-5xl lg:text-6xl">
          HomeServe <span className="text-[#F59E0B]">ecosystem</span> for trusted at-home services.
        </h1>
        <p className="mt-5 max-w-xl text-base text-slate-400">
          Every booking flows live between the customer, the technician and operations. Open the modules side by side to watch it happen.
        </p>
        <div className="mt-14 grid gap-5 md:grid-cols-3">
          {MODS.map((m, i) => (
            <Link key={m.to} to={m.to} data-testid={m.tid}
              className="group relative overflow-hidden rounded-3xl border border-slate-800 bg-slate-900/60 p-7 transition-[transform,border-color] duration-300 hover:-translate-y-1 hover:border-[#F59E0B]"
              style={{ animation: `rise .6s ease ${i * 0.12}s both` }}>
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold uppercase tracking-widest text-slate-500">{m.tag}</span>
                <ArrowUpRight className="h-5 w-5 text-slate-600 transition-colors group-hover:text-[#F59E0B]" />
              </div>
              <m.icon className="mt-10 h-10 w-10 text-[#F59E0B]" />
              <h2 className="font-heading mt-4 text-2xl font-bold">{m.title}</h2>
              <p className="mt-2 text-sm leading-relaxed text-slate-400">{m.desc}</p>
              <p className="mt-6 rounded-lg bg-slate-800/80 px-3 py-2 font-mono text-[11px] text-slate-300">{m.cred}</p>
            </Link>
          ))}
        </div>
        <p className="mt-10 text-xs text-slate-500">Demo mode: OTP is fixed (1234), payments (UPI/Card) are simulated, calls are masked placeholders.</p>
      </div>
    </div>
  );
}
