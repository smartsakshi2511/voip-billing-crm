import {
  Home,
  Users,
  CreditCard,
  Phone,
  Scale,
  Server,
  FileChartLine,
  Menu,
  ClipboardList, ChevronDown
} from "lucide-react";
import useTabStore from "../../store/useTabStore";
import useAuth from "../../store/useAuth";
import { useState } from "react";
import { useLocation } from "react-router-dom";
import { AnimatePresence, motion } from "framer-motion";
import { Link } from "react-router-dom";

const getSidebarItems = (role) => {
  const basePath = role === "admin" ? "/admin" : "/client";
  const items = [
    {
      name: "Dashboard",
      icon: Home,
      gradient: "from-indigo-500 to-purple-500",
      href: `${basePath}`,
    },
    {
      name: "Clients",
      icon: Users,
      gradient: "from-indigo-400 to-indigo-600",
      subItems: [
        { name: "User", href: `${basePath}/users` },
        { name: "SIP User", href: `${basePath}/sipuser` },
        ...(role !== "client"
          ? [
            {
              name: "Restrict Number",
              href: `${basePath}/restrictednumberpage`,
            },
          ]
          : []),
      ],
    },
    {
      name: "Billing",
      icon: CreditCard,
      gradient: "from-pink-500 to-rose-500",
      subItems: [{ name: "Refills", href: `${basePath}/refills` }],
    },
    {
      name: "DIDs",
      icon: Phone,
      gradient: "from-green-500 to-emerald-500",
      subItems: [
        { name: "DID", href: `${basePath}/did` },
        { name: "DID Destination", href: `${basePath}/diddestination` },
        ...(role !== "client" ? [{ name: "DID Purchase Request", href: `${basePath}/DIDPurchaseRequest` }] : []),
        ...(role !== "admin" ? [{ name: "Did Purchase", href: `${basePath}/didpurchase` }] : []),
        
      ],
    },
    {
      name: "Rate",
      icon: Scale,
      gradient: "from-yellow-500 to-orange-500",
      subItems:
        role === "admin"
          ? [
            { name: "Plan", href: `${basePath}/plan` },
            { name: "Plan Group", href: `${basePath}/plangroup` },
            { name: "Tariff", href: `${basePath}/tariff` },
          ]
          : [
            { name: "Plan", href: `${basePath}/plan` },
            { name: "Tariff", href: `${basePath}/tariff` }, // ⭐ FOR CLIENT ONLY ⭐
          ],
    },

    {
      name: "Provider",
      icon: Server,
      gradient: "from-teal-400 to-lime-500",
      subItems: [
        { name: "Routes", href: `${basePath}/routes` },
        { name: "Trunk", href: `${basePath}/trunk` },
        // { name: "Load Balance", href: `${basePath}/loadbalancepage` },
      ],
    },
    {
      name: "Reports",
      icon: FileChartLine,
      gradient: "from-sky-500 to-blue-600",
      subItems: [
        { name: "CDR", href: `${basePath}/cdr` },
        { name: "Calls Online", href: `${basePath}/callonline` },
        { name: "Summary Per Day", href: `${basePath}/summaryperday` },
        { name: "Summary Per Mon", href: `${basePath}/summarypermonth` },
        ...(role !== "client"
          ? [{ name: "Summary Of Trunk", href: `${basePath}/summaryoftrunk` }]
          : []),
        ...(role !== "client"
          ? [{ name: "Activity Log", href: `${basePath}/activity` }]
          : []),

        ,
      ],
    },
  ];
  if (role === "client") {
    return items.filter((item) => !["Provider"].includes(item.name));
  }

  return items;
};
const Sidebar = () => {
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [isMobileOpen, setIsMobileOpen] = useState(false);
  const [openMenu, setOpenMenu] = useState(null);
  const location = useLocation();
  const { role } = useAuth();
  const { addTab } = useTabStore();

  const toggleSubMenu = (name) => {
    setOpenMenu((prev) => (prev === name ? null : name));
  };

  const isActive = (path) => location.pathname === path;

  return (
    <>
      {isMobileOpen && (
        <div
          className="fixed inset-0 bg-black/40 z-40 md:hidden"
          onClick={() => setIsMobileOpen(false)}
        />
      )}

      <motion.div
        className={`
          fixed md:relative z-50 md:z-10 h-full
          bg-gradient-to-b from-gray-900 via-gray-800 to-gray-900
          text-white border-r border-gray-700
          transition-all duration-300
          ${isMobileOpen ? "left-0" : "-left-64"} md:left-0
          ${isSidebarOpen ? "w-64 md:w-[180px]" : "w-20 md:w-[72px]"}
        `}
        animate={{ width: isSidebarOpen ? 180 : 72 }}
      >
        {/* Toggle */}
        <motion.button
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.95 }}
          onClick={() =>
            window.innerWidth < 768
              ? setIsMobileOpen(false)
              : setIsSidebarOpen(!isSidebarOpen)
          }
          className="p-2 rounded-full hover:bg-gray-700 mt-4 ml-3"
        >
          <Menu size={18} />
        </motion.button>

        <nav className="mt-5 flex-grow overflow-y-auto scrollbar-hide px-2">
          {getSidebarItems(role).map((item) => {
            const isOpen = openMenu === item.name;

            return (
              <div key={item.name} className="mb-0.5">
                <Link
                  to={item.href || "#"}
                  onClick={(e) => {
                    if (item.subItems) {
                      e.preventDefault();
                      toggleSubMenu(item.name);
                    } else if (item.name !== "Dashboard") {
                      addTab({ name: item.name, path: item.href });
                      setIsMobileOpen(false);
                    }
                  }}
                >
                  <motion.div
                    whileHover={{ x: 3 }}
                    className={`
                      flex items-center justify-between px-2.5 py-1.5 rounded-md
                      text-[13px] font-medium transition-all
                      ${isActive(item.href)
                        ? "bg-indigo-600/20 text-indigo-300"
                        : "hover:bg-gray-700/50"
                      }
                    `}
                  >
                    <div className="flex items-center gap-2.5">
                      <div
                        className={`w-7 h-7 flex items-center justify-center rounded-md
                        bg-gradient-to-br ${item.gradient}`}
                      >
                        <item.icon size={14} />
                      </div>

                      {isSidebarOpen && (
                        <span className="whitespace-nowrap">
                          {item.name}
                        </span>
                      )}
                    </div>

                    {item.subItems && isSidebarOpen && (
                      <ChevronDown
                        size={12}
                        className={`transition-transform opacity-70 ${isOpen ? "rotate-180" : ""
                          }`}
                      />
                    )}
                  </motion.div>
                </Link>

                <AnimatePresence>
                  {isSidebarOpen &&
                    isOpen &&
                    item.subItems?.map((sub) => (
                      <motion.div
                        key={sub.href}
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: "auto" }}
                        exit={{ opacity: 0, height: 0 }}
                        className="ml-9 mt-0.5"
                      >
                        <Link
                          to={sub.href}
                          onClick={() => {
                            addTab({ name: sub.name, path: sub.href });
                            setIsMobileOpen(false);
                          }}
                          className={`
                            flex items-center gap-2 px-2 py-1 rounded-md
                            text-[11px] transition-colors
                            ${isActive(sub.href)
                              ? "bg-indigo-500/20 text-indigo-300"
                              : "hover:bg-gray-700"
                            }
                          `}
                        >
                          <ClipboardList size={11} />
                          {sub.name}
                        </Link>
                      </motion.div>
                    ))}
                </AnimatePresence>
              </div>
            );
          })}
        </nav>
      </motion.div>

      {/* Mobile open button */}
      <button
        onClick={() => setIsMobileOpen(true)}
        className="md:hidden fixed top-3 left-3 z-50 p-2 bg-gray-900 text-white rounded-md shadow"
      >
        <Menu size={18} />
      </button>
    </>
  );
};

export default Sidebar;

