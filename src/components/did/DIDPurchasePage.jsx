import React, { useEffect, useState } from "react";
import axios from "axios";
import CountryGrid from "./CountryGrid";
import CountryDetails from "./CountryDetails";
import useAuth from "../../store/useAuth";

const DIDPurchasePage = () => {
  const { token } = useAuth();
  const [countries, setCountries] = useState([]);
  const [selectedCountry, setSelectedCountry] = useState(null);
  const [coverage, setCoverage] = useState(null);
  const [loading, setLoading] = useState(false);
  const [selectedState, setSelectedState] = useState(null);

useEffect(() => {
    if (!token) return;   // ⛔ token nahi hai to API mat call karo

    axios.get(
      `https://${window.location.hostname}:5000/did/countries`,
      {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      }
    )
      .then(res => setCountries(res.data))
      .catch(err => console.error(err));
  }, [token]); // 👈 VERY IMPORTANT

  useEffect(() => {
    if (!selectedCountry) return;

    setLoading(true);
    axios.get(
      `https://${window.location.hostname}:5000/did/states/${selectedCountry.code}`,
      {
        headers: {
          Authorization: `Bearer ${token}`,
        },

      }

    )
      .then(res => setCoverage(res.data))
      .catch(err => console.error(err))
      .finally(() => setLoading(false));
  }, [selectedCountry]);
  console.log(localStorage.getItem("token"));
  console.log(selectedCountry)
  return (
    <div className="max-w-7xl mx-auto py-6 px-4 bg-gray-50 min-h-screen">
      <h1 className="text-2xl font-semibold mb-4"> DIDs</h1>

      {!selectedCountry ? (
        <CountryGrid
          countries={countries}
          onSelect={setSelectedCountry}
        />
      ) : (
        <CountryDetails
          country={selectedCountry}
          coverage={coverage}
          loading={loading}
          selectedState={selectedState}
          onSelectState={setSelectedState}
          onBack={() => {
            setSelectedCountry(null);
            setCoverage(null);
            setSelectedState(null);
          }}
        />

      )}
    </div>
  );
};

export default DIDPurchasePage;
