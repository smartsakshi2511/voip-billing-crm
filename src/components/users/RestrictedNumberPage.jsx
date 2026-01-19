import { useState, useEffect, useMemo, useCallback } from "react";
import axios from "axios";
import DataTable from "../reuseable/DataTable";
import AddButton from "../reuseable/AddButton";
import useAuth from "../../store/useAuth";
import usePopupStore from "../../store/usePopupStore";
import { Edit, Trash2 } from "lucide-react";
import SideDrawer from "../reuseable/SideDrawer";
import RestrictNumberForm from "../Form/userForm/RestrictedNumberForm";
import useToast from "../reuseable/useToast";

const RestrictNumberPage = () => {
    const { openPopup, isOpen } = usePopupStore();
    const { token } = useAuth();
    const toast = useToast();

    const [numbers, setNumbers] = useState([]);
    const [loading, setLoading] = useState(true);

    // ✔ Fetch restricted numbers
    const fetchNumbers = useCallback(async () => {
        try {
            const res = await axios.get(`https://${window.location.hostname}:5000/block`, {
                headers: { Authorization: `Bearer ${token}` },
            });

            setNumbers(
                res.data.map((n, idx) => ({
                    ...n,
                    serial: idx + 1,
                }))
            );
        } catch (err) {
            console.error("Failed to fetch restricted numbers:", err);
        } finally {
            setLoading(false);
        }
    }, [token]);

    useEffect(() => {
        if (token) fetchNumbers();
    }, [token, fetchNumbers]);

    const handleAdd = useCallback(
        (newEntry) => {
            setNumbers((prev) => {
                const updated = [...prev, newEntry];
                return updated.map((n, idx) => ({ ...n, serial: idx + 1 }));
            });
            toast.success("Number restricted successfully!");
        },
        [toast]
    );

    // ✔ Edit
    const handleEdit = useCallback(
        (row) => {
            openPopup(
                "Edit Restricted Number",
                <RestrictNumberForm
                    initialData={row}
                    onSuccess={(updated) => {
                        setNumbers((prev) =>
                            prev.map((n) =>
                                n.id === updated.id ? { ...updated, serial: n.serial } : n
                            )
                        );
                        toast.success("Number updated successfully!");
                    }}
                />
            );
        },
        [openPopup, toast]
    );

    // ✔ Delete
    const handleDelete = useCallback(
        async (row) => {
            const confirmed = await toast.confirmToast(
                `Delete number "${row.callerId}"?`
            );
            if (!confirmed) return;

            try {
                await axios.delete(
                    `https://${window.location.hostname}:5000/block/${row.id}`,
                    {
                        headers: { Authorization: `Bearer ${token}` },
                    }
                );

                setNumbers((prev) =>
                    prev
                        .filter((n) => n.id !== row.id)
                        .map((n, idx) => ({ ...n, serial: idx + 1 }))
                );

                toast.success("Number removed successfully!");
            } catch (err) {
                console.error("❌ Delete failed:", err);
                toast.error("Delete failed.");
            }
        },
        [token, toast]
    );
    const columns = useMemo(
        () => [
            { header: "S.No", accessor: "serial" },
            { header: "Caller ID", accessor: "callerId" },
            {
                header: "Status",
                accessor: "status",
                Cell: () => (
                    <span className="px-1 py-0.5 text-[10px] bg-red-100 text-red-700 rounded-full">
                        Blocked
                    </span>
                )
            },
            {
                header: "Created At", accessor: "created_at", Cell: ({ value }) => {
                    const formatted = value?.replace("T", " ").replace(".000Z", "");
                    return (
                        <span className="whitespace-nowrap">{formatted}</span>
                    );
                },
            },
            { header: "Actions", accessor: "actions" },
        ],
        []
    );

    const numbersWithActions = useMemo(
        () =>
            numbers.map((n) => ({
                ...n,
                actions: (
                    <div className="flex gap-3">
                        <button
                            className="text-red-500 hover:text-red-700"
                            onClick={() => handleDelete(n)}
                            title="Delete"
                        >
                            <Trash2 size={18} />
                        </button>
                    </div>
                ),
            })),
        [numbers, handleEdit, handleDelete]
    );

    return (
        <div className="flex overflow-auto relative z-10">
            <main
                className={`transition-all duration-300 max-w-7xl mx-auto py-6 px-4 lg:px-8 flex-1 bg-gray-50 min-h-screen ${isOpen ? "mr-[450px]" : ""
                    }`}
            >
                <DataTable
                    title="Restricted Number List"
                    columns={columns}
                    data={numbersWithActions}
                    loading={loading}
                    headerActions={
                        <AddButton
                            label="Add Number"
                            form={<RestrictNumberForm onSuccess={handleAdd} />}
                        />
                    }
                />
            </main>

            <SideDrawer />
        </div>
    );
};

export default RestrictNumberPage;
