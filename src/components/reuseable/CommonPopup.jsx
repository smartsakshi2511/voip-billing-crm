import usePopupStore from "../../store/usePopupStore";

const CommonPopup = () => {
  const { isOpen, title, content, closePopup } = usePopupStore();

  if (!isOpen) return null;

 
  return (
   <div className="fixed inset-0 flex items-center justify-center bg-black/50 z-50">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-2xl p-6 relative">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-xl font-bold text-gray-800">{title}</h2>
          <button
            onClick={closePopup}
            className="text-gray-500 hover:text-gray-700 text-2xl leading-none"
          >
            &times;
          </button>
        </div>
  <div className="max-h-[70vh] overflow-y-auto">{content}</div>

        {/* Common Footer Buttons */}
       
      </div>
    </div>
  );
};

export default CommonPopup;
