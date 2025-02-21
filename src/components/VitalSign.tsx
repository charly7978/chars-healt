
interface VitalSignProps {
  label: string;
  value: string | number;
  unit?: string;
}

const VitalSign = ({ label, value, unit }: VitalSignProps) => {
  return (
    <div className="bg-gray-800/20 backdrop-blur-md rounded-lg p-2">
      <h3 className="text-gray-400/90 text-xs mb-1">{label}</h3>
      <div className="flex items-baseline gap-1">
        <span className="text-lg font-bold text-white/90">{value}</span>
        {unit && <span className="text-gray-400/90 text-xs">{unit}</span>}
      </div>
    </div>
  );
};

export default VitalSign;
