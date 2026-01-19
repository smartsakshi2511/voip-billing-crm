import { useState, useEffect } from "react";
import axios from "axios";
import * as XLSX from "xlsx";
import useAuth from "../../store/useAuth";
import usePopupStore from "../../store/usePopupStore";
import useToast from "../reuseable/useToast";
import { saveAs } from "file-saver";
import { Download } from "lucide-react";

const sampleData = [
  {
    Code: "91",
    Destination: "India Mobile",
    buyprice: 0.05,
    buyminimum: 1,
    buyincrement: 1,
    sellprice: 0.1,
    sellminimum: 1,
    sellincrement: 1,
  },
  {
    Code: "44",
    Destination: "UK Mobile",
    buyprice: 0.07,
    buyminimum: 1,
    buyincrement: 1,
    sellprice: 0.15,
    sellminimum: 1,
    sellincrement: 1,
  },
];
const downloadSampleFile = () => {
  const ws = XLSX.utils.json_to_sheet(sampleData);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Tariffs");
  const wbout = XLSX.write(wb, { type: "array", bookType: "xlsx" });
  saveAs(
    new Blob([wbout], { type: "application/octet-stream" }),
    "Sample_Tariff_Prices.xlsx"
  );
};
const TariffForm = ({ initialData = null, bulkData = null, onSuccess }) => {
  const { closePopup } = usePopupStore();
  const { token } = useAuth();
  const toast = useToast();
  const [plans, setPlans] = useState([]);
  const [trunks, setTrunks] = useState([]);
  const [errors, setErrors] = useState({});
  const isBulkMode = Array.isArray(bulkData) && bulkData.length > 0;

  const [formData, setFormData] = useState({
    TarrifID: "",
    PlanID: "",
    PlanName: "",
    TrunkID: "",
    TrunkName: "",
    Code: "",
    Destination: "",
    buyprice: "",
    buyminimum: "",
    buyincrement: "",
    sellprice: "",
    sellminimum: "",
    sellincrement: "",
    status: "Active",
    mode: "manual",
    file: null,
  });

  const getPlanById = (id) =>
    Array.isArray(plans)
      ? plans.find((p) => String(p.PlanID) === String(id))
      : null;

  const getTrunkById = (id) =>
    Array.isArray(trunks)
      ? trunks.find((t) => String(t.id) === String(id))
      : null;

  useEffect(() => {
    if (!initialData) return;

    setFormData((prev) => ({
      ...prev,
      ...initialData,
      status: initialData.Status === "Inactive" ? "Inactive" : "Active",
      mode: "manual",
      file: null,
    }));
  }, [initialData]);

  useEffect(() => {
    axios
      .get(`https://${window.location.hostname}:5000/plans`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      .then((res) => setPlans(Array.isArray(res.data) ? res.data : []))
      .catch(console.error);
  }, [token]);
  useEffect(() => {
    axios
      .get(`https://${window.location.hostname}:5000/tariff_trunks`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      .then((res) => setTrunks(Array.isArray(res.data) ? res.data : []))
      .catch(console.error);
  }, [token]);
  useEffect(() => {
    if (!formData.PlanID) return;

    const plan = getPlanById(formData.PlanID);
    if (!plan) return;

    setFormData((prev) =>
      prev.PlanName === plan.PlanName
        ? prev
        : { ...prev, PlanName: plan.PlanName }
    );
  }, [formData.PlanID, plans]);

  useEffect(() => {
    if (!formData.TrunkID) return;

    const trunk = getTrunkById(formData.TrunkID);
    if (!trunk) return;

    setFormData((prev) =>
      prev.TrunkName === trunk.trunkname
        ? prev
        : { ...prev, TrunkName: trunk.trunkname }
    );
  }, [formData.TrunkID, trunks]);

  useEffect(() => {
    if (initialData || isBulkMode) return;

    axios
      .get(`https://${window.location.hostname}:5000/tariffs/next-id`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      .then((res) =>
        setFormData((prev) => ({ ...prev, TarrifID: res.data.TarrifID }))
      )
      .catch(console.error);
  }, [initialData, isBulkMode, token]);

  const handleChange = (e) => {
    const { name, value, files } = e.target;
    const val = files ? files[0] : value;

    setFormData((prev) => ({ ...prev, [name]: val }));
    setErrors((prev) => ({ ...prev, [name]: "" }));
  };

  const validate = () => {
    if (isBulkMode) return true;

    const err = {};
    if (!formData.PlanID) err.PlanID = "Select Plan";
    if (!formData.TrunkID) err.TrunkID = "Select Trunk";
    if (formData.mode === "manual") {
      if (!formData.Code) err.Code = "Code required";
      if (!formData.Destination) err.Destination = "Destination required";
    }

    setErrors(err);
    return !Object.keys(err).length;
  };
  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!validate()) return;

    try {
      if (formData.PlanID && !formData.PlanName) {
        const plan = plans.find(
          (p) => String(p.PlanID) === String(formData.PlanID)
        );
        if (plan) formData.PlanName = plan.PlanName;
      }

      if (formData.TrunkID && !formData.TrunkName) {
        const trunk = trunks.find(
          (t) => String(t.id) === String(formData.TrunkID)
        );
        if (trunk) formData.TrunkName = trunk.trunkname;
      }
      if (formData.mode === "excel") {
        if (!formData.file) {
          toast.error("Please select an Excel file");
          return;
        }

        const fd = new FormData();
        fd.append("file", formData.file);
        fd.append("PlanName", formData.PlanName || "");
        fd.append("TrunkName", formData.TrunkName || "");
        fd.append("Code", formData.Code || "");
        fd.append("Destination", formData.Destination || "");
        fd.append("status", formData.status || "Active");

        await axios.post(
          `https://${window.location.hostname}:5000/tariffs/upload`,
          fd,
          {
            headers: {
              Authorization: `Bearer ${token}`,
              "Content-Type": "multipart/form-data",
            },
          }
        );
        toast.success("Tariff Excel uploaded successfully");
        onSuccess?.({
          ...formData,
          id: initialData?.id || res.data?.id,
        });

        closePopup();
        return;
      }
      if (isBulkMode) {
        const allowed = [
          "PlanID",
          "PlanName",
          "TrunkID",
          "TrunkName",
          "buyprice",
          "buyminimum",
          "buyincrement",
          "sellprice",
          "sellminimum",
          "sellincrement",
          "status",
          "del_status",
        ];

        const updates = Object.fromEntries(
          Object.entries(formData).filter(
            ([k, v]) => allowed.includes(k) && v !== ""
          )
        );

        if (!Object.keys(updates).length) {
          toast.error("Change at least one field");
          return;
        }

        await axios.put(
          `https://${window.location.hostname}:5000/tariffs/bulk-update`,
          {
            ids: bulkData.map((r) => r.id),
            updates,
          },
          {
            headers: { Authorization: `Bearer ${token}` },
          }
        );

        toast.success("Bulk update successful");
        onSuccess?.();
        closePopup();
        return;
      }
      const url = initialData
        ? `/tariffs/${initialData.id}`
        : `/tariffs`;

      const method = initialData ? axios.put : axios.post;

      const res = await method(
        `https://${window.location.hostname}:5000${url}`,
        formData,
        {
          headers: { Authorization: `Bearer ${token}` },
        }
      );

      toast.success(
        initialData
          ? "Tariff updated successfully"
          : "Tariff added successfully"
      );
      onSuccess?.(res.data);
      closePopup();
    } catch (err) {
      console.error("❌ Tariff submit failed:", err);
      toast.error(
        err.response?.data?.message || "Failed to save tariff"
      );
    }
  };


  useEffect(() => {
    if (!isBulkMode) return;
    setFormData((prev) => ({
      ...prev,
      TarrifID: "",
      Code: "",
      Destination: "",
    }));
  }, [isBulkMode]);

  return (
    <form
      onSubmit={handleSubmit}
      className="p-6 border rounded-xl shadow-md bg-white space-y-6"
    >
      <div className="flex justify-end">
        <button
          type="button"
          onClick={downloadSampleFile}
          className=" text-black px-4 py-2 rounded-lg shadow hover:bg-gray-400 transition flex items-center gap-2"
        >
          <Download className="w-5 h-5" />
          Sample
        </button>
      </div>

      <div>
        <label className="block font-medium">Mode</label>
        <select
          name="mode"
          disabled={isBulkMode}
          value={formData.mode}
          onChange={handleChange}
          className="border px-3 py-2 w-full rounded-lg focus:ring focus:ring-blue-300"
        >
          <option value="manual">Manual</option>
          <option value="excel">Upload</option>
        </select>
      </div>

      {formData.mode === "excel" && (
        <div>
          <label className="block font-medium">Upload Excel File</label>
          <input
            type="file"
            name="file"
            accept=".xlsx, .xls, .csv"
            onChange={handleChange}
            className="border px-3 py-2 w-full rounded-lg"
          />
        </div>
      )}

      <div className="grid grid-cols-3 gap-6">
        {formData.mode === "manual" && !isBulkMode && (
          <div>
            <label className="block font-medium">Tariff ID</label>
            <input
              type="text"
              name="TarrifID"
              value={formData.TarrifID}
              readOnly
              className="border px-3 py-2 w-full rounded-lg bg-gray-100"
            />
          </div>
        )}

        <div>
          <label className="block font-medium">Plan Name</label>
          <select
            name="PlanID"
            value={formData.PlanID}
            onChange={(e) => {
              const selectedId = e.target.value;
              const plan = Array.isArray(plans)
                ? plans.find((p) => p.PlanID === selectedId)
                : null;
              setFormData((prev) => ({
                ...prev,
                PlanID: selectedId,
                PlanName: plan ? plan.PlanName : "",
              }));
              setErrors((prev) => ({ ...prev, PlanID: "" }));
            }}
            className={`border px-3 py-2 w-full rounded-lg focus:ring focus:ring-blue-300 ${errors.PlanID ? "border-red-500" : ""
              }`}
          >
            <option value="">Select Plan</option>
            {plans.map((p) => (
              <option key={p.PlanID} value={p.PlanID}>
                {p.PlanName}
              </option>
            ))}
          </select>
          {errors.PlanID && (
            <p className="text-red-500 text-sm">{errors.PlanID}</p>
          )}
        </div>

        <div>
          <label className="block font-medium">Trunk Name</label>
          <select
            name="TrunkID"
            value={formData.TrunkID}
            onChange={(e) => {
              const selectedId = e.target.value;
              const trunk = Array.isArray(trunks)
                ? trunks.find((t) => t.id.toString() === selectedId)
                : null;

              setFormData((prev) => ({
                ...prev,
                TrunkID: selectedId,
                TrunkName: trunk ? trunk.trunkname : "",
              }));
              setErrors((prev) => ({ ...prev, TrunkID: "" }));
            }}
            className={`border px-3 py-2 w-full rounded-lg focus:ring focus:ring-blue-300 ${errors.TrunkID ? "border-red-500" : ""
              }`}
          >
            <option value="">Select Trunk</option>
            {trunks.map((t) => (
              <option key={t.id} value={t.id}>
                {t.trunkname}
              </option>
            ))}
          </select>
          {errors.TrunkID && (
            <p className="text-red-500 text-sm">{errors.TrunkID}</p>
          )}
        </div>
      </div>
      <div className="grid grid-cols-3 gap-6">
        {formData.mode === "manual" && !isBulkMode && (
          <>
            <div>
              <label className="block font-medium">Code</label>
              <input
                type="text"
                name="Code"
                value={formData.Code}
                onChange={handleChange}
                className={`border px-3 py-2 w-full rounded-lg focus:ring focus:ring-blue-300 ${errors.Code ? "border-red-500" : ""
                  }`}
              />
              {errors.Code && (
                <p className="text-red-500 text-sm">{errors.Code}</p>
              )}
            </div>

            <div>
              <label className="block font-medium">Destination</label>
              <input
                type="text"
                name="Destination"
                value={formData.Destination}
                onChange={handleChange}
                className={`border px-3 py-2 w-full rounded-lg focus:ring focus:ring-blue-300 ${errors.Destination ? "border-red-500" : ""
                  }`}
              />
              {errors.Destination && (
                <p className="text-red-500 text-sm">{errors.Destination}</p>
              )}
            </div>
          </>
        )}

        <div>
          <label className="block font-medium">Status</label>
          <select
            name="status"
            value={formData.status}
            onChange={handleChange}
            className="border px-3 py-2 w-full rounded-lg focus:ring focus:ring-blue-300"
          >
            <option value="Active">Active</option>
            <option value="Inactive">Inactive</option>
          </select>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-6"></div>

      {formData.mode === "manual" && (
        <div className="grid grid-cols-3 gap-6">
          {[
            "buyprice",
            "sellprice",
            "buyminimum",
            "buyincrement",
            "sellminimum",
            "sellincrement",
          ].map((f) => (
            <div key={f}>
              <label className="block font-medium">{f}</label>
              <input
                type="text"
                name={f}
                value={formData[f]}
                onChange={handleChange}
                className={`border px-3 py-2 w-full rounded-lg focus:ring focus:ring-blue-300 ${errors[f] ? "border-red-500" : ""
                  }`}
              />
              {errors[f] && <p className="text-red-500 text-sm">{errors[f]}</p>}
            </div>
          ))}
        </div>
      )}
      <div className="text-right">
        <button
          type="submit"
          className="bg-gray-600 text-white px-2 py-2 rounded-lg shadow hover:bg-gray-700 transition"
        >
          {isBulkMode ? "Bulk Update" : initialData ? "Update" : "Submit"}
        </button>
      </div>
    </form>
  );
};

export default TariffForm;
