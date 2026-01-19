import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { User, Lock } from "lucide-react";
import useAuth from "../../store/useAuth";
import OTPModal from "./OTPModal";

const API_BASE = `https://${window.location.hostname}:5000`;

const Login = () => {
  const navigate = useNavigate();
  const { login, setAuthFromServer } = useAuth();
  const [form, setForm] = useState({ username: "", password: "" });
  const [error, setError] = useState("");
  const [showOtp, setShowOtp] = useState(false);
  const [otpUserId, setOtpUserId] = useState(null);
  const [loading, setLoading] = useState(false);

  const handleChange = (e) => {
    setForm({ ...form, [e.target.name]: e.target.value });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      const data = await login(form.username, form.password);
      setOtpUserId(data.userId);
      setShowOtp(true);
    } catch (err) {
      const msg = err.response?.data?.message || "Login failed.";
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  const handleOtpSuccess = async (token, role, user) => {
    await setAuthFromServer(token, role, user);
    navigate(role === "admin" ? "/admin" : "/client");
  };

  return (
    <div className="relative w-full min-h-screen bg-gradient-to-b from-blue-900 via-gray-900 to-gray-800 text-white flex items-center justify-center overflow-hidden">
      
      <motion.div
        className="absolute w-[500px] h-[500px] bg-blue-800 rounded-full -top-32 -left-32 opacity-20"
        animate={{ rotate: 360 }}
        transition={{ duration: 220, repeat: Infinity, ease: "linear" }}
      />
      <motion.div
        className="absolute w-[400px] h-[400px] bg-gray-700 rounded-full -bottom-28 -right-20 opacity-25"
        animate={{ rotate: -360 }}
        transition={{ duration: 260, repeat: Infinity, ease: "linear" }}
      />
      <motion.div
        className="absolute w-[300px] h-[300px] bg-blue-700 rounded-full top-1/4 right-1/3 opacity-20"
        animate={{ rotate: 360 }}
        transition={{ duration: 300, repeat: Infinity, ease: "linear" }}
      />
      <motion.div
        className="relative z-10 w-full max-w-md p-10 bg-gray-800/50 backdrop-blur-xl rounded-3xl shadow-2xl border border-gray-700"
        initial={{ opacity: 0, y: 50 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.8 }}
      >
        <h2 className="text-3xl font-bold text-white text-center mb-8 tracking-wide">
          Billing CRM Login
        </h2>

        {error && (
          <p className="mb-4 text-sm text-red-500 text-center font-medium">
            {error}
          </p>
        )}

        <form onSubmit={handleSubmit} className="space-y-6">

          {/* ✅ USER ID */}
          <div className="relative">
            <User className="absolute left-3 top-4 text-gray-400" />

            <input
              type="text"
              name="username"
              value={form.username}
              onChange={handleChange}
              required
              placeholder=" "
              className="peer w-full pl-10 pr-4 pt-6 pb-2 bg-gray-700 border border-gray-600 rounded-xl
                focus:outline-none focus:ring-2 focus:ring-blue-500 text-white"
            />

            <label
              className="absolute left-10 top-2 text-gray-400 text-sm transition-all
                peer-placeholder-shown:top-4
                peer-placeholder-shown:text-base
                peer-focus:top-2
                peer-focus:text-sm
                peer-focus:text-blue-400"
            >
              User ID
            </label>
          </div>

          {/* ✅ PASSWORD */}
          <div className="relative">
            <Lock className="absolute left-3 top-4 text-gray-400" />

            <input
              type="password"
              name="password"
              value={form.password}
              onChange={handleChange}
              required
              placeholder=" "
              className="peer w-full pl-10 pr-4 pt-6 pb-2 bg-gray-700 border border-gray-600 rounded-xl
                focus:outline-none focus:ring-2 focus:ring-blue-500 text-white"
            />

            <label
              className="absolute left-10 top-2 text-gray-400 text-sm transition-all
                peer-placeholder-shown:top-4
                peer-placeholder-shown:text-base
                peer-focus:top-2
                peer-focus:text-sm
                peer-focus:text-blue-400"
            >
              Password
            </label>
          </div>

          {/* ✅ Button */}
          <motion.button
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            type="submit"
            className="w-full py-3 bg-gradient-to-r from-blue-700 to-blue-600 text-white font-semibold rounded-xl shadow-md transition-all duration-300"
          >
            {loading ? "Please wait..." : "Log In"}
          </motion.button>
        </form>

        <p className="mt-6 text-center text-sm text-gray-400">
          &copy; 2025 Billing CRM. All rights reserved.
        </p>
      </motion.div>

      {showOtp && (
        <OTPModal
          userId={otpUserId}
          onClose={() => setShowOtp(false)}
          onSuccess={handleOtpSuccess}
          apiBase={API_BASE}
        />
      )}
    </div>
  );
};

export default Login;
