// src/pages/view/TrunkView.jsx
import React from "react";

const TrunkView = ({ trunk }) => {
  if (!trunk) return null;

  const fields = [
    { label: "Route Name", value: trunk.routeid },
    { label: "Trunk Name", value: trunk.trunkname },
    { label: "Type", value: trunk.type },
    { label: "Username", value: trunk.username },
    { label: "Password", value: trunk.password },
    { label: "Host", value: trunk.host },
    { label: "Add Prefix", value: trunk.addprefix },
    { label: "Codec", value: trunk.codec },
    { label: "Port", value: trunk.port },
    { label: "Status", value: trunk.status },
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

export default TrunkView;
