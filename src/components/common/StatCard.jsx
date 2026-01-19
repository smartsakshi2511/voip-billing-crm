import { motion } from "framer-motion";
import GaugeChart from "react-gauge-chart";

const StatCard = ({ name, icon: Icon, value, gradient, isGauge = false, max = 100, unit = "" }) => {
  const percent = Math.min(value / max, 1);

  return (
    <motion.div
      whileHover={{ y: -2, scale: 1.01 }}
      transition={{ type: "spring", stiffness: 250 }}
      className="bg-white rounded-2xl shadow-md border border-gray-100 hover:shadow-lg transition-all duration-300 p-3"
    >
      <div className="flex items-center justify-between gap-3">
        {/* Left: Icon + Name */}
        <div className="flex items-center gap-2">
          <div className={`p-2 rounded-full bg-gradient-to-br ${gradient} text-white shadow-md`}>
            <Icon size={16} /> {/* even smaller */}
          </div>
          <span className="text-sm font-semibold text-gray-700">{name}</span>
        </div>

        {/* Right: Value + optional mini gauge */}
        <div className="flex items-center gap-2">
          <p className="text-lg font-bold text-gray-900">{value}{unit}</p>

          {isGauge && (
            <div className="w-16 h-8">
              <GaugeChart
                id={`gauge-${name}`}
                nrOfLevels={20}
                colors={["#FF3CAC", "#784BA0", "#2B86C5"]}
                arcWidth={0.2}
                percent={percent}
                needleColor="#FFD700"
                needleBaseColor="#FFEC99"
                textColor="#111"
                hideText={true}  
                animate={true}
                arcsLength={[0.33, 0.33, 0.34]}
                style={{ width: "100%" }}
              />
            </div>
          )}
        </div>
      </div>
    </motion.div>
  );
};

export default StatCard;
