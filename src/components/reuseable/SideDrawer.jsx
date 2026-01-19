// src/components/reuseable/SideDrawer.jsx
import { motion, AnimatePresence } from "framer-motion";
import { useEffect } from "react";
import { useLocation } from "react-router-dom";
import usePopupStore from "../../store/usePopupStore";

const SideDrawer = () => {
  const { isOpen, title, content, closePopup } = usePopupStore();
  const location = useLocation(); 
  useEffect(() => {
    if (isOpen) {
      closePopup();
    }
  }, [location.pathname]); 

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* 🔹 Mobile overlay ONLY */}
          <motion.div
            className="fixed inset-0 bg-black/40 z-40 lg:hidden"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={closePopup}
          />

          {/* Drawer */}
          <motion.div
            className="
              fixed top-0 right-0 h-full
              w-full lg:w-[450px]
              bg-white shadow-2xl border-l border-gray-200
              z-50 flex flex-col
            "
            initial={{ x: "100%" }}
            animate={{ x: 0 }}
            exit={{ x: "100%" }}
            transition={{ duration: 0.25, ease: "easeInOut" }}
          >
            {/* Header */}
            <div className="flex justify-between items-center border-b px-5 py-4 bg-gray-50">
              <h2 className="text-base lg:text-lg font-bold text-gray-800">
                {title}
              </h2>
              <button
                onClick={closePopup}
                className="text-gray-500 hover:text-red-500 text-2xl"
              >
                &times;
              </button>
            </div>

            {/* Content */}
            <div className="flex-1 overflow-y-auto px-4 lg:px-6 py-4">
              {typeof content === "function" ? content() : content}
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
};

export default SideDrawer;
