import { useState, useEffect } from "react";
import axios from "axios";
import useAuth from "../../../store/useAuth";
import usePopupStore from "../../../store/usePopupStore";
import useToast from "../../reuseable/useToast"; // import toast


const RoutesForm = ({ initialData, bulkData, onSuccess }) => {
  const isBulkEdit = Array.isArray(bulkData) && bulkData.length > 0;
  const { closePopup } = usePopupStore();
  const { token } = useAuth();
  const toast = useToast(); // use toast
  const [existingRouteIDs, setExistingRouteIDs] = useState([]);

  const [form, setForm] = useState({ Routeid: "", routename: "" });

  useEffect(() => {
    if (initialData) setForm(initialData);
  }, [initialData]);

  useEffect(() => {
    if (!initialData && !form.Routeid && existingRouteIDs.length > 0) {
      let newId;
      do {
        newId = Math.floor(100000 + Math.random() * 900000).toString();
      } while (existingRouteIDs.includes(newId));

      setForm((prev) => ({ ...prev, Routeid: newId }));
    }
  }, [existingRouteIDs, initialData]);


  const fetchExistingRoutes = async () => {
    try {
      const res = await axios.get(`https://${window.location.hostname}:5000/routes`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const ids = res.data.map((r) => r.Routeid.toString());
      setExistingRouteIDs(ids);
    } catch (err) {
      console.error("Failed to fetch routes:", err);
    }
  };

  fetchExistingRoutes();


  const handleChange = (e) => {
    setForm({ ...form, [e.target.name]: e.target.value });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      if (isBulkEdit) {
        await axios.put(
          `https://${window.location.hostname}:5000/routes/bulk-update`,
          {
            ids: bulkData.map((r) => r.id),
            routename: form.routename,
          },
          { headers: { Authorization: `Bearer ${token}` } }
        );

        toast.success("Routes updated successfully");
        onSuccess?.();
        closePopup();
        return;
      }

      if (initialData) {
        const res = await axios.put(
          `https://${window.location.hostname}:5000/routes/${initialData.id}`,
          form,
          { headers: { Authorization: `Bearer ${token}` } }
        );
        toast.success("Route updated successfully!");
        onSuccess?.(res.data);
      } else {
        const res = await axios.post(`https://${window.location.hostname}:5000/routes`, form, {
          headers: { Authorization: `Bearer ${token}` },
        });
        toast.success("Route added successfully!");
        onSuccess?.(res.data);
      }
      closePopup();
    } catch (err) {
      console.error("❌ Failed to save route:", err);
      toast.error(err.response?.data?.message || "Failed to save route");
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4 p-4">
      {!isBulkEdit && (
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Route ID
          </label>
          <input
            type="text"
            name="Routeid"
            value={form.Routeid}
            readOnly
            className="w-full border rounded-lg px-3 py-2 bg-gray-100 cursor-not-allowed"
          />
        </div>
      )}

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">Route Name</label>
        <input
          type="text"
          name="routename"
          value={form.routename}
          onChange={handleChange}
          placeholder="Enter Route Name"
          className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500"
          required
        />
      </div>
      <div className="flex justify-end space-x-2 pt-4">
        <button
          type="button"
          onClick={closePopup}
          className="px-4 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300"
        >
          Cancel
        </button>
        <button
          type="submit"
          className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
        >
          Save
        </button>
      </div>
    </form>
  );
};

export default RoutesForm;
