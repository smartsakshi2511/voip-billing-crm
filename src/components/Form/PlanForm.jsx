import { useState, useEffect } from "react";
import usePopupStore from "../../store/usePopupStore";
import useAuth from "../../store/useAuth";
import axios from "axios";
import useToast from "../reuseable/useToast";

const PlanForm = ({ initialData, bulkData, onSuccess }) => {
  const { closePopup } = usePopupStore();
  const { token } = useAuth();
  const toast = useToast();


  const isBulkEdit = Array.isArray(bulkData) && bulkData.length > 0;
  const isEdit = !!initialData && !isBulkEdit;
  const [form, setForm] = useState({
    PlanID: "",
    PlanName: "",
    lcr_type: "",
  });

  const [fieldErrors, setFieldErrors] = useState({
    PlanName: "",
    lcr_type: "",
  });
  useEffect(() => {
    if (initialData && !isBulkEdit) {
      setForm({
        PlanID: initialData.PlanID || "",
        PlanName: initialData.PlanName || "",
        lcr_type: initialData.lcr_type || "",
      });
    }
    if (isBulkEdit) {
      setForm({
        PlanID: "",
        PlanName: "",
        lcr_type: "",
      });
    }
  }, [initialData, isBulkEdit]);

  useEffect(() => {
    if (!initialData && !isBulkEdit) {
      const newId = Math.floor(100000 + Math.random() * 900000).toString();
      setForm((prev) => ({ ...prev, PlanID: newId }));
    }
  }, [initialData, isBulkEdit]);

  const handleChange = (e) => {
    const { name, value } = e.target;
    setForm((prev) => ({ ...prev, [name]: value }));
    setFieldErrors((prev) => ({ ...prev, [name]: "" }));
  };

  const validateForm = () => {
    if (isBulkEdit) return true;

    const errors = {};
    if (!form.PlanName.trim()) errors.PlanName = "Plan Name is required!";
    if (!form.lcr_type) errors.lcr_type = "Please select LCR Type!";

    setFieldErrors(errors);
    return Object.keys(errors).length === 0;
  };
const handleSubmit = async (e) => {
  e.preventDefault();
  if (!validateForm()) return;

  try {
    // ✅ BULK UPDATE
    if (isBulkEdit) {
      await axios.put(
        `https://${window.location.hostname}:5000/plans/bulk-update`,
        {
          ids: bulkData.map((row) => row.id),
          PlanName: form.PlanName || null,
          lcr_type: form.lcr_type || null,
        },
        { headers: { Authorization: `Bearer ${token}` } }
      );

      toast.success("Plans updated successfully ✅");
      onSuccess?.();
      closePopup();
      return;
    }

    // ✅ SINGLE UPDATE
    if (initialData) {
      await axios.put(
        `https://${window.location.hostname}:5000/plans/${initialData.id}`,
        form,
        { headers: { Authorization: `Bearer ${token}` } }
      );

      toast.success("Plan updated successfully ✅");
      onSuccess?.();
      closePopup();
      return;
    }

    // ✅ ADD PLAN
    await axios.post(
      `https://${window.location.hostname}:5000/plans`,
      form,
      { headers: { Authorization: `Bearer ${token}` } }
    );

    toast.success("Plan added successfully ✅");
    onSuccess?.();
    closePopup();
  } catch (err) {
    console.error("❌ Failed to save plan:", err);
    toast.error("Error saving plan ❌");
  }
};

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {!isBulkEdit && (
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Plan ID
          </label>
          <input
            type="text"
            name="PlanID"
            value={form.PlanID}
            readOnly
            className="w-full border rounded-lg px-3 py-2 bg-gray-100 cursor-not-allowed"
          />
        </div>
      )}

    {/* PLAN NAME */}
{!isBulkEdit && (
  <div>
    <label className="block text-sm font-medium text-gray-700 mb-1">
      Plan Name
    </label>
    <input
      type="text"
      name="PlanName"
      value={form.PlanName}
      onChange={handleChange}
      disabled={isEdit}   // ✅ EDIT MODE = DISABLED
      className={`w-full border rounded-lg px-3 py-2 ${
        isEdit
          ? "bg-gray-100 cursor-not-allowed"
          : "focus:ring-2 focus:ring-blue-500"
      } ${fieldErrors.PlanName ? "border-red-500" : "border-gray-300"}`}
      placeholder="Enter Plan Name"
    />

    {isEdit && (
      <p className="text-xs text-gray-500 mt-1">
        Plan Name cannot be changed once created
      </p>
    )}

    {fieldErrors.PlanName && (
      <p className="text-red-500 text-sm mt-1">
        {fieldErrors.PlanName}
      </p>
    )}
  </div>
)}

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">
          LCR Type
        </label>
        <select
          name="lcr_type"
          value={form.lcr_type}
          onChange={handleChange}
          className={`w-full border rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500 ${
            fieldErrors.lcr_type ? "border-red-500" : "border-gray-300"
          }`}
        >
          <option value="">Select LCR Type</option>
          <option value="sellprice">Sell Price</option>
          <option value="buyprice">Buy Price</option>
          <option value="loadbalance">Load Balance</option>
        </select>

        {fieldErrors.lcr_type && (
          <p className="text-red-500 text-sm mt-1">
            {fieldErrors.lcr_type}
          </p>
        )}
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
          className="px-4 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700"
        >
          Save
        </button>
      </div>
    </form>
  );
};

export default PlanForm;
