import { useState, useEffect, useMemo, useCallback } from "react";
import axios from "axios";
import DataTable from "../reuseable/DataTable";
import AddButton from "../reuseable/AddButton";
import useAuth from "../../store/useAuth";
import usePopupStore from "../../store/usePopupStore";
import { Edit, Trash2 } from "lucide-react";
import SideDrawer from "../reuseable/SideDrawer";
import RoutesForm from "../Form/userForm/RoutesForm";
import useToast from "../reuseable/useToast";
import ExportButton from "../reuseable/ExportButton";


const RoutesPage = () => {
  const ENABLE_EDIT = false;
  const { openPopup, isOpen } = usePopupStore();
  const { token } = useAuth();
  const toast = useToast();
  const [routes, setRoutes] = useState([]);
  const [loading, setLoading] = useState(true); 
  const fetchRoutes = useCallback(async () => {
    try {
      const res = await axios.get(`https://${window.location.hostname}:5000/routes`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      setRoutes(
        res.data.map((r, idx) => ({
          ...r,
          serial: idx + 1,
        }))
      );
    } catch (err) {
      console.error("Failed to fetch routes:", err);
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    if (token) fetchRoutes();
  }, [token, fetchRoutes]);

  const handleAddRoute = useCallback(
    (newRoute) => {
      setRoutes((prev) => {
        const updated = [...prev, newRoute];
        return updated.map((r, idx) => ({ ...r, serial: idx + 1 }));
      });
      toast.success("Route added successfully!");
    },
    [toast]
  );

  const handleEdit = useCallback(
    (row) => {
      openPopup(
        "Edit Route",
        <RoutesForm
          initialData={row}
          onSuccess={(updatedRoute) => {
            setRoutes((prev) =>
              prev.map((r) =>
                r.id === updatedRoute.id
                  ? { ...updatedRoute, serial: r.serial }
                  : r
              )
            );
            toast.success("Route updated successfully!");
          }}
        />
      );
    },
    [openPopup, toast]
  );

  // const handleBulkEdit = (selectedRows) => {
  //   openPopup(
  //     `Bulk Edit (${selectedRows.length}) Routes`,
  //     <RoutesForm
  //       bulkData={selectedRows}
  //       onSuccess={fetchRoutes}
  //     />
  //   );
  // };


const handleDelete = useCallback(
  async (row) => {
    const confirmed = await toast.confirmToast(
      `Delete route "${row.routename}"?`
    );
    if (!confirmed) return;

    try {
      await axios.delete(`https://${window.location.hostname}:5000/routes/${row.id}`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      setRoutes((prev) =>
        prev
          .filter((r) => r.id !== row.id)
          .map((r, idx) => ({ ...r, serial: idx + 1 }))
      );

      toast.success("Route deleted successfully!");
    } catch (err) {
      console.error("Delete failed:", err);

      const msg =
        err.response?.data?.message ||
        "Delete failed. This route may be in use.";
      toast.error(msg);
    }
  },
  [token, toast]
);

  const handleBulkDelete = async (selectedRows) => {
    if (!selectedRows.length) return;

    const confirmed = await toast.confirmToast(
      `Delete ${selectedRows.length} routes?`
    );
    if (!confirmed) return;

    try {
      await axios.delete(
        `https://${window.location.hostname}:5000/routes/bulk-delete`,
        {
          headers: { Authorization: `Bearer ${token}` },
          data: {
            ids: selectedRows.map((r) => r.id),
          },
        }
      );

      toast.success("Routes deleted successfully");
      fetchRoutes();
    } catch (err) {
      console.error(err);
      toast.error("Bulk delete failed");
    }
  }; 
  
  const columns = useMemo(
    () => [
      { header: "S.No", accessor: "serial" },
      { header: "Route ID", accessor: "Routeid" },
      { header: "Route Name", accessor: "routename" },
      { header: "Actions", accessor: "actions",},
    ],
    []
  ); 
  const routesWithActions = useMemo(
    () =>
      routes.map((r) => ({
        ...r,
        actions: (
          <div className="flex gap-3">
             {ENABLE_EDIT && (
            <button
              className="text-indigo-500 hover:text-indigo-700"
              onClick={() => handleEdit(r)}
              title="Edit"
            >
              <Edit size={18} />
            </button>
             )}

            <button
              className="text-red-500 hover:text-red-700"
              onClick={() => handleDelete(r)}
              title="Delete"
            >
              <Trash2 size={18} />
            </button>
          </div>
        ),
      })),
    [routes, handleEdit, handleDelete]
  );

  return (
    <div className="flex overflow-auto relative z-10">
      <main
        className={`transition-all duration-300 max-w-7xl mx-auto py-6 px-4 lg:px-8 flex-1 bg-gray-50 min-h-screen ${isOpen ? "mr-[450px]" : ""
          }`}
      >
        <DataTable
          title="Routes List"
          columns={columns}
          data={routesWithActions}
          loading={loading}
          // enableSelection={true}
          headerActions={
            <div className="flex gap-2">
              <AddButton
                label="Add Route"
                form={<RoutesForm onSuccess={handleAddRoute} />}
              />
              <ExportButton
                data={routes}
                columns={columns}
                fileName="routes_list"
              /> 
            </div>
          }
          // bulkActions={(selectedRows) => (
          //   <div className="flex gap-2">
          //     <button
          //       title="Bulk Edit"
          //       onClick={() => handleBulkEdit(selectedRows)}
          //       className="p-1.5 rounded-md hover:bg-indigo-100"
          //     >
          //       <Edit size={14} className="text-indigo-600" />
          //     </button>

          //     <button
          //       title="Bulk Delete"
          //       onClick={() => handleBulkDelete(selectedRows)}
          //       className="p-1.5 rounded-md hover:bg-red-100"
          //     >
          //       <Trash2 size={14} className="text-red-600" />
          //     </button>
          //   </div>
          // )}
        />
      </main>
      <SideDrawer />
    </div>
  );
};

export default RoutesPage;
