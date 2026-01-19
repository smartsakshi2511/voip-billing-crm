import { useEffect, useState } from "react";
import { BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid, ResponsiveContainer } from "recharts";
import { motion } from "framer-motion";
import axios from "axios";
import useAuth from "../../store/useAuth";

const RevenueChart = () => {
  const [data, setData] = useState([]);
  const { token } = useAuth();

  useEffect(() => {
    const fetchRevenue = async () => {
      try {
        const res = await axios.get(`https://${window.location.hostname}:5000/dashboard/revenue`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        setData(res.data);
      } catch (err) {
        console.error("Error fetching revenue data:", err);
      }
    };
    fetchRevenue();
  }, [token]);

  return (
    <motion.div
      className="bg-white aspect-square rounded-2xl shadow-md hover:shadow-lg transition-all duration-300 p-5"
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
    >
      <h2 className="text-base font-semibold text-gray-700 mb-3">
        Monthly Profit
      </h2>
      <ResponsiveContainer width="100%" height="85%">
        <BarChart data={data} barSize={30}>
          <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" />
          <XAxis
            dataKey="month"
            tick={{ fontSize: 12 }}
            axisLine={false}
            tickLine={false}
          />
          <YAxis
            tickFormatter={(v) => `$${v}`}
            tick={{ fontSize: 12 }}
            axisLine={false}
            tickLine={false}
          />
          <Tooltip
            formatter={(value) => [`$${Number(value).toFixed(2)}`, "Profit"]}
            contentStyle={{
              backgroundColor: "white",
              border: "1px solid #e5e7eb",
              borderRadius: "8px",
            }}
          />
          <Bar dataKey="profit" fill="#10B981" radius={[6, 6, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </motion.div>
  );
};

export default RevenueChart;
