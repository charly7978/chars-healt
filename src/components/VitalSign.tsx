
interface VitalSignProps {
  label: string;
  value: string | number;
  unit?: string;
}

const VitalSign = ({ label, value, unit }: VitalSignProps) => {
  const isArrhythmiaDisplay = label === "Arrhythmias";
  
  const getArrhythmiaDisplay = () => {
    if (!isArrhythmiaDisplay) return { text: value, color: "" };
    
    const numArrhythmias = parseInt(value.toString());
    return {
      text: numArrhythmias === 0 ? "0" : numArrhythmias.toString(),
      color: numArrhythmias > 0 ? "text-medical-red" : "text-[#0FA0CE]"
    };
  };

  const { text, color } = getArrhythmiaDisplay();

  return (
    <div className="bg-gray-800/20 backdrop-blur-md rounded p-1.5">
      <h3 className="text-gray-400/90 text-xs mb-0.5">{label}</h3>
      <div className="flex items-baseline gap-0.5">
        <span className={`${isArrhythmiaDisplay ? 'text-sm' : 'text-base'} font-bold ${color || 'text-white/90'}`}>
          {text}
        </span>
        {!isArrhythmiaDisplay && unit && (
          <span className="text-gray-400/90 text-[10px]">{unit}</span>
        )}
      </div>
    </div>
  );
};

export default VitalSign;
