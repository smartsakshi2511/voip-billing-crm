import { X } from "lucide-react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import useTabStore from "../../store/useTabStore";

const TabBar = () => {
  const { openTabs, removeTab } = useTabStore();
  const location = useLocation();
  const navigate = useNavigate();

  const handleClose = (path) => {
    const isActive = location.pathname === path;
    removeTab(path);

    if (isActive) {
      const remaining = openTabs.filter((t) => t.path !== path);
      if (remaining.length > 0) {
        navigate(remaining[remaining.length - 1].path);
      } else {
        navigate("/admin");
      }
    }
  };

  if (openTabs.length === 0) return null;

  return (
    <div className="flex items-center gap-1 px-3 py-1 border-b bg-white-800 shadow-sm">
      {openTabs.map((tab) => (
        <div
          key={tab.path}
          className={`flex items-center gap-1 px-2 py-0.5 rounded text-[11px] cursor-pointer transition
            ${
              location.pathname === tab.path
                ? "bg-gray-700 text-white"
                : "bg-gray-200 text-gray-700 hover:bg-gray-300"
            }`}
        >
          <Link to={tab.path}>{tab.name}</Link>
          <button
            onClick={() => handleClose(tab.path)}
            className="ml-0.5 text-[10px] hover:text-red-500"
          >
            <X size={12} />
          </button>
        </div>
      ))}
    </div>
  );
};

export default TabBar;
