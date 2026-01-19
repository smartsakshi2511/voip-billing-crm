import { useState, useEffect } from "react";
import axios from "axios";
import useAuth from "../../../store/useAuth";
import usePopupStore from "../../../store/usePopupStore";
import useToast from "../../reuseable/useToast";

const RestrictNumberForm = ({ initialData, onSuccess }) => {
    const { closePopup } = usePopupStore();
    const { token } = useAuth();
    const toast = useToast();

    const [form, setForm] = useState({
        callerId: "",
    });

    const [seriesMode, setSeriesMode] = useState(false); // 🔥 NEW TOGGLE

    useEffect(() => {
        if (initialData) {
            setForm(initialData);

            // Agar callerId me * already hai, toggle ON kar do
            if (initialData.callerId?.includes("*")) {
                setSeriesMode(true);
                setForm((f) => ({
                    ...f,
                    callerId: initialData.callerId.replace("*", "")
                }));
            }
        }
    }, [initialData]);

    const handleSubmit = async (e) => {
        e.preventDefault();

        let finalCaller = form.callerId;

        // 🔥 Toggle ON hai to * add karo
        if (seriesMode) {
            finalCaller = finalCaller + "*";
        }

        try {
            if (initialData) {
                const res = await axios.put(
                    `https://${window.location.hostname}:5000/block/${initialData.id}`,
                    { callerId: finalCaller, status: 1 },
                    { headers: { Authorization: `Bearer ${token}` } }
                );

                toast.success("Number updated successfully!");
                onSuccess?.(res.data);
            } else {
                const res = await axios.post(
                    `https://${window.location.hostname}:5000/block`,
                    { callerId: finalCaller, status: 1 },
                    { headers: { Authorization: `Bearer ${token}` } }
                );

                toast.success("Number restricted successfully!");
                onSuccess?.(res.data);
            }

            closePopup();
        } catch (err) {
            console.error("❌ Failed:", err);
            toast.error(err.response?.data?.message || "Failed to save number");
        }
    };

    return (
        <form onSubmit={handleSubmit} className="space-y-4 p-4">

            {/* 🔹 Caller ID */}
            <div>
                <label className="block text-sm font-medium mb-1">Caller ID</label>
                <input
                    type="text"
                    name="callerId"
                    value={form.callerId}
                    onChange={(e) => {
                        const value = e.target.value;

                        // Allow only numbers
                        if (/^[0-9]*$/.test(value)) {
                            setForm({ ...form, callerId: value });
                        }
                    }}
                    placeholder="Enter caller ID"
                    required
                    className="w-full border px-3 py-2 rounded-lg"
                />
            </div>

            {/* 🔥 NEW — Toggle Button */}
            <div className="flex items-center gap-3">
                <label className="font-medium">Block Series</label>

                <label className="relative inline-flex items-center cursor-pointer">
                    <input
                        type="checkbox"
                        className="sr-only peer"
                        checked={seriesMode}
                        onChange={() => setSeriesMode(!seriesMode)}
                    />
                    <div className="w-11 h-6 bg-gray-300 rounded-full peer peer-checked:bg-blue-600 transition"></div>
                    <div className="absolute left-1 top-1 h-4 w-4 bg-white rounded-full transition peer-checked:translate-x-5"></div>
                </label>
            </div>

            <div className="text-xs text-gray-500">
                {seriesMode
                    ? "Series mode ON: all numbers like 98765xxxxx will be blocked."
                    : "Normal mode: only this exact number will be blocked."}
            </div>

            {/* Buttons */}
            <div className="flex justify-end space-x-2 pt-4">
                <button type="button" onClick={closePopup} className="px-4 py-2 bg-gray-200 rounded-lg">
                    Cancel
                </button>

                <button type="submit" className="px-4 py-2 bg-blue-600 text-white rounded-lg">
                    Save
                </button>
            </div>
        </form>
    );
};

export default RestrictNumberForm;
