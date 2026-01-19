import { useState, useEffect } from "react";
import axios from "axios";
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip
} from "recharts";
import { motion } from "framer-motion";
import useAuth from "../../store/useAuth";

const dayNames = ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"];
const monthNames = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];

const RevenueChart = () => {
  const [data, setData] = useState([]);
  const [filter, setFilter] = useState("month");
  const { token, role } = useAuth();

  const title = role === "admin" ? "Revenue Trend" : "Consumption Trend";
  const hasData = data.length > 0;

  // ⭐ FIX 1: minimum 2 points required
  const dummyData = [
    { label: "", profit: 0 },
    { label: "", profit: 0 },
  ];

  useEffect(() => {
    const fetchRevenue = async () => {
      try {
        const res = await axios.get(
          `https://${window.location.hostname}:5000/dashboard/revenue?filter=${filter}`,
          { headers: { Authorization: `Bearer ${token}` } }
        );

        const formatted = res.data.map((item) => {
          let label = "";

          if (filter === "month") {
            const [_, month] = item.month.split("-");
            label = monthNames[month - 1];
          }

          if (filter === "week") {
            label = dayNames[new Date(item.day).getDay()];
          }

          if (filter === "day") {
            const d = new Date(item.day);
            label = `${d.getHours()}:${String(d.getMinutes()).padStart(2, "0")}`;
          }

          return { ...item, label };
        });

        setData(formatted);
      } catch (err) {
        console.error("Error fetching revenue data:", err);
        setData([]);
      }
    };

    fetchRevenue();
  }, [token, filter]);

  return (
    <motion.div
      className="bg-white rounded-2xl shadow-lg p-6 hover:shadow-xl transition-all duration-300"
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
    >
      <div className="flex justify-between items-center mb-4">
        {/* ⭐ Title size same as other cards */}
        <h2 className="text-sm font-semibold text-gray-800 tracking-wide">
          {title}
        </h2>

        <select
          className="border rounded-lg px-3 py-1.5 text-sm bg-gray-50 hover:bg-gray-100 transition"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
        >
          <option value="month">Monthly</option>
          <option value="week">Weekly</option>
          <option value="day">Today</option>
        </select>
      </div>

      <div className="w-full h-[180px] sm:h-[200px]">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart
            data={hasData ? data : dummyData}
            margin={{ top: 5, right: 5, left: -10, bottom: 5 }}
          >
            <defs>
              <linearGradient id="lineGradient" x1="0" y1="0" x2="1" y2="0">
                <stop offset="0%" stopColor="#6366F1" />
                <stop offset="50%" stopColor="#10B981" />
                <stop offset="100%" stopColor="#F59E0B" />
              </linearGradient>
            </defs>

            <CartesianGrid strokeDasharray="3 3" opacity={0.15} />

            <XAxis
              dataKey="label"
              minTickGap={15}
              tick={{ fontSize: 10 }}
              tickLine={false}
              axisLine={false}
            />

            <YAxis
              tick={{ fontSize: 10 }}
              width={30}
              tickFormatter={(v) => `$${v}`}
              tickLine={false}
              axisLine={false}
            />

            {/* Tooltip only when real data */}
            {hasData && (
              <Tooltip
                wrapperStyle={{ fontSize: "11px" }}
                contentStyle={{
                  backgroundColor: "#ffffff",
                  borderRadius: "6px",
                  border: "1px solid #e5e7eb",
                  padding: "4px 6px",
                }}
              />
            )}

            {/* ⭐ FIX 2: Line ALWAYS rendered */}
            <Line
              type="monotone"
              dataKey="profit"
              stroke="url(#lineGradient)"
              strokeWidth={2}
              dot={hasData ? { r: 2 } : false}
              activeDot={hasData ? { r: 5 } : false}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </motion.div>
  );
};

export default RevenueChart;
