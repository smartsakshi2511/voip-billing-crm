import React, { useEffect, useState } from "react";
import useAuth from "../store/useAuth";
import axios from "axios";
import {
  EnvelopeIcon,
  PhoneIcon,
  CurrencyRupeeIcon,
  UserCircleIcon,
} from "@heroicons/react/24/outline";
import { PencilSquareIcon } from "@heroicons/react/24/outline";
import usePopupStore from "../store/usePopupStore";
import SideDrawer from "../components/reuseable/SideDrawer";
import EditProfileForm from "../components/Form/userForm/EditProfileForm";

const ProfilePage = () => {
  const { token } = useAuth();
  const [user, setUser] = useState(null);

  const { openPopup, isOpen } = usePopupStore(); // ⭐ REQUIRED

  useEffect(() => {
    const fetchProfile = async () => {
      try {
        const res = await axios.get(
          `https://${window.location.hostname}:5000/profile`,
          {
            headers: { Authorization: `Bearer ${token}` },
          }
        );
        setUser(res.data);
      } catch (error) {
        console.error("Failed to fetch profile:", error);
      }
    };
    fetchProfile();
  }, [token]);

  if (!user) {
    return (
      <div className="flex justify-center items-center h-[80vh] text-gray-500">
        Loading user details...
      </div>
    );
  }

  return (
    <div className="flex overflow-auto relative z-10">
      {/* MAIN CONTENT */}
      <main
        className={`transition-all duration-300 flex-1 bg-gray-50 min-h-screen ${isOpen ? "mr-[450px]" : ""
          }`}
      >
        <div className="min-h-screen bg-gray-50 py-10 px-4">
          <div className="max-w-6xl mx-auto bg-white rounded-2xl overflow-hidden shadow-xl border border-gray-100">

            {/* HEADER */}
            <div className="bg-gradient-to-r from-gray-700 via-gray-700 to-gray-700 p-4 text-white flex flex-col md:flex-row items-center gap-4">
              <div className="w-12 h-12 rounded-full bg-white/20 flex items-center justify-center text-4xl font-bold shadow-inner">
                {user.firstname?.[0]?.toUpperCase() ||
                  user.username?.[0]?.toUpperCase() ||
                  "U"}
              </div>

              <div className="flex-1">
                <h1 className="text-3xl font-semibold tracking-wide">
                  {user.firstname} {user.lastname}
                </h1>

                <p className="text-blue-100 flex items-center gap-2">
                  <EnvelopeIcon className="w-4 h-4 text-blue-100" />
                  {user.email}
                </p>
              </div>

              {/* <p className="text-sm mt-1 text-blue-200">
                  {user.Typeofaccount || "User Account"} •{" "}
                  <span className="font-medium text-white">
                    {user.planname || "No Plan"}
                  </span>
                </p> */}


              <div className="flex justify-end w-full md:w-auto p-2">
                <button
                  onClick={() =>
                    openPopup("Edit Profile", <EditProfileForm initialData={user} onProfileUpdated={(updatedUser) => setUser(updatedUser)} />)
                  }
                  className="bg-white/20 hover:bg-white/30 text-white p-2 rounded-lg transition"
                >
                  <PencilSquareIcon className="w-6 h-6" />
                </button>
              </div>


            
          </div>



          {/* CONTENT */}
          <div className="grid grid-cols-1 md:grid-cols-3">
            {/* LEFT SIDEBAR INFO */}
            <div className="bg-gray-50 border-r border-gray-100 p-6 flex flex-col gap-5">
              <h2 className="text-lg font-semibold text-gray-700 border-b pb-2">
                Quick Info
              </h2>

              <ProfileInfo
                icon={<PhoneIcon className="w-5 h-5 text-gray-500" />}
                label="Phone"
                value={user.phoneno}
              />
              <ProfileInfo
                icon={<PhoneIcon className="w-5 h-5 text-gray-500" />}
                label="Mobile"
                value={user.mobileno}
              />
              <ProfileInfo
                icon={<CurrencyRupeeIcon className="w-5 h-5 text-gray-500" />}
                label="Balance"
                value={user.balance}
              />
              <ProfileInfo
                icon={<CurrencyRupeeIcon className="w-5 h-5 text-gray-500" />}
                label="Credit Limit"
                value={user.Creditlimit}
              />
              <ProfileInfo
                icon={<UserCircleIcon className="w-5 h-5 text-gray-500" />}
                label="Status"
                value={user.status === "1" ? "Active ✅" : "Inactive ❌"}
              />
            </div>

            {/* RIGHT INFO */}
            <div className="col-span-2 p-8">

              <Section title="🏢 Company Details">
                <Detail label="Company Name" value={user.companyname} />
                <Detail label="Plan ID" value={user.planid} />
                <Detail label="Plan Name" value={user.planname} />
                <Detail
                  label="Record Call"
                  value={user.Recordcall ? "Yes" : "No"}
                />
              </Section>

              <Section title="📍 Address Details">
                <Detail label="Country" value={user.country} />
                <Detail label="State" value={user.state} />
                <Detail label="City" value={user.city} />
                <Detail label="Address" value={user.address} />
                <Detail label="Pincode" value={user.pincode} />
              </Section>

              <Section title="👤 Personal Information">
                <Detail label="Username" value={user.username} />
                <Detail label="First Name" value={user.firstname} />
                <Detail label="Last Name" value={user.lastname} />
                <Detail label="Type of Account" value={user.Typeofaccount} />
              </Section>
            </div>
          </div>
        </div>
    </div>
      </main >

  {/* SIDEDRAWER */ }
  < SideDrawer />
    </div >
  );
};

// SMALL COMPONENTS
const ProfileInfo = ({ icon, label, value }) => (
  <div className="flex items-center gap-3">
    {icon}
    <div>
      <p className="text-xs text-gray-500">{label}</p>
      <p className="text-sm font-medium text-gray-800">{value || "—"}</p>
    </div>
  </div>
);

const Section = ({ title, children }) => (
  <div className="mb-8">
    <h3 className="text-lg font-semibold text-gray-700 mb-4 border-b pb-2">
      {title}
    </h3>
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">{children}</div>
  </div>
);

const Detail = ({ label, value }) => (
  <div className="bg-gray-50 rounded-lg border border-gray-100 px-4 py-3 hover:bg-gray-100 transition">
    <p className="text-xs text-gray-500">{label}</p>
    <p className="text-sm font-medium text-gray-800">{value || "—"}</p>
  </div>
);

export default ProfilePage;
