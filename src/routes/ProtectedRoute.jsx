import { useEffect } from "react";
import { Navigate } from "react-router-dom";
import useAuth from "../store/useAuth";

export default function ProtectedRoute({ children, allowedRoles }) {
  const { token, role, isAuthenticated } = useAuth();

  if (!isAuthenticated || !token) {
    return <Navigate to="/billing/login" replace />;
  }

  if (allowedRoles && !allowedRoles.includes(role)) {
    return <Navigate to="/billing/login" replace />;
  }

  return children;
}
