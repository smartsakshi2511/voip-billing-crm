import { useEffect, useState } from "react";
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer } from "recharts";
import { motion } from "framer-motion";
import axios from "axios";
import useAuth from "../../store/useAuth";

const VisitsChart = () => {
  const [data, setData] = useState([]);
  const { token } = useAuth();

  useEffect(() => {
    const fetchData = async () => {
      try {
        const res = await axios.get(`https://${window.location.hostname}:5000/dashboard/concurrent-calls`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        setData(res.data);
      } catch (err) {
        console.error("Error fetching chart data:", err);
      }
    };
    fetchData();
  }, [token]);

  return (
    <motion.div
      className="bg-white aspect-square rounded-2xl shadow-md hover:shadow-lg transition-all duration-300 p-5"
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
    >
      <h2 className="text-base font-semibold text-gray-700 mb-3">
        Con Calls (Past Week)
      </h2>
      <ResponsiveContainer width="100%" height="85%">
        <LineChart data={data}>
          <XAxis dataKey="day" tick={{ fontSize: 12 }} axisLine={false} tickLine={false} />
          <YAxis tick={{ fontSize: 12 }} axisLine={false} tickLine={false} />
          <Tooltip />
          <Line type="monotone" dataKey="maxcalls" stroke="#6366F1" strokeWidth={2} dot={false} />
        </LineChart>
      </ResponsiveContainer>
    </motion.div>
  );
};

export default VisitsChart;
