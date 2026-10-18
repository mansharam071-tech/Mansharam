import { useEffect, useState } from "react";
import { Bot, Send } from "lucide-react";
import { toast } from "sonner";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { capi, errMsg, fmtDT } from "@/lib/api";

export default function CSupport() {
  const [msgs, setMsgs] = useState([{ from: "bot", text: "Hi! I'm the HomeServe assistant. Ask me about refunds, cancellation, invoices, coupons or your partner's location." }]);
  const [text, setText] = useState("");
  const [tickets, setTickets] = useState([]);
  const [suggest, setSuggest] = useState(false);
  const loadT = () => capi.get("/support/tickets").then((r) => setTickets(r.data));
  useEffect(() => { loadT(); }, []);
  const ask = async () => {
    if (!text.trim()) return;
    const q = text;
    setMsgs((m) => [...m, { from: "me", text: q }]);
    setText("");
    const { data } = await capi.post("/support/chatbot", { text: q });
    setMsgs((m) => [...m, { from: "bot", text: data.reply }]);
    setSuggest(data.suggest_ticket);
  };
  const raise = async () => {
    try {
      const last = [...msgs].reverse().find((m) => m.from === "me")?.text || "Need help";
      const { data } = await capi.post("/support/tickets", { subject: last.slice(0, 60), message: last });
      toast.success(`Ticket ${data.ticket_no} created`);
      setSuggest(false);
      loadT();
    } catch (e) { toast.error(errMsg(e)); }
  };
  return (
    <div className="space-y-4 p-4 pb-24">
      <h1 className="font-heading text-2xl font-bold">Help & Support</h1>
      <div className="rounded-2xl border bg-white">
        <div className="flex items-center gap-2 border-b px-4 py-3 text-sm font-bold"><Bot className="h-5 w-5 text-[#1E3A8A]" /> Live chatbot</div>
        <div className="flex h-64 flex-col gap-2 overflow-y-auto p-3" data-testid="chatbot-messages">
          {msgs.map((m, i) => (
            <div key={i} className={`max-w-[85%] rounded-2xl px-3 py-2 text-sm ${m.from === "me" ? "self-end bg-[#1E3A8A] text-white" : "self-start bg-slate-100"}`}>{m.text}</div>
          ))}
          {suggest && <Button data-testid="chatbot-raise-ticket-btn" size="sm" onClick={raise} className="self-start bg-[#F59E0B] text-slate-900 hover:bg-[#D97706]">Raise support ticket</Button>}
        </div>
        <div className="flex gap-2 border-t p-3">
          <Input data-testid="chatbot-input" value={text} onChange={(e) => setText(e.target.value)} onKeyDown={(e) => e.key === "Enter" && ask()} placeholder="Type your question" />
          <Button data-testid="chatbot-send-btn" onClick={ask} className="bg-[#1E3A8A]"><Send className="h-4 w-4" /></Button>
        </div>
      </div>
      <div>
        <h2 className="font-heading text-lg font-semibold">My tickets</h2>
        {tickets.length === 0 && <p className="mt-2 text-sm text-slate-500">No tickets yet</p>}
        {tickets.map((t) => (
          <div key={t.id} className="mt-2 rounded-xl border bg-white p-3" data-testid={`ticket-${t.id}`}>
            <div className="flex justify-between text-xs"><span className="font-mono font-bold">{t.ticket_no}</span><span className="font-semibold uppercase text-[#EAB308]">{t.status}</span></div>
            <p className="mt-1 text-sm font-semibold">{t.subject}</p>
            <p className="text-[11px] text-slate-400">{fmtDT(t.created_at)} · {t.messages.length} message(s)</p>
          </div>
        ))}
      </div>
    </div>
  );
}
