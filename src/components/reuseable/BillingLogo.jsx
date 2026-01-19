const BillingLogo = () => (
  <div className="flex items-center gap-2">
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="36"
      height="36"
      viewBox="0 0 24 24"
      fill="none"
      stroke="#1E40AF"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="lucide lucide-credit-card"
    >
      <rect width="20" height="14" x="2" y="5" rx="2" ry="2"></rect>
      <line x1="2" x2="22" y1="10" y2="10"></line>
    </svg>
    <span className="text-xl font-bold text-gray-800">Billing CRM</span>
  </div>
);

export default BillingLogo;
