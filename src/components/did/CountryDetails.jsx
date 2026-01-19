import React, { useState, useRef, useEffect } from "react";
import axios from "axios";
import useAuth from "../../store/useAuth";

const CountryDetails = ({
  country,
  coverage,
  loading,
  selectedState,
  onSelectState,
  onBack,
}) => {
  const { token } = useAuth();
  const reviewRef = useRef(null);
  const searchRef = useRef(null);
  const [quantity, setQuantity] = useState(1);
  const [orderData, setOrderData] = useState(null);
  const [agree, setAgree] = useState(false);
  const [successModal, setSuccessModal] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
  if (orderData && reviewRef.current) {
    reviewRef.current.scrollIntoView({
      behavior: "smooth",
      block: "start",
    });
  }
}, [orderData]);

useEffect(() => {
  if (selectedState && searchRef.current) {
    searchRef.current.scrollIntoView({
      behavior: "smooth",
      block: "start",
    });
  }
}, [selectedState]);



  if (loading) {
    return <div className="p-6 bg-white rounded">Loading...</div>;
  }

  if (!coverage || coverage.length === 0) {
    return (
      <div className="bg-white p-6 rounded">
        <button onClick={onBack} className="text-indigo-600 mb-4">
          ← Back
        </button>
        <h2 className="text-xl font-semibold">{country.name}</h2>
        <p>No coverage available</p>
      </div>
    );
  }

  return (
    <>
      <div className="bg-white border rounded-lg p-6 space-y-6">
        {/* Back */}
        <button onClick={onBack} className="text-indigo-600 text-sm">
          ← Back to countries
        </button>

        {/* Country Header */}
        <h2 className="text-2xl font-semibold flex items-center gap-2">
          <img
            src={`https://flagcdn.com/w40/${country.code.toLowerCase()}.png`}
            alt={country.name}
            className="w-8 h-5 object-cover"
          />
          {country.name}
        </h2>

        {/* Coverage */}
        <div>
          <h3 className="font-semibold mb-2">
            DID Coverage for {country.name}
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
            {coverage.map((state) => (
              <button
                key={state.id}
                onClick={() => onSelectState(state)}
                className="text-left px-3 py-2 bg-gray-100 border rounded hover:bg-indigo-50 text-sm text-indigo-700 underline"
              >
                {state.state_name} ({state.state_code})
              </button>
            ))}
          </div>
        </div>

        {/* Search Result */}
        {selectedState && (
          <div ref={searchRef} className="border rounded">
            <div className="bg-black text-white px-3 py-2 text-sm font-semibold">
              Search Results
            </div>

            <table className="w-full text-sm border-collapse">
              <thead className="bg-gray-100">
                <tr>
                  <th className="border px-2 py-1">Country</th>
                  <th className="border px-2 py-1">State</th>
                  <th className="border px-2 py-1">NRC</th>
                  <th className="border px-2 py-1">MRC</th>
                  <th className="border px-2 py-1">Qty</th>
                  <th className="border px-2 py-1"></th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td className="border px-2 py-1">{country.name}</td>
                  <td className="border px-2 py-1">
                    {selectedState.state_name}
                  </td>
                  <td className="border px-2 py-1">${selectedState.nrc}</td>
                  <td className="border px-2 py-1">${selectedState.mrc}</td>
                  <td className="border px-2 py-1">
                    <input
                      type="number"
                      min="1"
                      value={quantity}
                      onChange={(e) =>
                        setQuantity(Math.max(1, Number(e.target.value)))
                      }
                      className="w-16 border rounded px-1"
                    />
                  </td>
                  <td className="border px-2 py-1">
                    <button
                      onClick={() =>
                        setOrderData({
                          country: country.name,
                          state: selectedState.state_name,
                          quantity,
                          nrc: selectedState.nrc,
                          mrc: selectedState.mrc,
                          totalNRC: quantity * selectedState.nrc,
                          totalMRC: quantity * selectedState.mrc,
                        })
                      }
                      className="bg-indigo-600 text-white px-3 py-1 rounded"
                    >
                      ADD
                    </button>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        )}

         {orderData && (
          <div ref={reviewRef} className="border rounded-lg bg-indigo-50 p-4 space-y-3">
            <h3 className="font-semibold text-indigo-700">
              Review Your Order
            </h3>

            <div className="grid grid-cols-2 text-sm gap-2">
              <div>Country:</div><div>{orderData.country}</div>
              <div>State:</div><div>{orderData.state}</div>
              <div>Quantity:</div><div>{orderData.quantity}</div>
              <div>Total NRC:</div><div>${orderData.totalNRC}</div>
              <div>Total MRC:</div><div>${orderData.totalMRC}</div>
            </div>

            {/* Terms */}
            <label className="flex items-start gap-2 text-sm">
              <input
                type="checkbox"
                checked={agree}
                onChange={(e) => setAgree(e.target.checked)}
              />
              <span>
                I agree to the <b>Terms & Conditions</b> and understand that DID
                activation is subject to verification.
              </span>
            </label>

            {/* Submit */}
            <button
              disabled={!agree || submitting}
              onClick={async () => {
                try {
                  setSubmitting(true);

                  await axios.post(
                    `https://${window.location.hostname}:5000/did/request`,
                    {
                      country: country.name,
                      countryCode: country.code,
                      state: selectedState.state_name,
                      stateCode: selectedState.state_code,
                      quantity,
                      nrc: selectedState.nrc,
                      mrc: selectedState.mrc,
                    },
                    {
                      headers: {
                        Authorization: `Bearer ${token}`,
                      },
                    }
                  );

                  setSuccessModal(true);
                  setOrderData(null);
                  setAgree(false);
                } catch (err) {
                  alert("Failed to submit request");
                } finally {
                  setSubmitting(false);
                }
              }}
              className={`px-4 py-2 rounded text-white ${agree
                  ? "bg-indigo-600"
                  : "bg-gray-400 cursor-not-allowed"
                }`}
            >
              {submitting ? "Submitting..." : "Submit Request"}
            </button>
          </div>
        )}
      </div>

      {/* SUCCESS MODAL */}
      {successModal && (
        <div className="fixed inset-0 bg-black bg-opacity-40 flex items-center justify-center z-50">
          <div className="bg-white w-[420px] rounded-lg p-6 text-center space-y-4">
            <h2 className="text-lg font-semibold text-green-600">
              Thank you for your valuable order
            </h2>

            <p className="text-sm">
              Your request is sent to our support teams for review.
              <br />
              Our Team will get back to you with further details.
            </p>

            <p className="text-sm font-medium">
              Best Regards <br />
              support@next2call.com
            </p>

            <button
              onClick={() => setSuccessModal(false)}
              className="bg-indigo-600 text-white px-4 py-1 rounded"
            >
              Close
            </button>
          </div>
        </div>
      )}
    </>
  );
};

export default CountryDetails;
