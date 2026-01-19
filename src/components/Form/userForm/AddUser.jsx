import { useState, useEffect, useMemo, useRef } from "react";
import axios from "axios";
import usePopupStore from "../../../store/usePopupStore";
import useAuth from "../../../store/useAuth";
import useToast from "../../reuseable/useToast";
import {
  countryList,
  countryCodes,
  countryNameToISO,
} from "../../reuseable/Country";
import { Eye, EyeOff } from "lucide-react";


const isValidIPv4 = (ip) => {
  const ipv4Regex =
    /^(25[0-5]|2[0-4]\d|1\d{2}|[1-9]?\d)(\.(25[0-5]|2[0-4]\d|1\d{2}|[1-9]?\d)){3}$/;
  return ipv4Regex.test(ip);
};
const ClientForm = ({ initialData, onSuccess }) => {
  const { closePopup } = usePopupStore();
  const { token } = useAuth();
  const toast = useToast();
  const [showPassword, setShowPassword] = useState(false);
  const [noPlanGroupError, setNoPlanGroupError] = useState("");
  const [fieldErrors, setFieldErrors] = useState({
    planid: "",
    email: "",
    mobileno: "",
    host: "",
  });
  const hostTimeout = useRef(null);
  const [planGroups, setPlanGroups] = useState([]);
  const [existingUsers, setExistingUsers] = useState([]);
  const [form, setForm] = useState({
    username: "",
    password: "",
    planid: "",
    planname: "",
    status: "active",
    country: "",
    state: "",
    lastname: "",
    firstname: "",
    city: "",
    address: "",
    pincode: "",
    email: "",
    companyname: "",
    mobileno: "",
    country_code: "91",
    Typeofaccount: "Prepaid",
    Recordcall: "0",
    createSip: true,
    select_host: "user",
    host: "",
    codec: ["ulaw", "alaw"],
    port: 5060,
  });

  const isEdit = !!initialData;
  useEffect(() => {
    if (initialData) {
      setForm((prev) => ({
        ...prev,
        ...initialData,

        createSip: false,
        select_host: "user",
        host: "",
        port: 5060,
        codec: ["ulaw", "alaw"],
      }));
    }
  }, [initialData]);

  useEffect(() => {
    if (!token) return;

    const fetchPlanGroups = async () => {
      try {
        const res = await axios.get(
          `https://${window.location.hostname}:5000/user_planGroups`,
          {
            headers: { Authorization: `Bearer ${token}` },
          }
        );

        setPlanGroups(res.data);

        if (res.data.length === 0) {
          setNoPlanGroupError(
            "No Plan Group Available"
          );
        } else {
          setNoPlanGroupError("");
        }
      } catch (err) {
        console.error("🔴 Failed to fetch plan groups:", err);
      }
    };

    fetchPlanGroups();
  }, [token]);



  useEffect(() => {
    if (!token || initialData) return;
    const fetchUsers = async () => {
      try {
        const res = await axios.get(
          `https://${window.location.hostname}:5000/users_dropdown`,
          {
            headers: { Authorization: `Bearer ${token}` },
          }
        );
        setExistingUsers(res.data.map((u) => u.username.toLowerCase()));
      } catch (err) {
        console.error("🔴 Failed to fetch users:", err);
      }
    };
    fetchUsers();
  }, [token, initialData]);
  
  const handleChange = (e) => {
    const { name, value } = e.target;

    if (name === "mobileno") {
      if (!/^[0-9]*$/.test(value)) {
        toast.error("Mobile number must contain digits only ❌");
        return;
      }

      if (!value) {
        setFieldErrors((prev) => ({
          ...prev,
          mobileno: "Mobile number is required",
        }));
      } else if (value.length < 7 || value.length > 15) {
        setFieldErrors((prev) => ({
          ...prev,
          mobileno: "Enter a valid international mobile number",
        }));
      } else {
        setFieldErrors((prev) => ({ ...prev, mobileno: "" }));
      }
    }
    if (name === "email") {
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

      if (!value) {
        setFieldErrors((prev) => ({
          ...prev,
          email: "Email is required",
        }));
      } else if (!emailRegex.test(value)) {
        setFieldErrors((prev) => ({
          ...prev,
          email: "Invalid email format",
        }));
      } else {
        setFieldErrors((prev) => ({ ...prev, email: "" }));
      }
    }

    if (name === "planid") {
      const selectedGroup = planGroups.find((pg) => pg.PlanGroupID === value);
      setFieldErrors((prev) => ({
        ...prev,
        planid: value ? "" : "Please select a Plan Group",
      }));

      return setForm((prev) => ({
        ...prev,
        planid: value,
        planname: selectedGroup ? selectedGroup.Plangroupname : "",
      }));
    }
    if (name === "host") {
      clearTimeout(hostTimeout.current);

      hostTimeout.current = setTimeout(() => {
        if (!value) return;

        if (!isValidIPv4(value)) {
          setFieldErrors((prev) => ({
            ...prev,
            host: "Invalid IP format (example: 192.168.27.180)",
          }));
        } else {
          setFieldErrors((prev) => ({ ...prev, host: "" }));
        }
      }, 900);
    }

    setForm((prev) => ({ ...prev, [name]: value }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setFieldErrors({ planid: "", email: "", mobileno: "" });

    if (!form.planid) {
      setFieldErrors({ planid: "Please select a Plan Group" });
      return;
    }
    if (!form.email) {
      setFieldErrors((prev) => ({
        ...prev,
        email: "Email is required",
      }));
      toast.error("Email is required ❌");
      return;
    }

    if (!form.mobileno) {
      setFieldErrors((prev) => ({
        ...prev,
        mobileno: "Mobile number is required",
      }));
      toast.error("Mobile number is required ❌");
      return;
    }
    try {
      if (initialData?.id) {
        await axios.put(
          `https://${window.location.hostname}:5000/users/${initialData.id}`,
          form,
          {
            headers: { Authorization: `Bearer ${token}` },
          }
        );
        toast.success("User updated successfully ✅");
      } else {
        await axios.post(
          `https://${window.location.hostname}:5000/users`,
          form,
          {
            headers: { Authorization: `Bearer ${token}` },
          }
        );
        toast.success("User added successfully 🎉");
      }
      onSuccess?.();
      closePopup();
    } catch (err) {
      console.error("🔴 Failed to save user:", err.response || err);

      const backendMessage = err.response?.data?.message;

      toast.error(
        backendMessage ? `${backendMessage} ❌` : "Failed to save user ❌"
      );
    }
  };
  useEffect(() => {
    if (initialData) return;

    const generateUniqueUsername = () => {
      let username;
      do {
        username = Math.floor(10000000 + Math.random() * 90000000).toString();
      } while (existingUsers.includes(username));
      return username;
    };

    const generatePassword = (length = 12) => {
      const chars =
        "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@$%^&*()-_=+";
      return Array.from({ length }, () =>
        chars.charAt(Math.floor(Math.random() * chars.length))
      ).join("");
    };

    setForm((prev) => ({
      ...prev,
      username: generateUniqueUsername(),
      password: generatePassword(),
    }));
  }, [initialData, existingUsers]);

  const filteredCountries = useMemo(() => {
    return countryList
      .filter((c) => c.toLowerCase().includes(form.country.toLowerCase()))
      .slice(0, 5);
  }, [form.country]);

  useEffect(() => {
    if (!form.country) return;

    const iso = countryNameToISO[form.country];

    if (iso && countryCodes[iso]) {
      setForm((prev) => ({
        ...prev,
        country_code: countryCodes[iso],
      }));
    }
  }, [form.country]);

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div>
          <label className="block text-sm font-medium">Username</label>
          <input
            name="username"
            value={form.username}
            readOnly
            className="w-full border rounded-lg px-3 py-2 bg-gray-100"
            required
          />
        </div>
        <div>
          <label className="block text-sm font-medium">Password</label>

          <div className="relative">
            <input
              type={showPassword ? "text" : "password"}
              name="password"
              value={form.password}
              className="w-full border rounded-lg px-3 py-2 pr-10 bg-gray-100"
              readOnly
              required
            />

            <button
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-600 hover:text-black"
            >
              {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
            </button>
          </div>
        </div>
        <div>
          <label className="block text-sm font-medium">First Name</label>
          <input
            name="firstname"
            value={form.firstname}
            onChange={handleChange}
            className="w-full border rounded-lg px-3 py-2"
          />
        </div>

        <div>
          <label className="block text-sm font-medium">Last Name</label>
          <input
            name="lastname"
            value={form.lastname}
            onChange={handleChange}
            className="w-full border rounded-lg px-3 py-2"
          />
        </div>
        <div>
          <label className="block text-sm font-medium">
            Email <span className="text-red-500">*</span>
          </label>
          <input
            type="email"
            name="email"
            value={form.email}
            onChange={handleChange}
            className={`w-full border rounded-lg px-3 py-2 ${fieldErrors.email ? "border-red-500" : "border-gray-300"
              }`}
            placeholder="Enter email"
            required
          />
          {fieldErrors.email && (
            <p className="text-red-500 text-xs mt-1">{fieldErrors.email}</p>
          )}
        </div>
        <div>
          <label className="block text-sm font-medium">
            Plan Group <span className="text-red-500">*</span>
          </label>

          <select
            name="planid"
            value={form.planid}
            onChange={handleChange}
            disabled={planGroups.length === 0}
            className={`w-full border rounded-lg px-3 py-2 
      ${fieldErrors.planid || noPlanGroupError
                ? "border-red-500"
                : "border-gray-300"
              }
      ${planGroups.length === 0 ? "bg-gray-100 cursor-not-allowed" : ""}
    `}
          >
            <option value="">
              {planGroups.length === 0
                ? "No Plan Group Available"
                : "Select Plan Group"}
            </option>

            {planGroups.map((pg) => (
              <option key={pg.PlanGroupID} value={pg.PlanGroupID}>
                {pg.Plangroupname}
              </option>
            ))}
          </select>

          {fieldErrors.planid && (
            <p className="text-red-500 text-xs mt-1">{fieldErrors.planid}</p>
          )}

          {noPlanGroupError && (
            <p className="text-red-600 text-sm mt-1 font-medium">
              {noPlanGroupError}
            </p>
          )}
        </div>

        <div>
          <label className="block text-sm font-medium">Plan Name</label>
          <input
            name="planname"
            value={form.planname}
            readOnly
            className="w-full border rounded-lg px-3 py-2 bg-gray-100"
          />
        </div>
        <div>
          <label className="block text-sm font-medium">Account Type</label>
          <select
            name="Typeofaccount"
            value={form.Typeofaccount}
            onChange={handleChange}
            className="w-full border rounded-lg px-3 py-2 bg-gray-100 cursor-not-allowed"
            required
            disabled={!!initialData}
          >
            <option value="">Select Type</option>
            <option value="Postpaid">Postpaid</option>
            <option value="Prepaid">Prepaid</option>
          </select>
        </div>

        <div>
          <label className="block text-sm font-medium">Status</label>
          <select
            name="status"
            value={form.status}
            onChange={handleChange}
            className="w-full border rounded-lg px-3 py-2"
          >
            <option value="active">Active</option>
            <option value="inactive">Inactive</option>
          </select>
        </div>
        <div>
          <label className="block text-sm font-medium">Pincode</label>
          <input
            name="pincode"
            value={form.pincode}
            onChange={handleChange}
            className="w-full border rounded-lg px-3 py-2"
          />
        </div>
        <div>
          <label className="block text-sm font-medium">City</label>
          <input
            name="city"
            value={form.city}
            onChange={handleChange}
            className="w-full border rounded-lg px-3 py-2"
          />
        </div>
        <div>
          <label className="block text-sm font-medium">Address</label>
          <input
            name="address"
            value={form.address}
            onChange={handleChange}
            className="w-full border rounded-lg px-3 py-2"
          />
        </div>
        <div>
          <label className="block text-sm font-medium">State</label>
          <input
            name="state"
            value={form.state}
            onChange={handleChange}
            className="w-full border rounded-lg px-3 py-2"
          />
        </div>
        <div>
          <label className="block text-sm font-medium">Country</label>
          <input
            name="country"
            value={form.country}
            onChange={handleChange}
            className="w-full border rounded-lg px-3 py-2"
            placeholder="Type or select a country"
            list="countries"
          />
          <datalist id="countries">
            {filteredCountries.map((c) => (
              <option key={c} value={c} />
            ))}
          </datalist>
        </div>
        <div>
          <label className="block text-sm font-medium">
            Country Code <span className="text-red-500">*</span>
          </label>
          <select
            name="country_code"
            value={form.country_code}
            onChange={handleChange}
            className="w-full border rounded-lg px-3 py-2"
            required
          >
            {Object.entries(countryCodes).map(([iso, code]) => (
              <option key={iso} value={code}>
                +{code} ({iso})
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-sm font-medium">
            Company Name <span className="text-red-500">*</span>
          </label>
          <input
            name="companyname"
            value={form.companyname}
            onChange={handleChange}
            className="w-full border rounded-lg px-3 py-2"
          />
        </div>

        <div>
          <label className="block text-sm font-medium">
            Mobile No <span className="text-red-500">*</span>
          </label>
          <input
            name="mobileno"
            value={form.mobileno}
            onChange={handleChange}
            placeholder="4155552671"
            className={`w-full border rounded-lg px-3 py-2 ${fieldErrors.mobileno ? "border-red-500" : "border-gray-300"
              }`}
            required
          />
          {fieldErrors.mobileno && (
            <p className="text-red-500 text-xs mt-1">{fieldErrors.mobileno}</p>
          )}
        </div>

        <div>
          <label className="block text-sm font-medium">Record Call</label>
          <select
            name="Recordcall"
            value={form.Recordcall}
            onChange={handleChange}
            className="w-full border rounded-lg px-3 py-2"
            required
          >
            <option value="0">No</option>
            <option value="1">Yes</option>
          </select>
        </div>
      </div>
      {!isEdit && (
        <div className="col-span-3 border-t pt-4">
          <h3 className="text-md font-semibold mb-2">SIP Account Options</h3>

          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              name="createSip"
              checked={form.createSip}
              onChange={(e) =>
                setForm((prev) => ({ ...prev, createSip: e.target.checked }))
              }
            />
            <span>Create SIP Account</span>
          </label>

          {form.createSip && (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-3">
              {/* Select Host Type */}
              <div>
                <label className="block text-sm font-medium">Host Type</label>
                <select
                  name="select_host"
                  value={form.select_host}
                  onChange={(e) => {
                    handleChange(e);
                    if (isValidIPv4(e.target.value)) {
                      checkDuplicate("host", e.target.value);
                    }
                  }}
                  className="w-full border rounded-lg px-3 py-2"
                >
                  <option value="user">User</option>
                  <option value="ip">IP Based</option>
                </select>
              </div>
              {form.select_host === "ip" && (
                <div>
                  <label className="block text-sm font-medium">Host (IP)</label>
                  <input
                    name="host"
                    value={form.host}
                    onChange={handleChange}
                    className={`w-full border rounded-lg px-3 py-2 ${fieldErrors.host ? "border-red-500" : "border-gray-300"
                      }`}
                    placeholder="Enter IP Address"
                    required={form.createSip}
                  />

                  {fieldErrors.host && (
                    <p className="text-red-500 text-xs mt-1">
                      {fieldErrors.host}
                    </p>
                  )}
                </div>
              )}

              {/* Port */}
              <div>
                <label className="block text-sm font-medium">Port</label>
                <input
                  type="number"
                  name="port"
                  value={form.port}
                  onChange={handleChange}
                  className="w-full border rounded-lg px-3 py-2"
                  placeholder="5060"
                />
              </div>
            </div>
          )}
        </div>
      )}

      <div className="flex justify-end space-x-3 pt-4">
        <button
          type="submit"
          className="px-5 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700 shadow"
        >
          {initialData ? "Update User" : "Add User"}
        </button>
      </div>
    </form>
  );
};

export default ClientForm;
