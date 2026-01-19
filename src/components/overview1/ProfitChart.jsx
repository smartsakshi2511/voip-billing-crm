import { useEffect, useState } from "react";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
} from "recharts";
import { motion } from "framer-motion";
import axios from "axios";
import useAuth from "../../store/useAuth";

const ProfitChart = () => {
  const [data, setData] = useState([]);
  const { token } = useAuth();

  useEffect(() => {
    const fetchProfit = async () => {
      try {
        const res = await axios.get(`https://${window.location.hostname}:5000/dashboard/profit`, {
          headers: { Authorization: `Bearer ${token}` },
        }); 
        const chartData = res.data.map((item) => ({
          month: item.month,
          profit: Number(item.totalRevenue),
        }));
        setData(chartData);
      } catch (err) {
        console.error("🔴 Failed to fetch profit data:", err);
      }
    };
    fetchProfit();
  }, [token]);

  return (
    <motion.div
      className="bg-white rounded-xl shadow-md p-4 hover:shadow-lg transition-shadow duration-300"
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.4 }}
    >
      <h2 className="text-lg font-semibold text-gray-700 mb-4">Revenue Graph</h2>
      <div className="h-40">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={data} margin={{ top: 10, right: 0, left: 0, bottom: 0 }}>
            <defs>
              <linearGradient id="profitGradient" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#F59E0B" stopOpacity={0.4} />
                <stop offset="100%" stopColor="#FBBF24" stopOpacity={0.1} />
              </linearGradient>
            </defs>
            <CartesianGrid stroke="#f0f0f0" strokeDasharray="3 3" />
            <XAxis dataKey="month" stroke="#9CA3AF" />
            <YAxis stroke="#9CA3AF" tickFormatter={(value) => `$${value}`} />
            <Tooltip
              contentStyle={{
                borderRadius: "8px",
                border: "none",
                boxShadow: "0 2px 6px rgba(0,0,0,0.1)",
              }}
              itemStyle={{ color: "#1F2937", fontWeight: 500 }}
              formatter={(value) => [`$${Number(value).toFixed(2)}`, "Revenue"]}
            />
            <Area
              type="monotone"
              dataKey="profit"
              stroke="#F59E0B"
              fill="url(#profitGradient)"
              strokeWidth={2}
              dot={{ r: 3, stroke: "#F59E0B", strokeWidth: 2 }}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </motion.div>
  );
};

export default ProfitChart;
