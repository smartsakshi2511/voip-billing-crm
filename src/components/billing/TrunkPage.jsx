import React, { useEffect, useState, useCallback, useMemo } from "react";
import DataTable from "../reuseable/DataTable";
import { Edit, Trash2, Eye } from "lucide-react";
import AddButton from "../reuseable/AddButton";
import SideDrawer from "../reuseable/SideDrawer";
import TrunkForm from "../Form/TrunkForm";
import TrunkView from "../Form/TrunkView";
import useAuth from "../../store/useAuth";
import usePopupStore from "../../store/usePopupStore";
import axios from "axios";
import useToast from "../reuseable/useToast";
import ExportButton from "../reuseable/ExportButton";

const TrunkPage = () => {
  const { openPopup, isOpen } = usePopupStore();
  const [trunks, setTrunks] = useState([]);
  const [loading, setLoading] = useState(true);

  const { token } = useAuth();
  const toast = useToast();
 
  const fetchTrunks = useCallback(async () => {
    try {
      const res = await axios.get(`https://${window.location.hostname}:5000/trunks`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      setTrunks(
        res.data.map((item, idx) => ({
          ...item,
          id: item.id,
          serial: idx + 1,
        }))
      );
    } catch (err) {
      console.error("❌ Failed to fetch trunks:", err);
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    if (token) fetchTrunks();
  }, [token, fetchTrunks]); 
  const handleView = useCallback(
    (row) => {
      openPopup("View Trunk", <TrunkView trunk={row} />);
    },
    [openPopup]
  );

  const handleEdit = useCallback(
    (row) => {
      openPopup(
        "Edit Trunk",
        <TrunkForm
          initialData={row}
          onSuccess={(updated) => {
            setTrunks((prev) =>
              prev
                .map((t) => (t.id === updated.id ? updated : t))
                .map((t, i) => ({ ...t, serial: i + 1 }))
            );
            toast.success("Trunk updated successfully");
          }}
        />
      );
    },
    [openPopup, toast]
  );

  const handleDelete = useCallback(
  async (row) => {
    const confirmed = await toast.confirmToast(
      `Delete trunk "${row.trunkname}"?`
    );
    if (!confirmed) return;

    try {
      await axios.delete(
        `https://${window.location.hostname}:5000/trunks/${row.id}`,
        {
          headers: { Authorization: `Bearer ${token}` },
        }
      );

      setTrunks((prev) =>
        prev
          .filter((t) => t.id !== row.id)
          .map((t, i) => ({ ...t, serial: i + 1 }))
      );

      toast.success("Trunk deleted successfully");
    } catch (err) {
      console.error("❌ Delete failed:", err);

      const msg =
        err.response?.data?.message ||
        "Delete failed. This trunk may be in use.";

      toast.error(msg);
    }
  },
  [token, toast]
);

  const columns = useMemo(
    () => [
      { header: "S.No", accessor: "serial" },
      { header: "Route ID", accessor: "routeid" },
      { header: "Trunk Name", accessor: "trunkname" },
      { header: "Type", accessor: "type" },
      { header: "Username", accessor: "username" },
      { header: "Password", accessor: "password" },
      { header: "Host", accessor: "host" },
      { header: "Add Prefix", accessor: "addprefix" },
      { header: "Port", accessor: "port" },
      {
        header: "Status",
        accessor: "status",
        render: (value) => (
          <span
            className={`px-2 py-1 rounded-full text-xs font-semibold ${
              value === "Active"
                ? "bg-green-100 text-green-700"
                : "bg-red-100 text-red-700"
            }`}
          >
            {value}
          </span>
        ),
      },
      { header: "Actions", accessor: "actions" },
    ],
    []
  );
 
  const tableData = useMemo(
    () =>
      trunks.map((row) => ({
        ...row,
        actions: (
          <div className="flex gap-2">
            <button
              className="text-yellow-500 hover:text-yellow-700"
              onClick={() => handleView(row)}
            >
              <Eye size={18} />
            </button>

            <button
              className="text-indigo-500 hover:text-indigo-700"
              onClick={() => handleEdit(row)}
            >
              <Edit size={18} />
            </button>

            <button
              className="text-red-500 hover:text-red-700"
              onClick={() => handleDelete(row)}
            >
              <Trash2 size={18} />
            </button>
          </div>
        ),
      })),
    [trunks, handleView, handleEdit, handleDelete]
  ); 
  return (
    <div className="flex relative z-10 min-h-screen bg-gray-50">
      <main
        className={`transition-all duration-300 flex-1 max-w-full mx-auto py-6 px-4 lg:px-8 ${
          isOpen ? "mr-[450px]" : ""
        }`}
      >
        <DataTable
          key={isOpen ? "open" : "closed"}
          title="Trunk List"
          columns={columns}
          data={tableData}
          loading={loading}
          headerActions={
            <div className="flex gap-2">
              <AddButton
                label="Add Trunk"
                form={<TrunkForm onSuccess={fetchTrunks} />}
              />
              <ExportButton
                data={trunks}
                columns={columns}
                fileName="trunks_list"
              />
            </div>
          }
        />
      </main>

      <SideDrawer />
    </div>
  );
};

export default TrunkPage;
