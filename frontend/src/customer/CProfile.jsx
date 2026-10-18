import { useEffect, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Mic, Square, Trash2, LocateFixed, LogOut, Camera } from "lucide-react";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { capi, errMsg, fileToDataUrl, getGPS, session } from "@/lib/api";
import { useCust } from "./CustomerApp";

const AudioRecorder = ({ value, onChange }) => {
  const [rec, setRec] = useState(null);
  const start = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mr = new MediaRecorder(stream);
      const chunks = [];
      mr.ondataavailable = (e) => chunks.push(e.data);
      mr.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop());
        onChange(await fileToDataUrl(new Blob(chunks, { type: "audio/webm" })));
      };
      mr.start();
      setRec(mr);
      setTimeout(() => mr.state === "recording" && mr.stop(), 20000);
    } catch (e) { toast.error("Microphone permission denied"); }
  };
  const stop = () => { rec?.stop(); setRec(null); };
  return (
    <div className="rounded-xl border border-dashed p-3">
      <p className="text-xs font-semibold text-slate-600">Audio landmark note for technician (max 20s)</p>
      <div className="mt-2 flex items-center gap-2">
        {rec ? (
          <Button type="button" data-testid="audio-stop-btn" size="sm" onClick={stop} className="bg-[#EF4444]"><Square className="mr-1 h-3.5 w-3.5" /> Stop</Button>
        ) : (
          <Button type="button" data-testid="audio-record-btn" size="sm" variant="outline" onClick={start}><Mic className="mr-1 h-3.5 w-3.5" /> Record</Button>
        )}
        {value && <audio controls src={value} className="h-8 flex-1" />}
        {value && <button type="button" onClick={() => onChange(null)}><Trash2 className="h-4 w-4 text-slate-400" /></button>}
      </div>
    </div>
  );
};

const AddressDialog = ({ open, onOpenChange, initial, onSaved }) => {
  const [f, setF] = useState({ label: "Home", line: "", pincode: "", landmark: "", audio_note: null, location: null });
  useEffect(() => { if (open) setF((x) => ({ ...x, ...initial })); }, [open, initial]);
  const gps = async () => {
    try {
      const pos = await getGPS();
      const { data } = await capi.get("/locate", { params: pos });
      setF((x) => ({ ...x, location: pos, pincode: data.pincode || x.pincode }));
      toast.success(`Detected near ${data.city}`);
    } catch (e) { toast.error(e.message); }
  };
  const save = async () => {
    try {
      const { data } = await capi.post("/customer/addresses", f);
      if (!data.serviceable) toast.warning("Saved, but this pincode isn't serviceable yet");
      else toast.success("Address saved");
      onSaved(data);
      onOpenChange(false);
    } catch (e) { toast.error(errMsg(e)); }
  };
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm" data-testid="address-dialog">
        <DialogHeader><DialogTitle>Add address</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div className="flex gap-2">
            {["Home", "Office", "Other"].map((l) => (
              <button key={l} data-testid={`address-label-${l.toLowerCase()}`} onClick={() => setF({ ...f, label: l })}
                className={`rounded-full border px-4 py-1.5 text-xs font-bold ${f.label === l ? "border-[#1E3A8A] bg-[#1E3A8A] text-white" : ""}`}>{l}</button>
            ))}
          </div>
          <Button data-testid="address-gps-btn" variant="outline" className="w-full" onClick={gps}><LocateFixed className="mr-2 h-4 w-4" /> Detect via GPS</Button>
          <Input data-testid="address-line-input" placeholder="House / flat, street, area" value={f.line} onChange={(e) => setF({ ...f, line: e.target.value })} />
          <Input data-testid="address-pincode-input" placeholder="Pincode (e.g. 226001)" maxLength={6} value={f.pincode} onChange={(e) => setF({ ...f, pincode: e.target.value.replace(/\D/g, "") })} />
          <Input data-testid="address-landmark-input" placeholder="Landmark" value={f.landmark} onChange={(e) => setF({ ...f, landmark: e.target.value })} />
          <AudioRecorder value={f.audio_note} onChange={(v) => setF({ ...f, audio_note: v })} />
          <Button data-testid="address-save-btn" disabled={!f.line || f.pincode.length !== 6} onClick={save} className="w-full bg-[#1E3A8A]">Save address</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default function CProfile() {
  const { user, setSess, logout, setAddress } = useCust();
  const [sp] = useSearchParams();
  const [p, setP] = useState(user || {});
  const [addrs, setAddrs] = useState([]);
  const [open, setOpen] = useState(sp.get("addAddress") === "1");
  const fileRef = useRef();
  const initial = sp.get("lat") ? { pincode: sp.get("pincode") || "", location: { lat: +sp.get("lat"), lng: +sp.get("lng") } } : { pincode: sp.get("pincode") || "" };
  const loadAddrs = () => capi.get("/customer/addresses").then((r) => setAddrs(r.data));
  useEffect(() => {
    capi.get("/auth/me").then((r) => setP(r.data));
    loadAddrs();
  }, []);
  const save = async (patch) => {
    try {
      const { data } = await capi.put("/auth/me", patch);
      setP(data);
      const s = session.get("customer");
      session.set("customer", { ...s, user: data });
      setSess({ ...s, user: data });
      toast.success("Profile updated");
    } catch (e) { toast.error(errMsg(e)); }
  };
  const del = async (id) => { await capi.delete(`/customer/addresses/${id}`); loadAddrs(); };
  return (
    <div className="space-y-4 p-4 pb-24">
      {sp.get("onboard") && <p className="rounded-xl bg-amber-50 p-3 text-sm text-amber-800">Welcome! Add your name and an address to get started.</p>}
      <div className="flex items-center gap-4">
        <button data-testid="profile-avatar-btn" onClick={() => fileRef.current.click()} className="relative h-16 w-16 overflow-hidden rounded-full bg-[#1E3A8A] text-xl font-bold text-white">
          {p.avatar ? <img src={p.avatar} alt="" className="h-full w-full object-cover" /> : (p.name || "U")[0]}
          <span className="absolute bottom-0 right-0 grid h-5 w-5 place-items-center rounded-full bg-[#F59E0B]"><Camera className="h-3 w-3 text-slate-900" /></span>
        </button>
        <input ref={fileRef} type="file" accept="image/*" hidden onChange={async (e) => e.target.files[0] && save({ avatar: await fileToDataUrl(e.target.files[0]) })} />
        <div><p className="font-heading text-xl font-bold">{p.name || "Your name"}</p><p className="text-sm text-slate-500">+91 {p.phone}</p></div>
      </div>
      <div className="space-y-2 rounded-2xl border bg-white p-4">
        <Input data-testid="profile-name-input" placeholder="Full name" value={p.name || ""} onChange={(e) => setP({ ...p, name: e.target.value })} />
        <Input data-testid="profile-email-input" placeholder="Email" value={p.email || ""} onChange={(e) => setP({ ...p, email: e.target.value })} />
        <select data-testid="profile-language-select" value={p.language || "en"} onChange={(e) => setP({ ...p, language: e.target.value })} className="h-10 w-full rounded-md border px-3">
          <option value="en">English</option><option value="hi">हिंदी (Hindi)</option><option value="ta">தமிழ் (Tamil)</option><option value="bn">বাংলা (Bengali)</option>
        </select>
        <Button data-testid="profile-save-btn" onClick={() => save({ name: p.name, email: p.email, language: p.language })} className="w-full bg-[#1E3A8A]">Save profile</Button>
      </div>
      <div className="rounded-2xl border bg-white p-4">
        <p className="text-sm font-bold">Notifications</p>
        {["push", "sms", "offers"].map((k) => (
          <div key={k} className="mt-2 flex items-center justify-between text-sm capitalize">
            {k === "offers" ? "Offers & promotions" : `${k} alerts`}
            <Switch data-testid={`profile-notif-${k}`} checked={!!p.notifications?.[k]} onCheckedChange={(v) => save({ notifications: { ...p.notifications, [k]: v } })} />
          </div>
        ))}
      </div>
      <div className="rounded-2xl border bg-white p-4">
        <div className="flex items-center justify-between"><p className="text-sm font-bold">Saved addresses</p>
          <button data-testid="profile-add-address-btn" onClick={() => setOpen(true)} className="text-sm font-bold text-[#1E3A8A]">+ Add</button></div>
        {addrs.map((a) => (
          <div key={a.id} className="mt-3 flex items-start gap-3 rounded-xl bg-slate-50 p-3" data-testid={`profile-address-${a.id}`}>
            <span className="rounded-md bg-[#1E3A8A] px-2 py-0.5 text-[10px] font-bold uppercase text-white">{a.label}</span>
            <div className="min-w-0 flex-1">
              <p className="text-sm">{a.line}</p>
              <p className="text-xs text-slate-500">{a.pincode} · {a.city}{a.landmark ? ` · ${a.landmark}` : ""}</p>
              {a.audio_note && <audio controls src={a.audio_note} className="mt-1 h-8 w-full" />}
              <button onClick={() => setAddress(a)} className="mt-1 text-xs font-semibold text-[#1E3A8A]">Use for booking</button>
            </div>
            <button data-testid={`profile-address-delete-${a.id}`} onClick={() => del(a.id)}><Trash2 className="h-4 w-4 text-slate-400" /></button>
          </div>
        ))}
      </div>
      <Button data-testid="customer-logout-btn" variant="outline" onClick={logout} className="w-full border-[#EF4444] text-[#EF4444]"><LogOut className="mr-2 h-4 w-4" /> Logout</Button>
      <AddressDialog open={open} onOpenChange={setOpen} initial={initial} onSaved={(a) => { loadAddrs(); setAddress(a); }} />
    </div>
  );
}
