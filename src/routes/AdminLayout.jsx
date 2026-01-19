import Sidebar from "../components/common/Sidebar";
import Header from "../components/common/Header";
import TabBar from "../components/common/TabBar";
import { Outlet } from "react-router-dom";
import { motion } from "framer-motion";
import useTabStore from "../store/useTabStore";

export default function AdminLayout() {
  const { openTabs } = useTabStore();

  return (
    <div className="flex h-screen overflow-hidden bg-gray-100">
      <Sidebar />

      <div className="flex-1 flex flex-col overflow-hidden">
        <Header />
        {openTabs.length > 0 && <TabBar />}

        <motion.main
          initial={{ opacity: 0, y: 15 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, ease: "easeOut" }}
          className="flex-1 overflow-auto"
        >
          <div className="   ">
            <Outlet />
          </div>
        </motion.main>
      </div>
    </div>
  );
}
