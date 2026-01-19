import { useEffect } from "react";
import { AnimatePresence, motion } from "framer-motion";
import usePopupStore from "./usePopupStore";

const Popup = () => {
  const { isOpen, title, content, closePopup } = usePopupStore();

  // Close on ESC
  useEffect(() => {
    const handleEsc = (e) => e.key === "Escape" && closePopup();
    window.addEventListener("keydown", handleEsc);
    return () => window.removeEventListener("keydown", handleEsc);
  }, [closePopup]);

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Backdrop */}
          <motion.div
            key="backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 0.3 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="fixed inset-0 bg-black z-40"
            onClick={closePopup}
          />

          {/* Sliding Drawer */}
          <motion.div
            key="drawer"
            initial={{ x: "100%" }}
            animate={{ x: 0 }}
            exit={{ x: "100%" }}
            transition={{ type: "spring", stiffness: 200, damping: 20 }}
            className="fixed top-0 right-0 w-[450px] h-full bg-white shadow-2xl z-50 flex flex-col"
            onClick={(e) => e.stopPropagation()} // prevent backdrop close
          >
            {/* Header */}
            <div className="p-4 border-b flex justify-between items-center">
              <h2 className="text-lg font-semibold">{title || "📡 Live Data"}</h2>
              <button
                onClick={closePopup}
                className="text-gray-600 hover:text-gray-900"
              >
                ✕
              </button>
            </div>

            {/* Content */}
            <div className="p-4 overflow-y-auto flex-1">
              {content || (
                <p className="text-gray-600">Here goes your live data...</p>
              )}
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
};

export default Popup;
