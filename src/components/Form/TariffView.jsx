// src/Form/TariffView.jsx
import React from "react";

const TariffView = ({ data }) => {
  if (!data) return null;

  const fields = [
    { label: "Tariff ID", value: data.TarrifID },
    { label: "Plan ID", value: data.PlanID },
    { label: "Plan Name", value: data.PlanName },
    { label: "Code", value: data.Code },
    { label: "Destination", value: data.Destination },
    { label: "Trunk ID", value: data.TrunkID },
    { label: "Trunk Name", value: data.TrunkName },
    { label: "Buy Price", value: data.buyprice },
    { label: "Buy Minimum", value: data.buyminimum },
    { label: "Buy Increment", value: data.buyincrement },
    { label: "Sell Price", value: data.sellprice },
    { label: "Sell Minimum", value: data.sellminimum },
    { label: "Sell Increment", value: data.sellincrement },
    { label: "Status", value: data.status },
  ];

  return (
    <div className="p-6 space-y-4">

      <div className="grid grid-cols-2 gap-4">
        {fields.map((f, i) => (
          <div
            key={i}
            className="flex justify-between items-center p-3 border rounded-lg bg-gray-50 shadow-sm"
          >
            <p className="text-sm font-medium text-gray-600">{f.label}</p>
            <p className="text-base font-semibold text-gray-900">
              {f.value || "—"}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
};

export default TariffView;
