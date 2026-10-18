import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import { capi, fmtDT, fmtDate, inr } from "@/lib/api";
import { Empty, StatusBadge } from "@/components/common/Shared";
import { useCust } from "./CustomerApp";

export default function CBookings() {
  const [list, setList] = useState([]);
  const { refreshCart } = useCust();
  useEffect(() => { capi.get("/customer/bookings").then((r) => setList(r.data)); }, []);
  const rebook = async (id) => {
    await capi.post(`/customer/bookings/${id}/rebook`);
    await refreshCart();
    toast.success("Added to cart — open Home to checkout");
  };
  return (
    <div className="p-4 pb-24">
      <h1 className="font-heading text-2xl font-bold">My bookings</h1>
      <div className="mt-4 space-y-3">
        {list.length === 0 && <Empty text="No bookings yet" testid="bookings-empty" />}
        {list.map((b) => (
          <div key={b.id} className="rounded-2xl border bg-white p-4">
            <Link to={`/app/booking/${b.id}`} data-testid={`booking-item-${b.id}`} className="block">
              <div className="flex items-center justify-between">
                <span className="font-mono text-xs font-bold text-slate-500">{b.booking_no}</span>
                <StatusBadge status={b.status} />
              </div>
              <p className="mt-2 text-sm font-semibold">{b.lines.map((l) => `${l.name} ×${l.qty}`).join(", ")}</p>
              <p className="mt-1 text-xs text-slate-500">{fmtDate(b.slot_date)} · {b.slot_time} · {inr(b.pricing.total)} · {b.payment_method.toUpperCase()}</p>
              <p className="text-[11px] text-slate-400">Booked {fmtDT(b.created_at)}</p>
            </Link>
            {["completed", "cancelled"].includes(b.status) && (
              <button data-testid={`bookings-rebook-${b.id}`} onClick={() => rebook(b.id)} className="mt-3 rounded-lg border border-[#1E3A8A] px-3 py-1.5 text-xs font-bold text-[#1E3A8A]">One-click Re-book</button>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
