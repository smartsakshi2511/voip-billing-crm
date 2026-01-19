"use client";

import useAuth from "../../../store/useAuth";

const DIDView = ({ data }) => {
  const { role } = useAuth();

  if (!data) return null;

  const fields = [
    { label: "ID", value: data.id },
    { label: "DID Number", value: data.did },
    { label: "Reserved", value: data.reserved === "yes" ? "Yes" : "No" },
    { label: "User ID", value: data.user_id },
    ...(role === "admin"
      ? [{ label: "Trunk", value: data.trunk }]
      : []),

    { label: "Monthly Cost", value: data.monthlycost },
    ...(role === "admin"
      ? [
          { label: "Buy Price", value: data.buyprice },
          { label: "Buy Minimum", value: data.buyminimum },
          { label: "Buy Increment", value: data.buyincrement },
        ]
      : []),
    {
      label: role === "client" ? "Rate" : "Sell Price",
      value: data.sellprice,
    },
    {
      label: role === "client" ? "Minimum" : "Sell Minimum",
      value: data.sellminimum,
    },
    {
      label: role === "client" ? "Increment" : "Sell Increment",
      value: data.sellincrement,
    },

    { label: "Status", value: data.status },
  ];

  return (
    <div className="p-6 space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {fields.map((f, i) => (
          <div
            key={i}
            className="p-4 bg-gray-50 border rounded-lg shadow-sm flex flex-col"
          >
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
              {f.label}
            </p>
            <p className="mt-1 text-sm font-medium text-gray-800 break-words">
              {f.value ?? "—"}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
};

export default DIDView;
