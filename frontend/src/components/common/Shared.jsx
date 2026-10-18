import { AirVent, Sparkles, Zap, Wrench, Scissors, PaintRoller, Bug, WashingMachine, Home } from "lucide-react";
import { STATUS } from "@/lib/api";

const ICONS = { AirVent, Sparkles, Zap, Wrench, Scissors, PaintRoller, Bug, WashingMachine };
export const CatIcon = ({ name, className }) => {
  const I = ICONS[name] || Home;
  return <I className={className} />;
};

export const StatusBadge = ({ status, testid }) => {
  const s = STATUS[status] || { label: status, cls: "bg-slate-100 text-slate-700" };
  return (
    <span data-testid={testid} className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-[11px] font-semibold uppercase tracking-wide ${s.cls}`}>
      {s.label}
    </span>
  );
};

export const PhoneFrame = ({ children, tone = "light", testid }) => (
  <div className="min-h-screen w-full bg-[#0F172A] md:flex md:items-center md:justify-center md:py-6 phone-bg">
    <div
      data-testid={testid}
      className={`relative mx-auto flex h-[100dvh] w-full flex-col overflow-hidden md:h-[860px] md:w-[412px] md:rounded-[2.4rem] md:border-[10px] md:border-slate-800 md:shadow-2xl ${tone === "partner" ? "bg-white" : "bg-[#F8FAFC]"}`}
    >
      {children}
    </div>
  </div>
);

export const Stepper = ({ steps, current, testid }) => (
  <div data-testid={testid} className="flex items-start">
    {steps.map((s, i) => {
      const done = i < current;
      const active = i === current;
      return (
        <div key={s} className="flex flex-1 flex-col items-center text-center">
          <div className="flex w-full items-center">
            <div className={`h-0.5 flex-1 ${i === 0 ? "opacity-0" : done || active ? "bg-[#22C55E]" : "bg-slate-200"}`} />
            <div
              className={`grid h-7 w-7 place-items-center rounded-full text-xs font-bold transition-colors duration-300 ${
                done ? "bg-[#22C55E] text-white" : active ? "bg-[#1E3A8A] text-white ring-4 ring-blue-100" : "bg-slate-200 text-slate-500"
              }`}
            >
              {done ? "✓" : i + 1}
            </div>
            <div className={`h-0.5 flex-1 ${i === steps.length - 1 ? "opacity-0" : done ? "bg-[#22C55E]" : "bg-slate-200"}`} />
          </div>
          <span className={`mt-1.5 text-[11px] font-medium leading-tight ${active ? "text-[#1E3A8A]" : "text-slate-500"}`}>{s}</span>
        </div>
      );
    })}
  </div>
);

export const Empty = ({ text, testid }) => (
  <div data-testid={testid} className="rounded-2xl border border-dashed border-slate-300 p-8 text-center text-sm text-slate-500">
    {text}
  </div>
);
