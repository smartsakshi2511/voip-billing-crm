const CDRView = ({ data }) => {
  if (!data) return null;

  const fields = [
    { label: "Unique ID", value: data.uniqueid },
    { label: "SIP Account", value: data.sipaccount },
    { label: "DID", value: data.did },
    { label: "From", value: data.call_from },
    { label: "To", value: data.call_to },
    { label: "User ID", value: data.userid },
    { label: "Destination", value: data.destination },
    { label: "Trunk", value: data.Trunk },
    { label: "Type of Call", value: data.typeofcall },
    { label: "Direction", value: data.direction },
    { label: "Status", value: data.status },
    { label: "Balance Status", value: data.balance_status },
    { label: "Actual Duration", value: data.actualduration },
    { label: "Buy Duration", value: data.buyduration },
    { label: "Sell Duration", value: data.sellduration },
    { label: "Buy Cost", value: data.buycost },
    { label: "Sell Cost", value: data.sellcost },
    { label: "Margin", value: data.margin },
    { label: "Recording URL", value: data.recording_url },
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
            <p className="mt-1 text-sm font-medium text-gray-800 break-words whitespace-normal">
              {f.value || "—"}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
};

export default CDRView;
