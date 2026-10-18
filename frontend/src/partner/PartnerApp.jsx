import { createContext, useContext, useState } from "react";
import { Routes, Route, Navigate, NavLink, useNavigate, useLocation } from "react-router-dom";
import { Home, CalendarDays, IndianRupee, UserCog, Siren } from "lucide-react";
import { toast } from "sonner";
import { AlertDialog, AlertDialogContent, AlertDialogHeader, AlertDialogTitle, AlertDialogDescription, AlertDialogFooter, AlertDialogCancel } from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { PhoneFrame } from "@/components/common/Shared";
import { OtpLogin } from "@/components/common/OtpLogin";
import { papi, session, getGPS, errMsg } from "@/lib/api";
import { useHindi } from "@/lib/i18n";
import PDashboard from "./PDashboard";
import PJob from "./PJob";
import PEarnings from "./PEarnings";
import PSchedule from "./PSchedule";
import PProfile from "./PProfile";

const Ctx = createContext(null);
export const usePartner = () => useContext(Ctx);

const NAV = [
  { to: "/partner", icon: Home, label: "Home", end: true },
  { to: "/partner/schedule", icon: CalendarDays, label: "Schedule" },
  { to: "/partner/earnings", icon: IndianRupee, label: "Earnings" },
  { to: "/partner/profile", icon: UserCog, label: "KYC & Profile" },
];

const SOS = () => {
  const [open, setOpen] = useState(false);
  const fire = async () => {
    let location = null;
    try { location = await getGPS(); } catch (e) { /* fallback to last known */ }
    try {
      await papi.post("/partner/sos", { location });
      toast.error("SOS sent! Ops team & emergency contact alerted.");
    } catch (e) { toast.error(errMsg(e)); }
    setOpen(false);
  };
  return (
    <>
      <button data-testid="partner-sos-btn" onClick={() => setOpen(true)}
        className="sos-pulse absolute bottom-24 right-4 z-[600] grid h-14 w-14 place-items-center rounded-full bg-[#EF4444] text-white shadow-xl">
        <Siren className="h-6 w-6" />
      </button>
      <AlertDialog open={open} onOpenChange={setOpen}>
        <AlertDialogContent className="max-w-sm" data-testid="sos-confirm-dialog">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-[#EF4444]">Send emergency SOS?</AlertDialogTitle>
            <AlertDialogDescription>Your live location will be shared with the HomeServe safety team immediately.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="gap-2">
            <AlertDialogCancel data-testid="sos-cancel-btn">Cancel</AlertDialogCancel>
            <Button data-testid="sos-confirm-btn" className="bg-[#EF4444] hover:bg-red-600" onClick={fire}>Send SOS</Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
};

export default function PartnerApp() {
  const [sess, setSess] = useState(session.get("partner"));
  const nav = useNavigate();
  const loc = useLocation();
  useHindi(sess?.user?.language);
  const logout = () => { session.clear("partner"); setSess(null); nav("/partner/login"); };
  if (!sess && loc.pathname !== "/partner/login") return <Navigate to="/partner/login" replace />;
  const inJob = loc.pathname.startsWith("/partner/job/");
  return (
    <PhoneFrame tone="partner" testid="partner-app-frame">
      <Ctx.Provider value={{ user: sess?.user, setSess, logout }}>
        <div className="relative flex-1 overflow-y-auto bg-[#F4F5F7] no-scrollbar">
          <Routes>
            <Route path="login" element={<OtpLogin role="partner" accent="#0F172A" title="Earn more. Work your way." subtitle="Partner app for verified HomeServe professionals."
              hint="New partners start with KYC document verification before going online."
              onDone={(d) => { setSess({ token: d.token, user: d.user }); nav(d.user.kyc_status === "approved" ? "/partner" : "/partner/profile"); }} />} />
            <Route index element={<PDashboard />} />
            <Route path="job/:id" element={<PJob />} />
            <Route path="earnings" element={<PEarnings />} />
            <Route path="schedule" element={<PSchedule />} />
            <Route path="profile" element={<PProfile />} />
          </Routes>
        </div>
        {sess && <SOS />}
        {sess && !inJob && (
          <nav className="grid grid-cols-4 border-t-2 border-slate-200 bg-white pb-2 pt-1.5">
            {NAV.map((n) => (
              <NavLink key={n.to} to={n.to} end={n.end} data-testid={`partner-nav-${n.label.split(" ")[0].toLowerCase()}`}
                className={({ isActive }) => `flex flex-col items-center gap-0.5 py-1.5 text-[11px] font-bold ${isActive ? "text-[#0F172A]" : "text-slate-400"}`}>
                <n.icon className="h-6 w-6" />{n.label}
              </NavLink>
            ))}
          </nav>
        )}
      </Ctx.Provider>
    </PhoneFrame>
  );
}
