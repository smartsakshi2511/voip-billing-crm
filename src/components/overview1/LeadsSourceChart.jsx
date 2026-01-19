import { useEffect, useState } from "react";
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip, Legend } from "recharts";
import { motion } from "framer-motion";
import axios from "axios";
import useAuth from "../../store/useAuth";

const COLORS = ["#3B82F6", "#10B981", "#F59E0B", "#F97316", "#8B5CF6"];

const LeadsSourceChart = () => {
  const [data, setData] = useState([]);
  const { token } = useAuth();

  useEffect(() => {
    const fetchData = async () => {
      try {
        const res = await axios.get(`https://${window.location.hostname}:5000/dashboard/top-trunks`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        setData(res.data);
      } catch (err) {
        console.error("Error fetching top trunks:", err);
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
        Top 5 Trunks
      </h2>
      <ResponsiveContainer width="100%" height="85%">
        <PieChart>
          <Pie
            data={data}
            cx="50%"
            cy="50%"
            outerRadius="70%"
            dataKey="value"
            labelLine={false}
            label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
          >
            {data.map((_, i) => (
              <Cell key={i} fill={COLORS[i % COLORS.length]} />
            ))}
          </Pie>
          <Tooltip
            formatter={(v, _, props) => [`${v} calls`, props.payload.name]}
            contentStyle={{
              backgroundColor: "#fff",
              border: "1px solid #e5e7eb",
              borderRadius: "8px",
            }}
          />
          <Legend verticalAlign="bottom" height={30} iconType="circle" />
        </PieChart>
      </ResponsiveContainer>
    </motion.div>
  );
};

export default LeadsSourceChart;
