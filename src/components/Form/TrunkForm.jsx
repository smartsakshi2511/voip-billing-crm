import { useState, useEffect, useRef } from "react";
import usePopupStore from "../../store/usePopupStore";
import useAuth from "../../store/useAuth";
import axios from "axios";
import useToast from "../reuseable/useToast";

const TrunkForm = ({ initialData, onSuccess }) => {
  const codecRef = useRef();
  const { closePopup } = usePopupStore();
  const { token } = useAuth();
  const toast = useToast();
  const isEdit = !!initialData;

  const [form, setForm] = useState({
    routeid: "",
    trunkname: "",
    type: "",
    username: "",
    password: "",
    host: "",
    addprefix: "",
    codec: ["opus", "ulaw", "alaw", "g722"],
    port: "5060",
    status: "Active",
  });

  const [routes, setRoutes] = useState([]);
  const [users, setUsers] = useState([]);
  const [errors, setErrors] = useState({});
  const [showCodecDropdown, setShowCodecDropdown] = useState(false);
  useEffect(() => {
    if (initialData) {
      setForm({
        routeid: initialData.routeid || "",
        trunkname: initialData.trunkname || "",
        type: initialData.type || "",
        username: initialData.username || "",
        password: initialData.password || "",
        host: initialData.host || "",
        addprefix: initialData.addprefix || "",
        codec: initialData.codec ? initialData.codec.split(",") : [],
        port: initialData.port || "5060",
        status: initialData.status || "Active",
      });
    }
  }, [initialData]);

  useEffect(() => {
    const fetchRoutes = async () => {
      try {
        const res = await axios.get(`https://${window.location.hostname}:5000/routes`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        setRoutes(res.data);
      } catch (err) {
        console.error("❌ Failed to fetch routes:", err);
      }
    };
    fetchRoutes();
  }, [token]);
  useEffect(() => {
    const fetchUsers = async () => {
      try {
        const res = await axios.get(`https://${window.location.hostname}:5000/users_dropdown`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        setUsers(res.data);
      } catch (err) {
        console.error("❌ Failed to fetch users:", err);
      }
    };
    fetchUsers();
  }, [token]);

  useEffect(() => {
    if (form.username) {
      const selectedUser = users.find((u) => u.username === form.username);
      if (selectedUser?.password) {
        setForm((prev) => ({ ...prev, password: selectedUser.password }));
      }
    }
  }, [form.username, users]);

  useEffect(() => {
    const checkDuplicate = async () => {
      if (!form.trunkname.trim()) return;

      try {
        const res = await axios.get(
          `https://${window.location.hostname}:5000/trunks/check-name/${form.trunkname}`,
          {
            headers: { Authorization: `Bearer ${token}` },
            params: { excludeId: initialData?.id } // ✅ current row ignore
          }
        );

        if (res.data.exists) {
          setErrors(prev => ({ ...prev, trunkname: "❌ Trunk name already exists!" }));
        } else {
          setErrors(prev => ({ ...prev, trunkname: "" }));
        }
      } catch (err) {
        console.error("❌ Failed to check trunk name:", err);
      }
    };

    const timeout = setTimeout(checkDuplicate, 500);
    return () => clearTimeout(timeout);
  }, [form.trunkname, initialData, token]);


  useEffect(() => {
    if (form.type !== "User" || !form.username.trim()) return;

    const checkUsernameDuplicate = async () => {
      try {
        const res = await axios.get(
          `https://${window.location.hostname}:5000/trunks/check-username/${form.username}`,
          {
            headers: { Authorization: `Bearer ${token}` },
            params: { excludeId: initialData?.id }
          }
        );

        if (res.data.exists) {
          setErrors(prev => ({ ...prev, username: "❌ Username already exists!" }));
        } else {
          setErrors(prev => ({ ...prev, username: "" }));
        }
      } catch (err) {
        console.error("❌ Failed to check username:", err);
      }
    };

    const timeout = setTimeout(checkUsernameDuplicate, 500);
    return () => clearTimeout(timeout);
  }, [form.username, form.type, initialData, token]);


  useEffect(() => {
    if (!form.host.trim()) return;

    const checkHostPrefix = async () => {
      try {
        const res = await axios.get(
          `https://${window.location.hostname}:5000/trunks/check-host-prefix`,
          {
            headers: { Authorization: `Bearer ${token}` },
            params: {
              host: form.host,
              addprefix: form.addprefix || "",
              excludeId: initialData?.id || 0
            }
          }
        );

        setErrors(prev => ({
          ...prev,
          host: res.data.exists ? res.data.message : ""
        }));
      } catch (err) {
        console.error("Check host/prefix failed:", err);
      }
    };

    const t = setTimeout(checkHostPrefix, 400);
    return () => clearTimeout(t);
  }, [form.host, form.addprefix, token, initialData]);



  const handleChange = (e) => {
    const { name, value } = e.target;

    setForm((prev) => ({ ...prev, [name]: value }));

    if (value && errors[name]) {
      setErrors((prev) => ({ ...prev, [name]: "" }));
    }
    if (name === "type") {
      if (value === "User") {
        setForm((prev) => ({ ...prev, host: "" }));
      } else if (value === "IP") {
        // ✅ Clear everything related to user
        setForm((prev) => ({ ...prev, host: "", username: "", password: "" }));
      }
    }
  };


  const toggleSelection = (field, value) => {
    setForm(prev => {
      let arr = prev[field];
      if (arr.includes(value)) {
        arr = arr.filter(v => v !== value);
      } else {
        arr = [...arr, value];
      }
      setShowCodecDropdown(false);
      if (arr.length > 0 && errors.codec) {
        setErrors(prev => ({ ...prev, codec: "" }));
      }

      return { ...prev, [field]: arr };
    });
  };


  const handleSubmit = async (e) => {
    e.preventDefault();
    if (errors.trunkname || errors.host || errors.username) {
      return;
    }

    let hasError = false;
    const newErrors = {};

    if (!form.routeid) { newErrors.routeid = "❌ Please select Route"; hasError = true; }
    if (!form.trunkname.trim()) { newErrors.trunkname = "❌ Please enter Trunk Name"; hasError = true; }
    if (!form.type) { newErrors.type = "❌ Please select Type"; hasError = true; }

    if (form.type === "IP" && !form.host.trim()) { newErrors.host = "❌ Please enter Host"; hasError = true; }
    if (form.type === "User" && !form.username) { newErrors.username = "❌ Please select Username"; hasError = true; }
    if (form.type === "User" && !form.password) { newErrors.password = "❌ Password is required"; hasError = true; }

    if (!form.codec.length) { newErrors.codec = "❌ Select at least one Codec"; hasError = true; }
    if (!form.port) { newErrors.port = "❌ Port is required"; hasError = true; }
    if (!form.status) { newErrors.status = "❌ Select Status"; hasError = true; }

    if (errors.trunkname || errors.host || errors.username) {
      hasError = true;
    }

    if (hasError) {
      setErrors(newErrors);
      return;
    }

    try {
      const resCheck = await axios.get(
        `https://${window.location.hostname}:5000/trunks/check-name/${form.trunkname}`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      if (resCheck.data.exists && (!initialData || resCheck.data.id !== initialData.id)) {
        setErrors(prev => ({ ...prev, trunkname: "❌ Trunk name already exists!" }));
        return;
      }
    } catch (err) {
      console.error("❌ Failed to validate trunk name:", err);
      return;
    }
    try {
      if (form.type === "User") {
        const resCheckUser = await axios.get(
          `https://${window.location.hostname}:5000/trunks/check-username/${form.username}`,
          {
            headers: { Authorization: `Bearer ${token}` },
            params: { excludeId: initialData?.id }
          }
        );

        if (resCheckUser.data.exists) {
          setErrors(prev => ({ ...prev, username: "❌ Username already exists!" }));
          return;
        }
      }
    } catch (err) {
      console.error("❌ Failed to validate username:", err);
      return;
    }



    try {
      const payload = { ...form, codec: form.codec.join(",") };
      let res;
      if (initialData) {
        res = await axios.put(
          `https://${window.location.hostname}:5000/trunks/${initialData.id}`,
          payload,
          { headers: { Authorization: `Bearer ${token}` } }
        );
        toast.success("Trunk updated successfully ✅");
      } else {
        res = await axios.post(
          `https://${window.location.hostname}:5000/trunks`,
          payload,
          { headers: { Authorization: `Bearer ${token}` } }
        );
        toast.success("Trunk added successfully 🎉");
      }
      if (onSuccess) onSuccess(res.data);
      closePopup();
    } catch (err) {
      console.error("❌ Failed to save trunk:", err);
      toast.error("Failed to save trunk ❌");
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Route ID */}
        <div>
          <label className="block text-sm font-medium mb-1">Route Name</label>
          <select
            name="routeid"
            value={form.routeid}
            onChange={handleChange}
            className="w-full border rounded-lg px-3 py-2"
          >
            <option value="">Select Route</option>
            {routes.map((route) => (
              <option key={route.Routeid} value={route.Routeid}>{route.routename}</option>
            ))}
          </select>
          {errors.routeid && <p className="text-red-600 text-sm">{errors.routeid}</p>}
        </div>

        <div>
          <label className="block text-sm font-medium mb-1">Trunk Name</label>
          <input
            type="text"
            name="trunkname"
            value={form.trunkname}
            onChange={handleChange}
            disabled={isEdit}
            className={`w-full border rounded-lg px-3 py-2 ${isEdit
                ? "bg-gray-100 cursor-not-allowed text-gray-500"
                : "focus:ring-2 focus:ring-blue-500"
              }`}
          />

          {errors.trunkname && <p className="text-red-600 text-sm">{errors.trunkname}</p>}
        </div>
        <div>
          <label className="block text-sm font-medium mb-1">Type</label>
          <select
            name="type"
            value={form.type}
            onChange={handleChange}
            className="w-full border rounded-lg px-3 py-2"
          >
            <option value="">Select Type</option>
            <option value="IP">IP</option>
            <option value="User">User</option>
          </select>
          {errors.type && <p className="text-red-600 text-sm">{errors.type}</p>}
        </div>

        {(form.type === "IP" || form.type === "User") && (
          <div>
            <label className="block text-sm font-medium mb-1">Host</label>
            <input
              type="text"
              name="host"
              value={form.host}
              onChange={handleChange}
              className="w-full border rounded-lg px-3 py-2"
            />
            {errors.host && <p className="text-red-600 text-sm">{errors.host}</p>}
          </div>
        )}

        {form.type === "User" && (
          <>
            <div>
              <label className="block text-sm font-medium mb-1">Username</label>
              <input
                type="text"
                name="username"
                value={form.username}
                onChange={handleChange}
                className="w-full border rounded-lg px-3 py-2 bg-gray-100"
              />
              {errors.username && <p className="text-red-600 text-sm">{errors.username}</p>}
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Password</label>
              <input
                type="text"
                name="password"
                value={form.password}
                onChange={handleChange}
                className="w-full border rounded-lg px-3 py-2 bg-gray-100"
              />
              {errors.password && <p className="text-red-600 text-sm">{errors.password}</p>}
            </div>
          </>
        )}

        <div>
          <label className="block text-sm font-medium mb-1">Add Prefix</label>
          <input
            type="text"
            name="addprefix"
            value={form.addprefix}
            onChange={handleChange}
            className="w-full border rounded-lg px-3 py-2"
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
          {errors.codec && <p className="text-red-600 text-sm">{errors.codec}</p>}

          {showCodecDropdown && (
            <div className="absolute z-10 w-full bg-white border rounded-lg mt-1 shadow-lg max-h-40 overflow-y-auto">
              {["opus", "ulaw", "alaw", "g722"].map((opt) => (
                <label key={opt} className="flex items-center px-3 py-1 hover:bg-gray-100 cursor-pointer">
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
          <label className="block text-sm font-medium mb-1">Port</label>
          <input
            type="number"
            name="port"
            value={form.port}
            onChange={handleChange}
            className="w-full border rounded-lg px-3 py-2"
          />
          {errors.port && <p className="text-red-600 text-sm">{errors.port}</p>}
        </div>

        <div>
          <label className="block text-sm font-medium mb-1">Status</label>
          <select
            name="status"
            value={form.status}
            onChange={handleChange}
            className="w-full border rounded-lg px-3 py-2"
          >
            <option value="">Select Status</option>
            <option value="Active">Active</option>
            <option value="Inactive">Inactive</option>
          </select>
          {errors.status && <p className="text-red-600 text-sm">{errors.status}</p>}
        </div>
      </div>

      <div className="flex justify-end space-x-2 pt-4">
        <button
          type="button"
          onClick={closePopup}
          className="px-4 py-2 bg-gray-200 text-gray-700 rounded-lg"
        >
          Cancel
        </button>
        <button type="submit" className="px-4 py-2 bg-gray-600 text-white rounded-lg">
          Save
        </button>
      </div>
    </form>
  );
};

export default TrunkForm;
