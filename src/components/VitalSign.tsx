
interface VitalSignProps {
  label: string;
  value: string | number;
  unit?: string;
}

const VitalSign = ({ label, value, unit }: VitalSignProps) => {
  const isArrhythmiaDisplay = label === "Arrhythmias";
  
  const getArrhythmiaDisplay = () => {
    if (!isArrhythmiaDisplay) return { text: value, color: "" };
    
    if (value === "ARRITMIA DETECTADA") {
      return {
        text: "ARRITMIA DETECTADA",
        color: "text-medical-red"
      };
    }
    
    return {
      text: "SIN ARRITMIAS",
      color: "text-[#0FA0CE]"
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
