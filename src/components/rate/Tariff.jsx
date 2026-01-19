import React, { useEffect, useState, useCallback, useMemo } from "react";
import axios from "axios";
import DataTable from "../reuseable/DataTable";
import AddButton from "../reuseable/AddButton";
import SideDrawer from "../reuseable/SideDrawer";
import TariffForm from "../Form/TariffForm";
import TariffView from "../Form/TariffView";
import usePopupStore from "../../store/usePopupStore";
import useAuth from "../../store/useAuth";
import { Edit, Trash2, Eye } from "lucide-react";
import useToast from "../reuseable/useToast";
import ExportButton from "../reuseable/ExportButton";

const ActionButtons = ({
  row,
  token,
  role,
  openPopup,
  confirmToast,
  success,
  error,
  setTariffs,
}) => {
  const handleEdit = (updatedTariff) => {
    try {
       if (!updatedTariff || !updatedTariff.id) {
        console.warn("Invalid updatedTariff:", updatedTariff);
        return;
      }

      setTariffs((prev) =>
        (Array.isArray(prev) ? prev : []).map((t) =>
          t?.id === updatedTariff.id
            ? { ...t, ...updatedTariff }  
            : t
        )
      );

      success("Tariff updated successfully!");
    } catch (err) {
      console.error(err);
      error("Failed to update tariff");
    }
  };


  const handleDelete = async () => {
    const confirmed = await confirmToast("Delete this tariff?");
    if (!confirmed) return;

    try {
      await axios.delete(
        `https://${window.location.hostname}:5000/tariffs/${row.id}`,
        { headers: { Authorization: `Bearer ${token}` } }
      );

      setTariffs((prev) => prev.filter((t) => t.id !== row.id));
      success("Tariff deleted successfully!");
    } catch (err) {
      console.error(err);
      error("Failed to delete tariff");
    }
  };

  return (
    <div className="flex space-x-2">
      <button
        className="text-yellow-500 hover:text-yellow-700"
        onClick={() => openPopup("View Tariff", <TariffView data={row} />)}
      >
        <Eye size={18} />
      </button>
      {role === "admin" && (
        <button
          className="text-indigo-500 hover:text-indigo-700"
          onClick={() =>
            openPopup(
              "Edit Tariff",
              <TariffForm initialData={row} onSuccess={handleEdit} />
            )
          }
        >
          <Edit size={18} />
        </button>
      )}
      {role === "admin" && (
        <button
          className="text-red-500 hover:text-red-700"
          onClick={handleDelete}
        >
          <Trash2 size={18} />
        </button>
      )}
    </div>
  );
};
const TariffPage = () => {
  const { openPopup, isOpen } = usePopupStore();
  const [tariffs, setTariffs] = useState([]);
  const [loading, setLoading] = useState(true);
  const { token, role } = useAuth();
  const { success, error, confirmToast } = useToast();

  const fetchTariffs = useCallback(async () => {
    setLoading(true);

    try {
      const res = await axios.get(
        `https://${window.location.hostname}:5000/tariffs`,
        {
          headers: { Authorization: `Bearer ${token}` },
        }
      );

      const dataWithSerial = res.data.map((t, i) => ({
        ...t,
        serial: i + 1,
      }));

      setTariffs(dataWithSerial);
    } catch (err) {
      console.error(err);
      error("Failed to load tariffs");
    }

    setLoading(false);
  }, [token]);

  useEffect(() => {
    if (token) fetchTariffs();
  }, [token, fetchTariffs]);
  const columns = useMemo(() => {
    let baseColumns = [
      ...(role === "admin"
        ? [
          {
            header: "S.No",
            accessor: "serial",
            title: "Serial No.",
            exportable: false,
          },
        ]
        : []),
      ...(role === "admin"
        ? [{ header: "Tariff ID", accessor: "TarrifID", title: "Tariff ID" }]
        : []),

      { header: "Plan", accessor: "PlanName", title: "Plan Name" },
      { header: "Code", accessor: "Code", title: "Code" },
      { header: "Destination", accessor: "Destination", title: "Destination" },
      { header: "Rate", accessor: "sellprice", title: "Rate" },
      { header: "Minimum", accessor: "sellminimum", title: "Minimum" },
      { header: "Increment", accessor: "sellincrement", title: "Increment" },
      { header: "Status", accessor: "status", title: "Status" },
      ...(role === "admin"
        ? [{ header: "Actions", accessor: "actions", title: "Actions" }]
        : []),
    ];

    if (role === "admin") {
      baseColumns.splice(
        5,
        0,
        { header: "Buy Price", accessor: "buyprice", title: "Buy Price" },
        { header: "Buy Min", accessor: "buyminimum", title: "Buy Min" },
        { header: "Buy Incr", accessor: "buyincrement", title: "Buy Incr" }
      );
    }

    return baseColumns;
  }, [role]);
  const tableData = useMemo(
    () =>
     (Array.isArray(tariffs) ? tariffs : []).map((row) => ({
        ...row,
        actions: (
          <ActionButtons
            row={row}
            role={role}
            token={token}
            openPopup={openPopup}
            confirmToast={confirmToast}
            success={success}
            error={error}
            setTariffs={setTariffs}
          />
        ),
      })),
    [tariffs, role]
  );
  const handleBulkDelete = async (selectedRows) => {
    if (selectedRows.length === 0) return;

    const confirmed = await confirmToast(
      `Delete ${selectedRows.length} selected tariffs?`
    );
    if (!confirmed) return;

    try {
      const ids = selectedRows.map((row) => row.id);

      await Promise.all(
        ids.map((id) =>
          axios.delete(
            `https://${window.location.hostname}:5000/tariffs/${id}`,
            { headers: { Authorization: `Bearer ${token}` } }
          )
        )
      );
      setTariffs((prev) => prev.filter((t) => !ids.includes(t.id)));

      success(`${ids.length} tariffs deleted successfully`);
    } catch (err) {
      console.error(err);
      error("Failed to delete selected tariffs");
    }
  };

  const handleBulkEdit = (selectedRows) => {
    if (selectedRows.length === 0) return;

    openPopup(
      `Edit ${selectedRows.length} Tariffs`,
      <TariffForm
        bulkData={selectedRows}
        onSuccess={(updatedRows = []) => {
          if (!Array.isArray(updatedRows)) return;

          setTariffs((prev) =>
            prev.map((t) => {
              const updated = updatedRows.find((u) => u.id === t.id);
              return updated ? { ...t, ...updated } : t;
            })
          );
        }}
      />
    );
  };

  return (
    <div className="flex-1 overflow-auto relative z-10">
      <main
        className={`transition-all duration-300 max-w-7xl mx-auto py-6 px-4 lg:px-8 flex-1 bg-gray-50 min-h-screen ${isOpen ? "mr-[450px]" : ""
          }`}
      >
        <DataTable
          title="Tariff List"
          columns={columns}
          data={tableData}
          loading={loading}
          enableSelection={role === "admin"}
          headerActions={
            <div className="flex gap-2">
              {role === "admin" && (
                <AddButton
                  label="Add Tariff"
                  form={<TariffForm onSuccess={fetchTariffs} />}
                />
              )}

              <ExportButton
                data={tariffs}
                columns={columns}
                fileName="tariff_list"
              />
            </div>
          }
          bulkActions={(selectedRows) => (
            <div className="flex items-center gap-1">
              <button
                title="Bulk Edit"
                onClick={() => handleBulkEdit(selectedRows)}
                className="p-1.5 rounded-md hover:bg-indigo-100 transition"
              >
                <Edit size={14} className="text-indigo-600" />
              </button>

              <button
                title="Delete Selected"
                onClick={() => handleBulkDelete(selectedRows)}
                className="p-1.5 rounded-md hover:bg-red-100 transition"
              >
                <Trash2 size={14} className="text-red-600" />
              </button>
            </div>
          )}
        />
      </main>

      <SideDrawer />
    </div>
  );
};

export default TariffPage;
