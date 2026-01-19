import { useState, useEffect, useMemo, useCallback } from "react";
import axios from "axios";
import DataTable from "../reuseable/DataTable";
import AddButton from "../reuseable/AddButton";
import SideDrawer from "../reuseable/SideDrawer";
import useAuth from "../../store/useAuth";
import usePopupStore from "../../store/usePopupStore";
import useToast from "../reuseable/useToast";
import { Edit, Trash2 } from "lucide-react";
import LoadBalanceForm from "../Form/userForm/LoadBalanceForm";

const LoadBalancePage = () => {
  const { token } = useAuth();
  const { openPopup, isOpen } = usePopupStore();
  const toast = useToast();

  const [mix, setMix] = useState([]);
  const [loading, setLoading] = useState(true);

  const fetchMix = useCallback(async () => {
    try {
      const res = await axios.get(`https://${window.location.hostname}:5000/routemix`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      setMix(
        res.data.map((r, idx) => ({
          ...r,
          serial: idx + 1,
        }))
      );
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    fetchMix();
  }, [fetchMix]);

  const columns = useMemo(
    () => [
      { header: "S.No", accessor: "serial" },
      { header: "Trunk (Route Name)", accessor: "route_name" },
      { header: "LB Trunk", accessor: "user" },
      { header: "Percentage", accessor: "percentage" },
          {
                header: "Status",
                accessor: "status",
                Cell: ({ value }) => {
                    const isActive = Number(value) === 1;

                    return (
                        <span
                            className={`px-1 py-0.5 text-[10px] font-medium rounded-full ${isActive
                                    ? "bg-green-100 text-green-700"
                                    : "bg-red-100 text-red-700"
                                }`}
                        >
                            {isActive ? "Active" : "Inactive"}
                        </span>
                    );
                },
            },
      { header: "Actions", accessor: "actions" },
    ],
    []
  );

  const handleEdit = (row) => {
    openPopup(
      "Edit Load Balance",
      <LoadBalanceForm
        initialData={row}
        onSuccess={(updated) => {
          setMix((prev) =>
            prev.map((r) => (r.id === updated.id ? updated : r))
          );
          toast.success("Updated successfully!");
        }}
      />
    );
  };

  const handleDelete = async (row) => {
    const confirm = await toast.confirmToast("Delete this entry?");
    if (!confirm) return;

    try {
      await axios.delete(`https://${window.location.hostname}:5000/routemix/${row.id}`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      setMix((prev) => prev.filter((r) => r.id !== row.id));
      toast.success("Deleted!");
    } catch (err) {
      toast.error("Delete failed!");
    }
  };

  const mixWithActions = useMemo(
    () =>
      mix.map((r) => ({
        ...r,
        actions: (
          <div className="flex gap-3">
            <button onClick={() => handleEdit(r)} className="text-indigo-500">
              <Edit size={18} />
            </button>
            <button
              onClick={() => handleDelete(r)}
              className="text-red-500"
            >
              <Trash2 size={18} />
            </button>
          </div>
        ),
      })),
    [mix]
  );

  return (
    <div className="flex">
      <main
        className={`transition-all flex-1 bg-gray-50 p-6 ${
          isOpen ? "mr-[450px]" : ""
        }`}
      >
        <DataTable
          title="Load Balance List"
          columns={columns}
          data={mixWithActions}
          loading={loading}
          headerActions={
            <AddButton
              label="Add Load Balance"
              form={<LoadBalanceForm />}
            />
          }
        />
      </main>
      <SideDrawer />
    </div>
  );
};

export default LoadBalancePage;
