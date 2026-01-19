import * as XLSX from "xlsx";
import { saveAs } from "file-saver";

/* ===== CSV ===== */
export const exportToCSV = (data, columns, fileName = "export") => {
  if (!data?.length) return;

  const headers = columns
    .filter(col => col.accessor !== "actions" && col.exportable !== false)
    .map(col => col.header);

  const rows = data.map(row =>
    columns
      .filter(col => col.accessor !== "actions" && col.exportable !== false)
      .map(col => `"${row[col.accessor] ?? ""}"`)
      .join(",")
  );

  const csvContent = [headers.join(","), ...rows].join("\n");
  const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
  saveAs(blob, `${fileName}.csv`);
};

/* ===== EXCEL ===== */
export const exportToExcel = (data, columns, fileName = "export") => {
  if (!data?.length) return;

  const excelData = data.map(row => {
    const obj = {};
    columns
      .filter(col => col.accessor !== "actions" && col.exportable !== false)
      .forEach(col => {
        obj[col.header] = row[col.accessor] ?? "";
      });
    return obj;
  });

  const worksheet = XLSX.utils.json_to_sheet(excelData);
  const workbook = XLSX.utils.book_new();

  XLSX.utils.book_append_sheet(workbook, worksheet, "Data");

  const excelBuffer = XLSX.write(workbook, {
    bookType: "xlsx",
    type: "array",
  });

  const blob = new Blob(
    [excelBuffer],
    { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }
  );

  saveAs(blob, `${fileName}.xlsx`);
};
