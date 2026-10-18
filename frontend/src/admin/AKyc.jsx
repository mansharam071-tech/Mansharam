import { useEffect, useState } from "react";
import { FileImage } from "lucide-react";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { aapi, errMsg, fmtDT } from "@/lib/api";
import { Empty } from "@/components/common/Shared";

const DOCS = { aadhaar: "Aadhaar", pan: "PAN", dl: "Driving Licence", police: "Police Verification" };
const CLS = { approved: "bg-green-100 text-green-700", pending: "bg-yellow-100 text-yellow-800", rejected: "bg-red-100 text-red-700", resubmit: "bg-amber-100 text-amber-800" };

const DocRow = ({ p, type, doc, reload }) => {
  const [note, setNote] = useState("");
  const [file, setFile] = useState(undefined);
  const act = async (action) => {
    try { await aapi.post(`/admin/kyc/${p.id}/${type}`, { action, note }); toast.success(`${DOCS[type]} ${action}d`); reload(); } catch (e) { toast.error(errMsg(e)); }
  };
  const view = async () => setFile((await aapi.get(`/admin/kyc/${p.id}/${type}/file`)).data.file);
  return (
    <div className="flex items-center gap-3 rounded-xl border p-3" data-testid={`kyc-row-${p.id}-${type}`}>
      <div className="w-44">
        <p className="text-sm font-semibold">{DOCS[type]}</p>
        <p className="font-mono text-xs text-slate-500">{doc.number || "—"}{doc.expiry_date ? ` · exp ${doc.expiry_date}` : ""}</p>
      </div>
      <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase ${CLS[doc.status]}`}>{doc.status}</span>
      <button data-testid={`kyc-view-${p.id}-${type}`} onClick={view} className="flex items-center gap-1 text-xs font-semibold text-[#1E3A8A]"><FileImage className="h-4 w-4" />View</button>
      <Input data-testid={`kyc-note-${p.id}-${type}`} className="h-8 flex-1" placeholder="Note to partner (optional)" value={note} onChange={(e) => setNote(e.target.value)} />
      <button data-testid={`kyc-approve-${p.id}-${type}`} onClick={() => act("approve")} className="rounded-lg bg-[#22C55E] px-3 py-1.5 text-xs font-bold text-white">Accept</button>
      <button data-testid={`kyc-reject-${p.id}-${type}`} onClick={() => act("reject")} className="rounded-lg bg-[#EF4444] px-3 py-1.5 text-xs font-bold text-white">Reject</button>
      <button data-testid={`kyc-resubmit-${p.id}-${type}`} onClick={() => act("resubmit")} className="rounded-lg border border-[#F59E0B] px-3 py-1.5 text-xs font-bold text-amber-700">Resubmit</button>
      <Dialog open={file !== undefined} onOpenChange={() => setFile(undefined)}>
        <DialogContent className="max-w-xl" data-testid="kyc-file-dialog">
          <DialogHeader><DialogTitle>{p.name} · {DOCS[type]}</DialogTitle></DialogHeader>
          {file ? (file.startsWith("data:application/pdf") ? <iframe title="doc" src={file} className="h-[60vh] w-full" /> : <img src={file} alt="document" className="max-h-[60vh] w-full object-contain" />)
            : <p className="p-6 text-center text-sm text-slate-500">No file uploaded for this document (seeded demo record).</p>}
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default function AKyc() {
  const [list, setList] = useState([]);
  const load = () => aapi.get("/admin/kyc").then((r) => setList(r.data));
  useEffect(() => { load(); }, []);
  return (
    <div className="space-y-4">
      <p className="text-sm text-slate-500">Partners with documents awaiting verification. Approving all 4 documents activates the partner.</p>
      {list.length === 0 && <Empty text="KYC queue is clear" testid="kyc-empty" />}
      {list.map((p) => (
        <div key={p.id} className="rounded-2xl border bg-white p-5" data-testid={`kyc-partner-${p.id}`}>
          <div className="flex items-center justify-between">
            <div><p className="text-[18px] font-semibold">{p.name || "New partner"}</p><p className="text-xs text-slate-500">+91 {p.phone} · joined {fmtDT(p.created_at)} · skills {p.skills?.length || 0}</p></div>
            <span className={`rounded-full px-3 py-1 text-xs font-bold uppercase ${CLS[p.kyc_status] || "bg-slate-100"}`}>{p.kyc_status}</span>
          </div>
          <div className="mt-3 space-y-2">
            {Object.entries(p.documents || {}).map(([t, d]) => <DocRow key={t} p={p} type={t} doc={d} reload={load} />)}
            {!Object.keys(p.documents || {}).length && <p className="text-sm text-slate-400">No documents uploaded yet</p>}
          </div>
        </div>
      ))}
    </div>
  );
}
