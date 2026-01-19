import { useState, useEffect, useMemo, useCallback } from "react";
import axios from "axios";
import DataTable from "../reuseable/DataTable";
import SideDrawer from "../reuseable/SideDrawer";
import useAuth from "../../store/useAuth";
import usePopupStore from "../../store/usePopupStore";
import CDRView from "../Form/userForm/CDRView";
import { Eye } from "lucide-react";
import {
  PhoneCall,
  ArrowDownLeft,
  ArrowUpRight,
  HelpCircle,
} from "lucide-react";

import RecordingPlayer from "../reuseable/RecordingPlayer";
import ExportButton from "../reuseable/ExportButton";
const CDRList = () => {
  const [cdrs, setCdrs] = useState([]);
  const [loading, setLoading] = useState(true);
  const { token, role } = useAuth();
  const { openPopup, isOpen } = usePopupStore();
  const [filters, setFilters] = useState({
    from: "",
    to: "",
    did: "",
    userid: "",
    status: "",
  });

const columns = useMemo(() => {
  const baseColumns = [
   ...(role === "admin"
    ? [ { header: "S.No", accessor: "serial", title: "Serial No", exportable: false }] : []),
  { header: "User ID", accessor: "userid", title: "User ID" },
 { header: "CLI", accessor: "call_from", title: "CLI" },
  { header: "Number", accessor: "call_to", title: "Number" },
  { header: "SIP Acc", accessor: "sipaccount", title: "SIP Account" },
  { header: "DID", accessor: "did", title: "DID" },
  ...(role === "admin"
    ? [{ header: "Trunk", accessor: "Trunk", title: "Trunk" }]
    : []),
  { header: "forword", accessor: "typeofcall", title: "Type Of Call" },
  { header: "Duration", accessor: "actualduration", title: "Actual Duration" },
     { header: "ring", accessor: "ringduration", title: "ring Duration" },

  {
    header: "Time",
    accessor: "Timestamp",
    Cell: ({ value }) => {
      const formatted = value?.replace("T", " ").replace(".000Z", "");
      return (
        <span className="whitespace-nowrap">{formatted}</span>
      );
    },
    title: "Time"
  },
  { header: "Cost", accessor: "sellcost", title: "Cost" },
  {
    header: "Direction",
    accessor: "direction",
    title: "Direction",
    Cell: ({ value }) => {
      const direction = value?.toLowerCase() || "";

      let icon, color, title;

      switch (direction) {
        case "inbound":
          icon = <ArrowDownLeft size={16} />;
          color = "text-green-600";
          title = "Inbound Call";
          break;
        case "outbound":
          icon = <ArrowUpRight size={16} />;
          color = "text-blue-600";
          title = "Outbound Call";
          break;
        default:
          icon = <HelpCircle size={16} />;
          color = "text-gray-400";
          title = "Unknown Direction";
      }

      return (
        <div
          className={`flex items-center justify-center ${color}`}
          title={title}
        >
          {icon}
        </div>
      );
    },
  },

  {
    header: "Status",
    accessor: "status_info",
    title: "Status & Balance Status",
    Cell: ({ row }) => {
      const status = row.status?.toUpperCase() || "";
      const balance = row.balance_status?.trim().toUpperCase() || "";
      const failedReason = row.FailedReason?.trim() || "";
      let statusIcon, statusColor, statusTitle;

      switch (status) {
        case "ANSWER":
          statusIcon = <PhoneCall size={13} />;
          statusColor = "text-green-700";
          statusTitle = "Answered";
          break;
        case "CANCEL":
          statusIcon = <i className="fa-solid fa-phone-slash"></i>;
          statusColor = "text-red-500";
          statusTitle = "Cancelled";
          break;
        case "BUSY":
          statusIcon = <i className="fa-solid fa-user-xmark"></i>;
          statusColor = "text-orange-500";
          statusTitle = "Busy";
          break;
        case "CHANUNAVAIL":
          statusIcon = <i className="fa-solid fa-user"></i>;
          statusColor = "text-blue-500";
          statusTitle = "Channel Unavailable";
          break;
        case "NOANSWER":
          statusIcon = <i className="fa-solid fa-phone-volume"></i>;
          statusColor = "text-yellow-600";
          statusTitle = "No Answer";
          break;
        case "CONGESTION":
          statusIcon = <i className="fa-solid fa-network-wired"></i>;
          statusColor = "text-purple-500";
          statusTitle = "Congestion";
          break;
        default:
          statusIcon = <i className="fa-solid fa-circle-question"></i>;
          statusColor = "text-gray-400";
          statusTitle = "Unknown";
      }
      const combinedStatusTitle = failedReason
        ? `${statusTitle} `
        : statusTitle;
      let balanceIcon, balanceColor, balanceTitle;

      switch (balance) {
        case "DETECTED":
          balanceIcon = <i className="fa-solid fa-circle-check"></i>;
          balanceColor = "text-green-500";
          balanceTitle = "Billed";
          break;
        case "NOTDETECTED":
          balanceIcon = <i className="fa-solid fa-circle-xmark"></i>;
          balanceColor = "text-red-500";
          balanceTitle = "Not Billed";
          break;
        case "NOTABLEDETECT":
          balanceIcon = <i className="fa-solid fa-triangle-exclamation"></i>;
          balanceColor = "text-yellow-500";
          balanceTitle = "Notable Billed";
          break;
        default:
          balanceIcon = <i className="fa-solid fa-circle-question"></i>;
          balanceColor = "text-gray-400";
          balanceTitle = "Unknown";
      }

      return (
        <div className="flex items-center gap-4 justify-center">
          {/* Status icon with combined title */}
          <div className={`${statusColor}`} title={combinedStatusTitle}>
            {statusIcon}
          </div>
          <div className={`${balanceColor}`} title={balanceTitle}>
            {balanceIcon}
          </div>
        </div>
      );
    },
  },
  {
    header: "Record",
    accessor: "recording_url",
    title: "Recording",
    exportable: false,
    Cell: ({ value }) => <RecordingPlayer url={value} />,
  },

   ...(role === "admin" ? [{ header: "View", accessor: "actions" }] : []),
];
  return baseColumns;
}, [role]);

  const fetchCDRs = useCallback(async () => {
    try {
      setLoading(true);
      const params = {};

      Object.entries(filters).forEach(([key, val]) => {
        if (val) params[key] = val;
      });

      const res = await axios.get(`https://${window.location.hostname}:5000/cdr`, {
        headers: { Authorization: `Bearer ${token}` },
        params,
      });

      setCdrs(res.data);
    } catch (err) {
      console.error("Failed to fetch", err);
    } finally {
      setLoading(false);
    }
  }, [filters, token]);

  useEffect(() => {
    if (token) fetchCDRs();
  }, [token]);

  const handleView = useCallback((row) => {
    openPopup(`CDR Details – ${row.uniqueid}`, <CDRView data={row} />);
  }, []);

  const dataWithActions = useMemo(
    () =>
      cdrs.map((c, index) => ({
        ...c,
        serial: index + 1,
      status_info: `${c.status || "UNKNOWN"} / ${
        c.balance_status || "UNKNOWN"
      }`,

        actions: (
          <button
            key={c.uniqueid || index}
            onClick={() => handleView(c)}
            className="text-blue-600 hover:text-blue-400 transition-colors"
            title="View"
          >
            <Eye size={16} />
          </button>
        ),
      })),
    [cdrs]
  );

  const resetFilters = () => {
    setFilters({ from: "", to: "", did: "", userid: "", status: "" });
    fetchCDRs();
  };

  return (
    <div className="flex-1 overflow-auto relative z-10 bg-gray-50 min-h-screen">
      <main
        className={`transition-all duration-300 max-w-7xl mx-auto py-6 px-4 lg:px-8 space-y-6 ${isOpen ? "mr-[450px]" : ""
          }`}
      >
        <div className="bg-white shadow rounded-lg p-4 grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4 items-end">
          <div className="flex flex-col">
            <label className="text-sm font-medium text-gray-600">From</label>
            <input
              type="date"
              value={filters.from}
              onChange={(e) =>
                setFilters((f) => ({ ...f, from: e.target.value }))
              }
              className="border border-gray-300 rounded px-2 py-1 focus:outline-none focus:ring-2 focus:ring-gray-400"
            />
          </div>
          <div className="flex flex-col">
            <label className="text-sm font-medium text-gray-600">To</label>
            <input
              type="date"
              value={filters.to}
              onChange={(e) =>
                setFilters((f) => ({ ...f, to: e.target.value }))
              }
              className="border border-gray-300 rounded px-2 py-1 focus:outline-none focus:ring-2 focus:ring-gray-400"
            />
          </div>
          <div className="flex flex-col">
            <label className="text-sm font-medium text-gray-600">DID</label>
            <input
              type="text"
              value={filters.did}
              onChange={(e) =>
                setFilters((f) => ({ ...f, did: e.target.value }))
              }
              placeholder="DID"
              className="border border-gray-300 rounded px-2 py-1 focus:outline-none focus:ring-2 focus:ring-gray-400"
            />
          </div>
          <div className="flex flex-col">
            <label className="text-sm font-medium text-gray-600">User ID</label>
            <input
              type="text"
              value={filters.userid}
              onChange={(e) =>
                setFilters((f) => ({ ...f, userid: e.target.value }))
              }
              placeholder="User ID"
              className="border border-gray-300 rounded px-2 py-1 focus:outline-none focus:ring-2 focus:ring-gray-400"
            />
          </div>
          <div className="flex flex-col">
            <label className="text-sm font-medium text-gray-600">Status</label>
            <select
              value={filters.status}
              onChange={(e) =>
                setFilters((f) => ({ ...f, status: e.target.value }))
              }
              className="border border-gray-300 rounded px-2 py-1 focus:outline-none focus:ring-2 focus:ring-gray-400"
            >
              <option value="">All</option>
              <option value="ANSWER">ANSWER</option>
              <option value="NO ANSWER">NOANSWER</option>
              <option value="CANCEL">CANCEL</option>
            </select>
          </div>
          <div className="flex gap-2">
            <button
              onClick={fetchCDRs}
              className="px-4 py-1 bg-gray-600 text-white rounded hover:bg-gray-700 transition-colors"
            >
              Filter
            </button>
            <button
              onClick={resetFilters}
              className="px-4 py-1 bg-gray-300 rounded hover:bg-gray-400 transition-colors"
            >
              Reset
            </button>
          </div>
        </div>
        <div className="overflow-x-auto bg-white rounded-lg shadow">
          <DataTable
            title="CDR List"
            columns={columns}
            data={dataWithActions}
            stickyHeader
            loading={loading}
            striped
            hover
             headerActions={
              <ExportButton
                data={dataWithActions}
                columns={columns}
                fileName="cdrs_list"
              />
              
            }
              onRefresh={fetchCDRs} 
          />
        </div>
      </main>
      <SideDrawer />
    </div>
  );
};

export default CDRList;
