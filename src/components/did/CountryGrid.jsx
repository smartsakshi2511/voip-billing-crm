const CountryGrid = ({ countries, onSelect }) => {
  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-3 border rounded-lg p-4 bg-white">
      {countries.map((c) => (
        <button
          key={c.id}
          onClick={() =>
            onSelect({
              name: c.country_name,
              code: c.country_code,
              flag: c.flag,
            })
          }
          className="flex items-center justify-between px-3 py-2 bg-gray-50 hover:bg-indigo-50 rounded border"
        >
          <div className="flex items-center gap-2">
            <img
              src={`https://flagcdn.com/w20/${c.country_code.toLowerCase()}.png`}
              alt={c.country_name}
              className="w-6 h-4 object-cover"
            />
            <span className="font-medium">{c.country_name}</span>
          </div>

          <span className="text-indigo-600">›</span>
        </button>
      ))}
    </div>
  );
};

export default CountryGrid;
