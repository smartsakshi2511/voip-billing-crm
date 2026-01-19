import { useState, useEffect, useMemo, useCallback } from "react";
import axios from "axios";
import DataTable from "../reuseable/DataTable";
import AddButton from "../reuseable/AddButton";
import SideDrawer from "../reuseable/SideDrawer";
import DIDForm from "../Form/userForm/DidForm";
import useAuth from "../../store/useAuth";
import usePopupStore from "../../store/usePopupStore";
import { Eye, Edit, Trash2 } from "lucide-react";
import useToast from "../reuseable/useToast";
import DIDView from "../Form/userForm/DidView";
import ExportButton from "../reuseable/ExportButton";

const DIDList = () => {
  const [dids, setDids] = useState([]);
  const [loading, setLoading] = useState(true);
  const { token, role } = useAuth();
  const { openPopup, isOpen } = usePopupStore();
  const toast = useToast();
  const fetchDIDs = useCallback(async () => {
    try {
      const res = await axios.get(
        `https://${window.location.hostname}:5000/dids`,
        { headers: { Authorization: `Bearer ${token}` } }
      );

      const dataWithSerial = res.data.map((d, i) => ({
        ...d,
        serial: i + 1,
      }));

      setDids(dataWithSerial);
    } catch (err) {
      console.error("🔴 Failed to fetch DIDs:", err);
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    if (token) fetchDIDs();
  }, [token, fetchDIDs]);

  const handleView = useCallback(
    (row) => {
      openPopup(`DID Details – ${row.did}`, <DIDView data={row} />);
    },
    [openPopup]
  );

  const handleEdit = useCallback(
    (row) => {
      openPopup(
        `Edit DID`,
        <DIDForm initialData={row} onSuccess={fetchDIDs} />
      );
    },
    [openPopup, fetchDIDs]
  );

  const handleDelete = useCallback(
    async (id) => {
      const isConfirmed = await toast.confirmToast(
        "Are you sure you want to delete this DID?"
      );
      if (!isConfirmed) return;

      try {
        await axios.delete(
          `https://${window.location.hostname}:5000/dids/${id}`,
          {
            headers: { Authorization: `Bearer ${token}` },
          }
        );

        setDids((prev) => prev.filter((d) => d.id !== id));
        toast.success("DID deleted successfully");
      } catch (err) {
        console.error("🔴 Delete failed:", err);
        toast.error("Failed to delete DID ❌");
      }
    },
    [token, toast]
  );
  const handleBulkDelete = async (selectedRows) => {
    if (selectedRows.length === 0) return;

    const confirmed = await toast.confirmToast(
      `Delete ${selectedRows.length} selected DIDs?`
    );
    if (!confirmed) return;

    try {
      const ids = selectedRows.map((row) => row.id);

      await Promise.all(
        ids.map((id) =>
          axios.delete(`https://${window.location.hostname}:5000/dids/${id}`, {
            headers: { Authorization: `Bearer ${token}` },
          })
        )
      );

      setDids((prev) => prev.filter((d) => !ids.includes(d.id)));
      toast.success(`${ids.length} DIDs deleted successfully`);
    } catch (err) {
      console.error(err);
      toast.error("Failed to delete selected DIDs ❌");
    }
  };
const handleBulkEdit = (selectedRows) => {
  if (!selectedRows.length) return;

  openPopup(
    `Bulk Edit (${selectedRows.length}) DIDs`,
    <DIDForm
      bulkData={selectedRows}
      onSuccess={fetchDIDs}
    />
  );
};
const columns = useMemo(
  () => [
    { header: "S.No", accessor: "serial" },
    { header: "DID", accessor: "did" },
    ...(role === "admin"
      ? [{ header: "Trunk", accessor: "trunk" }]
      : []),
    { header: "User ID", accessor: "user_id" },
    { header: "Monthly Cost", accessor: "monthlycost" },
    {
      header: role === "client" ? "Rate" : "Sell Price",
      accessor: "sellprice",
    },
    { header: "Status", accessor: "status" },
    { header: "Reserve", accessor: "reserved" },
    { header: "Actions", accessor: "actions" },
  ],
  [role]
);
  const didsWithActions = useMemo(
    () =>
      dids.map((d) => ({
        ...d,
        actions: (
          <div className="flex gap-3">
            <button
              onClick={() => handleView(d)}
              className="text-yellow-500 hover:text-yellow-700"
              title="View"
            >
              <Eye size={18} />
            </button>

            {role === "admin" && (
              <button
                onClick={() => handleEdit(d)}
                className="text-indigo-500 hover:text-indigo-700"
                title="Edit"
              >
                <Edit size={18} />
              </button>
            )}
            {role === "admin" && (
              <button
                onClick={() => handleDelete(d.id)}
                className="text-red-500 hover:text-red-400"
                title="Delete"
              >
                <Trash2 size={18} />
              </button>
            )}
          </div>
        ),
      })),
    [dids, role, handleView, handleEdit, handleDelete]
  );

  return (
    <div className="flex-1 overflow-auto relative z-10">
      <main
        className={`transition-all duration-300 mx-auto py-6 px-4 lg:px-8 flex-1 min-h-screen ${
          isOpen ? "mr-[450px]" : ""
        }`}
      >
        <DataTable
          title="DIDs List"
          columns={columns}
          data={didsWithActions}
          loading={loading}
          enableSelection={role === "admin"} 
          headerActions={
            <div className="flex gap-2">
              {role === "admin" && (
                <AddButton
                  label="Add DID"
                  form={<DIDForm onSuccess={fetchDIDs} />}
                />
              )}

              <ExportButton data={dids} columns={columns} fileName="did_list" />
            </div>
          }
          bulkActions={(
            selectedRows 
          ) => (
            <div className="flex items-center gap-1">
              <button
                title="Bulk Edit"
                onClick={() => handleBulkEdit(selectedRows)}
                className="p-1.5 rounded-md hover:bg-indigo-100 transition"
              >
                <Edit size={14} className="text-indigo-600" />
              </button>

              <button
                title="Delete Selected"
                onClick={() => handleBulkDelete(selectedRows)}
                className="p-1.5 rounded-md hover:bg-red-100 transition"
              >
                <Trash2 size={14} className="text-red-600" />
              </button>
            </div>
          )}
        />
      </main>

      <SideDrawer />
    </div>
  );
};

export default DIDList;
