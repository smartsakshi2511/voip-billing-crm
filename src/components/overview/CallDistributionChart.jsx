import { useEffect, useState } from "react";
import axios from "axios";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
} from "recharts";
import { motion } from "framer-motion";
import useAuth from "../../store/useAuth";

const CallDistributionChart = () => {
  const [data, setData] = useState([]);
  const { token } = useAuth();
  const hasData = data.length > 0;

  const dummyData = [
    { label: "", inbound_calls: 0, outbound_calls: 0 }
  ];


  useEffect(() => {
    const fetchData = async () => {
      try {
        const res = await axios.get(
          `https://${window.location.hostname}:5000/dashboard/call-distribution?filter=month`,
          { headers: { Authorization: `Bearer ${token}` } }
        );

        setData(res.data);
      } catch (err) {
        console.error("Failed to fetch distribution data", err);
      }
    };

    fetchData();
  }, [token]);

  return (
    <motion.div
      className="bg-white rounded-2xl shadow-md p-3 hover:shadow-lg transition-all duration-300"
      initial={{ opacity: 0, y: 15 }}
      animate={{ opacity: 1, y: 0 }}
    >
      <h2 className="text-sm font-semibold mb-3 text-gray-700">
        Call Distribution (Inbound / Outbound)
      </h2>

      <div className="h-40 sm:h-44">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart
            data={hasData ? data : dummyData}
            margin={{ top: 5, right: 5, left: 0, bottom: 5 }}
          >
            <CartesianGrid strokeDasharray="3 3" opacity={0.15} />

            <XAxis
              dataKey="label"
              stroke="#9CA3AF"
              tick={{ fontSize: 10 }}
            />

            <YAxis
              stroke="#9CA3AF"
              tick={{ fontSize: 10 }}
              domain={[0, 100]}   // ⭐ IMPORTANT
            />

            {hasData && (
              <>
                <Tooltip />

                <Bar
                  dataKey="inbound_calls"
                  stackId="a"
                  fill="#10B981"
                  radius={[4, 4, 0, 0]}
                />

                <Bar
                  dataKey="outbound_calls"
                  stackId="a"
                  fill="#3B82F6"
                  radius={[4, 4, 0, 0]}
                />
              </>
            )}
          </BarChart>
        </ResponsiveContainer>
      </div>
    </motion.div>
  );
};

export default CallDistributionChart;
