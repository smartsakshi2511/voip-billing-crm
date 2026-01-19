import { useState, useEffect } from "react";
import axios from "axios";
import useAuth from "../../../store/useAuth";
import usePopupStore from "../../../store/usePopupStore";
import useToast from "../../reuseable/useToast";

const PERC_OPTIONS = [10,20,30,40,50,60,70,80,90,100];

const LoadBalanceForm = ({ initialData, onSuccess }) => {
  const { token } = useAuth();
  const { closePopup } = usePopupStore();
  const toast = useToast();

  const [trunksList, setTrunksList] = useState([]);
  const [users, setUsers] = useState([]);

  // rows = existing trunks (with id if from db) + one blank row for new trunk
  const [rows, setRows] = useState([]);
  const [selectedUser, setSelectedUser] = useState("");
  const [total, setTotal] = useState(0);
  const [loadingUserData, setLoadingUserData] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    const loadDropdowns = async () => {
      try {
        const [trRes, uRes] = await Promise.all([
          axios.get(`https://${window.location.hostname}:5000/tariff_trunks`, { headers: { Authorization: `Bearer ${token}` } }),
          axios.get(`https://${window.location.hostname}:5000/tariff_trunks`, { headers: { Authorization: `Bearer ${token}` } })
        ]);
        setTrunksList(trRes.data || []);
        setUsers(uRes.data || []);
      } catch (err) {
        toast.error("Failed to load dropdown data");
      }
    };
    loadDropdowns();
  }, [token]);

  const recalcTotal = (list) => {
    const t = (list || rows).reduce((s, r) => s + Number(r.percentage || 0), 0);
    setTotal(t);
    return t;
  };

  const onUserChange = async (u) => {
    setSelectedUser(u);
    setError("");
    setRows([]); 
    if (!u) return;

    setLoadingUserData(true);
    try {
      const res = await axios.get(
        `https://${window.location.hostname}:5000/routemix/user/${u}`,
        { headers: { Authorization: `Bearer ${token}` } }
      );

      const existing = (res.data || []).map((r) => ({
        id: r.id,               // DB id if present
        route_name: r.route_name,
        percentage: Number(r.percentage),
        status: r.status === undefined ? 1 : r.status
      }));

      if (existing.length === 0) {
        // first time: show single row prefilled with 100%
        const initialRow = [{ route_name: "", percentage: 100, status: 1 }];
        setRows(initialRow);
        recalcTotal(initialRow);
      } else {
        // existing trunks: show all existing + one empty row for new trunk entry
        const combined = [...existing, { route_name: "", percentage: "", status: 1, _isNew: true }];
        setRows(combined);
        recalcTotal(combined);
      }
    } catch (err) {
      toast.error("Failed to fetch user percentage info");
      setRows([{ route_name: "", percentage: "" }]);
      recalcTotal([{ route_name: "", percentage: "" }]);
    } finally {
      setLoadingUserData(false);
    }
  };

  // change a row
  const changeRow = (index, field, value) => {
    const updated = rows.map((r, idx) => (idx === index ? { ...r, [field]: field === "percentage" ? (value === "" ? "" : Number(value)) : value } : r));
    setRows(updated);
    recalcTotal(updated);
    // reset error if total now ok
    if (recalcTotal(updated) === 100) setError("");
  };

  // remove a row (only allowed for new row or if you want to delete an existing one)
  const removeRow = (index) => {
    const r = rows[index];
    // if it's an existing DB row, mark for deletion (we'll send batch replace, so we'll just omit it)
    const updated = rows.filter((_, i) => i !== index);
    setRows(updated);
    recalcTotal(updated);
  };

  // Save: use the batch endpoint (recommended)
  const handleSave = async (e) => {
    e && e.preventDefault();
    setError("");

    if (!selectedUser) {
      toast.error("Select user first");
      return;
    }

    // Validate: every row must have route_name and percentage
    for (const r of rows) {
      if (!r.route_name) {
        setError("Select trunk for every row");
        toast.error("Select trunk for every row");
        return;
      }
      if (r.percentage === "" || r.percentage === null || isNaN(Number(r.percentage))) {
        setError("Select percentage for every row");
        toast.error("Select percentage for every row");
        return;
      }
      if (![10,20,30,40,50,60,70,80,90,100].includes(Number(r.percentage))) {
        setError("Percentage must be one of 10,20,...100");
        toast.error("Percentage must be 10,20,...100");
        return;
      }
    }

    const s = recalcTotal(rows);
    if (s !== 100) {
      setError("Total must be exactly 100%");
      toast.error("Total must be exactly 100%");
      // When error occurs we ensure UI shows all rows (we already do). focus first bad field optionally:
      return;
    }

    // Prepare payload: we will send minimal fields to backend batch API
    const payloadTrunks = rows.map((r) => ({
      route_name: r.route_name,
      percentage: Number(r.percentage),
      status: r.status !== undefined ? r.status : 1
    }));

    try {
      // Use batch save endpoint (recommended)
      await axios.post(
        `https://${window.location.hostname}:5000/routemix/batch-save`,
        { user: selectedUser, trunks: payloadTrunks },
        { headers: { Authorization: `Bearer ${token}` } }
      );

      toast.success("Saved successfully!");
      onSuccess?.();
      closePopup();
    } catch (err) {
      const msg = err.response?.data?.message || "Failed to save";
      setError(msg);
      toast.error(msg);
    }
  };

  // UI
  return (
    <form onSubmit={handleSave} className="space-y-4 p-4">
      <div>
        <label className="block mb-1 font-medium">LB Trunk</label>
        <select
          className="w-full border p-2 rounded"
          value={selectedUser}
          onChange={(e) => onUserChange(e.target.value)}
        >
          <option value="">Select LB Trunk</option>
          {users.map((u) => (
            <option key={u.id} value={u.trunkname} >
              {u.trunkname} 
            </option>
          ))}
        </select>
      </div>

      {loadingUserData ? (
        <div>Loading user trunks...</div>
      ) : (
        <>
          <h3 className="mt-2 font-semibold">Trunks for this user</h3>

          {rows.map((r, i) => (
            <div key={i} className="flex gap-3 items-center mt-2">
              <select
                className="border p-2 rounded w-1/2"
                value={r.route_name}
                onChange={(e) => changeRow(i, "route_name", e.target.value)}
              >
                <option value="">Select Trunk</option>
                {trunksList.map((t) => (
                  <option key={t.id} value={t.trunkname}>
                    {t.trunkname}
                  </option>
                ))}
              </select>

              <select
                className="border p-2 rounded w-1/3"
                value={r.percentage === "" ? "" : String(r.percentage)}
                onChange={(e) => changeRow(i, "percentage", e.target.value)}
              >
                <option value="">%</option>
                {PERC_OPTIONS.map((p) => (
                  <option key={p} value={p}>{p}%</option>
                ))}
              </select>

              {/* show remove for new rows */}
              <button
                type="button"
                onClick={() => removeRow(i)}
                className="px-2 py-1 bg-gray-200 rounded"
                title="Remove row"
              >
                ✕
              </button>
            </div>
          ))}

          <div className="mt-2">
            <button
              type="button"
              onClick={() => setRows([...rows, { route_name: "", percentage: "" }])}
              className="px-2 py-1 bg-gray-700 text-white rounded"
            >
              + Add row
            </button>
          </div>

          <div className="text-right font-semibold mt-3">
            Total: {total}% {total !== 100 && <span className="text-red-500">(Must be 100%)</span>}
          </div>

          {error && <p className="text-red-500 text-sm mt-1">{error}</p>}
        </>
      )}

      <div className="flex justify-end gap-3 pt-4">
        <button type="button" className="px-3 py-2 bg-gray-300 rounded" onClick={closePopup}>Cancel</button>
        <button type="submit" className="px-2 py-2 bg-gray-700 text-white rounded">Save</button>
      </div>
    </form>
  );
};

export default LoadBalanceForm;
