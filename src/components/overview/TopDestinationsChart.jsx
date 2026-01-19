import { useEffect, useState } from "react";
import {
  PieChart,
  Pie,
  Cell,
  ResponsiveContainer,
  Tooltip,
  Legend,
} from "recharts";
import axios from "axios";
import useAuth from "../../store/useAuth";

// 🎨 Chart Colors
const COLORS = ["#3E8EDE", "#34C38F", "#F1B44C", "#F46A6A", "#6F42C1"];

// ⭐ Default pie (when API has no data)
const DEFAULT_PIE = [
  { name: "USA", value: 1, actualValue: 0, code: "US" },
  { name: "UK", value: 1, actualValue: 0, code: "UK" },
  { name: "India", value: 1, actualValue: 0, code: "IN" },
  { name: "UAE", value: 1, actualValue: 0, code: "AE" },
  { name: "Other", value: 1, actualValue: 0, code: "OT" },
];

const TopDestinationsChart = () => {
  const { token } = useAuth();

  // ✅ Initialize with DEFAULT_PIE (important)
  const [data, setData] = useState(DEFAULT_PIE);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const res = await axios.get(
          `https://${window.location.hostname}:5000/dashboard/top-destinations`,
          { headers: { Authorization: `Bearer ${token}` } }
        );

        // 🟡 If API empty → keep default pie
        if (!res.data || res.data.length === 0) {
          setData(DEFAULT_PIE);
          return;
        }

        const total = res.data.reduce((sum, item) => sum + item.value, 0);

        const normalized = res.data.map((item) => ({
          ...item,
          percentage:
            total === 0
              ? "0.0"
              : ((item.value / total) * 100).toFixed(1),
        }));

        setData(normalized);
      } catch (err) {
        console.error("Error:", err);
        setData(DEFAULT_PIE);
      }
    };

    fetchData();
  }, [token]);

  const handleCountryClick = async (entry) => {
    if (!entry || entry.value === 0) return;

    try {
      await axios.get(
        `https://${window.location.hostname}:5000/dashboard/top-trunkcalls?code=${entry.code}`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
    } catch (err) {
      console.error("Error:", err);
    }
  };

  return (
    <div className="bg-white rounded-2xl shadow-md p-4 sm:p-6">
      <h2 className="text-sm sm:text-base font-semibold mb-2 text-gray-800">
        Top 5 Destinations
      </h2>

      <div className="w-full h-[180px] sm:h-[220px]">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={data}
              cx="50%"
              cy="40%"
              outerRadius="65%"
              dataKey="value"
              labelLine={false}
              isAnimationActive={false}
            >
              {data.map((entry, i) => (
                <Cell
                  key={i}
                  fill={COLORS[i % COLORS.length]}
                  cursor={entry.value > 0 ? "pointer" : "default"}
                  onClick={() =>
                    entry.value > 0 && handleCountryClick(entry)
                  }
                />
              ))}
            </Pie>

            {/* 🟢 Tooltip always visible (even for 0) */}
            <Tooltip
              formatter={(value, name, props) => [
                `${value} (${props.payload.percentage}%)`,
                name,
              ]}
              contentStyle={{
                backgroundColor: "#fff",
                borderRadius: "6px",
                border: "1px solid #e5e7eb",
                fontSize: "12px",
                padding: "6px 10px",
              }}
            />

            {/* 🟢 Legend always visible */}
            <Legend
              verticalAlign="bottom"
              align="center"
              iconType="circle"
              wrapperStyle={{ paddingBottom: 5 }}
              formatter={(value, entry, index) => (
                <span
                  style={{
                    color: COLORS[index % COLORS.length],
                    fontSize: "12px",
                    fontWeight: 400,
                  }}
                >
                  {value}
                </span>
              )}
            />
          </PieChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
};

export default TopDestinationsChart;
