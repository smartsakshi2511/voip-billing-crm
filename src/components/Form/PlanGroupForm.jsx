import { useState, useRef, useEffect } from "react";
import usePopupStore from "../../store/usePopupStore";
import useAuth from "../../store/useAuth";
import useToast from "../reuseable/useToast";

const PlanGroupForm = ({ initialData, bulkData, onSuccess }) => {
  const isBulkEdit = Array.isArray(bulkData) && bulkData.length > 0;
  const isEdit = !!initialData && !isBulkEdit;

  const { closePopup } = usePopupStore();
  const { token } = useAuth();
  const toast = useToast();
  const [form, setForm] = useState(
    initialData
      ? {
        ...initialData,
        plangroupids: initialData.plangroupids || [],     // checkbox
        plangroupmembers: initialData.plangroupmembers || [], // display
        Lcrtype: initialData.Lcrtype || [],
        user: initialData.user || []
      }
      : {
        PlanGroupID: "",
        Plangroupname: "",
        plangroupmembers: [],
        plangroupids: [],
        Lcrtype: [],
        user: []
      }
  );

  const [membersOptions, setMembersOptions] = useState([]);
  const [userOptions, setUserOptions] = useState([]);
  const [existingPlanGroupIDs, setExistingPlanGroupIDs] = useState([]);

  const [fieldErrors, setFieldErrors] = useState({
    Plangroupname: "",
    plangroupmembers: "",
    user: ""
  });

  const [showMembersDropdown, setShowMembersDropdown] = useState(false);
  const [showUserDropdown, setShowUserDropdown] = useState(false);

  const membersRef = useRef();
  const userRef = useRef();


  const togglePlanSelection = (plan) => {
    setForm((prev) => {
      const ids = prev.plangroupids ? [...prev.plangroupids] : [];
      const members = prev.plangroupmembers ? [...prev.plangroupmembers] : [];
      const types = prev.Lcrtype ? [...prev.Lcrtype] : [];

      const idStr = plan.PlanID.toString();   // FIXED

      const index = ids.indexOf(idStr);

      if (index > -1) {
        ids.splice(index, 1);
        members.splice(index, 1);
        types.splice(index, 1);
      } else {
        ids.push(idStr);                      // FIXED
        members.push(plan.PlanName);

        const type = plan.loadbalance_type === "loadbalance"
          ? "loadbalance"
          : plan.lcr_type || "";

        types.push(type);
      }

      return { ...prev, plangroupids: ids, plangroupmembers: members, Lcrtype: types };
    });
  };


  useEffect(() => {
    const handler = (e) => {
      if (membersRef.current && !membersRef.current.contains(e.target)) setShowMembersDropdown(false);
      if (userRef.current && !userRef.current.contains(e.target)) setShowUserDropdown(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  useEffect(() => {
    const fetchOptions = async () => {
      try {
        const planRes = await fetch(`https://${window.location.hostname}:5000/plans`, { headers: { Authorization: `Bearer ${token}` } });
        const planData = await planRes.json();
        setMembersOptions(planData);

        const userRes = await fetch(`https://${window.location.hostname}:5000/users_dropdown`, { headers: { Authorization: `Bearer ${token}` } });
        const userData = await userRes.json();
        setUserOptions(userData.map((u) => u.username));

        const pgRes = await fetch(`https://${window.location.hostname}:5000/plangroups`, { headers: { Authorization: `Bearer ${token}` } });
        const pgData = await pgRes.json();
        setExistingPlanGroupIDs(pgData.map((p) => p.PlanGroupID.toString()));
      } catch (err) {
        console.error("🔴 Fetch error:", err);
      }
    };
    fetchOptions();
  }, []);

  const handleChange = (e) => {
    const { name, value } = e.target;
    setForm((prev) => ({ ...prev, [name]: value }));

    setFieldErrors((prev) => ({ ...prev, [name]: "" }));

    if (name === "PlanGroupID") {
      if (existingPlanGroupIDs.includes(value) && (!initialData || value !== initialData.PlanGroupID.toString())) {
        toast.error("This Plan Group ID already exists!");
      }
    }
  };

  const validateForm = () => {
    const errors = {};
    if (!form.Plangroupname.trim()) errors.Plangroupname = "Plan Group Name is required!";
    if (!form.plangroupmembers || form.plangroupmembers.length === 0) errors.plangroupmembers = "Select at least 1 Plan Member!";
    setFieldErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
     if (!isBulkEdit) {
    if (!validateForm()) return;
  }

    try {
      if (isBulkEdit) {
     const bulkPayload = {
    ids: bulkData.map((g) => g.id),
    ...(form.plangroupids && form.plangroupids.length > 0 && { plangroupmembers: form.plangroupids }),
    ...(form.Plangroupname && form.Plangroupname.trim() !== "" && { Plangroupname: form.Plangroupname }),
  };

  if (!bulkPayload.plangroupmembers && !bulkPayload.Plangroupname) {
    toast.error("Nothing to update for selected Plan Groups!");
    return;
  }

  const res = await fetch(
    `https://${window.location.hostname}:5000/plangroups/bulk-update`,
    {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(bulkPayload),
    }
  );

  const data = await res.json();

  if (!res.ok) {
    toast.error(data.message || "Failed to update Plan Groups ❌");
    return;
  }

  toast.success("Plan Groups updated successfully");
  onSuccess?.();
  closePopup();
  return;
}

      const cleanedUsers = Array.isArray(form.user)
        ? form.user.filter((u) => u && u.trim() !== "")
        : (form.user || "")
          .split(",")
          .map((u) => u.trim())
          .filter((u) => u !== "");

      const plangroupmembersToSend =
        form.plangroupids && form.plangroupids.length > 0
          ? form.plangroupids
          : form.plangroupmembers;

      const payload = {
        PlanGroupID: form.PlanGroupID,
        Plangroupname: form.Plangroupname,
        plangroupmembers: form.plangroupids,
        Lcrtype: form.Lcrtype,
        user: form.user || [],
      };

      console.log("📤 Final Payload Sent →", payload);

      const res = initialData
        ? await fetch(`https://${window.location.hostname}:5000/plangroups/${initialData.id}`, {
          method: "PUT",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify(payload),
        })
        : await fetch(`https://${window.location.hostname}:5000/plangroups`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify(payload),
        });

      const data = await res.json();

      if (!res.ok) {
        toast.error(data.message || "Failed to submit Plan Group ❌");
        return;
      }

      if (onSuccess) onSuccess(data);
      closePopup();
      toast.success(
        initialData
          ? "Plan Group updated successfully"
          : "Plan Group added successfully"
      );
    } catch (err) {
      console.error("🔴 Submit error:", err);
      toast.error("Error submitting Plan Group ❌");
    }
  };

  useEffect(() => {
    const generateUniquePlanGroupID = async (existingIDs) => {
      let newId;
      do {
        newId = Math.floor(100000 + Math.random() * 900000).toString(); // 6-digit random
      } while (existingIDs.includes(newId));
      return newId;
    };

    const setRandomId = async () => {
      if (!initialData) {  // Only for ADD & after fetching existing IDs
        const id = await generateUniquePlanGroupID(existingPlanGroupIDs);
        setForm((prev) => ({ ...prev, PlanGroupID: id }));
      }
    };

    setRandomId();
  }, [existingPlanGroupIDs, initialData]);


  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {!isBulkEdit && (
          <div>
            <label className="block text-sm font-medium mb-1">Plan Group ID</label>
            <input type="text" name="PlanGroupID" value={form.PlanGroupID} readOnly className="w-full border rounded-lg px-3 py-2 bg-gray-100 cursor-not-allowed" />
          </div>
        )}
       {!isBulkEdit && (
        <div>
          <label className="block text-sm font-medium mb-1">Plan Group Name</label>
          <input type="text" name="Plangroupname" value={form.Plangroupname} onChange={handleChange} placeholder="Enter Plan Group Name"   disabled={isEdit} className={`w-full border rounded-lg px-3 py-2  ${
        isEdit
          ? "bg-gray-100 cursor-not-allowed"
          : "focus:ring-2 focus:ring-blue-500"
      }`} />
          {fieldErrors.Plangroupname && <p className="text-red-500 text-sm mt-1">{fieldErrors.Plangroupname}</p>}
        </div>
        )}
      </div>

      {/* Plan Members */}
      <div ref={membersRef} className="relative">
        <label className="block text-sm font-medium mb-1">Plan Group Members</label>
        <div onClick={() => setShowMembersDropdown((prev) => !prev)} className="w-full border rounded-lg px-3 py-2 cursor-pointer bg-white">
          {form.plangroupmembers.length > 0 ? form.plangroupmembers.join(", ") : "Select Members"}
        </div>
        {showMembersDropdown && (
          <div className="absolute z-10 w-full bg-white border rounded-lg mt-1 shadow-lg max-h-40 overflow-y-auto">
            {membersOptions.map((plan) => (
              <label key={plan.PlanID} className="flex items-center px-3 py-1 hover:bg-gray-100 cursor-pointer">
                <input
                  type="checkbox"
                  checked={form.plangroupids.includes(plan.PlanID.toString())}
                  onChange={() => togglePlanSelection(plan)}
                  className="mr-2"
                />
                {plan.PlanName} ({plan.loadbalance_type || plan.lcr_type})
              </label>
            ))}

          </div>
        )}
        {fieldErrors.plangroupmembers && <p className="text-red-500 text-sm mt-1">{fieldErrors.plangroupmembers}</p>}
      </div>




      {/* Buttons */}
      <div className="flex justify-end space-x-3 pt-4">
        <button type="button" onClick={closePopup} className="px-4 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300">Cancel</button>
        <button type="submit" className="px-4 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700">Submit</button>
      </div>
    </form>
  );
};

export default PlanGroupForm;
