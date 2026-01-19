 
import useAuth from "../../../store/useAuth"; 
const UserView = ({ data }) => {
    const { role } = useAuth();
  if (!data) return null;

 const fields = [
    { label: "Username", value: data.username },
    { label: "First Name", value: data.firstname },
    { label: "Last Name", value: data.lastname },
    { label: "Mobile No", value: data.mobileno },
     ...(role === "admin"
      ? [{ label: "Plan ID", value: data.planid } ]
      : []),
    { label: "Plan Name", value: data.planname },
    { label: "Account Type", value: data.Typeofaccount },
    { label: "Status", value: data.status },
     ...(role === "admin"
      ? [{ label: "Credit Limit", value: data.Creditlimit },
    { label: "Balance", value: data.balance },]
      : []),
    { label: "Country", value: data.country },
    { label: "State", value: data.state },
    { label: "City", value: data.city },
    { label: "Pincode", value: data.pincode },
    { label: "Address", value: data.address },
    { label: "Record Call", value: data.Recordcall === "1" ? "Yes" : "No" },
  ];

  return (
    <div className="p-6 space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {fields.map((f, i) => (
          <div
            key={i}
            className="p-4 bg-gray-50 border rounded-lg shadow-sm flex flex-col"
          >
            {/* Label */}
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
              {f.label}
            </p>

            {/* Value */}
            <p className="mt-1 text-sm font-medium text-gray-800 break-words whitespace-normal">
              {f.value || "—"}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
};

export default UserView;
