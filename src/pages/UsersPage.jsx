import { useEffect, useState, useMemo  } from "react";
import axios from "axios";
import DataTable from "../components/reuseable/DataTable";
import AddButton from "../components/reuseable/AddButton";
import SideDrawer from "../components/reuseable/SideDrawer";
import ClientForm from "../components/Form/userForm/AddUser";
import UserView from "../components/Form/userForm/UserView";
import useAuth from "../store/useAuth";
import usePopupStore from "../store/usePopupStore";
import { Edit, Eye, Trash2 } from "lucide-react";
import useToast from "../components/reuseable/useToast";
import ExportButton from "../components/reuseable/ExportButton";

 
const UsersList = () => {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
   const { token, role } = useAuth();
  const { openPopup, isOpen } = usePopupStore();
  const toast = useToast();

const columns = useMemo(() => {
  const baseColumns = [
    { header: "S.No", accessor: "serial" },
    { header: "Username", accessor: "username" },
    { header: "Password", accessor: "password" },
    { header: "Full Name", accessor: "fullName" },
    { header: "Mobile", accessor: "mobileno" },
    { header: "Plan Name", accessor: "planname" },
    { header: "Type", accessor: "Typeofaccount" },
  ];
  const hasPrepaid = users.some(
    (u) => u.Typeofaccount === "Prepaid"
  );
  const hasPostpaid = users.some(
    (u) => u.Typeofaccount === "Postpaid"
  );

  return [
    ...baseColumns, 
    ...(hasPrepaid
      ? [{ header: "Balance", accessor: "balance" }]
      : []), 
    ...(hasPostpaid
      ? [{ header: "Credit", accessor: "Creditlimit" }]
      : []),
  ];
}, [role, users]);


  const fetchUsers = async () => {
    try {
      const res = await axios.get(`https://${window.location.hostname}:5000/users`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      const formatted = res.data.map((u) => ({
        ...u,
        fullName: `${u.firstname || ""} ${u.lastname || ""}`.trim(),
      }));

      setUsers(formatted);

    } catch (err) {
      console.error("Failed to fetch users:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (token) fetchUsers();
  }, [token]);

  const handleView = (row) => {
    openPopup(`User Details – ${row.username}`, <UserView data={row} />);
  };

  const handleEdit = (row) => {
    openPopup(
      `Edit User – ${row.username}`,
      <ClientForm initialData={row} onSuccess={fetchUsers} />
    );
  };

  const handleDelete = async (id) => {
    const c = await toast.confirmToast("Delete this user?");
    if (!c) return;

    try {
      await axios.delete(`https://${window.location.hostname}:5000/users/${id}`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      setUsers((prev) => prev.filter((u) => u.id !== id));
      toast.success("User deleted successfully");

    } catch (err) {
      console.error("Delete failed:", err);
      toast.error("Failed to delete user");
    }
  };
 


  return (
    <div className="flex-1 overflow-auto relative z-10">
      <main
        className={`transition-all duration-300 max-w-7xl mx-auto py-6 px-4 lg:px-8 flex-1 bg-gray-50 min-h-screen ${
          isOpen ? "mr-[450px]" : ""
        }`}
      >
        <DataTable
          title="Client List"
          loading={loading}
          columns={columns}
          data={users}
           headerActions={ 
              <div className="flex gap-2">
              {role === "admin" && (
                <AddButton
                  label="Add Client"
                  form={<ClientForm onSuccess={fetchUsers} />}
                />
              )}

              <ExportButton
                data={users}
                columns={columns}
                fileName="users_list"
              />
            </div>
            }
          actions={(row) => (
            <div className="flex gap-3">
              <button
                onClick={() => handleView(row)}
                className="text-yellow-500 hover:text-yellow-700"
                title="View"
              >
                <Eye size={18} />
              </button>

              {role === "admin" && (
              <button
                onClick={() => handleEdit(row)}
                className="text-indigo-500 hover:text-indigo-700"
                title="Edit"
              >
                <Edit size={18} />
              </button>
              )}

              {role === "admin" && (
              <button
                onClick={() => handleDelete(row.id)}
                className="text-red-500 hover:text-red-400"
                title="Delete"
              >
                <Trash2 size={18} />
              </button>
              )}
            </div>
          )}
         onRefresh={fetchUsers} 

        />
      </main>

      <SideDrawer />
    </div>
  );
};

export default UsersList;
