import { useState, useEffect, useMemo, useCallback } from "react";
import axios from "axios";
import DataTable from "../reuseable/DataTable";
import CommonPopup from "../reuseable/CommonPopup";
import useAuth from "../../store/useAuth";

const formatDuration = (seconds) => {
  const h = String(Math.floor(seconds / 3600)).padStart(2, "0");
  const m = String(Math.floor((seconds % 3600) / 60)).padStart(2, "0");
  const s = String(seconds % 60).padStart(2, "0");
  return `${h}:${m}:${s}`;
};

const OnlineCallsList = () => {
  const [calls, setCalls] = useState([]);
  const [loading, setLoading] = useState(true);

  const { token } = useAuth();
 
  const fetchOnlineCalls = useCallback(async () => {
    try {
      const res = await axios.get(
        `https://${window.location.hostname}:5000/onlinecalls`,
        {
          headers: { Authorization: `Bearer ${token}` },
        }
      );

      setCalls(res.data);
    } catch (err) {
      console.error("🔴 Failed to fetch online calls:", err);
    } finally {
      setLoading(false);
    }
  }, [token]);
 
  useEffect(() => {
    if (!token) return;

    fetchOnlineCalls();
    const poll = setInterval(fetchOnlineCalls, 3000);
    return () => clearInterval(poll);
  }, [token, fetchOnlineCalls]);
 
  useEffect(() => {
    const timer = setInterval(() => {
      setCalls((prev) => [...prev]);
    }, 1000);
    return () => clearInterval(timer);
  }, []);

const columns = useMemo(
  () => [
    { header: "SIP", accessor: "sipaccount" },
    { header: "User", accessor: "user" },
    { header: "Start Time", accessor: "start_time" },
    { header: "CallerID", accessor: "callerid" },
    { header: "Callerip", accessor: "callerip" },
    { header: "Number", accessor: "number" },
    { header: "Credit", accessor: "credit" },

    {
      header: "Duration",
      accessor: "duration",
      Cell: ({ row }) => {
        const duration = Number(row.duration || 0);
        return formatDuration(duration);
      },
    },

    { header: "Status", accessor: "status" },
    { header: "Direction", accessor: "direction" },
  ],
  []
);


  return (
    <div className="flex-1 overflow-auto relative z-10">
      <main className="max-w-7xl mx-auto py-6 px-4 lg:px-8">
        <DataTable
          title="Online Calls List"
          columns={columns}
          data={calls}
          loading={loading}
        />
      </main>

      <CommonPopup />
    </div>
  );
};

export default OnlineCallsList;
