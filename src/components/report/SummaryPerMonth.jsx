import { useState, useEffect, useMemo } from "react";
import axios from "axios";
import DataTable from "../reuseable/DataTable";
import SideDrawer from "../reuseable/SideDrawer";
import useAuth from "../../store/useAuth";
import usePopupStore from "../../store/usePopupStore";
import ExportButton from "../reuseable/ExportButton";


const SummaryPerMonth = () => {
  const [summaryData, setSummaryData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [userList, setUserList] = useState([]);
  const [didList, setDidList] = useState([]);
  const { token, role } = useAuth();
  const { isOpen } = usePopupStore();

  const [filters, setFilters] = useState({
    user: "",
    fromDate: "",
    toDate: "",
    did: "",
  });

  const columns = useMemo(() => {
    return [
      { header: "S.No", accessor: "serial", exportable: false },
      { header: "Month", accessor: "month" },
      { header: "Username", accessor: "username" },
      { header: "Total Calls", accessor: "total_calls" },
      { header: "Inbound", accessor: "inbound_calls" },
      { header: "Outbound", accessor: "outbound_calls" },
      { header: "Missed", accessor: "missed_call" },
      { header: "Answered", accessor: "answercall" },
      { header: "Cancelled", accessor: "cancelcall" },
      { header: "Other", accessor: "othercalls" },
      { header: "ASR", accessor: "ASR", title: "Average Success Ratio" },
      { header: "ACD", accessor: "ACR", title: "Average Call Duration" },
      ...(role === "admin"
        ? [
          { header: "Buy Cost", accessor: "buycost" },
          { header: "Sell Cost", accessor: "sellcost" },
          { header: "Margin", accessor: "margin" },
        ]
        : []),

      ...(role === "client"
        ? [{ header: "Cost", accessor: "sellcost" }]
        : []),
    ];
  }, [role]);

  useEffect(() => {
    const fetchDropdowns = async () => {
      try {
        const [usersRes, didsRes] = await Promise.all([
          axios.get(`https://${window.location.hostname}:5000/users_dropdown`, {
            headers: { Authorization: `Bearer ${token}` },
          }),
          axios.get(`https://${window.location.hostname}:5000/dids`, {
            headers: { Authorization: `Bearer ${token}` },
          }),
        ]);

        setUserList(usersRes.data);
        setDidList(didsRes.data);
      } catch (err) {
        console.error("❌ Dropdown fetch failed:", err);
      }
    };

    if (token) fetchDropdowns();
  }, [token]);

  // 📊 Fetch summary with dynamic filters
  const fetchSummary = async () => {
    try {
      setLoading(true);

      const params = {};
      if (filters.user) params.user = filters.user;
      if (filters.fromDate) params.from = filters.fromDate;
      if (filters.toDate) params.to = filters.toDate;
      if (filters.did) params.did = filters.did;

      const res = await axios.get(`https://${window.location.hostname}:5000/monthwise-calls`, {
        headers: { Authorization: `Bearer ${token}` },
        params,
      });

      setSummaryData(res.data);
    } catch (err) {
      console.error("❌ Monthly summary fetch failed:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (token) fetchSummary();
  }, [token]);

  const resetFilters = () => {
    setFilters({ user: "", fromDate: "", toDate: "", did: "" });
    fetchSummary();
  };

  const dataWithSerial = summaryData.map((row, index) => ({
    ...row,
    serial: index + 1,
  }));

  return (
    <div className="flex-1 overflow-auto relative z-10 bg-gray-50 min-h-screen">
      <main
        className={`transition-all duration-300 max-w-7xl mx-auto py-6 px-4 lg:px-8 space-y-6 ${isOpen ? "mr-[450px]" : ""
          }`}
      >
        {/* 🔹 Filter Bar */}
        <div className="bg-white shadow-lg rounded-xl p-4 border border-gray-200 flex flex-wrap items-end gap-3">
          {/* From Date */}
          {/* From Date */}
          <div className="flex flex-col">
            <label className="text-xs text-gray-600 mb-1">From</label>
            <input
              type="month"
              value={filters.fromDate}
              onChange={(e) =>
                setFilters((f) => ({ ...f, fromDate: e.target.value }))
              }
              className="border border-gray-300 text-sm rounded-lg px-3 py-1.5 focus:ring-2 focus:ring-blue-500"
            />
          </div>

          {/* To Date */}
          <div className="flex flex-col">
            <label className="text-xs text-gray-600 mb-1">To</label>
            <input
              type="month"
              value={filters.toDate}
              onChange={(e) =>
                setFilters((f) => ({ ...f, toDate: e.target.value }))
              }
              className="border border-gray-300 text-sm rounded-lg px-3 py-1.5 focus:ring-2 focus:ring-blue-500"
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
                className="border border-gray-300 text-sm rounded-lg px-3 py-1.5 bg-white focus:ring-2 focus:ring-blue-500"
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

          {/* DID Dropdown */}
          <div className="flex flex-col">
            <label className="text-xs text-gray-600 mb-1">DID</label>
            <select
              value={filters.did}
              onChange={(e) =>
                setFilters((f) => ({ ...f, did: e.target.value }))
              }
              className="border border-gray-300 text-sm rounded-lg px-3 py-1.5 bg-white focus:ring-2 focus:ring-blue-500"
            >
              <option value="">All</option>
              {didList.map((d) => (
                <option key={d.id} value={d.did}>
                  {d.did}
                </option>
              ))}
            </select>
          </div>

          {/* Buttons */}
          <div className="flex gap-2 ml-auto">
            <button
              onClick={fetchSummary}
              className="px-4 py-1.5 bg-gray-600 text-white text-sm rounded-lg shadow hover:bg-gray-700 transition-all"
            >
              Apply
            </button>
            <button
              onClick={resetFilters}
              className="px-4 py-1.5 bg-gray-200 text-gray-700 text-sm rounded-lg hover:bg-gray-300 transition-all"
            >
              Reset
            </button>
          </div>
        </div>

        {/* Table */}
        {loading ? (
          <div className="flex justify-center items-center h-64 text-gray-600">
            Loading monthly summary...
          </div>
        ) : (
          <div className="overflow-x-auto bg-white rounded-lg shadow">
            <DataTable title="Summary Per Month" columns={columns} data={dataWithSerial}
              headerActions={
                <div className="flex gap-2">
                  <ExportButton
                    data={summaryData}
                    columns={columns}
                    fileName="summaryData_Months_list"
                  />
                </div>
              }
            />
          </div>
        )}
      </main>
      <SideDrawer />
    </div>
  );
};

export default SummaryPerMonth;
