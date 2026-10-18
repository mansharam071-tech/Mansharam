import axios from "axios";
import { useEffect, useRef } from "react";
import { getLocale } from "@/lib/i18n";

const BASE = `${process.env.REACT_APP_BACKEND_URL}/api`;
const LOGIN = { customer: "/app/login", partner: "/partner/login", admin: "/admin/login" };

export const session = {
  get: (role) => JSON.parse(localStorage.getItem(`hs_${role}`) || "null"),
  set: (role, v) => localStorage.setItem(`hs_${role}`, JSON.stringify(v)),
  clear: (role) => localStorage.removeItem(`hs_${role}`),
};

export const makeApi = (role) => {
  const inst = axios.create({ baseURL: BASE });
  inst.interceptors.request.use((c) => {
    const s = session.get(role);
    if (s?.token) c.headers.Authorization = `Bearer ${s.token}`;
    return c;
  });
  inst.interceptors.response.use(
    (r) => r,
    (e) => {
      if (e.response?.status === 401 && session.get(role)) {
        session.clear(role);
        window.location.href = LOGIN[role];
      }
      return Promise.reject(e);
    }
  );
  return inst;
};

export const capi = makeApi("customer");
export const papi = makeApi("partner");
export const aapi = makeApi("admin");

export const errMsg = (e) => {
  const d = e?.response?.data?.detail;
  if (d == null) return e?.message || "Something went wrong";
  if (typeof d === "string") return d;
  if (Array.isArray(d)) return d.map((x) => x?.msg || JSON.stringify(x)).join(" ");
  return d.msg || String(d);
};

export const inr = (n) => (Number(n) < 0 ? "-₹" : "₹") + Math.abs(Number(n || 0)).toLocaleString("en-IN", { maximumFractionDigits: 2 });
export const fmtDT = (s) =>
  s ? new Date(s).toLocaleString(getLocale(), { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }) : "-";
export const fmtDate = (s) => (s ? new Date(`${s}T00:00:00`).toLocaleDateString(getLocale(), { day: "numeric", month: "short", year: "numeric" }) : "-");

export const STATUS = {
  payment_pending: { label: "Payment Pending", cls: "bg-orange-100 text-orange-800 border-orange-200" },
  pending: { label: "Pending", cls: "bg-yellow-100 text-yellow-800 border-yellow-200" },
  assigned: { label: "Assigned", cls: "bg-blue-100 text-blue-800 border-blue-200" },
  en_route: { label: "En Route", cls: "bg-indigo-100 text-indigo-800 border-indigo-200" },
  in_progress: { label: "In Progress", cls: "bg-amber-100 text-amber-800 border-amber-200" },
  completed: { label: "Completed", cls: "bg-green-100 text-green-800 border-green-200" },
  cancelled: { label: "Cancelled", cls: "bg-red-100 text-red-700 border-red-200" },
};

export const usePoll = (fn, ms, deps = []) => {
  const ref = useRef(fn);
  ref.current = fn;
  useEffect(() => {
    ref.current();
    const t = setInterval(() => ref.current(), ms);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
};

export const fileToDataUrl = (file) =>
  new Promise((res, rej) => {
    const r = new FileReader();
    r.onload = () => res(r.result);
    r.onerror = rej;
    r.readAsDataURL(file);
  });

export const getGPS = () =>
  new Promise((res, rej) => {
    if (!navigator.geolocation) return rej(new Error("GPS not supported"));
    navigator.geolocation.getCurrentPosition(
      (p) => res({ lat: p.coords.latitude, lng: p.coords.longitude }),
      () => rej(new Error("Location permission denied")),
      { timeout: 8000 }
    );
  });
