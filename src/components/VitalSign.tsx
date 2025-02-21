
interface VitalSignProps {
  label: string;
  value: string | number;
  unit?: string;
}

const VitalSign = ({ label, value, unit }: VitalSignProps) => {
  return (
    <div className="bg-gray-800/20 backdrop-blur-md rounded p-1.5">
      <h3 className="text-gray-400/90 text-xs mb-0.5">{label}</h3>
      <div className="flex items-baseline gap-0.5">
        <span className="text-base font-bold text-white/90">{value}</span>
        {unit && <span className="text-gray-400/90 text-[10px]">{unit}</span>}
      </div>
    </div>
  );
};

export default VitalSign;
