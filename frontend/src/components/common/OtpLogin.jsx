import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { errMsg, session } from "@/lib/api";
import axios from "axios";

const BASE = `${process.env.REACT_APP_BACKEND_URL}/api`;

export const OtpLogin = ({ role, title, subtitle, accent = "#1E3A8A", onDone, hint }) => {
  const [phone, setPhone] = useState("");
  const [otp, setOtp] = useState("");
  const [step, setStep] = useState("phone");
  const [busy, setBusy] = useState(false);

  const send = async () => {
    setBusy(true);
    try {
      const { data } = await axios.post(`${BASE}/auth/otp/send`, { phone, role });
      toast.success(`OTP sent · ${data.message}`);
      setStep("otp");
    } catch (e) {
      toast.error(errMsg(e));
    }
    setBusy(false);
  };
  const verify = async () => {
    setBusy(true);
    try {
      const { data } = await axios.post(`${BASE}/auth/otp/verify`, { phone, otp, role });
      session.set(role, { token: data.token, user: data.user });
      onDone(data);
    } catch (e) {
      toast.error(errMsg(e));
    }
    setBusy(false);
  };

  return (
    <div className="flex h-full flex-col">
      <div className="relative overflow-hidden px-6 pb-10 pt-14 text-white" style={{ background: accent }}>
        <div className="absolute -right-10 -top-10 h-40 w-40 rounded-full bg-white/10" />
        <div className="absolute -bottom-16 right-16 h-32 w-32 rounded-full bg-[#F59E0B]/30" />
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-white/70">HomeServe</p>
        <h1 className="font-heading mt-3 text-3xl font-extrabold leading-tight">{title}</h1>
        <p className="mt-2 text-sm text-white/80">{subtitle}</p>
      </div>
      <div className="-mt-5 flex-1 rounded-t-3xl bg-white px-6 pt-8">
        {step === "phone" ? (
          <>
            <label className="text-sm font-semibold text-slate-800">Mobile number</label>
            <div className="mt-2 flex items-center gap-2 rounded-xl border border-slate-300 px-3 focus-within:border-[#1E3A8A]">
              <span className="text-[15px] font-semibold text-slate-600">+91</span>
              <input
                data-testid={`${role}-login-phone-input`}
                className="h-12 flex-1 bg-transparent text-[15px] outline-none"
                inputMode="numeric"
                maxLength={10}
                placeholder="98XXXXXXXX"
                value={phone}
                onChange={(e) => setPhone(e.target.value.replace(/\D/g, ""))}
              />
            </div>
            <Button data-testid={`${role}-login-send-otp-btn`} disabled={phone.length !== 10 || busy} onClick={send}
              className="mt-6 h-12 w-full rounded-xl bg-[#F59E0B] text-[15px] font-bold text-slate-900 hover:bg-[#D97706]">
              Get OTP
            </Button>
          </>
        ) : (
          <>
            <label className="text-sm font-semibold text-slate-800">Enter 4-digit OTP sent to +91 {phone}</label>
            <Input data-testid={`${role}-login-otp-input`} className="mt-2 h-12 text-center text-xl tracking-[0.6em]" maxLength={4}
              inputMode="numeric" value={otp} onChange={(e) => setOtp(e.target.value.replace(/\D/g, ""))} />
            <p className="mt-2 text-xs text-slate-500">Demo mode — use OTP <b>1234</b></p>
            <Button data-testid={`${role}-login-verify-btn`} disabled={otp.length !== 4 || busy} onClick={verify}
              className="mt-6 h-12 w-full rounded-xl text-[15px] font-bold" style={{ background: accent }}>
              Verify & Continue
            </Button>
            <button data-testid={`${role}-login-change-number`} className="mt-4 w-full text-sm font-medium text-[#1E3A8A]" onClick={() => setStep("phone")}>
              Change number
            </button>
          </>
        )}
        {hint && <p className="mt-8 rounded-xl bg-slate-50 p-3 text-xs text-slate-500">{hint}</p>}
      </div>
    </div>
  );
};
