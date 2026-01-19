import { create } from "zustand";

const usePopupStore = create((set) => ({
  isOpen: false,
  title: "",
  content: null,
  openPopup: (title, content) => set({ isOpen: true, title, content }),
  closePopup: () => set({ isOpen: false, title: "", content: null }),
}));

export default usePopupStore;
