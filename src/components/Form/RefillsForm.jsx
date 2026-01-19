import usePopupStore from "../../store/usePopupStore";
import { useState, useEffect } from "react";
import axios from "axios";
import useAuth from "../../store/useAuth";
import useToast from "../reuseable/useToast";

const RefillsForm = ({ initialData, onSuccess }) => {
  const { closePopup } = usePopupStore();
  const { token } = useAuth();
  const toast = useToast();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [users, setUsers] = useState([]);

  const [errors, setErrors] = useState({
    user: "",
    credit: "",
    description: "",
  });

  const [form, setForm] = useState({
    user: "",
    credit: "",
    description: "",
    add_delete: "Add",
  });

  useEffect(() => {
    if (initialData) {
      setForm((prev) => ({ ...prev, ...initialData }));
    }
  }, [initialData]);

  useEffect(() => {
    const fetchUsers = async () => {
      try {
        const res = await axios.get(
          `https://${window.location.hostname}:5000/users`,
          { headers: { Authorization: `Bearer ${token}` } }
        );
        setUsers(res.data);
      } catch (err) {
        console.error("Failed to fetch users", err);
      }
    };

    if (token) fetchUsers();
  }, [token]);


  const validate = () => {
    let valid = true;
    let newErrors = { user: "", credit: "", description: "" };

    if (!form.user) {
      newErrors.user = "User is required.";
      valid = false;
    }

    if (!form.credit) {
      newErrors.credit = "Amount is required.";
      valid = false;
    } else if (isNaN(form.credit)) {
      newErrors.credit = "Amount must be numeric.";
      valid = false;
    }

    if (!form.description.trim()) {
      newErrors.description = "Description is required.";
      valid = false;
    }

    setErrors(newErrors);
    return valid;
  };

  const handleCreditChange = (e) => {
    let value = e.target.value;

    if (!/^\d*\.?\d{0,2}$/.test(value)) return;

    setForm((prev) => ({ ...prev, credit: value }));

    if (!value) {
      setErrors((prev) => ({ ...prev, credit: "Amount is required." }));
    } else {
      setErrors((prev) => ({ ...prev, credit: "" }));
    }
  };

  const handleChange = (e) => {
    const { name, value } = e.target;

    setForm((prev) => ({ ...prev, [name]: value }));

    // Live validation
    if (name === "user" && !value) {
      setErrors((prev) => ({ ...prev, user: "User is required." }));
    } else if (name === "user") {
      setErrors((prev) => ({ ...prev, user: "" }));
    }

    if (name === "description" && !value.trim()) {
      setErrors((prev) => ({
        ...prev,
        description: "Description is required.",
      }));
    } else if (name === "description") {
      setErrors((prev) => ({ ...prev, description: "" }));
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (isSubmitting) return;

    if (!validate()) {
      toast.error("Please fix the errors ❌");
      return;
    }
    setIsSubmitting(true);
    try {
      let res;
      if (initialData?.id) {
        res = await axios.put(
          `https://${window.location.hostname}:5000/refills/${initialData.id}`,
          form,
          { headers: { Authorization: `Bearer ${token}` } }
        );
        toast.success(`Refill updated successfully`);
      } else {
        res = await axios.post(
          `https://${window.location.hostname}:5000/refills`,
          form,
          { headers: { Authorization: `Bearer ${token}` } }
        );
        toast.success(`Refill added successfully`);
      }

      if (onSuccess) onSuccess();
      closePopup();
    } catch (err) {
      console.error("Failed to save refill:", err.response || err);
      toast.error("Failed to save refill ❌");
    }
    finally {
      setIsSubmitting(false); // 🔓 UNLOCK
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">

        <div>
          <label className="block text-sm font-medium">User</label>
          <select
            name="user"
            value={form.user}
            onChange={handleChange}
            className="w-full border rounded-lg px-3 py-2"
          >
            <option value="">Select User</option>
            {users.map((u) => (
              <option key={u.id} value={u.username}>
                {u.firstname} {u.lastname}
              </option>
            ))}
          </select>
          {errors.user && (
            <p className="text-red-500 text-xs">{errors.user}</p>
          )}
        </div>
        <div>
          <label className="block text-sm font-medium">Amount</label>
          <div className="relative">
            <span className="absolute inset-y-0 left-3 flex items-center text-gray-400">
              $
            </span>
            <input
              type="text"
              name="credit"
              value={form.credit}
              onChange={handleCreditChange}
              className="w-full border rounded-lg pl-8 px-3 py-2"
              placeholder="0.00"
            />
          </div>
          {errors.credit && (
            <p className="text-red-500 text-xs">{errors.credit}</p>
          )}
        </div>

        <div className="md:col-span-2">
          <label className="block text-sm font-medium">Description</label>
          <input
            name="description"
            value={form.description}
            onChange={handleChange}
            className="w-full border rounded-lg px-3 py-2"
            placeholder="Enter description"
          />
          {errors.description && (
            <p className="text-red-500 text-xs">{errors.description}</p>
          )}
        </div>

        {/* TYPE */}
        <div className="md:col-span-2">
          <label className="block text-sm font-medium">Credit/Debit</label>
          <select
            name="add_delete"
            value={form.add_delete}
            onChange={handleChange}
            className="w-full border rounded-lg px-3 py-2"
          >
            <option value="Add">Credit</option>
            <option value="Delete">Debit</option>
          </select>
        </div>
      </div>

      <div className="flex justify-end space-x-3 pt-4">
        <button
          type="submit"
          disabled={isSubmitting}
          className={`px-5 py-2 rounded-lg shadow text-white
    ${isSubmitting
              ? "bg-gray-400 cursor-not-allowed"
              : "bg-gray-600 hover:bg-gray-700"
            }`}
        >
          {isSubmitting
            ? "Processing..."
            : initialData
              ? "Update Refill"
              : "Add Refill"}
        </button>

      </div>
    </form>
  );
};

export default RefillsForm;
