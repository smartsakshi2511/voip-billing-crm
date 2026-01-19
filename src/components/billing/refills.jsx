import { useEffect, useState, useCallback, useMemo } from "react";
import DataTable from "../reuseable/DataTable";
import { Trash2 } from "lucide-react";
import AddButton from "../reuseable/AddButton";
import SideDrawer from "../reuseable/SideDrawer";
import RefillsForm from "../Form/RefillsForm";
import usePopupStore from "../../store/usePopupStore";
import axios from "axios";
import useAuth from "../../store/useAuth";
import useToast from "../reuseable/useToast";
import ExportButton from "../reuseable/ExportButton";


const formatDate = (isoString) => {
  if (!isoString) return "";
  const date = new Date(isoString);
  return date
    .toLocaleString("en-GB", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    })
    .replace(",", "");
};

const RefillsPage = () => {
  const [refills, setRefills] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState({
    user: "",
    fromDate: "",
    toDate: "",
  });

  const [appliedFilters, setAppliedFilters] = useState({
    user: "",
    fromDate: "",
    toDate: "",
  });

  const [userList, setUserList] = useState([]);
  const { token, role } = useAuth();
  
  const { isOpen } = usePopupStore();
  const toast = useToast();

  const fetchRefills = useCallback(async () => {
    try {
      setLoading(true);

      const params = {};
      if (appliedFilters.user) params.user = appliedFilters.user;
      if (appliedFilters.fromDate) params.from = appliedFilters.fromDate;
      if (appliedFilters.toDate) params.to = appliedFilters.toDate;

      const res = await axios.get(
        `https://${window.location.hostname}:5000/refills`,
        {
          headers: { Authorization: `Bearer ${token}` },
          params,
        }
      );

      const indexed = res.data.map((item, idx) => ({
        ...item,
        serial: idx + 1,
        date: formatDate(item.date),
      }));

      setRefills(indexed);
    } catch (err) {
      console.error("Failed to fetch refills:", err);
    } finally {
      setLoading(false);
    }
  }, [token, appliedFilters]);

  useEffect(() => {
    if (token) fetchRefills();
  }, [token]);


  useEffect(() => {
    if (token) fetchRefills();
  }, [token, fetchRefills]);

  const handleDelete = useCallback(
    async (id) => {
      const confirmed = await toast.confirmToast(
        "Are you sure you want to delete this refill?"
      );
      if (!confirmed) return;

      try {
        await axios.delete(`https://${window.location.hostname}:5000/refills/${id}`, {
          headers: { Authorization: `Bearer ${token}` },
        });

        setRefills((prev) =>
          prev
            .filter((r) => r.id !== id)
            .map((r, idx) => ({ ...r, serial: idx + 1 }))
        );

        toast.success("Refill deleted successfully");
      } catch (err) {
        console.error("Delete failed:", err);
        toast.error("Failed to delete refill");
      }
    },
    [token, toast]
  );

  useEffect(() => {
    const fetchUsers = async () => {
      try {
        const res = await axios.get(
          `https://${window.location.hostname}:5000/users_dropdown`,
          { headers: { Authorization: `Bearer ${token}` } }
        );
        setUserList(res.data);
      } catch (err) {
        console.error("Failed to fetch users dropdown", err);
      }
    };

    if (token && role === "admin") fetchUsers();
  }, [token, role]);

  const exportData = useMemo(() => {
    return refills.map((r, idx) => ({
      ...r,
      serial: idx + 1,
      add_delete:
        r.add_delete === "Add"
          ? "Credit"
          : r.add_delete === "Delete"
            ? "Debit"
            : "",
    }));
  }, [refills]);


  const columns = useMemo(
    () => [
      { header: "S.No", accessor: "serial", exportable: false },
      { header: "User", accessor: "user" },
      { header: "Amount", accessor: "credit" },
      { header: "Description", accessor: "description" },
      {
        header: "Credit/Debit",
        accessor: "add_delete",
        Cell: ({ value }) => {
          if (value === "Add") {
            return <span className="text-green-600 font-medium">Credit</span>;
          }
          if (value === "Delete") {
            return <span className="text-red-600 font-medium">Debit</span>;
          }
          return "-";
        },
      }, { header: "Date", accessor: "date" },
      ...(role === "admin" ? [{ header: "Action", accessor: "actions" }] : []),
    ],
    []
  );

  const refillsWithActions = useMemo(
    () =>
      refills.map((r) => ({
        ...r,
        actions: (
          <button
            onClick={() => handleDelete(r.id)}
            className="text-red-500 hover:text-red-400"
          >
            <Trash2 size={18} />
          </button>
        ),
      })),
    [refills, handleDelete]
  );

  return (
    <div className="flex-1 overflow-auto relative z-10">
      <main
        className={`transition-all duration-300 max-w-7xl mx-auto py-6 px-4 lg:px-8 flex-1 bg-gray-50 min-h-screen ${isOpen ? "mr-[450px]" : ""
          }`}
      >
        {/* Filter Bar */}
        <div className="bg-white shadow-lg rounded-xl p-4 border border-gray-200 flex flex-wrap items-end gap-3 mb-4">

          {/* From Date */}
          <div className="flex flex-col">
            <label className="text-xs text-gray-600 mb-1">From</label>
            <input
              type="date"
              value={filters.fromDate}
              onChange={(e) =>
                setFilters((f) => ({ ...f, fromDate: e.target.value }))
              }
              className="border border-gray-300 text-sm rounded-lg px-3 py-1.5"
            />
          </div>

          {/* To Date */}
          <div className="flex flex-col">
            <label className="text-xs text-gray-600 mb-1">To</label>
            <input
              type="date"
              value={filters.toDate}
              onChange={(e) =>
                setFilters((f) => ({ ...f, toDate: e.target.value }))
              }
              className="border border-gray-300 text-sm rounded-lg px-3 py-1.5"
            />
          </div>

          {/* User Dropdown */}
          {role === "admin" && (
            <div className="flex flex-col">
              <label className="text-xs text-gray-600 mb-1">User</label>
              <select
                value={filters.user}
                onChange={(e) =>
                  setFilters((f) => ({ ...f, user: e.target.value }))
                }
                className="border border-gray-300 text-sm rounded-lg px-3 py-1.5 bg-white"
              >
                <option value="">All</option>
                {userList.map((u, idx) => (
                  <option key={idx} value={u.username}>
                    {u.username}
                  </option>
                ))}
              </select>
            </div>
          )}

          <div className="flex gap-2 ml-auto">
            <button
              onClick={() => {
                setAppliedFilters(filters);
                fetchRefills();
              }}
              className="px-4 py-1.5 bg-gray-600 text-white text-sm rounded-lg"
            >
              Apply
            </button>

            <button
              onClick={() => {
                const reset = { user: "", fromDate: "", toDate: "" };
                setFilters(reset);
                setAppliedFilters(reset);
                fetchRefills();
              }}
              className="px-4 py-1.5 bg-gray-200 text-gray-700 text-sm rounded-lg"
            >
              Reset
            </button>

          </div>
        </div>

        <DataTable
          title="Refills List"
          loading={loading}
          columns={columns}
          data={refillsWithActions}
          headerActions={
            <div className="flex gap-2">
              {role === "admin" && (
                <AddButton
                  label="Add Refill"
                  form={<RefillsForm onSuccess={fetchRefills} />}
                />
              )}

              <ExportButton
                data={exportData}
                columns={columns}
                fileName="refills_list"
              />
            </div>
          }
          onRefresh={fetchRefills}
        />

      </main>

      <SideDrawer />
    </div>
  );
};

export default RefillsPage;
