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
      console.error("🔴 Failed to fetch top callers:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchTopCallers();
  }, [filter]);

  const filterOptions = [
    { label: "Month", value: "month" },
    { label: "Day", value: "day" },
  ];

  return (
    <motion.div
      className="bg-white rounded-xl shadow-md p-5 hover:shadow-lg transition-shadow duration-300"
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5 }}
    > 
      <div className="flex justify-between items-center mb-4">
        <h2 className="text-lg font-semibold text-gray-700 mb-4">Top 5 Callers</h2>

        <Menu as="div" className="relative inline-block text-left">
          <Menu.Button className="px-2 py-1 rounded-full hover:bg-gray-100 text-gray-600 text-lg">
            &#8942;  
          </Menu.Button>

          <Transition
            as={Fragment}
            enter="transition ease-out duration-150"
            enterFrom="transform opacity-0 scale-95"
            enterTo="transform opacity-100 scale-100"
            leave="transition ease-in duration-100"
            leaveFrom="transform opacity-100 scale-100"
            leaveTo="transform opacity-0 scale-95"
          >
            <Menu.Items className="absolute right-0 mt-2 w-28 origin-top-right bg-white border border-gray-200 divide-y divide-gray-100 rounded-md shadow-lg focus:outline-none z-10">
              {filterOptions.map((option) => (
                <Menu.Item key={option.value}>
                  {({ active }) => (
                    <button
                      onClick={() => setFilter(option.value)}
                      className={`${
                        active ? "bg-gray-100" : ""
                      } w-full text-left px-4 py-2 text-sm text-gray-700`}
                    >
                      {option.label}
                    </button>
                  )}
                </Menu.Item>
              ))}
            </Menu.Items>
          </Transition>
        </Menu>
      </div> 
      {loading ? (
        <ul className="space-y-2">
          {[1, 2, 3, 4, 5].map((i) => (
            <li
              key={i}
              className="animate-pulse flex justify-between items-center py-2 px-3 border rounded-lg bg-gray-100"
            >
              <div className="flex items-center gap-3">
                <div className="w-6 h-6 rounded-full bg-gray-300"></div>
                <div className="space-y-1">
                  <div className="h-3 w-24 bg-gray-300 rounded"></div>
                  <div className="h-2 w-16 bg-gray-200 rounded"></div>
                </div>
              </div>
              <div className="h-3 w-10 bg-gray-300 rounded"></div>
            </li>
          ))}
        </ul>
      ) : (
        <ul className="space-y-2">
          {data.map((caller, i) => (
            <li
              key={i}
              className="flex justify-between items-center py-2 px-3 border rounded-lg hover:bg-gray-50 transition"
            >
              <div className="flex items-center gap-3">
                <div
                  className={`w-8 h-8 rounded-full flex items-center justify-center font-semibold text-white ${
                    i === 0
                      ? "bg-yellow-400"
                      : i === 1
                      ? "bg-gray-400"
                      : i === 2
                      ? "bg-orange-400"
                      : "bg-blue-300"
                  }`}
                >
                  {i + 1}
                </div>
                <div>
                  <p className="text-sm font-medium text-gray-800">
                    {caller.username}
                  </p>
                  <p className="text-xs text-gray-500">
                    Total Calls: {caller.totalCalls}
                  </p>
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </motion.div>
  );
};

export default TopCallers;
