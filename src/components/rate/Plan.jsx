import React, { useEffect, useState, useCallback, useMemo } from "react";
import DataTable from "../reuseable/DataTable";
import { Edit, Trash2, PlusCircle  } from "lucide-react";
import AddButton from "../reuseable/AddButton";
import SideDrawer from "../reuseable/SideDrawer";
import PlanForm from "../Form/PlanForm";
import useAuth from "../../store/useAuth";
import usePopupStore from "../../store/usePopupStore";
import axios from "axios";
import useToast from "../reuseable/useToast";
import ExportButton from "../reuseable/ExportButton";

const PlanPage = () => {
  const { openPopup, isOpen } = usePopupStore();
  const [plans, setPlans] = useState([]);
  const [loading, setLoading] = useState(true);

  const { token, role } = useAuth();
  const toast = useToast();

  const fetchPlans = useCallback(async () => {
    try {
      const res = await axios.get(`https://${window.location.hostname}:5000/plans`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      setPlans(
        res.data.map((plan, idx) => ({
          ...plan,
          serial: idx + 1,

          Type: plan.lcr_type
            ? plan.lcr_type
            : plan.loadbalance_type
              ? plan.loadbalance_type
              : "-",

        }))
      );
    } catch (err) {
      console.error("Frontend failed to fetch plans:", err);
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    if (token) fetchPlans();
  }, [token, fetchPlans]);

  const columns = useMemo(
    () => [
      { header: "S.No", accessor: "serial", exportable: false },
      { header: "Plan ID", accessor: "PlanID" },
      { header: "Plan Name", accessor: "PlanName" },
      { header: "Type", accessor: "Type" },
      ...(role === "admin" ? [{ header: "Actions", accessor: "actions" }] : []),],
    []
  );

  const handleEdit = useCallback(
    (row) => {
      openPopup(
        "Edit Plan",
        <PlanForm
          initialData={{
            id: row.id,
            PlanID: row.PlanID,
            PlanName: row.PlanName,
            lcr_type: row.lcr_type,
            loadbalance_type: row.loadbalance_type,
            Type: row.lcr_type
              ? "lcr"
              : row.loadbalance_type
                ? "loadbalance"
                : "",
            del_status: row.del_status
          }}

          onSuccess={(updated) => {
            fetchPlans();
            toast.success("Plan updated successfully");
          }}
        />
      );
    },
    [openPopup, toast, fetchPlans]
  );

  const handleBulkEdit = (selectedRows) => {
    if (selectedRows.length === 0) return;

    openPopup(
      `Edit ${selectedRows.length} Plans`,
      <PlanForm
        bulkData={selectedRows}
        onSuccess={() => {
          fetchPlans();
          toast.success("Plans updated successfully");
        }}
      />
    );
  };



  const handleDelete = useCallback(
    async (row) => {
      const confirmed = await toast.confirmToast(
        `Are you sure you want to delete plan "${row.PlanName}"?`
      );
      if (!confirmed) return;

      try {
        await axios.delete(
          `https://${window.location.hostname}:5000/plans/${row.id}`,
          { headers: { Authorization: `Bearer ${token}` } }
        );

        setPlans((prev) =>
          prev
            .filter((p) => p.id !== row.id)
            .map((p, i) => ({ ...p, serial: i + 1 }))
        );

        toast.success("Plan deleted successfully");
      } catch (err) {
        console.error("❌ Failed to delete:", err);

        const msg =
          err.response?.data?.message ||
          "Delete failed. This plan may be in use.";

        toast.error(msg);
      }
    },
    [token, toast]
  );

  const handleBulkDelete = async (selectedRows) => {
    if (selectedRows.length === 0) return;

    const confirmed = await toast.confirmToast(
      `Delete ${selectedRows.length} selected plans?`
    );
    if (!confirmed) return;

    try {
      const ids = selectedRows.map((row) => row.id);

      await Promise.all(
        ids.map((id) =>
          axios.delete(
            `https://${window.location.hostname}:5000/plans/${id}`,
            { headers: { Authorization: `Bearer ${token}` } }
          )
        )
      );

      setPlans((prev) => prev.filter((p) => !ids.includes(p.id)));
      toast.success(`${ids.length} plans deleted successfully`);
    } catch (err) {
      console.error(err);
      toast.error("Failed to delete selected plans");
    }
  };


  const handlePlanAssign = async (selectedRows) => {
    const planIds = selectedRows.map(r => r.PlanID);

    const res = await axios.post(
      `https://${window.location.hostname}:5000/plans/check-and-assign`,
      { planIds },
      { headers: { Authorization: `Bearer ${token}` } }
    );

    if (res.data.alreadyAssigned.length) {
      toast.info(
        `Already assigned: ${res.data.alreadyAssigned.join(", ")}`
      );
    }

    if (res.data.newlyAssigned.length) {
      toast.success(
        `Assigned: ${res.data.newlyAssigned.join(", ")}`
      );
    }
  };



  const tableData = useMemo(
    () =>
      plans.map((row) => ({
        ...row,
        actions: (
          role === "admin" ? (
            <div className="flex gap-3">
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
          ) : (
            <div></div>
          )
        )

      })),
    [plans, handleEdit, handleDelete]
  );

  return (
    <div className="flex overflow-auto relative z-10">
      <main
        className={`transition-all duration-300 max-w-7xl mx-auto py-6 px-4 lg:px-8 flex-1 bg-gray-50 min-h-screen ${isOpen ? "mr-[450px]" : ""
          }`}
      >
        <DataTable
          key={isOpen ? "open" : "closed"}
          title="Plan List"
          loading={loading}
          columns={columns}
          data={tableData}

          // ✅ Admin + Client dono ke liye row select
          enableSelection={role === "admin" || role === "client"}

          // ✅ Header actions sirf ADMIN
          headerActions={
            role === "admin" ? (
              <div className="flex gap-2">
                <AddButton
                  label="Add Plan"
                  form={<PlanForm onSuccess={fetchPlans} />}
                />
                <ExportButton
                  data={plans}
                  columns={columns}
                  fileName="plan_list"
                />
              </div>
            ) : null
          }

          // ✅ Bulk Actions role-wise
          bulkActions={(selectedRows) => {
            // 🟣 ADMIN ACTIONS
            if (role === "admin") {
              return (
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
              );
            }

            // 🟢 CLIENT ACTION
            if (role === "client") {
              return (
                <div className="flex items-center gap-1">
                  <button
                    title="Assign Selected Plans"
                    onClick={() => handlePlanAssign(selectedRows)}
                    className="p-1.5 rounded-md hover:bg-green-100 transition"
                  >
                    <PlusCircle  size={16} className="text-green-600" />
                  </button>
                </div>

              );
            }

            return null;
          }}
        />

      </main>

      <SideDrawer />
    </div>
  );
};

export default PlanPage;
