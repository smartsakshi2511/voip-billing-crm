import { Routes, Route, Navigate } from "react-router-dom";
// import useAuth from "./store/useAuth";
import Login from "./pages/Login/login";
import adminRoutes from "./routes/AdminRoutes.jsx";
import clientRoutes from "./routes/ClientsRoutes.jsx";
import AdminLayout from "./routes/AdminLayout.jsx";
import ClientLayout from "./routes/ClientLayout.jsx";
import ProtectedRoute from "./routes/ProtectedRoute";
 
export default function App() {
  return (  
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route
          path="/admin"
          element={
           <ProtectedRoute allowedRoles={["admin"]}>
              <AdminLayout />
            </ProtectedRoute>
          }
        >
          {adminRoutes()}
        </Route>
       <Route
          path="/client"
          element={
          <ProtectedRoute allowedRoles={["client"]}>
              <ClientLayout />
            </ProtectedRoute>
          }
        >
          {clientRoutes()}
        </Route>

        <Route path="*" element={<Navigate to="/login" replace />} />
      </Routes>
 
  );
}
