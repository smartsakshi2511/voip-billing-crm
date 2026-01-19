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

  const hasData = data.length > 0;

  // 👇 empty graph ke liye dummy
  const emptyData = [{ month: "", profit: 0 }];

  useEffect(() => {
    const fetchProfit = async () => {
      try {
        const res = await axios.get(
          `https://${window.location.hostname}:5000/dashboard/profit`,
          { headers: { Authorization: `Bearer ${token}` } }
        );

        const chartData = res.data.map((item) => ({
          month: item.month,
          profit: Number(item.totalRevenue),
        }));

        setData(chartData);
      } catch (err) {
        console.error(err);
        setData([]);
      }
    };

    fetchProfit();
  }, [token]);

  return (
    <motion.div
      className="bg-white rounded-2xl shadow-md p-3 hover:shadow-lg transition-all"
      initial={{ opacity: 0, y: 15 }}
      animate={{ opacity: 1, y: 0 }}
    >
      <h2 className="text-sm font-semibold text-gray-700 mb-2">
        Revenue Graph
      </h2>

      <div className="h-[160px] sm:h-[200px]">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart
            data={hasData ? data : emptyData}
            margin={{ top: 5, right: 5, left: 0, bottom: 5 }}
          >
            <defs>
              <linearGradient id="profitGradient" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#F59E0B" stopOpacity={0.45} />
                <stop offset="100%" stopColor="#FBBF24" stopOpacity={0.1} />
              </linearGradient>
            </defs>

            <CartesianGrid strokeDasharray="3 3" opacity={0.15} />

            <XAxis
              dataKey="month"
              tick={{ fontSize: 10 }}
              axisLine={false}
              tickLine={false}
            />

            <YAxis
              domain={hasData ? ["auto", "auto"] : [0, 100]}
              tick={{ fontSize: 10 }}
              tickFormatter={(v) => `$${v}`}
              axisLine={false}
              tickLine={false}
            />

            {hasData && (
              <>
                <Tooltip
                  formatter={(v) => [`$${Number(v).toFixed(2)}`, "Revenue"]}
                />
                <Area
                  type="monotone"
                  dataKey="profit"
                  stroke="#F59E0B"
                  fill="url(#profitGradient)"
                  strokeWidth={2}
                  dot={{ r: 2 }}
                  activeDot={{ r: 4 }}
                />
              </>
            )}
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </motion.div>
  );
};

export default ProfitChart;
