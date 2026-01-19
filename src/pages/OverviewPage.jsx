import { useEffect, useState, Suspense, lazy } from "react";
import axios from "axios";
import { motion } from "framer-motion";
import CountUp from "react-countup";
import { Users, ShoppingBag, BarChart2, Zap } from "lucide-react";
import useAuth from "../store/useAuth";
import StatCard from "../components/common/StatCard";
 const RevenueChart = lazy(() => import("../components/overview/RevenueChart"));
const LeadsSourceChart = lazy(() =>
  import("../components/overview/LeadsSourceChart")
);
const CallDistributionChart = lazy(() =>
  import("../components/overview/CallDistributionChart")
);
const ASRChart = lazy(() => import("../components/overview/ASRChart"));
const ACRChart = lazy(() => import("../components/overview/ACRChart"));
const VisitsChart = lazy(() => import("../components/overview/VisitsChart"));
const ProfitChart = lazy(() => import("../components/overview/ProfitChart"));
const TopDeals = lazy(() => import("../components/overview/TopDeals"));
const TopDestinationsChart = lazy(() =>
  import("../components/overview/TopDestinationsChart")
);

const Skeleton = ({ height = "100px", width = "100%", className = "" }) => {
  return (
    <div
      className={`bg-gray-200 animate-pulse rounded-2xl ${className}`}
      style={{ height, width }}
    ></div>
  );
};
const OverviewPage = () => {
  const [stats, setStats] = useState(null);
  const { token } = useAuth();

  useEffect(() => {
    if (!token) return;

    const fetchStats = async () => {
      try {
        const res = await axios.get(
          `https://${window.location.hostname}:5000/dashboard/stats`,
          {
            headers: { Authorization: `Bearer ${token}` },
          }
        );
        setStats(res.data);
      } catch (err) {
        console.error("🔴 Failed to fetch dashboard stats:", err);
      }
    };

    fetchStats();

    const interval = setInterval(fetchStats, 5000);

    return () => clearInterval(interval);
  }, [token]);

  const cards = [
    {
      name: "Active Users",
      icon: Users,
      color: "from-indigo-500 to-blue-500",
      value: stats?.activeUsers || 0,
    },
    {
      name: "Total Live Calls",
      icon: ShoppingBag,
      color: "from-violet-500 to-purple-500",
      value: stats?.liveCalls || 0,
    },
    {
      name: "Total Calls",
      icon: BarChart2,
      color: "from-pink-500 to-rose-500",
      value: stats?.totalCalls || 0,
    },
    {
      name: "Mon Recharge",
      icon: Zap,
      color: "from-green-500 to-emerald-500",
      value: stats?.monthlyRecharge || 0,
      prefix: "$",
    },
  ];

  return (
    <div className="flex-1 overflow-auto bg-gray-50 min-h-screen text-gray-900">
      <main className="w-full max-w-[1600px] xl:max-w-none mx-auto py-8 px-4 lg:px-8 space-y-8">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
          {stats
            ? cards.map((card, i) => (
                <motion.div
                  key={i}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.1 }}
                >
                  <StatCard
                    name={card.name}
                    icon={card.icon}
                    value={
                      <CountUp
                        end={card.value}
                        duration={1}
                        prefix={card.prefix || ""}
                      />
                    }
                    gradient={card.color}
                  />
                </motion.div>
              ))
            : Array(4)
                .fill()
                .map((_, i) => <Skeleton key={i} height="120px" />)}
        </div>
        <Suspense fallback={<Skeleton height="300px" />}>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
            <CallDistributionChart />
            <ProfitChart />
            <ASRChart />
            <ACRChart />
          </div>
        </Suspense>

        <Suspense fallback={<Skeleton height="300px" />}>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
            <TopDestinationsChart />
            <VisitsChart />
            <LeadsSourceChart />
            <RevenueChart />
          </div>
        </Suspense>
        <Suspense fallback={<Skeleton height="300px" />}>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
            <TopDeals />
          </div>
 
        </Suspense>
      </main>
    </div>
  );
};

export default OverviewPage;
