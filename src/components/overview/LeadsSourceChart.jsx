import { useEffect, useState } from "react";
import {
  PieChart,
  Pie,
  Cell,
  ResponsiveContainer,
  Tooltip,
  Legend,
} from "recharts";
import { motion } from "framer-motion";
import axios from "axios";
import useAuth from "../../store/useAuth";

// 🌈 Slice Colors
const COLORS = ["#FF6B6B", "#4ECDC4", "#FFD93D", "#1A535C", "#FF9F1C"];

// ⭐ Default Pie (Empty State)
const DEFAULT_DATA = [
  { name: "Trunk A", value: 1, actualValue: 0 },
  { name: "Trunk B", value: 1, actualValue: 0 },
  { name: "Trunk C", value: 1, actualValue: 0 },
  { name: "Trunk D", value: 1, actualValue: 0 },
  { name: "Trunk E", value: 1, actualValue: 0 },
];

// ⭐ Custom Tooltip
const CustomTooltip = ({ active, payload }) => {
  if (active && payload && payload.length) {
    const slice = payload[0].payload;
    const bg = slice.fill;

    return (
      <div
        style={{
          backgroundColor: bg,
          padding: "8px 12px",
          borderRadius: "8px",
          color: "#fff",
          fontSize: "13px",
          boxShadow: "0 2px 8px rgba(0,0,0,0.25)",
        }}
      >
        <div><strong>{slice.name}</strong></div>
        <div>Value: {slice.actualValue}</div>
      </div>
    );
  }
  return null;
};

const LeadsSourceChart = () => {
  const { token } = useAuth();
  const [data, setData] = useState(DEFAULT_DATA);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const res = await axios.get(
          `https://${window.location.hostname}:5000/dashboard/top-trunks`,
          { headers: { Authorization: `Bearer ${token}` } }
        );

        // 🟡 Empty API → keep default pie
        if (!res.data || res.data.length === 0) {
          setData(DEFAULT_DATA);
          return;
        }

        const formatted = res.data.map((item) => ({
          ...item,
          value: item.value === 0 ? 1 : item.value, // ⭐ visual fix
          actualValue: item.value,
        }));

        setData(formatted);
      } catch (err) {
        console.error("Failed to fetch top trunks:", err);
        setData(DEFAULT_DATA);
      }
    };

    fetchData();
  }, [token]);

  return (
    <motion.div
      className="bg-white rounded-xl shadow-md p-4 hover:shadow-lg transition-shadow duration-300"
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
    >
      <h2 className="text-sm font-semibold text-gray-700 mb-2">
        Top 5 Trunks
      </h2>

      <div className="w-full h-[200px] sm:h-[240px]">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={data}
              cx="50%"
              cy="45%"
              innerRadius="50%"
              outerRadius="75%"
              dataKey="value"
              labelLine={false}
              isAnimationActive={false}   // ⭐ no blink
            >
              {data.map((entry, index) => (
                <Cell
                  key={index}
                  fill={COLORS[index % COLORS.length]}
                  cursor={entry.actualValue > 0 ? "pointer" : "default"}
                />
              ))}
            </Pie>

            {/* ✅ Tooltip works even if value = 0 */}
            <Tooltip
              content={<CustomTooltip />}
              wrapperStyle={{
                background: "none",
                border: "none",
                boxShadow: "none",
                padding: 0,
              }}
            />

            {/* ✅ Legend always visible */}
            <Legend
              verticalAlign="bottom"
              iconType="circle"
              wrapperStyle={{ fontSize: "12px" }}
            />
          </PieChart>
        </ResponsiveContainer>
      </div>
    </motion.div>
  );
};

export default LeadsSourceChart;
