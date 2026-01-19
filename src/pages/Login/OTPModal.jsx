import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import axios from "axios";

const OTPModal = ({ userId, apiBase, onSuccess, onClose }) => {
  const [otp, setOtp] = useState(["", "", "", ""]);
  const [timer, setTimer] = useState(60);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [maskedEmail, setMaskedEmail] = useState("");
  const [maskedMobile, setMaskedMobile] = useState("");

  // Mask helpers
  const maskEmail = (email) => {
    if (!email) return "";
    const [name, domain] = email.split("@");
    return name.slice(0, 2) + "******@" + domain;
  };

  const maskMobile = (mobile) => {
    if (!mobile) return "";
    return "******" + mobile.slice(-4);
  };

  // Load masked details from backend
  useEffect(() => {
    const fetchContactInfo = async () => {
      try {
        const res = await axios.get(`${apiBase}/auth/otp-reference/${userId}`);
        setMaskedEmail(maskEmail(res.data.email));
        setMaskedMobile(maskMobile(res.data.mobile));
      } catch (err) {
        console.log("No contact info found");
      }
    };
    fetchContactInfo();
  }, [userId, apiBase]);

  // Timer
  useEffect(() => {
    if (timer === 0) return;
    const interval = setInterval(() => setTimer((t) => t - 1), 1000);
    return () => clearInterval(interval);
  }, [timer]);

  // OTP input handler
  const handleChange = (value, index) => {
    if (!/^[0-9]?$/.test(value)) return;

    const newOtp = [...otp];
    newOtp[index] = value;
    setOtp(newOtp);

    if (value && index < 3) {
      document.getElementById(`otp-${index + 1}`)?.focus();
    }
  };

  // Verify OTP (click or press Enter)
  const verifyOTP = async () => {
    const finalOtp = otp.join("");
    if (finalOtp.length !== 4) {
      setError("Enter valid 4 digit OTP");
      return;
    }

    setLoading(true);
    try {
      const res = await axios.post(`${apiBase}/auth/verify-otp`, {
        userId,
        otp: finalOtp,
      });
      onSuccess(res.data.token, res.data.role, res.data.user);
    } catch (err) {
      setError(err.response?.data?.message || "Invalid OTP");
    } finally {
      setLoading(false);
    }
  };

  // Resend OTP
  const resendOTP = async () => {
    setTimer(60);
    setOtp(["", "", "", ""]);
    setError("");
    try {
      await axios.post(`${apiBase}/auth/resend-otp`, { userId });
    } catch (err) {
      console.log("Resend failed");
    }
  };

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-xl flex items-center justify-center z-50">
      <motion.div
        initial={{ opacity: 0, scale: 0.8, y: 50 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        transition={{ duration: 0.4 }}
        className="w-full max-w-md bg-gray-800/60 backdrop-blur-xl border border-gray-700 p-8 rounded-3xl shadow-2xl"
      >
        <h2 className="text-2xl font-bold text-center text-white mb-2">
          Verify OTP
        </h2>

        {/* FIXED TEXT LINE */}
        <p className="text-center text-gray-300 text-base leading-relaxed mb-6 break-words">
          Enter the 4-digit OTP sent to your email {maskedEmail} & mobile {maskedMobile}
        </p>

        {error && (
          <p className="text-center text-red-500 text-sm mb-4">{error}</p>
        )}

        {/* OTP BOXES */}
        <div className="flex justify-center gap-4 mb-6">
          {otp.map((digit, i) => (
            <input
              key={i}
              id={`otp-${i}`}
              maxLength={1}
              value={digit}
              onChange={(e) => handleChange(e.target.value, i)}
              onKeyDown={(e) => {
                if (e.key === "Enter") verifyOTP();
              }}
              className="w-14 h-14 text-center text-2xl font-semibold bg-gray-700 border border-gray-600 text-white rounded-2xl focus:ring-2 focus:ring-blue-500 outline-none transition-all"
            />
          ))}
        </div>

        {/* Timer */}
        <div className="text-center mb-6">
          {timer > 0 ? (
            <p className="text-gray-400 text-sm">
              Resend OTP in <span className="text-blue-400">{timer}s</span>
            </p>
          ) : (
            <button
              onClick={resendOTP}
              className="text-blue-400 font-medium hover:underline"
            >
              Resend OTP
            </button>
          )}
        </div>

        {/* Verify Button */}
        <button
          onClick={verifyOTP}
          className="w-full py-3 bg-gradient-to-r from-blue-700 to-blue-600 text-white font-semibold rounded-xl shadow-md transition duration-300"
        >
          {loading ? "Verifying..." : "Verify OTP"}
        </button>

        {/* Cancel */}
        <button
          onClick={onClose}
          className="mt-4 w-full text-gray-400 text-sm hover:text-gray-200"
        >
          Cancel
        </button>
      </motion.div>
    </div>
  );
};

export default OTPModal;
