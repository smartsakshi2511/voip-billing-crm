import { Download } from "lucide-react";
import { exportToCSV, exportToExcel } from "./exportUtils";
import useToast from "./useToast"; // 🔥 add this

const ExportButton = ({ data = [], columns = [], fileName = "export" }) => {
  const toast = useToast();

  const handleCSVExport = () => {
    if (!data.length) {
      toast.warning("No data available to export");
      return;
    }

    exportToCSV(data, columns, fileName);
    toast.success(`CSV exported successfully (${data.length} records)`);
  };

  const handleExcelExport = () => {
    if (!data.length) {
      toast.warning("No data available to export");
      return;
    }

    exportToExcel(data, columns, fileName);
    toast.success(`Excel exported successfully (${data.length} records)`);



  };

  return (
    <div className="relative inline-block">
      {/* Hover wrapper */}
      <div className="group inline-block">
        <button
          className="flex items-center gap-1 px-3 py-1 text-xs 
                     bg-gray-300 text-black rounded-lg 
                     hover:bg-gray-400 transition"
        >
          <Download size={14} />
          
        </button>

        {/* Dropdown */}
        <div
          className="absolute right-0 mt-1 min-w-[140px]
                     invisible opacity-0 group-hover:visible group-hover:opacity-100
                     bg-white border rounded-lg shadow-lg z-50
                     transition-all duration-150"
        >
          <button
            onClick={handleCSVExport}
            className="block w-full text-left px-3 py-2 text-xs hover:bg-gray-100"
          >
            CSV
          </button>

          <button
            onClick={handleExcelExport}
            className="block w-full text-left px-3 py-2 text-xs hover:bg-gray-100"
          >
            Excel
          </button>
        </div>
      </div>
    </div>
  );
};

export default ExportButton;
