import { useEffect, useState, useMemo, useCallback } from "react";
import axios from "axios";
import DataTable from "../reuseable/DataTable";
import SideDrawer from "../reuseable/SideDrawer";
import useAuth from "../../store/useAuth";
import ExportButton from "../reuseable/ExportButton";

const DIDPurchaseRequestList = () => {
  const [requests, setRequests] = useState([]);
  const [loading, setLoading] = useState(true);
  const { token } = useAuth();

  const fetchRequests = useCallback(async () => {
    try {
      const res = await axios.get(
        `https://${window.location.hostname}:5000/did_purchase_requests`,
        {
          headers: { Authorization: `Bearer ${token}` },
        }
      );
      setRequests(res.data);
    } catch (err) {
      console.error("❌ Failed to fetch DID Purchase Requests:", err);
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    if (token) fetchRequests();
  }, [token, fetchRequests]);

  const columns = useMemo(
    () => [
      { header: "ID", accessor: "id" },
      { header: "User ID", accessor: "user_id" },
      { header: "From Email", accessor: "from_email" },
      { header: "To Email", accessor: "to_email" },
      { header: "Country", accessor: "country" },
      { header: "Country Code", accessor: "country_code" },
      { header: "State", accessor: "state" },
      { header: "State Code", accessor: "state_code" },
      { header: "Qty", accessor: "quantity" },
      { header: "NRC", accessor: "nrc" },
      { header: "MRC", accessor: "mrc" },
      { header: "Total NRC", accessor: "total_nrc" },
      { header: "Total MRC", accessor: "total_mrc" },
      { header: "Status", accessor: "status" },
      // { header: "Created At", accessor: "created_at" },
      {
        header: "Created At", accessor: "created_at", Cell: ({ value }) => {
          const formatted = value?.replace("T", " ").replace(".000Z", "");
          return (
            <span className="whitespace-nowrap">{formatted}</span>
          );
        },
      },
    ],
    []
  );

  return (
    <div className="flex-1 overflow-auto relative z-10">
      <main className="max-w-7xl mx-auto py-6 px-4 lg:px-8">
        <DataTable
          title="DID Purchase Requests"
          columns={columns}
          data={requests}
          loading={loading}
          headerActions={
            <ExportButton
              data={requests}
              columns={columns}
              fileName="did_purchase_requests"
            />
          }
        />
      </main>
      <SideDrawer />
    </div>
  );
};

export default DIDPurchaseRequestList;
