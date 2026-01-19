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
        const response = await axios.get(
          `https://${window.location.hostname}:5000/dashboard/concurrent-calls`,
          { headers: { Authorization: `Bearer ${token}` } }
        );
        setData(response.data);
      } catch (error) {
        console.error("Error fetching chart data:", error);
      }
    };
    fetchData();
  }, [token]);

  return (
    <motion.div
      className="bg-white rounded-xl shadow p-4"
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.3 }}
    >
      <h2 className="text-sm sm:text-md font-semibold mb-2">
        Max Concurrent Calls (Past Week)
      </h2>

      <div className="h-[180px] sm:h-[220px]">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data} margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
            <XAxis
              dataKey="day"
              tick={{ fontSize: window.innerWidth < 640 ? 9 : 11 }}
              minTickGap={15}        // prevents overlapping
              tickLine={false}
              axisLine={false}
            />
            <YAxis
              tick={{ fontSize: window.innerWidth < 640 ? 9 : 11 }}
              width={30}             // smaller Y axis space
              tickLine={false}
              axisLine={false}
            />
            <Tooltip wrapperStyle={{ fontSize: "11px" }} />
            <Line
              type="monotone"
              dataKey="maxcalls"
              stroke="#6366F1"
              strokeWidth={2}
              dot={{ r: 2 }}        // small dots
              activeDot={{ r: 4 }}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </motion.div>
  );
};

export default VisitsChart;
