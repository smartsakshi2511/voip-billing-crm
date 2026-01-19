import { useState, useEffect, useMemo } from "react";
import axios from "axios";
import DataTable from "../reuseable/DataTable";
import { ChevronDown } from "lucide-react"; 
import useAuth from "../../store/useAuth";

const Badge = ({ color = "gray", children }) => {
  const colorMap = {
    gray: "bg-gray-100 text-gray-700 border border-gray-300",
    blue: "bg-blue-100 text-blue-700 border border-blue-300",
    green: "bg-green-100 text-green-700 border border-green-300",
    orange: "bg-orange-100 text-orange-700 border border-orange-300",
    red: "bg-red-100 text-red-700 border border-red-300",
    purple: "bg-purple-100 text-purple-700 border border-purple-300",
  };

  return (
    <span className={`px-2 py-1 rounded-lg text-xs font-medium ${colorMap[color]}`}>
      {children}
    </span>
  );
};
const ActivityLog = () => {
  const { token } = useAuth();
  const [logs, setLogs] = useState([]);
  const [search, setSearch] = useState("");

  const fetchLogs = async () => {
    try {
      const res = await axios.get(
        `https://${window.location.hostname}:5000/logs`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      setLogs(res.data);
    } catch (e) {
      console.error("Failed to load logs", e);
    }
  };

  useEffect(() => {
    if (token) fetchLogs();
  }, [token]);
 
  const filteredLogs = useMemo(() => {
    return logs.filter((log) =>
      Object.values(log).some((value) =>
        String(value).toLowerCase().includes(search.toLowerCase())
      )
    );
  }, [search, logs]);

  const columns = useMemo(
    () => [
      { header: "ID", accessor: "admin_log_id" },
      { header: "Date", accessor: "event_date" },
      { header: "User", accessor: "user" },
      { header: "IP", accessor: "ip_address" },

      {
        header: "Section",
        accessor: "event_section",
        Cell: ({ row }) => (
          <Badge  >{row?.event_section || "N/A"}</Badge>
        ),
      },
      {
        header: "Action",
        accessor: "event_type",
        Cell: ({ row }) => (
     <Badge color={row?.event_type === "ADD" ? "green" : "orange"}>
  {row?.event_type || "N/A"}
</Badge>
        ),
      },

      { header: "Record", accessor: "record_id" },
      { header: "Code", accessor: "event_code" },

    //   {
    //     header: "SQL",
    //     accessor: "event_sql",
    //     Cell: ({ row }) => (
    //       <details className="cursor-pointer text-sm text-gray-700">
    //         <summary className="flex items-center gap-1 text-blue-600">
    //           View SQL <ChevronDown size={14} />
    //         </summary>
    //         <pre className="bg-gray-100 p-2 mt-2 rounded text-gray-800 overflow-auto whitespace-pre-wrap">
    //           {row?.event_sql || "N/A"}
    //         </pre>
    //       </details>
    //     ),
    //   },

      { header: "Notes", accessor: "event_notes" },
    //   { header: "User Group", accessor: "user_group" },
    ],
    []
  );

  return (
    <div className="flex-1 overflow-auto bg-gray-50 min-h-screen p-6">
      <DataTable
        title="Activity Log"
        columns={columns}
        data={filteredLogs}
        pageSize={20}
        hoverEffect
        striped
      />
    </div>
  );
};

export default ActivityLog;
