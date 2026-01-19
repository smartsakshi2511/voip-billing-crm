import { motion, AnimatePresence } from "framer-motion";
import { Search, RefreshCcw } from "lucide-react";
import { useState, useEffect, useMemo, useCallback } from "react";
import React from "react";

const TableSkeleton = ({ columns, rows = 10 }) => {
  return (
    <div className="animate-pulse">
      <table className="min-w-full divide-y divide-gray-200">
        <thead className="bg-gray-100">
          <tr>
            {columns.map((col) => (
              <th
                key={col.accessor}
                className="px-3 py-2 text-left text-[11px] font-semibold text-gray-400 uppercase"
              >
                {col.header}
              </th>
            ))}
          </tr>
        </thead>

        <tbody className="divide-y divide-gray-100">
          {Array.from({ length: rows }).map((_, rowIndex) => (
            <tr key={rowIndex} className="h-7">
              {columns.map((_, colIndex) => (
                <td key={colIndex} className="px-3 py-2">
                  <div className="h-3 w-full bg-gray-200 rounded-md"></div>
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};
const DataTable = ({
  columns,
  data,
  totalCount,
  fetchData,
  title,
  actions,
  headerActions,
  loading,
  onRefresh,
  enableSelection = false,
  rowKey = "id",
  bulkActions,
}) => {
  const [searchTerm, setSearchTerm] = useState("");
  const [debouncedTerm, setDebouncedTerm] = useState(searchTerm);
  const [currentPage, setCurrentPage] = useState(1);
  const [rowsPerPage, setRowsPerPage] = useState(10);
  const [selectedRows, setSelectedRows] = useState([]);
  const isServerSide = typeof fetchData === "function";

  useEffect(() => {
    const handler = setTimeout(() => setDebouncedTerm(searchTerm), 300);
    return () => clearTimeout(handler);
  }, [searchTerm]);

  useEffect(() => {
    setCurrentPage(1);
  }, [debouncedTerm]);

  useEffect(() => {
    if (!fetchData) return;
    fetchData({
      page: currentPage,
      limit: rowsPerPage,
      search: debouncedTerm,
    });
  }, [currentPage, rowsPerPage, debouncedTerm, fetchData]);

  const renderCellContent = useCallback((col, value) => {
    if (col.accessor === "status") {
      const color =
        value === "active" || value === "Active" || value === "ANSWER"
          ? "bg-green-100 text-green-700"
          : value === "PENDING" || value === "Pending"
            ? "bg-yellow-100 text-yellow-700"
            : "bg-red-100 text-red-700";
      return (
        <span
          className={`px-1 py-0.5 rounded-full text-[10px] font-medium ${color}`}
        >
          {value}
        </span>
      );
    }

    if (col.accessor === "balance_status") {
      const color =
        value === "DETECTED"
          ? "bg-purple-100 text-purple-700"
          : "bg-red-100 text-red-700";
      return (
        <span
          className={`px-1 py-0.5 rounded-full text-[10px] font-medium ${color}`}
        >
          {value}
        </span>
      );
    }

    if (col.accessor === "reserved") {
      const val = String(value || "").toLowerCase();
      const isReserved = val === "yes";
      const color = isReserved
        ? "bg-green-100 text-blue-700"
        : "bg-red-100 text-pink-700";
      return (
        <span
          className={`px-1 py-0.5 rounded-full text-[10px] font-medium ${color}`}
        >
          {isReserved ? "Reserved" : "Free"}
        </span>
      );
    }

    return Array.isArray(value) ? value.join(", ") : value;
  }, []);

  const toggleRow = (row) => {
    setSelectedRows((prev) => {
      const exists = prev.some((r) => r[rowKey] === row[rowKey]);
      return exists
        ? prev.filter((r) => r[rowKey] !== row[rowKey])
        : [...prev, row];
    });
  };

  const toggleAll = (rows) => {
    setSelectedRows((prev) => (prev.length === rows.length ? [] : rows));
  };

  const filteredData = useMemo(() => {
    if (isServerSide) return data;

    if (!debouncedTerm) return data;

    return data.filter((row) =>
      Object.values(row).some((val) =>
        String(val).toLowerCase().includes(debouncedTerm.toLowerCase())
      )
    );
  }, [data, debouncedTerm, isServerSide]);
  const paginatedData = useMemo(() => {
    if (isServerSide) return data;

    const start = (currentPage - 1) * rowsPerPage;
    return filteredData.slice(start, start + rowsPerPage);
  }, [filteredData, currentPage, rowsPerPage, isServerSide]);
  const tableData = isServerSide ? data : paginatedData;

  const finalColumns = useMemo(() => {
    if (!enableSelection) return columns;

    return [
      {
        header: (
          <input
            type="checkbox"
            checked={
              tableData.length > 0 && selectedRows.length === tableData.length
            }
            onChange={() => toggleAll(tableData)}
          />
        ),
        accessor: "__select__",
        Cell: ({ row }) => (
          <input
            type="checkbox"
            checked={selectedRows.some((r) => r[rowKey] === row[rowKey])}
            onChange={() => toggleRow(row)}
          />
        ),
      },
      ...columns,
    ];
  }, [columns, enableSelection, selectedRows, tableData]);

  const effectiveTotalCount = isServerSide ? totalCount : filteredData.length;

  const totalPages = Math.ceil(effectiveTotalCount / rowsPerPage);

  return (
    <motion.div
      className="bg-white shadow-md rounded-xl p-4 border border-gray-200"
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.2 }}
    >
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-4">
        <h2 className="text-base font-semibold text-gray-800 text-center sm:text-left">
          {title}
        </h2>

        <div className="flex items-center gap-2 flex-wrap">

          <input
            type="text"
            placeholder="Search..."
            className="w-[160px] h-7 bg-gray-100 text-gray-800 placeholder-gray-400
             rounded-md pl-7 pr-2 text-[11px]
             border border-gray-300
             focus:outline-none focus:ring-1 focus:ring-gray-400"
            onChange={(e) => setSearchTerm(e.target.value)}
            value={searchTerm}
          />  {headerActions && <div>{headerActions}</div>}

          {/* Refresh */}
          {onRefresh && (
            <button
              onClick={onRefresh}
              disabled={loading}
              title="Refresh"
              className="p-1.5 rounded-lg border border-gray-300 bg-white
                 hover:bg-gray-100 transition"
            >
              <RefreshCcw
                size={14}
                className={
                  loading ? "animate-spin text-gray-400" : "text-gray-600"
                }
              />
            </button>
          )}
          {/* 🔹 Bulk Actions inline */}
          {enableSelection && selectedRows.length > 0 && (
            <div className="flex items-center gap-1 px-2 py-0.5 bg-gray-100 rounded-lg border">
              <span className="text-[11px] text-gray-600 whitespace-nowrap">
                {selectedRows.length}
              </span>

              {bulkActions?.(selectedRows)}
            </div>
          )}
        </div>
      </div>{" "}
      <div className="overflow-x-auto">
        {loading ? (
          <TableSkeleton columns={finalColumns} rows={10} />
        ) : (
          <table className="min-w-full divide-y divide-gray-200 text-[11px]">
            <thead className="bg-gray-50 sticky top-0 z-10">
              <tr>
                {finalColumns.map((col) => (
                  <th
                    key={col.accessor}
                    title={col.title}
                    className="px-2 py-0.5 text-left font-medium text-gray-500 uppercase tracking-wider"
                  >
                    {col.header}
                  </th>
                ))}

                {actions && (
                  <th className="px-2 py-0.5 text-left font-medium text-gray-500 uppercase tracking-wider">
                    Actions
                  </th>
                )}
              </tr>
            </thead>

            <tbody className="divide-y divide-gray-200">
              <AnimatePresence>
                {tableData.length > 0 ? (
                  tableData.map((row, index) => (
                    <motion.tr
                      key={row[rowKey]}
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0 }}
                      transition={{ duration: 0.3 }}
                      className={`hover:bg-gray-100 transition-colors ${index % 2 === 0 ? "bg-white" : "bg-gray-50"
                        }`}
                    >
                      {finalColumns.map((col) => (
                        <td
                          key={col.accessor}
                          className="px-2 py-0.5 break-words whitespace-normal leading-snug text-gray-800 max-w-[120px]"
                        >
                          {col.Cell
                            ? col.Cell({ value: row[col.accessor], row })
                            : col.accessor === "serial"
                              ? (currentPage - 1) * rowsPerPage + index + 1
                              : renderCellContent(col, row[col.accessor])}
                        </td>
                      ))}

                      {actions && (
                        <td className="px-2 py-0.5 whitespace-nowrap text-gray-800">
                          <div className="flex gap-1">{actions(row)}</div>
                        </td>
                      )}
                    </motion.tr>
                  ))
                ) : (
                  <tr>
                    <td
                      colSpan={columns.length + (actions ? 1 : 0)}
                      className="text-center py-4 text-gray-500"
                    >
                      No records found.
                    </td>
                  </tr>
                )}
              </AnimatePresence>
            </tbody>
          </table>
        )}
      </div>
      {effectiveTotalCount > 0 && (
        <div className="flex flex-col sm:flex-row justify-end items-center mt-4 gap-3">
          <div className="flex items-center gap-2">
            <span className="text-xs text-gray-600">Rows:</span>
            <select
              className="border border-gray-300 rounded-md px-2 py-0.5 text-xs focus:outline-none focus:ring-1 focus:ring-gray-500"
              value={rowsPerPage}
              onChange={(e) => {
                setCurrentPage(1);
                setRowsPerPage(Number(e.target.value));
              }}
            >
              {[10, 25, 50, 100, 500, 1000].map((size) => (
                <option key={size} value={size}>
                  {size}
                </option>
              ))}
            </select>
          </div>

          <div className="flex items-center gap-1">
            {Array.from({ length: totalPages }, (_, i) => i + 1)
              .filter(
                (page) =>
                  page === 1 ||
                  page === totalPages ||
                  (page >= currentPage - 1 && page <= currentPage + 1)
              )
              .map((page, index, array) => {
                const prev = array[index - 1];
                const isEllipsis = prev && page - prev > 1;

                return (
                  <React.Fragment key={page}>
                    {isEllipsis && (
                      <span className="text-gray-400 text-xs px-1">...</span>
                    )}
                    <button
                      className={`px-3 py-1 rounded-md text-xs font-medium transition-all border ${page === currentPage
                          ? "bg-gray-600 text-white border-gray-600"
                          : "bg-white text-gray-700 border-gray-300 hover:bg-gray-100"
                        }`}
                      onClick={() => setCurrentPage(page)}
                    >
                      {page}
                    </button>
                  </React.Fragment>
                );
              })}
          </div>
        </div>
      )}
    </motion.div>
  );
};

export default DataTable;
