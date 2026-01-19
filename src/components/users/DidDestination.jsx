import { useState, useEffect, useMemo, useCallback } from "react";
import axios from "axios";
import DataTable from "../reuseable/DataTable";
import SideDrawer from "../reuseable/SideDrawer";
import useAuth from "../../store/useAuth";
import { Trash2 } from "lucide-react";
import useToast from "../reuseable/useToast";
import ExportButton from "../reuseable/ExportButton";

const DIDDestinationList = () => {
  const [destinations, setDestinations] = useState([]);
  const [loading, setLoading] = useState(true);
  const { token, role } = useAuth();
  const toast = useToast();

  // 🔥 Fetch function memoized
  const fetchDestinations = useCallback(async () => {
    try {
      const res = await axios.get(
        `https://${window.location.hostname}:5000/diddestinations`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      setDestinations(res.data);
    } catch (err) {
      console.error("🔴 Failed to fetch DID Destinations:", err);
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    if (token) fetchDestinations();
  }, [token, fetchDestinations]);

  // 🔥 Delete handler memoized
  const handleDelete = useCallback(
    async (id) => {
      const confirmed = await toast.confirmToast(
        "Are you sure you want to delete this DID Destination?"
      );
      if (!confirmed) return;

      try {
        await axios.delete(`https://${window.location.hostname}:5000/diddestination/${id}`, {
          headers: { Authorization: `Bearer ${token}` },
        });

        setDestinations((prev) => prev.filter((d) => d.id !== id));
        toast.success("DID Destination deleted successfully!");
      } catch (err) {
        console.error("🔴 Delete failed:", err);
        toast.error("Failed to delete DID Destination!");
      }
    },
    [token, toast]
  );

  // 🔥 Memoized columns (prevents rerenders)
  const columns = useMemo(
    () => [
      { header: "DID ID", accessor: "did_id" },
      { header: "Status", accessor: "status" },
      { header: "Type of Call", accessor: "typeofcall" },
      { header: "IVR Extension", accessor: "ivr_extension" },
      { header: "PSTN", accessor: "PSTN" },
      { header: "IP Address", accessor: "ip_address" },
      { header: "SIP ID", accessor: "SIPID" },
      ...(role === "admin" ? [{ header: "Actions", accessor: "actions" }] : []),
    ],
    []
  );

  // 🔥 Memoized row transformation
  const dataWithActions = useMemo(
    () =>
      destinations.map((d) => ({
        ...d,
        actions: (
          <div className="flex gap-3">
            <button
              onClick={() => handleDelete(d.id)}
              className="text-red-500 hover:text-red-400"
              title="Delete"
            >
              <Trash2 size={18} />
            </button>
          </div>
        ),
      })),
    [destinations, handleDelete]
  );

  return (
    <div className="flex-1 overflow-auto relative z-10">
      <main className="max-w-7xl mx-auto py-6 px-4 lg:px-8">
        <DataTable
          title="DID Destinations List"
          columns={columns}
          data={dataWithActions}
          loading={loading}  // ✔ Uses skeleton loader from DataTable
          headerActions={
            <ExportButton
              data={destinations}
              columns={columns}
              fileName="destinations_list"
            />
          }
        />
      </main>

      <SideDrawer />
    </div>
  );
};

export default DIDDestinationList;
