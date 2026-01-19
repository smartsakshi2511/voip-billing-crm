import { useEffect, useState, useCallback, useRef } from "react";
import {
  UserCircleIcon,
  PhoneIcon,
  ArrowRightOnRectangleIcon,
  UserIcon,
} from "@heroicons/react/24/outline";
import axios from "axios";
import usePopupStore from "../../store/usePopupStore";
import useAuth from "../../store/useAuth";
import { useNavigate } from "react-router-dom";
import BillingLogo from "../reuseable/BillingLogo";
import OnlineCallsList from "../users/CallsOnline";

const Header = () => {
  const { isOpen } = usePopupStore();
  const { logout, user, role, token } = useAuth();
  const navigate = useNavigate();

  const [showLiveCalls, setShowLiveCalls] = useState(false);
  const [showProfileDropdown, setShowProfileDropdown] = useState(false);
  const [liveUser, setLiveUser] = useState(null);
  const [isDesktop, setIsDesktop] = useState(window.innerWidth >= 1024);

  const dropdownRef = useRef(null);

  /* ---------------- Responsive screen check ---------------- */
  useEffect(() => {
    const handleResize = () => setIsDesktop(window.innerWidth >= 1024);
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  /* ---------------- Fetch live balance ---------------- */
  const fetchLiveUser = useCallback(async () => {
    if (!token || role !== "client") return;

    try {
      const res = await axios.get(
        `https://${window.location.hostname}:5000/users_dropdown`,
        {
          headers: { Authorization: `Bearer ${token}` },
        }
      );

      if (Array.isArray(res.data) && res.data.length > 0) {
        setLiveUser(res.data[0]);
      }
    } catch (err) {
      console.error("🔴 Failed to fetch user balance:", err);
    }
  }, [token, role]);

  useEffect(() => {
    fetchLiveUser();
  }, [fetchLiveUser]);

  /* ---------------- Outside click for profile dropdown ---------------- */
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target)) {
        setShowProfileDropdown(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  /* ---------------- Actions ---------------- */
  const handleLogout = () => {
    logout();
    navigate("/login");
  };

  const handleProfile = () => {
    navigate(role === "client" ? "/client/profile" : "/admin/profile");
  };

  return (
    <>
      <header
        className="sticky top-0 z-40 bg-white shadow transition-all duration-300"
        style={{
          marginRight: isOpen && isDesktop ? "450px" : "0px",
        }}
      >
        <div className="w-full py-2 px-3 sm:px-4 flex items-center justify-between gap-y-2">
          <BillingLogo />

          <div className="flex items-center gap-2 sm:gap-3 justify-end">
            {/* Client balance */}
            {role === "client" && liveUser && (
              <div className="px-2 sm:px-3 py-1 rounded-md text-xs sm:text-sm font-semibold whitespace-nowrap bg-blue-100 text-blue-700 shadow-sm">
                {liveUser.Typeofaccount === "Prepaid"
                  ? `Balance: $${Number(liveUser.balance ?? 0).toFixed(2)}`
                  : `Credit: $${Number(liveUser.Creditlimit ?? 0).toFixed(2)}`}
              </div>
            )}

            {/* Live calls */}
            {role !== "client" && (
              <button
                onClick={() => setShowLiveCalls(true)}
                className="p-2 rounded-md hover:bg-blue-50 transition-colors"
                title="Live Calls"
              >
                <PhoneIcon className="w-6 h-6 text-blue-600" />
              </button>
            )}

            {/* Profile */}
            <div className="relative" ref={dropdownRef}>
              <button
                onClick={() =>
                  setShowProfileDropdown((prev) => !prev)
                }
                className="flex items-center gap-2 p-2 rounded-md hover:bg-gray-100 transition-colors"
              >
                <span className="hidden sm:inline text-sm font-medium">
                  {user?.firstname || "Guest"}
                </span>
                <UserCircleIcon className="w-8 h-8 text-gray-600" />
              </button>

              {showProfileDropdown && (
                <div className="absolute right-0 mt-2 w-44 bg-white border border-gray-200 shadow-lg rounded-md overflow-hidden z-50">
                  <button
                    onClick={handleProfile}
                    className="w-full flex items-center gap-2 px-4 py-2 text-sm hover:bg-gray-100"
                  >
                    <UserIcon className="w-5 h-5 text-gray-600" />
                    Profile
                  </button>
                  <button
                    onClick={handleLogout}
                    className="w-full flex items-center gap-2 px-4 py-2 text-sm text-red-600 hover:bg-red-50"
                  >
                    <ArrowRightOnRectangleIcon className="w-5 h-5" />
                    Logout
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      </header>

      {/* Live Calls Modal */}
      {showLiveCalls && role !== "client" && (
        <div className="fixed inset-0 z-50 bg-black/40 flex justify-center items-start pt-20">
          <div className="bg-white rounded-lg shadow-lg w-[90%] sm:w-[80%] max-w-4xl p-3 animate-slideDown">
            <div className="flex justify-between items-center mb-2 border-b pb-1">
              <h2 className="text-lg font-semibold text-blue-600">
                Live Calls
              </h2>
              <button
                onClick={() => setShowLiveCalls(false)}
                className="text-gray-600 hover:text-red-500 font-bold"
              >
                ✕
              </button>
            </div>
            <div className="max-h-[60vh] overflow-y-auto scrollbar-thin">
              <OnlineCallsList />
            </div>
          </div>
        </div>
      )}

      <style>
        {`
          @keyframes slideDown {
            0% { transform: translateY(-20px); opacity: 0; }
            100% { transform: translateY(0); opacity: 1; }
          }
          .animate-slideDown { animation: slideDown 0.25s ease-out; }
        `}
      </style>
    </>
  );
};

export default Header;
