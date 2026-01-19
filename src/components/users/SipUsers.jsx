import { useState, useEffect, useMemo, useCallback } from "react";
import axios from "axios";
import DataTable from "../reuseable/DataTable";
import AddButton from "../reuseable/AddButton";
import SideDrawer from "../reuseable/SideDrawer";
import SIPAccountForm from "../Form/userForm/SipUserForm";
import useAuth from "../../store/useAuth";
import usePopupStore from "../../store/usePopupStore";
import { Edit, Trash2 } from "lucide-react";
import useToast from "../reuseable/useToast";
import ExportButton from "../reuseable/ExportButton";


const SIPAccountsList = () => {
  const [sipAccounts, setSipAccounts] = useState([]);
  const [loading, setLoading] = useState(true);

  const { token, role } = useAuth();
  const { openPopup, isOpen } = usePopupStore();
  const toast = useToast();
 
  const fetchSipAccounts = useCallback(async () => {
    try {
      const res = await axios.get(
        `https://${window.location.hostname}:5000/sipaccounts`,
        {
          headers: { Authorization: `Bearer ${token}` },
        }
      );

      const withIndex = res.data.map((item, idx) => ({
        ...item,
        serial: idx + 1,
      }));

      setSipAccounts(withIndex);
    } catch (err) {
      console.error("Failed to fetch SIP accounts:", err);
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    if (token) fetchSipAccounts();
  }, [token, fetchSipAccounts]);
 
  const handleEdit = useCallback(
    (row) => {
      openPopup(
        "Edit SIP",
        <SIPAccountForm initialData={row} onSuccess={fetchSipAccounts} />
      );
    },
    [openPopup, fetchSipAccounts]
  );
 
  const handleDelete = useCallback(
    async (id) => {
      const confirmed = await toast.confirmToast(
        "Are you sure you want to delete this SIP account?"
      );
      if (!confirmed) return;

      try {
        await axios.delete(
          `https://${window.location.hostname}:5000/sipaccounts/${id}`,
          {
            headers: { Authorization: `Bearer ${token}` },
          }
        );

        setSipAccounts((prev) =>
          prev
            .filter((s) => s.id !== id)
            .map((s, idx) => ({ ...s, serial: idx + 1 }))
        );

        toast.success("SIP account deleted successfully!");
      } catch (err) {
        console.error("Delete failed:", err);
        toast.error("Failed to delete SIP account.");
      }
    },
    [token, toast]
  );

  // ✔ Memoized Table Columns
  const columns = useMemo(
    () => [
      { header: "S.No", accessor: "serial" },
      { header: "Account Code", accessor: "accountcode" },
      { header: "Username", accessor: "username" },
      { header: "Password", accessor: "password" },
      { header: "Caller ID", accessor: "callerid" },
      { header: "Codec", accessor: "codec" },
      { header: "Host", accessor: "host" },
      { header: "Port", accessor: "port" },
      ...(role === "admin" ? [{ header: "Actions", accessor: "actions" }] : []),
    ],
    []
  );

  // ✔ Memoized rows with action buttons
  const sipAccountsWithActions = useMemo(
    () =>
      sipAccounts.map((s) => ({
        ...s,
        actions: (
          <div className="flex gap-3">
            <button
              onClick={() => handleEdit(s)}
              className="text-yellow-300 hover:text-yellow-200"
              title="Edit"
            >
              <Edit size={18} />
            </button>

            <button
              onClick={() => handleDelete(s.id)}
              className="text-red-500 hover:text-red-400"
              title="Delete"
            >
              <Trash2 size={18} />
            </button>
          </div>
        ),
      })),
    [sipAccounts, handleEdit, handleDelete]
  );

  return (
    <div className="flex-1 overflow-auto relative z-10">
      <main
        className={`transition-all duration-300 max-w-7xl mx-auto py-6 px-4 lg:px-8 flex-1 bg-gray-50 min-h-screen ${
          isOpen ? "mr-[450px]" : ""
        }`}
      >
        <DataTable
          title="SIP Accounts List"
          loading={loading} v
          columns={columns}
          data={sipAccountsWithActions}
          headerActions={
            <div className="flex gap-2">
            <AddButton
              label="Add SIP"
              form={<SIPAccountForm onSuccess={fetchSipAccounts} />}
            />
            <ExportButton
                data={sipAccounts}
                columns={columns}
                fileName="sipAccounts_list"
              />
            </div>
          }
           onRefresh={fetchSipAccounts} 
        />
      </main>

      <SideDrawer />
    </div>
  );
};

export default SIPAccountsList;
