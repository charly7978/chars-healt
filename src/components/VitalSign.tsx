
interface VitalSignProps {
  label: string;
  value: string | number;
  unit?: string;
}

const VitalSign = ({ label, value, unit }: VitalSignProps) => {
  const isArrhythmiaDisplay = label === "Arrhythmias";
  
  const getArrhythmiaDisplay = () => {
    if (!isArrhythmiaDisplay) return { text: value, color: "" };
    
    const [status, count] = value.toString().split('|');
    
    if (status === "ARRITMIA DETECTADA") {
      return {
        text: `ARRITMIA DETECTADA (${count})`,
        color: "text-medical-red"
      };
    }
    
    return {
      text: "SIN ARRITMIAS (0)",
      color: "text-[#0FA0CE]"
    };
  };

  const { text, color } = getArrhythmiaDisplay();

  return (
    <div className="bg-gray-800/60 backdrop-blur-md rounded-lg p-3 w-[160px] transition-all duration-300 hover:bg-gray-800/80">
      <h3 className="text-gray-400/90 text-xs uppercase tracking-wider mb-1">{label}</h3>
      <div className="flex items-baseline gap-1 justify-center">
        <span className={`${isArrhythmiaDisplay ? 'text-sm' : 'text-2xl'} font-bold ${color || 'text-white/90'}`}>
          {text}
        </span>
        {!isArrhythmiaDisplay && unit && (
          <span className="text-gray-400/90 text-xs">{unit}</span>
        )}
      </div>
    </div>
  );
};

export default VitalSign;
