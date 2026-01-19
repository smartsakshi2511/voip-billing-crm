import { useState } from "react";
import usePopupStore from "../../../store/usePopupStore";
import useAuth from "../../../store/useAuth";
import axios from "axios";
import useToast from "../../reuseable/useToast";

const EditProfileForm = ({ initialData, onProfileUpdated }) => {
  const { closePopup } = usePopupStore();
  const { token } = useAuth();
  const toast = useToast();

  const [form, setForm] = useState({
    firstname: initialData.firstname || "",
    lastname: initialData.lastname || "",
    email: initialData.email || "",
    mobileno: initialData.mobileno || "",
    address: initialData.address || "",
    city: initialData.city || "",
    state: initialData.state || "",
    country: initialData.country || "",
    pincode: initialData.pincode || "",
  });

  const [errors, setErrors] = useState({});

  const validate = () => {
    const newErrors = {};

    // Email validation
    if (!/\S+@\S+\.\S+/.test(form.email)) {
      newErrors.email = "Invalid email format";
    }

    // Mobile validation
    if (!/^\d{10}$/.test(form.mobileno)) {
      newErrors.mobileno = "Mobile number must be 10 digits";
    }

    setErrors(newErrors);

    return Object.keys(newErrors).length === 0;
  };

 const handleChange = (e) => {
  const { name, value } = e.target;

  // prevent more than 10 digits in mobile
  if (name === "mobileno" && value.length > 10) return;

  setForm((prev) => ({ ...prev, [name]: value }));

  // Live clear errors
  setErrors((prev) => {
    const newErrors = { ...prev };

    if (name === "email") {
      if (/\S+@\S+\.\S+/.test(value)) delete newErrors.email;
    }

    if (name === "mobileno") {
      if (/^\d{10}$/.test(value)) delete newErrors.mobileno;
    }

    return newErrors;
  });
};


  const handleSubmit = async (e) => {
    e.preventDefault();

    if (!validate()) return;

    try {
      await axios.put(
        `https://${window.location.hostname}:5000/profile`,
        form,
        { headers: { Authorization: `Bearer ${token}` } }
      );

      toast.success("Profile updated successfully");

      // Update UI instantly in parent
      onProfileUpdated({ ...initialData, ...form });

      closePopup();
    } catch (err) {
      console.error(err);
      toast.error("Update failed");
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6">

      {/* 🔥 3 fields per row */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {/* First Name */}
        <div>
          <label className="block text-sm font-medium text-gray-700">First Name</label>
          <input
            name="firstname"
            value={form.firstname}
            onChange={handleChange}
            className="w-full border rounded-lg px-3 py-2"
          />
        </div>

        {/* Last Name */}
        <div>
          <label className="block text-sm font-medium text-gray-700">Last Name</label>
          <input
            name="lastname"
            value={form.lastname}
            onChange={handleChange}
            className="w-full border rounded-lg px-3 py-2"
          />
        </div>

        {/* Email */}
        <div>
          <label className="block text-sm font-medium text-gray-700">Email</label>
          <input
            name="email"
            value={form.email}
            onChange={handleChange}
            className="w-full border rounded-lg px-3 py-2"
          />
          {errors.email && (
            <p className="text-red-500 text-xs mt-1">{errors.email}</p>
          )}
        </div>
      </div>

      {/* 🔥 Another row */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {/* Mobile no */}
        <div>
          <label className="block text-sm font-medium text-gray-700">Mobile No</label>
          <input
            name="mobileno"
            value={form.mobileno}
            onChange={handleChange}
            className="w-full border rounded-lg px-3 py-2"
            maxLength="10"
          />
          {errors.mobileno && (
            <p className="text-red-500 text-xs mt-1">{errors.mobileno}</p>
          )}
        </div>

        {/* Address */}
        <div>
          <label className="block text-sm font-medium text-gray-700">Address</label>
          <input
            name="address"
            value={form.address}
            onChange={handleChange}
            className="w-full border rounded-lg px-3 py-2"
          />
        </div>

        {/* City */}
        <div>
          <label className="block text-sm font-medium text-gray-700">City</label>
          <input
            name="city"
            value={form.city}
            onChange={handleChange}
            className="w-full border rounded-lg px-3 py-2"
          />
        </div>

      </div>
<div className="grid grid-cols-1 sm:grid-cols-3 gap-4">

      {/* Full width fields */}
      <div>
        <label className="block text-sm font-medium text-gray-700">State</label>
        <input
          name="state"
          value={form.state}
          onChange={handleChange}
          className="w-full border rounded-lg px-3 py-2"
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700">Country</label>
        <input
          name="country"
          value={form.country}
          onChange={handleChange}
          className="w-full border rounded-lg px-3 py-2"
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700">Pincode</label>
        <input
          name="pincode"
          value={form.pincode}
          onChange={handleChange}
          className="w-full border rounded-lg px-3 py-2"
        />
      </div>
</div>
      {/* Buttons */}
      <div className="flex justify-end gap-3">
        <button
          type="button"
          onClick={closePopup}
          className="px-4 py-2 bg-gray-300 text-gray-700 rounded-lg"
        >
          Cancel
        </button>

        <button
          type="submit"
          className="px-4 py-2 bg-gray-700 text-white rounded-lg"
        >
          Save
        </button>
      </div>
    </form>
  );
};

export default EditProfileForm;
