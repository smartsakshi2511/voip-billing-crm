export const countryCodes = {
  "1": "USA/Canada",
  "7": "Russia/Kazakhstan",
  "20": "Egypt",
  "27": "South Africa",
  "30": "Greece",
  "31": "Netherlands",
  "33": "France",
  "34": "Spain",
  "39": "Italy",
  "44": "United Kingdom",
  "49": "Germany",
  "52": "Mexico",
  "55": "Brazil",
  "60": "Malaysia",
  "61": "Australia",
  "62": "Indonesia",
  "63": "Philippines",
  "65": "Singapore",
  "81": "Japan",
  "82": "South Korea",
  "86": "China",
  "91": "India",
  "92": "Pakistan",
  "94": "Sri Lanka",
  "971": "UAE",
  "974": "Qatar",
  "966": "Saudi Arabia"
};

export function getCountryFromCode(code) {
  const str = String(code);

  for (let i = str.length; i > 0; i--) {
    const prefix = str.slice(0, i);
    if (countryCodes[prefix]) return countryCodes[prefix];
  }

  return "Unknown";
}
