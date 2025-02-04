interface VitalSignProps {
  label: string;
  value: string | number;
  unit?: string;
}

const VitalSign = ({ label, value, unit }: VitalSignProps) => {
  return (
    <div className="bg-gray-800 rounded-lg p-4 min-w-[200px]">
      <h3 className="text-gray-400 text-sm mb-1">{label}</h3>
      <div className="flex items-baseline gap-2">
        <span className="text-2xl font-bold text-white">{value}</span>
        {unit && <span className="text-gray-400 text-sm">{unit}</span>}
      </div>
    </div>
  );
};

export default VitalSign;