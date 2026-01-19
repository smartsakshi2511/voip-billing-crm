import { useState, useEffect } from "react";
import axios from "axios";
import DataTable from "../reuseable/DataTable";
import SideDrawer from "../reuseable/SideDrawer";
import useAuth from "../../store/useAuth";
import usePopupStore from "../../store/usePopupStore";
import ExportButton from "../reuseable/ExportButton";


const SummaryOfTrunk = () => {
  const [summaryData, setSummaryData] = useState([]);
  const [codeList, setCodeList] = useState([]);
  const [selectedCode, setSelectedCode] = useState("");
  const [trunkList, setTrunkList] = useState([]);
  const [loading, setLoading] = useState(true);
  const { token, role } = useAuth();
  const { isOpen } = usePopupStore();

  const [filters, setFilters] = useState({
    trunk: "",
    fromDate: "",
    toDate: "",
  });

  const columns = [
    { header: "S.No", accessor: "serial", exportable: false },
    {
      header: "Date",
      accessor: "timestamp",
      Cell: ({ value }) => {
        const formattedDate = value
          ? new Date(value).toISOString().split("T")[0]
          : "";
        return <span className="whitespace-nowrap">{formattedDate}</span>;
      },
    },
    { header: "ASR", accessor: "ASR", title: "Average Success Ratio" },
    { header: "ACD", accessor: "ACR", title: "Average Call Duration" },
    ...(role !== "client" ? [{ header: "Trunk ID", accessor: "trunk_id" }] : []),
    { header: "Trunk Name", accessor: "trunk" },

    ...(role !== "client" ? [{ header: "Code", accessor: "code" }] : []),
    { header: "NotCon Calls", accessor: "other_call" },
    { header: "Connected Calls", accessor: "connected_calls" },
  ]

  // 🟡 Fetch trunk dropdown (from tariff_trunks)
  useEffect(() => {
    const fetchTrunks = async () => {
      try {
        console.log("🟡 Fetching trunk list...");
        const res = await axios.get(`https://${window.location.hostname}:5000/tariff_trunks`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        console.log("✅ Trunk List Response:", res.data);
        setTrunkList(res.data);
      } catch (err) {
        console.error("❌ Failed to fetch trunks:", err);
      }
    };

    if (token) fetchTrunks();
  }, [token]);

  // 🟢 Fetch Summary Data
  const fetchSummary = async () => {
    try {
      setLoading(true);

      const params = {};
      if (filters.trunk) params.trunk = filters.trunk;
      if (selectedCode) params.code = selectedCode;  // add code filter
      if (filters.fromDate) params.from = filters.fromDate;
      if (filters.toDate) params.to = filters.toDate;

      const res = await axios.get(
        `https://${window.location.hostname}:5000/trunk-summary`,
        {
          headers: { Authorization: `Bearer ${token}` },
          params,
        }
      );

      setSummaryData(res.data);
    } catch (err) {
      console.error("Failed to fetch trunk summary:", err);
    } finally {
      setLoading(false);
    }
  };


  useEffect(() => {
    if (token) fetchSummary();
  }, [token]);

  const resetFilters = () => {
    setFilters({ trunk: "", fromDate: "", toDate: "" });
    setSelectedCode("");
    fetchSummary();
  };

  const dataWithSerial = summaryData.map((row, index) => ({
    ...row,
    serial: index + 1,
  }));

  useEffect(() => {
    const fetchCodes = async () => {
      try {
        const res = await axios.get(
          `https://${window.location.hostname}:5000/trunk-codes`,
          {
            headers: { Authorization: `Bearer ${token}` },
          }
        );
        setCodeList(res.data);
      } catch (err) {
        console.error("Failed to fetch codes:", err);
      }
    };

    if (token) fetchCodes();
  }, [token]);



  return (
    <div className="flex-1 overflow-auto relative z-10 bg-gray-50 min-h-screen">
      <main
        className={`transition-all duration-300 max-w-7xl mx-auto py-6 px-4 lg:px-8 space-y-6 ${isOpen ? "mr-[450px]" : ""
          }`}
      >
        {/* 🔹 Filter Bar */}
        <div className="bg-white shadow-lg rounded-xl p-4 border border-gray-200 flex flex-wrap items-end gap-3">



          {/* From Date */}
          <div className="flex flex-col">
            <label className="text-xs text-gray-600 mb-1">From</label>
            <input
              type="date"
              value={filters.fromDate}
              onChange={(e) =>
                setFilters((f) => ({ ...f, fromDate: e.target.value }))
              }
              className="border border-gray-300 text-sm rounded-lg px-3 py-1.5 focus:ring-2 focus:ring-gray-500 focus:border-gray-400"
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
              className="border border-gray-300 text-sm rounded-lg px-3 py-1.5 focus:ring-2 focus:ring-gray-500 focus:border-gray-400"
            />
          </div>


          {/* Trunk Dropdown */}
          <div className="flex flex-col">
            <label className="text-xs text-gray-600 mb-1">Trunk</label>
            <select
              value={filters.trunk}
              onChange={(e) =>
                setFilters((f) => ({ ...f, trunk: e.target.value }))
              }
              className="border border-gray-300 text-sm rounded-lg px-3 py-1.5 bg-white focus:ring-2 focus:ring-gray-500 focus:border-gray-400"
            >
              <option value="">All</option>
              {trunkList.map((t) => (
                <option key={t.id} value={t.trunkname}>
                  {t.trunkname}
                </option>
              ))}
            </select>
          </div>

          {/* Code Dropdown */}
          <div className="flex flex-col">
            <label className="text-xs text-gray-600 mb-1">Code</label>
            <select
              value={selectedCode}
              onChange={(e) => setSelectedCode(e.target.value)}
              className="border border-gray-300 text-sm rounded-lg px-3 py-1.5 bg-white"
            >
              <option value="">All</option>
              {codeList.map((c) => (
                <option key={c} value={c}>
                  {c}
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
            Loading trunk summary...
          </div>
        ) : (
          <div className="overflow-x-auto bg-white rounded-lg shadow">
            <DataTable
              title="Summary of Trunk"
              columns={columns}
              data={dataWithSerial}
              headerActions={
                <div className="flex gap-2">
                  <ExportButton
                    data={summaryData}
                    columns={columns}
                    fileName="trunkList_list"
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

export default SummaryOfTrunk;
