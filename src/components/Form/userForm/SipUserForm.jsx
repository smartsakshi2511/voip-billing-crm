import { useState, useEffect, useRef } from "react";
import axios from "axios";
import usePopupStore from "../../../store/usePopupStore";
import useAuth from "../../../store/useAuth";
import useToast from "../../../components/reuseable/useToast";
import { Eye, EyeOff } from "lucide-react";

const isValidIPv4 = (ip) => {
  const ipv4Regex =
    /^(25[0-5]|2[0-4]\d|1\d{2}|[1-9]?\d)(\.(25[0-5]|2[0-4]\d|1\d{2}|[1-9]?\d)){3}$/;
  return ipv4Regex.test(ip);
};

const SIPAccountForm = ({ initialData, onSuccess }) => {
  const codecRef = useRef();
  const { closePopup } = usePopupStore();
  const { token } = useAuth();
  const [users, setUsers] = useState([]);
  const toast = useToast();
  const [showPassword, setShowPassword] = useState(false);
  const [showCodecDropdown, setShowCodecDropdown] = useState(false);
  const [errors, setErrors] = useState({
    username: "",
    host: "",
    usernameLength: "",
    passwordLength: "",
  });
  const [form, setForm] = useState({
    accountcode: "",
    username: "",
    password: "",
    callerid: "",
    codec: ["opus", "ulaw", "alaw", "g722"],
    host: "",
    select_host: "",
    port: "5060",
  });

  const hostTimeout = useRef(null);
  useEffect(() => {
    if (initialData) {
      setForm((prev) => ({
        ...prev,
        ...initialData,
        codec: Array.isArray(initialData.codec)
          ? initialData.codec
          : initialData.codec?.split(",") || [],
      }));
    }
  }, [initialData]);

  useEffect(() => {
    setForm((prev) => {
      if (prev.select_host === "ip") {
        return { ...prev, password: "" };
      }
      if (prev.select_host === "user") {
        return { ...prev, host: "" };
      }
      return prev;
    });
  }, [form.select_host]);

  useEffect(() => {
    const fetchUsers = async () => {
      try {
        const res = await axios.get(
          `https://${window.location.hostname}:5000/users_dropdown`,
          {
            headers: { Authorization: `Bearer ${token}` },
          }
        );
        setUsers(res.data);
      } catch (err) {
        console.error("🔴 Failed to fetch users:", err);
      }
    };
    if (token) fetchUsers();
  }, [token]);

  useEffect(() => {
    const handleClickOutside = (e) => {
      if (codecRef.current && !codecRef.current.contains(e.target)) {
        setShowCodecDropdown(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const handleChange = (e) => {
    const { name, value } = e.target;

    if (name === "username") {
      if (value.length > 8) {
        setErrors((prev) => ({
          ...prev,
          usernameLength: "Username cannot exceed 8 characters.",
        }));
      } else {
        setErrors((prev) => ({ ...prev, usernameLength: "" }));
      }
    }
    if (name === "password") {
      if (value.length > 12) {
        setErrors((prev) => ({
          ...prev,
          passwordLength: "Password cannot exceed 12 characters.",
        }));
      } else {
        setErrors((prev) => ({ ...prev, passwordLength: "" }));
      }
    }
    if (name === "host") {
      clearTimeout(hostTimeout.current);

      hostTimeout.current = setTimeout(() => {
        if (!value) return;

        if (!isValidIPv4(value)) {
          setErrors((prev) => ({
            ...prev,
            host: "Invalid IP format (example: 192.168.27.180)",
          }));
        } else {
          setErrors((prev) => ({ ...prev, host: "" }));
          checkDuplicate("host", value);
        }
      }, 900);
    }

    setForm((prev) => ({ ...prev, [name]: value }));
  };

  const checkDuplicate = async (field, value) => {
    if (!value) return;

    try {
      const res = await axios.get(
        `https://${window.location.hostname}:5000/sipaccounts/check-duplicate?${field}=${value}`,
        { headers: { Authorization: `Bearer ${token}` } }
      );

      if (field === "username") {
        setErrors((prev) => ({
          ...prev,
          username: res.data.usernameExists ? "Username already exists" : "",
        }));
      }

      if (field === "host") {
        setErrors((prev) => ({
          ...prev,
          host: res.data.hostExists ? "Host IP already exists" : "",
        }));
      }
    } catch (err) {
      console.error("Duplicate check error:", err);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (errors.username || errors.host) {
      toast.error("Please fix duplicate errors first ❌");
      return;
    }
    try {
      if (initialData?.id) {
        await axios.put(
          `https://${window.location.hostname}:5000/sipaccounts/${initialData.id}`,
          form,
          { headers: { Authorization: `Bearer ${token}` } }
        );
        toast.success("SIP account updated successfully");
      } else {
        await axios.post(
          `https://${window.location.hostname}:5000/sipaccounts`,
          form,
          {
            headers: { Authorization: `Bearer ${token}` },
          }
        );
        toast.success("SIP account added successfully");
      }

      if (onSuccess) onSuccess();
      closePopup();
    } catch (err) {
      console.error("🔴 Failed to save SIP:", err.response || err);

      const msg = err.response?.data?.message;

      if (
        err.response?.status === 409 ||
        err.response?.data?.code === "DUPLICATE_USERNAME"
      ) {
        toast.error("❌ Username already exists. Please choose another one.");
      } else {
        toast.error(msg || "Failed to save SIP account ❌");
      }
    }
  };

  const toggleSelection = (field, value) => {
    setForm((prev) => {
      const arr = prev[field];
      if (arr.includes(value)) {
        return { ...prev, [field]: arr.filter((v) => v !== value) };
      } else {
        return { ...prev, [field]: [...arr, value] };
      }
    });
  };
  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div>
          <label className="block text-sm font-medium">Account Code</label>
          <select
            name="accountcode"
            value={form.accountcode}
            onChange={handleChange}
            className="w-full border rounded-lg px-3 py-2"
          >
            <option value="">Select User</option>
            {users.map((u) => (
              <option key={u.id} value={u.username}>
                {u.firstname}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-sm font-medium">Select Host</label>
          <select
            name="select_host"
            value={form.select_host}
            onChange={handleChange}
            className="w-full border rounded-lg px-3 py-2"
          >
            <option value="">Select Option</option>
            <option value="user">User</option>
            <option value="ip">IP</option>
          </select>
        </div>
        {form.select_host === "user" && (
          <>
            <div>
              <label className="block text-sm font-medium">Username</label>
              <input
                name="username"
                value={form.username}
                onChange={(e) => {
                  handleChange(e);
                  checkDuplicate("username", e.target.value);
                }}
                className="w-full border rounded-lg px-3 py-2"
                placeholder="Enter Username"
              />
              {errors.username && (
                <p className="text-red-500 text-xs">{errors.username}</p>
              )}
              {errors.usernameLength && (
                <p className="text-red-500 text-xs">{errors.usernameLength}</p>
              )}
            </div>
            <div>
              <label className="block text-sm font-medium">Password</label>

              <div className="relative">
                <input
                  type={showPassword ? "text" : "password"}
                  name="password"
                  value={form.password}
                  onChange={handleChange}
                  className="w-full border rounded-lg px-3 py-2 pr-10"
                  placeholder="Enter Password"
                />
                {errors.passwordLength && (
                  <p className="text-red-500 text-xs">
                    {errors.passwordLength}
                  </p>
                )}
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-600 hover:text-black"
                >
                  {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
            </div>
          </>
        )}

        {form.select_host === "ip" && (
          <>
            <div>
              <label className="block text-sm font-medium">Username</label>
              <input
                name="username"
                value={form.username}
                onChange={(e) => {
                  handleChange(e);
                  if (isValidIPv4(e.target.value)) {
                    checkDuplicate("host", e.target.value);
                  }
                }}
                className="w-full border rounded-lg px-3 py-2"
                placeholder="Enter Username"
              />
              {errors.username && (
                <p className="text-red-500 text-xs">{errors.username}</p>
              )}
              {errors.usernameLength && (
                <p className="text-red-500 text-xs">{errors.usernameLength}</p>
              )}
            </div>
            <div>
              <label className="block text-sm font-medium">Host</label>
              <input
                name="host"
                value={form.host}
                onChange={(e) => {
                  handleChange(e);
                  checkDuplicate("host", e.target.value);
                }}
                className="w-full border rounded-lg px-3 py-2"
                placeholder="Enter Host IP"
              />

              {errors.host && (
                <p className="text-red-500 text-xs">{errors.host}</p>
              )}
            </div>
          </>
        )}

        <div>
          <label className="block text-sm font-medium">Caller ID</label>
          <input
            name="callerid"
            type="number"
            value={form.callerid}
            onChange={handleChange}
            className="w-full border rounded-lg px-3 py-2"
            placeholder="Enter Caller ID"
          />
        </div>

        <div ref={codecRef} className="relative">
          <label className="block text-sm font-medium mb-1">Codec</label>
          <div
            onClick={() => setShowCodecDropdown((prev) => !prev)}
            className="w-full border rounded-lg px-3 py-2 cursor-pointer bg-white"
          >
            {form.codec.length > 0 ? form.codec.join(", ") : "Select Codec"}
          </div>

          {showCodecDropdown && (
            <div className="absolute z-10 w-full bg-white border rounded-lg mt-1 shadow-lg max-h-40 overflow-y-auto">
              {["opus", "ulaw", "alaw", "g722"].map((opt) => (
                <label
                  key={opt}
                  className="flex items-center px-3 py-1 hover:bg-gray-100 cursor-pointer"
                >
                  <input
                    type="checkbox"
                    checked={form.codec.includes(opt)}
                    onChange={() => toggleSelection("codec", opt)}
                    className="mr-2"
                  />
                  {opt}
                </label>
              ))}
            </div>
          )}
        </div>

        <div>
          <label className="block text-sm font-medium">Port</label>
          <input
            name="port"
            value={form.port}
            onChange={handleChange}
            className="w-full border rounded-lg px-3 py-2"
            placeholder="Enter Port"
          />
        </div>
      </div>

      <div className="flex justify-end space-x-3 pt-4">
        <button
          type="submit"
          className="px-5 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700 shadow"
        >
          {initialData ? "Update SIP Account" : "Add SIP Account"}
        </button>
      </div>
    </form>
  );
};

export default SIPAccountForm;
