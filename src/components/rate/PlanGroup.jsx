import React, { useEffect, useState, useCallback, useMemo } from "react";
import axios from "axios";
import DataTable from "../reuseable/DataTable";
import { Edit, Trash2 } from "lucide-react";
import AddButton from "../reuseable/AddButton";
import SideDrawer from "../reuseable/SideDrawer";
import useToast from "../reuseable/useToast";
import PlanGroupForm from "../Form/PlanGroupForm";
import usePopupStore from "../../store/usePopupStore";
import useAuth from "../../store/useAuth";
import ExportButton from "../reuseable/ExportButton";


const PlanGroupPage = () => {
  const { openPopup, isOpen } = usePopupStore();
  const [planGroups, setPlanGroups] = useState([]);
  const [loading, setLoading] = useState(true);

  const toast = useToast();
  const { token } = useAuth();

  const fetchPlanGroups = useCallback(async () => {
    try {
      const res = await axios.get(`https://${window.location.hostname}:5000/plangroups`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      setPlanGroups(
        res.data.map((g, idx) => ({
          ...g,
          serial: idx + 1,
        }))
      );
    } catch (err) {
      console.error("❌ Failed to fetch plan groups:", err);
      toast.error("Failed to load Plan Groups");
    } finally {
      setLoading(false);
    }
  }, [token, toast]);

  useEffect(() => {
    if (token) fetchPlanGroups();
  }, [token, fetchPlanGroups]);


  const columns = useMemo(
    () => [
      { header: "S.No", accessor: "serial", exportable: false },
      { header: "Plan Group ID", accessor: "PlanGroupID" },
      { header: "Plan Group Name", accessor: "Plangroupname" },
      { header: "Plan Group Members", accessor: "plangroupmembers" },
      { header: "LCR Type", accessor: "Lcrtype" },
      { header: "Actions", accessor: "actions" },
    ],
    []
  );

  // const handleEdit = useCallback(
  //   (row) => {
  //     openPopup(
  //       "Edit Plan Group",
  //       <PlanGroupForm
  //         initialData={row}
  //         onSuccess={async (updated) => {
  //           try {
  //             const res = await axios.put(
  //               `https://${window.location.hostname}:5000/plangroups/${row.id}`,
  //               updated,
  //               { headers: { Authorization: `Bearer ${token}` } }
  //             );

  //             setPlanGroups((prev) =>
  //               prev
  //                 .map((g) => (g.id === row.id ? res.data : g))
  //                 .map((g, idx) => ({ ...g, serial: idx + 1 }))
  //             );

  //             toast.success("Plan Group updated successfully");
  //           } catch (err) {
  //             console.error("❌ Update failed:", err);
  //             toast.error("Failed to update Plan Group");
  //           }
  //         }}
  //       />
  //     );
  //   },
  //   [openPopup, token, toast]
  // );


  const handleEdit = useCallback(
    (row) => {
      openPopup(
        "Edit Plan Group",
        <PlanGroupForm
          initialData={row}
          onSuccess={async () => {
            try {
              await fetchPlanGroups();   // ✅ Only refresh list
              toast.success("Plan Group updated successfully");
            } catch (err) {
              console.error("❌ Refresh failed:", err);
              toast.error("Failed to refresh data");
            }
          }}
        />
      );
    },
    [openPopup, token, toast, fetchPlanGroups]
  );

  const handleBulkEdit = (selectedRows) => {
    if (!selectedRows.length) return;

    openPopup(
      `Edit ${selectedRows.length} Plan Groups`,
      <PlanGroupForm
        bulkData={selectedRows}
        onSuccess={fetchPlanGroups}
      />
    );
  };


  const handleDelete = useCallback(
    async (row) => {
      const confirmed = await toast.confirmToast(
        `Are you sure you want to delete Plan Group "${row.Plangroupname}"?`
      );
      if (!confirmed) return;

      try {
        await axios.delete(
          `https://${window.location.hostname}:5000/plangroups/${row.id}`,
          { headers: { Authorization: `Bearer ${token}` } }
        );

        setPlanGroups((prev) =>
          prev
            .filter((g) => g.id !== row.id)
            .map((g, idx) => ({ ...g, serial: idx + 1 }))
        );

        toast.success("Plan Group deleted successfully");
      } catch (err) {
        console.error("❌ Delete failed:", err);


        const msg =
          err.response?.data?.message ||
          "Failed to delete Plan Group";

        toast.error(msg);
      }
    },
    [token, toast]
  );
  const handleBulkDelete = async (selectedRows) => {
    if (!selectedRows.length) return;

    const confirmed = await toast.confirmToast(
      `Delete ${selectedRows.length} Plan Groups?`
    );
    if (!confirmed) return;

    try {
      await axios.delete(
        `https://${window.location.hostname}:5000/plangroups/bulk-delete`,
        {
          headers: { Authorization: `Bearer ${token}` },
          data: { ids: selectedRows.map((r) => r.id) }
        }
      );

      toast.success("Plan Groups deleted successfully");
      fetchPlanGroups();
    } catch (err) {
      console.error(err);
      toast.error("Bulk delete failed");
    }
  };


  const tableData = useMemo(
    () =>
      planGroups.map((row) => ({
        ...row,
        actions: (
          <div className="flex gap-2">
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
    [planGroups, handleEdit, handleDelete]
  );

  return (
    <div className="flex-1 overflow-auto relative z-10">
      <main
        className={`transition-all duration-300 max-w-7xl mx-auto py-6 px-4 lg:px-8 flex-1 bg-gray-50 min-h-screen ${isOpen ? "mr-[450px]" : ""
          }`}
      >
        <DataTable
          title="Plan Group List"
          loading={loading}
          columns={columns}
          data={tableData}
          enableSelection={true}
          headerActions={
            <div className="flex gap-2">
              <AddButton
                label="Add Plan Group"
                form={<PlanGroupForm onSuccess={fetchPlanGroups} />}
              />
              <ExportButton
                data={planGroups}
                columns={columns}
                fileName="plangroup_list"
              />
            </div>
          }

          bulkActions={(selectedRows) => (
            <div className="flex gap-2">
              <button
                title="Bulk Edit"
                onClick={() => handleBulkEdit(selectedRows)}
                className="p-1.5 rounded-md hover:bg-indigo-100"
              >
                <Edit size={14} className="text-indigo-600" />
              </button>

              <button
                title="Bulk Delete"
                onClick={() => handleBulkDelete(selectedRows)}
                className="p-1.5 rounded-md hover:bg-red-100"
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

export default PlanGroupPage;
