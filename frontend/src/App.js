import "@/App.css";
import "leaflet/dist/leaflet.css";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { Toaster } from "@/components/ui/sonner";
import Portal from "@/pages/Portal";
import CustomerApp from "@/customer/CustomerApp";
import PartnerApp from "@/partner/PartnerApp";
import AdminApp from "@/admin/AdminApp";

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Portal />} />
        <Route path="/app/*" element={<CustomerApp />} />
        <Route path="/partner/*" element={<PartnerApp />} />
        <Route path="/admin/*" element={<AdminApp />} />
      </Routes>
      <Toaster position="top-center" richColors />
    </BrowserRouter>
  );
}

export default App;
