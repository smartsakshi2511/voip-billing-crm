// store/useAuth.js
import { create } from "zustand";
import { persist } from "zustand/middleware";
import axios from "axios";

const useAuth = create(
  persist(
    (set) => ({
      user: null,
      token: null,
      role: null,
      isAuthenticated: false,
 
      setAuthFromServer: (token, role, user) => {
        axios.defaults.headers.common["Authorization"] = `Bearer ${token}`;
        set({
          user,
          token,
          role,
          isAuthenticated: true,
        });
      },

      login: async (username, password) => {
        
        const res = await axios.post(`https://${window.location.hostname}:5000/auth/login`, {
          username,
          password,
        });
 
        return res.data;
      },

      logout: async () => {
        try {
          await axios.post(`https://${window.location.hostname}:5000/auth/logout`);
        } catch (err) {
          console.error("🔴 Logout error:", err);
        }

        set({ user: null, token: null, role: null, isAuthenticated: false });
        delete axios.defaults.headers.common["Authorization"];
      },
    }),
    { name: "auth-storage" }
  )
);

export default useAuth;
