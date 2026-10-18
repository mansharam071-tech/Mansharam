import { useEffect, useState } from "react";
import { Upload, CheckCircle2, Clock, XCircle, RotateCcw, LogOut } from "lucide-react";
import { toast } from "sonner";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { papi, capi, errMsg, fileToDataUrl, session } from "@/lib/api";
import { usePartner } from "./PartnerApp";

const DOCS = [
  { type: "aadhaar", label: "Aadhaar Card", expiry: false },
  { type: "pan", label: "PAN Card", expiry: false },
  { type: "dl", label: "Driving Licence", expiry: true },
  { type: "police", label: "Police Verification", expiry: true },
];
const ST = {
  approved: { icon: CheckCircle2, cls: "text-[#22C55E]", label: "Approved" },
  pending: { icon: Clock, cls: "text-[#EAB308]", label: "Under review" },
  rejected: { icon: XCircle, cls: "text-[#EF4444]", label: "Rejected" },
  resubmit: { icon: RotateCcw, cls: "text-[#F59E0B]", label: "Resubmit" },
};

const DocCard = ({ d, doc, onSaved }) => {
  const [f, setF] = useState({ number: doc?.number || "", expiry_date: doc?.expiry_date || "", file: null });
  const st = ST[doc?.status];
  const expiring = doc?.expiry_date && (new Date(doc.expiry_date) - Date.now()) / 86400000 <= 30;
  const editable = doc?.status !== "approved" || expiring;
  const submit = async () => {
    try {
      const { data } = await papi.post("/partner/documents", { type: d.type, ...f, expiry_date: f.expiry_date || null });
      toast.success(`${d.label} submitted for verification`);
      onSaved(data);
    } catch (e) { toast.error(errMsg(e)); }
  };
  return (
    <div className="rounded-2xl bg-white p-4" data-testid={`kyc-doc-${d.type}`}>
      <div className="flex items-center justify-between">
        <p className="text-sm font-bold">{d.label}</p>
        {st ? <span className={`flex items-center gap-1 text-xs font-bold ${st.cls}`}><st.icon className="h-4 w-4" />{st.label}</span> : <span className="text-xs font-bold text-slate-400">Not uploaded</span>}
      </div>
      {doc?.note && <p className="mt-1 text-xs text-[#EF4444]">Admin note: {doc.note}</p>}
      {expiring && <p data-testid={`kyc-${d.type}-expiring`} className="mt-1 text-xs font-semibold text-[#EAB308]">Expires {doc.expiry_date} — upload the renewed document</p>}
      {editable && (
        <div className="mt-3 space-y-2">
          <Input data-testid={`kyc-${d.type}-number`} placeholder="Document number" value={f.number} onChange={(e) => setF({ ...f, number: e.target.value })} />
          {d.expiry && <Input data-testid={`kyc-${d.type}-expiry`} type="date" value={f.expiry_date} onChange={(e) => setF({ ...f, expiry_date: e.target.value })} />}
          <label className="flex h-11 cursor-pointer items-center justify-center gap-2 rounded-xl border-2 border-dashed text-sm font-semibold text-slate-600">
            <Upload className="h-4 w-4" /> {f.file ? "File attached ✓" : "Upload photo / PDF"}
            <input data-testid={`kyc-${d.type}-file`} type="file" accept="image/*,application/pdf" hidden onChange={async (e) => e.target.files[0] && setF({ ...f, file: await fileToDataUrl(e.target.files[0]) })} />
          </label>
          <Button data-testid={`kyc-${d.type}-submit`} disabled={!f.number || (d.expiry && !f.expiry_date)} onClick={submit} className="h-11 w-full bg-[#0F172A] font-bold">Submit</Button>
        </div>
      )}
      {doc?.status === "approved" && <p className="mt-1 text-xs text-slate-500">{doc.number}{doc.expiry_date ? ` · valid till ${doc.expiry_date}` : ""}</p>}
    </div>
  );
};

export default function PProfile() {
  const { logout, setSess } = usePartner();
  const [me, setMe] = useState(null);
  const [cats, setCats] = useState([]);
  const [svcs, setSvcs] = useState([]);
  const load = () => papi.get("/auth/me").then((r) => setMe(r.data));
  useEffect(() => {
    load();
    capi.get("/catalog/home").then((r) => setCats(r.data.categories));
    capi.get("/catalog/services").then((r) => setSvcs(r.data));
  }, []);
  if (!me) return <div className="p-6 text-sm">Loading…</div>;
  const save = async (patch, msg) => {
    try { const { data } = await papi.put("/partner/profile", patch); setMe(data); toast.success(msg); } catch (e) { toast.error(errMsg(e)); }
  };
  const setLang = async (language) => {
    try {
      const { data } = await papi.put("/auth/me", { language });
      setMe(data);
      const s = session.get("partner");
      session.set("partner", { ...s, user: data });
      setSess({ ...s, user: data });
    } catch (e) { toast.error(errMsg(e)); }
  };
  const toggle = (k, id) => setMe({ ...me, [k]: me[k]?.includes(id) ? me[k].filter((x) => x !== id) : [...(me[k] || []), id] });
  const bank = me.bank || {};
  return (
    <div className="space-y-4 p-4 pb-28">
      <h1 className="font-heading text-2xl font-bold">KYC & Profile</h1>
      <div className="rounded-2xl bg-white p-4">
        <Input data-testid="partner-name-input" placeholder="Full name" value={me.name || ""} onChange={(e) => setMe({ ...me, name: e.target.value })} />
        <Button data-testid="partner-name-save" onClick={() => save({ name: me.name }, "Name saved")} className="mt-2 h-11 w-full bg-[#0F172A]">Save name</Button>
        <p className="mt-2 text-xs text-slate-500">KYC status: <b data-testid="partner-kyc-status" className="uppercase">{me.kyc_status.replace("_", " ")}</b></p>
        <label className="mt-3 block text-xs font-semibold text-slate-600">Language</label>
        <select data-testid="partner-language-select" value={me.language || "en"} onChange={(e) => setLang(e.target.value)} className="mt-1 h-11 w-full rounded-xl border-2 bg-white px-3">
          <option value="en">English</option><option value="hi">हिंदी (Hindi)</option>
        </select>
      </div>
      <p className="font-heading text-lg font-bold">Document verification</p>
      {DOCS.map((d) => <DocCard key={d.type} d={d} doc={me.documents?.[d.type]} onSaved={load} />)}
      <div className="rounded-2xl bg-white p-4" data-testid="partner-skills-section">
        <p className="text-sm font-bold">Skills (categories)</p>
        <div className="mt-2 flex flex-wrap gap-1.5">
          {cats.map((c) => <button key={c.id} data-testid={`skill-${c.id}`} onClick={() => toggle("skills", c.id)} className={`rounded-full border-2 px-3 py-1.5 text-xs font-bold ${me.skills?.includes(c.id) ? "border-[#1E3A8A] bg-[#1E3A8A] text-white" : ""}`}>{c.name}</button>)}
        </div>
        <p className="mt-3 text-sm font-bold">Sub-categories</p>
        <div className="mt-2 flex flex-wrap gap-1.5">
          {svcs.filter((s) => me.skills?.includes(s.category_id)).map((s) => <button key={s.id} data-testid={`subskill-${s.id}`} onClick={() => toggle("sub_skills", s.id)} className={`rounded-full border px-2.5 py-1 text-[11px] font-semibold ${me.sub_skills?.includes(s.id) ? "border-[#F59E0B] bg-amber-50" : ""}`}>{s.name}</button>)}
        </div>
        <Button data-testid="partner-skills-save" onClick={() => save({ skills: me.skills, sub_skills: me.sub_skills }, "Skills saved")} className="mt-3 h-11 w-full bg-[#0F172A]">Save skills</Button>
      </div>
      <div className="space-y-2 rounded-2xl bg-white p-4" data-testid="partner-bank-section">
        <p className="text-sm font-bold">Bank account for payouts</p>
        {[["holder", "Account holder name"], ["account_no", "Account number"], ["ifsc", "IFSC code"], ["bank_name", "Bank name"]].map(([k, ph]) => (
          <Input key={k} data-testid={`bank-${k}`} placeholder={ph} value={bank[k] || ""} onChange={(e) => setMe({ ...me, bank: { ...bank, [k]: e.target.value } })} />
        ))}
        <Button data-testid="partner-bank-save" onClick={() => save({ bank }, "Bank details saved")} className="h-11 w-full bg-[#0F172A]">Save bank details</Button>
      </div>
      <Button data-testid="partner-logout-btn" variant="outline" onClick={logout} className="h-12 w-full border-2 border-[#EF4444] font-bold text-[#EF4444]"><LogOut className="mr-2 h-4 w-4" /> Logout</Button>
    </div>
  );
}
