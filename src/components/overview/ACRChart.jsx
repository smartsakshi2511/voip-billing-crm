import { useEffect, useState } from "react";
import {
  LineChart, Line, XAxis, YAxis,
  Tooltip, ResponsiveContainer, CartesianGrid
} from "recharts";
import { motion } from "framer-motion";
import axios from "axios";
import useAuth from "../../store/useAuth";

const dayNames = ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"];
const monthNames = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];

const ACRChart = () => {
  const [data, setData] = useState([]);
  const [filter, setFilter] = useState("month");
  const { token } = useAuth();

  const hasData = data.length > 0;

  useEffect(() => {
    const fetchData = async () => {
      try {
        const res = await axios.get(
          `https://${window.location.hostname}:5000/dashboard/asr-acr?filter=${filter}`,
          { headers: { Authorization: `Bearer ${token}` } }
        );

        const formatted = res.data.map((item) => {
          let label = item.label;

          if (filter === "month") {
            const [, month] = item.label.split("-");
            label = monthNames[Number(month) - 1];
          } else if (filter === "week") {
            label = dayNames[new Date(item.label).getDay()];
          } else {
            const d = new Date(item.label);
            label = `${d.getHours()}:${String(d.getMinutes()).padStart(2,"0")}`;
          }

          return { label, acr: Number(item.ACR) };
        });

        setData(formatted);
      } catch (err) {
        console.error(err);
        setData([]);
      }
    };

    fetchData();
  }, [token, filter]);

  return (
    <motion.div
      className="bg-white rounded-2xl shadow-md p-3 hover:shadow-lg transition-all duration-300"
      initial={{ opacity: 0, y: 15 }}
      animate={{ opacity: 1, y: 0 }}
    >
      <div className="flex justify-between items-center mb-2">
        <h2 className="text-sm font-semibold text-gray-700">
          Avg Call Duration
        </h2>

        <select
          className="border rounded-md px-2 py-1 text-xs bg-gray-50"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
        >
          <option value="month">Monthly</option>
          <option value="week">Weekly</option>
          <option value="day">Today</option>
        </select>
      </div>

      <div className="h-36 sm:h-40">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart
            data={hasData ? data : [{}]}
            margin={{ top: 5, right: 5, left: 0, bottom: 5 }}
          >
            <defs>
              <linearGradient id="acrGradient" x1="0" y1="0" x2="1" y2="0">
                <stop offset="0%" stopColor="#3B82F6" />
                <stop offset="50%" stopColor="#6366F1" />
                <stop offset="100%" stopColor="#8B5CF6" />
              </linearGradient>
            </defs>

            <CartesianGrid strokeDasharray="3 3" opacity={0.15} />

            <XAxis
              dataKey="label"
              stroke="#9CA3AF"
              tick={{ fontSize: 10 }}
              interval="preserveStartEnd"
            />

            <YAxis
              stroke="#9CA3AF"
              tick={{ fontSize: 10 }}
              domain={hasData ? ["auto", "auto"] : [0, 60]}
            />

            {hasData && (
              <>
                <Tooltip
                  formatter={(v) => [`${v}`, "ACR"]}
                  contentStyle={{
                    borderRadius: "8px",
                    border: "none",
                    boxShadow: "0 2px 6px rgba(0,0,0,0.1)",
                  }}
                />

                <Line
                  type="monotone"
                  dataKey="acr"
                  stroke="url(#acrGradient)"
                  strokeWidth={3}
                  dot={{ r: 2 }}
                  activeDot={{ r: 4 }}
                />
              </>
            )}
          </LineChart>
        </ResponsiveContainer>
      </div>
    </motion.div>
  );
};

export default ACRChart;
