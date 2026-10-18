import { createContext, useContext, useEffect, useState, useCallback } from "react";
import { Routes, Route, Navigate, NavLink, useNavigate, useLocation } from "react-router-dom";
import { Home, CalendarCheck, Wallet, LifeBuoy, User } from "lucide-react";
import { PhoneFrame } from "@/components/common/Shared";
import { OtpLogin } from "@/components/common/OtpLogin";
import { capi, session } from "@/lib/api";
import { useHindi } from "@/lib/i18n";
import CHome from "./CHome";
import CServices from "./CServices";
import CServiceDetail from "./CServiceDetail";
import CCheckout from "./CCheckout";
import CBookings from "./CBookings";
import CTracking from "./CTracking";
import CWallet from "./CWallet";
import CProfile from "./CProfile";
import CSupport from "./CSupport";

const Ctx = createContext(null);
export const useCust = () => useContext(Ctx);

const NAV = [
  { to: "/app", icon: Home, label: "Home", end: true },
  { to: "/app/bookings", icon: CalendarCheck, label: "Bookings" },
  { to: "/app/wallet", icon: Wallet, label: "Wallet" },
  { to: "/app/support", icon: LifeBuoy, label: "Help" },
  { to: "/app/profile", icon: User, label: "Profile" },
];

const BottomNav = () => (
  <nav className="grid grid-cols-5 border-t border-slate-200 bg-white px-1 pb-2 pt-1.5">
    {NAV.map((n) => (
      <NavLink key={n.to} to={n.to} end={n.end} data-testid={`customer-nav-${n.label.toLowerCase()}`}
        className={({ isActive }) => `flex flex-col items-center gap-0.5 rounded-lg py-1 text-[11px] font-semibold transition-colors ${isActive ? "text-[#1E3A8A]" : "text-slate-400"}`}>
        <n.icon className="h-5 w-5" />
        {n.label}
      </NavLink>
    ))}
  </nav>
);

export default function CustomerApp() {
  const [sess, setSess] = useState(session.get("customer"));
  const [cartCount, setCartCount] = useState(0);
  const [address, setAddress] = useState(null);
  const nav = useNavigate();
  const loc = useLocation();
  useHindi(sess?.user?.language);

  const refreshCart = useCallback(async () => {
    if (!session.get("customer")) return;
    const { data } = await capi.get("/customer/cart");
    setCartCount(data.items.reduce((a, i) => a + i.qty, 0));
    if (!address && data.address) setAddress(data.address);
  }, [address]);

  useEffect(() => {
    if (sess) refreshCart().catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sess]);

  const logout = () => {
    session.clear("customer");
    setSess(null);
    nav("/app/login");
  };

  if (!sess && loc.pathname !== "/app/login") return <Navigate to="/app/login" replace />;
  const hideNav = /\/app\/(login|service\/|checkout|booking\/)/.test(loc.pathname);

  return (
    <PhoneFrame testid="customer-app-frame">
      <Ctx.Provider value={{ user: sess?.user, setSess, cartCount, refreshCart, address, setAddress, logout }}>
        <div className="relative flex-1 overflow-y-auto no-scrollbar" id="cust-scroll">
          <Routes>
            <Route path="login" element={<OtpLogin role="customer" title="Home services, done right." subtitle="Verified professionals at your doorstep in 30 minutes."
              hint="New here? Any valid mobile number creates your account instantly."
              onDone={(d) => { setSess({ token: d.token, user: d.user }); nav(d.is_new ? "/app/profile?onboard=1" : "/app"); }} />} />
            <Route index element={<CHome />} />
            <Route path="services" element={<CServices />} />
            <Route path="service/:id" element={<CServiceDetail />} />
            <Route path="checkout" element={<CCheckout />} />
            <Route path="bookings" element={<CBookings />} />
            <Route path="booking/:id" element={<CTracking />} />
            <Route path="wallet" element={<CWallet />} />
            <Route path="profile" element={<CProfile />} />
            <Route path="support" element={<CSupport />} />
          </Routes>
        </div>
        {sess && !hideNav && <BottomNav />}
      </Ctx.Provider>
    </PhoneFrame>
  );
}
