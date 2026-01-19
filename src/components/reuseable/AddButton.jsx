// src/components/common/AddButton.jsx
import usePopupStore from "../../store/usePopupStore";

const AddButton = ({ label, form }) => {
  const { openPopup } = usePopupStore();

  return (
    <button
      onClick={() => openPopup(label, form)}
      className="px-3 py-1 bg-gradient-to-b from-gray-700 via-gray-700 to-gray-700 text-white text-xs rounded-lg hover:bg-blue-600"
    >
      {label}
    </button>
  );
};


export default AddButton;
