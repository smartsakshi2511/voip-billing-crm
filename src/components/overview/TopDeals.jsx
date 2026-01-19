import { useEffect, useState, Fragment } from "react";
import { motion } from "framer-motion";
import axios from "axios";
import useAuth from "../../store/useAuth";
import { Menu, Transition } from "@headlessui/react";

const TopCallers = () => {
  const { token } = useAuth();
  const [data, setData] = useState([]);
  const [filter, setFilter] = useState("month");
  const [loading, setLoading] = useState(false);

  const fetchTopCallers = async () => {
    setLoading(true);
    try {
      const today = new Date();
      const date =
        filter === "month"
          ? today.toISOString().slice(0, 7)
          : today.toISOString().slice(0, 10);

      const res = await axios.get(
        `https://${window.location.hostname}:5000/dashboard/top-callers?type=${filter}&date=${date}`,
        { headers: { Authorization: `Bearer ${token}` } }
      );

      setData(res.data);
    } catch (err) {
      console.error("Failed to fetch top callers:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchTopCallers();
  }, [filter]);

  const maxCalls = Math.max(...data.map((c) => c.totalCalls), 0);

  return (
    <motion.div
      className="bg-white rounded-xl border border-gray-200 shadow-sm hover:shadow-md transition-all p-3 sm:p-4"
      initial={{ opacity: 0, y: 18 }}
      animate={{ opacity: 1, y: 0 }}
    >
      {/* Header */}
      <div className="flex justify-between items-center mb-2 sm:mb-3">
        <h2 className="text-xs sm:text-sm font-medium text-gray-700">
          Top Accounts
        </h2>

        <Menu>
          <Menu.Button className="p-1.5 rounded-md hover:bg-gray-100 text-gray-600 text-sm sm:text-base">
            ⋮
          </Menu.Button>

          <Transition
            as={Fragment}
            enter="transition duration-150"
            enterFrom="opacity-0 scale-95"
            enterTo="opacity-100 scale-100"
            leave="transition duration-100"
            leaveFrom="opacity-100 scale-100"
            leaveTo="opacity-0 scale-95"
          >
            <Menu.Items className="absolute right-5 mt-2 w-28 bg-white shadow-lg border border-gray-200 rounded-lg z-20 py-1 text-xs sm:text-sm">
              {[{ label: "Monthly", value: "month" }, { label: "Daily", value: "day" }].map(
                (item) => (
                  <Menu.Item key={item.value}>
                    {({ active }) => (
                      <button
                        onClick={() => setFilter(item.value)}
                        className={`${
                          active ? "bg-gray-100" : ""
                        } w-full text-left px-2 sm:px-3 py-1`}
                      >
                        {item.label}
                      </button>
                    )}
                  </Menu.Item>
                )
              )}
            </Menu.Items>
          </Transition>
        </Menu>
      </div>

      {/* Content */}
      {loading ? (
        <div className="space-y-2">
          {[...Array(5)].map((_, i) => (
            <div key={i} className="flex items-center gap-2 sm:gap-3 p-2 bg-gray-100 animate-pulse rounded-lg">
              <div className="w-6 h-6 sm:w-8 sm:h-8 bg-gray-300 rounded-lg" />
              <div className="flex-1 space-y-1">
                <div className="w-20 h-2 sm:h-3 bg-gray-300 rounded" />
                <div className="w-12 h-1.5 sm:h-2 bg-gray-200 rounded" />
              </div>
            </div>
          ))}
        </div>
      ) : (
        <ul className="space-y-2">
          {data.map((caller, index) => {
            const percent = (caller.totalCalls / maxCalls) * 100;

            return (
              <li
                key={caller.username}
                className="rounded-lg p-2 sm:p-2.5 border border-gray-200 hover:bg-gray-50 transition cursor-pointer"
              >
                <div className="flex items-center gap-2 sm:gap-3">
                  <div
                    className={`w-6 h-6 sm:w-8 sm:h-8 flex items-center justify-center rounded-lg text-white text-[10px] sm:text-xs font-medium
                      ${
                        index === 0
                          ? "bg-yellow-400"
                          : index === 1
                          ? "bg-gray-400"
                          : index === 2
                          ? "bg-orange-500"
                          : "bg-indigo-500"
                      }`}
                  >
                    {index + 1}
                  </div>

                  <div>
                    <p className="text-[10px] sm:text-xs font-medium text-gray-700">
                      {caller.username || "Unknown"}
                    </p>
                    <p className="text-[9px] sm:text-[11px] text-gray-500">
                      {caller.totalCalls} calls
                    </p>
                  </div>
                </div>

                <div className="mt-1 w-full h-1 sm:h-1.5 bg-gray-100 rounded-full overflow-hidden">
                  <motion.div
                    initial={{ width: 0 }}
                    animate={{ width: `${percent}%` }}
                    transition={{ duration: 0.35 }}
                    className="h-full bg-indigo-500 rounded-full"
                  />
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </motion.div>
  );
};

export default TopCallers;
