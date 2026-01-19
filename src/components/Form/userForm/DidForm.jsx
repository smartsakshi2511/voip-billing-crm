import { useState, useEffect } from "react";
import axios from "axios";
import useAuth from "../../../store/useAuth";
import useToast from "../../reuseable/useToast";
import usePopupStore from "../../../store/usePopupStore";
import * as XLSX from "xlsx";
import { saveAs } from "file-saver";
import { Download } from "lucide-react";

const sampleData = [
  {
    did: "1234567890",
    monthlycost: 100,
    buyprice: 50,
    buyminimum: 1,
    buyincrement: 1,
    sellprice: 150,
    sellminimum: 1,
    sellincrement: 1,
  },
  {
    did: "9876543210",
    monthlycost: 200,
    buyprice: 80,
    buyminimum: 1,
    buyincrement: 1,
    sellprice: 250,
    sellminimum: 1,
    sellincrement: 1,
  },
];

const DIDForm = ({ initialData, bulkData, onSuccess }) => {
  const { token } = useAuth();
  const toast = useToast();
  const { closePopup } = usePopupStore();

  const [form, setForm] = useState({
    did: "",
    reserved: false,
    user_id: "",
    trunk: "",
    monthlycost: 0,
    buyprice: 0,
    buyminimum: 0,
    buyincrement: 0,
    sellprice: 0,
    sellminimum: 0,
    sellincrement: 0,
    status: "Active",
    typeofcall: "PSTN",
    pstn: "",
    sipid: "",
    ivr_extension: "",
    ip_address: "",
  });

  const [users, setUsers] = useState([]);
  const [trunks, setTrunks] = useState([]);
  const [bulkFile, setBulkFile] = useState(null);
  const [mode, setMode] = useState("manual");
  const [loading, setLoading] = useState(false);
  const isBulkMode = Array.isArray(bulkData) && bulkData.length > 0;
  const isEditMode = Boolean(initialData);
  const isReservedDID =
    initialData?.reserved === "yes" || initialData?.reserved === true;


  const fetchDropdowns = async () => {
    try {
      const [usersRes, trunksRes] = await Promise.all([
        axios.get(`https://${window.location.hostname}:5000/users_dropdown`, {
          headers: { Authorization: `Bearer ${token}` },
        }),
        axios.get(`https://${window.location.hostname}:5000/tariff_trunks`, {
          headers: { Authorization: `Bearer ${token}` },
        }),
      ]);
      setUsers(usersRes.data);
      setTrunks(trunksRes.data);
    } catch (err) {
      alert("Failed to load dropdown data");
      console.error(err);
    }
  };

  useEffect(() => {
    fetchDropdowns();
  }, []);

  useEffect(() => {
    if (initialData && users.length && trunks.length) {
      setForm((prev) => ({
        ...prev,
        did: initialData.did || "",
        reserved:
          initialData.reserved === "yes" || initialData.reserved === true,
        user_id:
          users.find((u) => u.id === initialData.user_id)?.username ||
          initialData.user_id ||
          "",
        trunk:
          trunks.find((t) => t.trunkname === initialData.trunk)?.trunkname ||
          initialData.trunk ||
          "",
        monthlycost: initialData.monthlycost || 0,
        buyprice: initialData.buyprice || 0,
        buyminimum: initialData.buyminimum || 0,
        buyincrement: initialData.buyincrement || 0,
        sellprice: initialData.sellprice || 0,
        sellminimum: initialData.sellminimum || 0,
        sellincrement: initialData.sellincrement || 0,
        status: initialData.status || "",
        typeofcall: initialData.typeofcall || "PSTN",
        pstn: initialData.PSTN || "",
        sipid: initialData.SIPID || "",
        ivr_extension: initialData.ivr_extension || "",
        ip_address: initialData.ip_address || "",
      }));
    }
  }, [initialData, users.length, trunks.length]);

  const resetForm = () => {
    setForm({
      did: "",
      reserved: false,
      user_id: "",
      trunk: "",
      monthlycost: "",
      buyprice: "",
      buyminimum: "",
      buyincrement: "",
      sellprice: "",
      sellminimum: "",
      sellincrement: "",
      status: "",
      typeofcall: "PSTN",
      pstn: "",
      sipid: "",
      ivr_extension: "",
      ip_address: "",
    });
    setBulkFile(null);
  };

  const handleChange = (e) => {
    const { name, value, type, checked } = e.target;
    const decimalFields = [
      "buyprice",
      "sellprice",
      "buyminimum",
      "buyincrement",
      "sellminimum",
      "sellincrement",
      "monthlycost",
    ];
    let val = type === "checkbox" ? checked : value;

    if (decimalFields.includes(name) && val) {
      if (/^\d*\.?\d{0,6}$/.test(val)) {
        setForm((prev) => ({ ...prev, [name]: val }));
      }
    } else {
      setForm((prev) => ({ ...prev, [name]: val }));
    }
  };

  const handleBulkSubmit = async (e) => {
    e.preventDefault();
    if (!bulkFile || !form.user_id || !form.trunk) {
      alert("Select user, trunk, and upload a file.");
      return;
    }

    setLoading(true);
    try {
      const formData = new FormData();
      formData.append("file", bulkFile);
      formData.append("user_id", form.user_id);
      formData.append("trunk", form.trunk);
      formData.append("reserved", form.reserved ? "yes" : "no");
      formData.append("status", form.status);
      formData.append("typeofcall", form.typeofcall);
      formData.append("pstn", form.pstn);
      formData.append("sipid", form.sipid);
      formData.append("ivr_extension", form.ivr_extension);
      formData.append("ip_address", form.ip_address);

      await axios.post(`https://${window.location.hostname}:5000/dids/import`, formData, {
        headers: { Authorization: `Bearer ${token}` },
      });

      toast.success("✅ Bulk import successful!");
      resetForm();
      onSuccess?.();
      closePopup();
    } catch (err) {
      toast.error("Bulk import failed");
      console.error(err);
    } finally {
      setLoading(false);
    }
  };


  // const handleSubmit = async (e) => {
  //   e.preventDefault();
  //   setLoading(true);
  //   try {
  //     const res = initialData
  //       ? await axios.put(
  //         `https://${window.location.hostname}:5000/dids/${initialData.id}`,
  //         form,
  //         {
  //           headers: { Authorization: `Bearer ${token}` },
  //         }
  //       )
  //       : await axios.post(`https://${window.location.hostname}:5000/dids`, form, {
  //         headers: { Authorization: `Bearer ${token}` },
  //       });

  //     toast.success("DID saved successfully!");
  //     resetForm();
  //     onSuccess?.();
  //     closePopup();
  //   } catch (err) {
  //     console.error(err);
  //     toast.error("Failed to save DID");
  //   } finally {
  //     setLoading(false);
  //   }
  // };


  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);

    try {
      if (isBulkMode) {
        console.log("🟡 BULK MODE TRUE");

        const updates = {};

        [
          "reserved",
          "user_id",
          "trunk",
          "monthlycost",
          "buyprice",
          "buyminimum",
          "buyincrement",
          "sellprice",
          "sellminimum",
          "sellincrement",
          "status",
          "typeofcall",
          "pstn",
          "sipid",
          "ivr_extension",
          "ip_address",
        ].forEach((key) => {
          if (form[key] !== "" && form[key] !== null) {
            updates[key] = form[key];
          }
        });

        console.log("🧾 Form values 👉", form);
        console.log("🧾 Update payload 👉", updates);
        console.log("🧾 Selected bulkData 👉", bulkData);

        if (!Object.keys(updates).length) {
          console.warn("⚠️ No fields changed");
          toast.error("Please change at least one field");
          return;
        }

        const url = `https://${window.location.hostname}:5000/dids/bulkUpdate`;

        console.log("🌐 API URL 👉", url);
        console.log("📤 Sending IDs 👉", bulkData.map((row) => row.id));
        console.log("🔐 Token 👉", token);

        try {
          const res = await axios.put(
            url,
            {
              ids: bulkData.map((row) => row.id),
              data: updates,
            },
            {
              headers: { Authorization: `Bearer ${token}` },
            }
          );

          console.log("✅ BULK API RESPONSE 👉", res.data);

          toast.success("✅ Bulk DID update successful");
          onSuccess?.();
          closePopup();
        } catch (apiErr) {
          console.error("❌ BULK API ERROR");

          if (apiErr.response) {
            console.error("Status 👉", apiErr.response.status);
            console.error("Response 👉", apiErr.response.data);
          } else if (apiErr.request) {
            console.error("No response from server 👉", apiErr.request);
          } else {
            console.error("Axios error 👉", apiErr.message);
          }

          toast.error("Bulk DID update failed");
        }

        return;
      }

      /* ======================================================
         2️⃣ MANUAL ADD / UPDATE
      ====================================================== */
      if (initialData) {
        await axios.put(
          `https://${window.location.hostname}:5000/dids/${initialData.id}`,
          form,
          {
            headers: { Authorization: `Bearer ${token}` },
          }
        );
        toast.success("✅ DID updated successfully");
      } else {
        await axios.post(
          `https://${window.location.hostname}:5000/dids`,
          form,
          {
            headers: { Authorization: `Bearer ${token}` },
          }
        );
        toast.success("✅ DID added successfully");
      }

      resetForm();
      onSuccess?.();
      closePopup();
    } catch (err) {
      console.error(err);
      toast.error("Failed to save DID");
    } finally {
      setLoading(false);
    }
  };


  const downloadSampleFile = () => {
    const ws = XLSX.utils.json_to_sheet(sampleData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "DIDs");

    const wbout = XLSX.write(wb, { bookType: "xlsx", type: "array" });
    saveAs(new Blob([wbout], { type: "application/octet-stream" }), "DID_Sample.xlsx");
  };


  return (
    <div className="p-4">
      <div className="mb-4 ">
        <label className="block text-sm font-medium mb-1">Select Mode</label>
        <select
          value={mode}
          onChange={(e) => setMode(e.target.value)}
          className="w-full border rounded px-3 py-2"
        >
          <option value="manual">Manual</option>
          <option value="bulk">Bulk Import</option>
        </select>
      </div>

      {mode === "manual" ? (
        <form onSubmit={handleSubmit} className="space-y-4">
          {/* --------------------------- Manual Form Fields --------------------------- */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium">User</label>
              <select
                name="user_id"
                value={form.user_id}
                onChange={handleChange}
                className="w-full border rounded px-3 py-2"
              >
                <option value="">Select User</option>
                {users.map((u, idx) => (
                  <option key={idx} value={u.username}>
                    {u.username}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium">Trunk</label>
              <select
                name="trunk"
                value={form.trunk}
                onChange={handleChange}
                className="w-full border rounded px-3 py-2"
              >
                <option value="">Select Trunk</option>
                {trunks.map((t, idx) => (
                  <option key={idx} value={t.trunkname}>
                    {t.trunkname}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium">DID</label>
              <input
                type="text"
                name="did"
                value={form.did}
                onChange={handleChange}
                readOnly={isEditMode && isReservedDID}   // ⭐ main logic
                className={`w-full border rounded px-3 py-2 
      ${isEditMode && isReservedDID
                    ? "bg-gray-100 cursor-not-allowed"
                    : ""}`}
                placeholder="Enter DID"
              />

              {/* {isEditMode && isReservedDID && (
                <p className="text-xs text-red-500 mt-1">
                  Reserved DID cannot be edited
                </p>
              )} */}
            </div>

            <div className="flex items-center gap-2 mt-6">
              <input
                type="checkbox"
                name="reserved"
                checked={form.reserved}
                onChange={handleChange}
              />
              <label className="text-sm">Reserved</label>
            </div>

            {form.reserved && form.user_id && (
              <>
                <div>
                  <label className="block text-sm font-medium">
                    Type of Call
                  </label>
                  <select
                    name="typeofcall"
                    value={form.typeofcall}
                    onChange={handleChange}
                    className="w-full border rounded px-3 py-2"
                  >
                    <option value="PSTN">PSTN</option>
                    <option value="SIPID">SIPID</option>
                    <option value="IP">IP</option>
                    <option value="IVR">IVR</option>
                  </select>
                </div>

                {form.typeofcall === "PSTN" && (
                  <div>
                    <label className="block text-sm font-medium">PSTN</label>
                    <input
                      type="text"
                      name="pstn"
                      value={form.pstn}
                      onChange={handleChange}
                      className="w-full border rounded px-3 py-2"
                      placeholder="Enter PSTN"
                    />
                  </div>
                )}

                {form.typeofcall === "SIPID" && (
                  <div>
                    <label className="block text-sm font-medium">SIP ID</label>
                    <input
                      type="text"
                      name="sipid"
                      value={form.sipid}
                      onChange={handleChange}
                      className="w-full border rounded px-3 py-2"
                      placeholder="Enter SIP ID"
                    />
                  </div>
                )}

                {form.typeofcall === "IP" && (
                  <div>
                    <label className="block text-sm font-medium">
                      IP Address
                    </label>
                    <input
                      type="text"
                      name="ip_address"
                      value={form.ip_address}
                      onChange={handleChange}
                      className="w-full border rounded px-3 py-2"
                      placeholder="Enter IP Address"
                    />
                  </div>
                )}

                {form.typeofcall === "IVR" && (
                  <div>
                    <label className="block text-sm font-medium">
                      IVR Extension
                    </label>
                    <input
                      type="text"
                      name="ivr_extension"
                      value={form.ivr_extension}
                      onChange={handleChange}
                      className="w-full border rounded px-3 py-2"
                      placeholder="Enter IVR Extension"
                    />
                  </div>
                )}
              </>
            )}

            {[
              { label: "Monthly Cost", name: "monthlycost", step: "0.000001" },
              { label: "Buy Price", name: "buyprice", step: "0.000001" },
              { label: "Buy Minimum", name: "buyminimum" },
              { label: "Buy Increment", name: "buyincrement" },
              { label: "Sell Price", name: "sellprice", step: "0.000001" },
              { label: "Sell Minimum", name: "sellminimum" },
              { label: "Sell Increment", name: "sellincrement" },
            ].map(({ label, name, step }) => (
              <div key={name}>
                <label className="block text-sm font-medium">{label}</label>
                <input
                  type="number"
                  name={name}
                  value={form[name]}
                  onChange={handleChange}
                  className="w-full border rounded px-3 py-2"
                  placeholder={label}
                  step={step || "1"}
                  min="0"
                />
              </div>
            ))}

            <div>
              <label className="block text-sm font-medium">Status</label>
              <select
                name="status"
                value={form.status}
                onChange={handleChange}
                className="w-full border rounded px-3 py-2"
              >
                <option value="">Select Status</option>
                <option value="Active">Active</option>
                <option value="Inactive">Inactive</option>
              </select>
            </div>
          </div>

          <div className="flex justify-end pt-4">
            <button
              type="submit"
              disabled={loading}
              className="px-5 py-2 bg-gray-600 text-white rounded hover:bg-gray-700 disabled:opacity-50"
            >
              {loading ? "Saving..." : initialData ? "Update DID" : "Add DID"}
            </button>
          </div>
        </form>
      ) : (
        <form
          onSubmit={handleBulkSubmit}
          className="p-6 border rounded-xl shadow-md bg-white space-y-6 relative"
        >
          <div className="flex justify-end">
            <button
              type="button"
              onClick={downloadSampleFile}
              className="text-black px-4 py-2 rounded-lg shadow hover:bg-gray-400 transition flex items-center gap-2"
            >
              <Download className="w-5 h-5" />
              Sample
            </button>
          </div>

          {/* ---------------- User ---------------- */}
          <div>
            <label className="block font-medium">User</label>
            <select
              name="user_id"
              value={form.user_id}
              onChange={handleChange}
              className="border px-3 py-2 w-full rounded-lg focus:ring focus:ring-blue-300"
            >
              <option value="">Select User</option>
              {users.map((u, idx) => (
                <option key={idx} value={u.username}>
                  {u.username}
                </option>
              ))}
            </select>
          </div>



          {/* ---------------- Trunk ---------------- */}
          <div>
            <label className="block font-medium">Trunk</label>
            <select
              name="trunk"
              value={form.trunk}
              onChange={handleChange}
              className="border px-3 py-2 w-full rounded-lg focus:ring focus:ring-blue-300"
            >
              <option value="">Select Trunk</option>
              {trunks.map((t, idx) => (
                <option key={idx} value={t.trunkname}>
                  {t.trunkname}
                </option>
              ))}
            </select>
          </div>




          {/* ---------------- Excel Upload ---------------- */}
          <div>
            <label className="block font-medium">Upload Excel File</label>
            <input
              type="file"
              accept=".xlsx,.xls"
              onChange={(e) => setBulkFile(e.target.files[0])}
              className="border px-3 py-2 w-full rounded-lg"
            />
          </div>


          {/* Reserved Checkbox */}
          <div className="flex items-center gap-2 mt-6">
            <input
              type="checkbox"
              name="reserved"
              checked={form.reserved}
              onChange={handleChange}
            />
            <label className="text-sm">Reserved</label>
          </div>

          {form.reserved && form.user_id && (
            <>
              <div>
                <label className="block text-sm font-medium">
                  Type of Call
                </label>
                <select
                  name="typeofcall"
                  value={form.typeofcall}
                  onChange={handleChange}
                  className="w-full border rounded px-3 py-2"
                >
                  <option value="PSTN">PSTN</option>
                  <option value="SIPID">SIPID</option>
                  <option value="IP">IP</option>
                  <option value="IVR">IVR</option>
                </select>
              </div>

              {form.typeofcall === "PSTN" && (
                <div>
                  <label className="block text-sm font-medium">PSTN</label>
                  <input
                    type="text"
                    name="pstn"
                    value={form.pstn}
                    onChange={handleChange}
                    className="w-full border rounded px-3 py-2"
                    placeholder="Enter PSTN"
                  />
                </div>
              )}

              {form.typeofcall === "SIPID" && (
                <div>
                  <label className="block text-sm font-medium">SIP ID</label>
                  <input
                    type="text"
                    name="sipid"
                    value={form.sipid}
                    onChange={handleChange}
                    className="w-full border rounded px-3 py-2"
                    placeholder="Enter SIP ID"
                  />
                </div>
              )}

              {form.typeofcall === "IP" && (
                <div>
                  <label className="block text-sm font-medium">
                    IP Address
                  </label>
                  <input
                    type="text"
                    name="ip_address"
                    value={form.ip_address}
                    onChange={handleChange}
                    className="w-full border rounded px-3 py-2"
                    placeholder="Enter IP Address"
                  />
                </div>
              )}

              {form.typeofcall === "IVR" && (
                <div>
                  <label className="block text-sm font-medium">
                    IVR Extension
                  </label>
                  <input
                    type="text"
                    name="ivr_extension"
                    value={form.ivr_extension}
                    onChange={handleChange}
                    className="w-full border rounded px-3 py-2"
                    placeholder="Enter IVR Extension"
                  />
                </div>
              )}
            </>
          )}

          <div>
            <label className="block text-sm font-medium">Status</label>
            <select
              name="status"
              value={form.status}
              onChange={handleChange}
              className="w-full border rounded px-3 py-2"
            >
              <option value="">Select Status</option>
              <option value="Active">Active</option>
              <option value="Inactive">Inactive</option>
            </select>
          </div>


          {/* ---------------- Submit Button ---------------- */}
          <div className="text-right">
            <button
              type="submit"
              disabled={loading}
              className="bg-gray-600 text-white px-6 py-2 rounded-lg shadow hover:bg-gray-700 transition disabled:opacity-50"
            >
              {loading ? "Importing..." : "Import DIDs"}
            </button>
          </div>
        </form>
      )}
    </div>
  );
};

export default DIDForm;
