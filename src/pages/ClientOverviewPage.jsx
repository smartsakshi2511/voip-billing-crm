import { useEffect, useState, Suspense, lazy } from "react";
import axios from "axios";
import { motion } from "framer-motion";
import useAuth from "../store/useAuth";
import StatCard from "../components/common/StatCard";
import { Users, ShoppingBag, BarChart2, Zap } from "lucide-react";

const RevenueChart = lazy(() => import("../components/overview/RevenueChart"));
const TopDestinationsChart = lazy(() =>
  import("../components/overview/TopDestinationsChart")
);
const VisitsChart = lazy(() => import("../components/overview/VisitsChart"));
const CallDistributionChart = lazy(() =>
  import("../components/overview/CallDistributionChart")
);
const ASRChart = lazy(() => import("../components/overview/ASRChart"));
const ACRChart = lazy(() => import("../components/overview/ACRChart"));

const Skeleton = ({ height = "100px", width = "100%", className = "" }) => (
  <div
    className={`bg-gray-200 animate-pulse rounded-2xl ${className}`}
    style={{ height, width }}
  />
);

const OverviewPage = () => {
  const [stats, setStats] = useState(null);
  const { token } = useAuth();

  useEffect(() => {
    if (!token) return;

    const fetchStats = async () => {
      try {
        const res = await axios.get(
          `https://${window.location.hostname}:5000/dashboard/client/stats`,
          { headers: { Authorization: `Bearer ${token}` } }
        );
        setStats(res.data);
      } catch (err) {
        console.error("Failed to fetch dashboard stats:", err);
      }
    };

    fetchStats();
    const interval = setInterval(fetchStats, 5000);
    return () => clearInterval(interval);
  }, [token]);

  const cards = [
    { name: "SIP Users", icon: Users, gradient: "from-indigo-500 to-blue-500", value: stats?.sipUsers || 0 },
    { name: "Live Calls", icon: ShoppingBag, gradient: "from-violet-500 to-purple-500", value: stats?.liveCalls || 0, isGauge: true, max: 200 },
    { name: "Total Calls", icon: BarChart2, gradient: "from-pink-500 to-rose-500", value: stats?.totalCalls || 0, isGauge: true, max: 500 },
    { name: "Recharge", icon: Zap, gradient: "from-green-500 to-emerald-500", value: stats?.monthlyRecharge || 0, isGauge: true, max: 10000, unit: "$" },
  ];

  return (
    <div className="flex-1 min-h-screen bg-gray-50 text-gray-900 overflow-auto">
      <main className="max-w-7xl mx-auto py-8 px-4 lg:px-8 space-y-8">

        {/* Stats Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
          {stats
            ? cards.map((card, i) => (
                <motion.div
                  key={i}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.1 }}
                >
                  <StatCard {...card} />
                </motion.div>
              ))
            : Array(4).fill().map((_, i) => <Skeleton key={i} height="120px" />)}
        </div>

        {/* Top Charts */}
        <Suspense fallback={<Skeleton height="300px" />}>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
            <RevenueChart />
            <TopDestinationsChart />
            <VisitsChart />
          </div>
        </Suspense>

        {/* ASR / ACR / Call Distribution */}
        <Suspense fallback={<Skeleton height="300px" />}>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
            <ASRChart />
            <ACRChart />
            <CallDistributionChart />
          </div>
        </Suspense>
      </main>
    </div>
  );
};

export default OverviewPage;
