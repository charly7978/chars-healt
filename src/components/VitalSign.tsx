interface VitalSignProps {
  label: string;
  value: string | number;
  unit?: string;
}

const VitalSign = ({ label, value, unit }: VitalSignProps) => {
  const isArrhythmiaDisplay = label === "ARRITMIAS";
  
  const getArrhythmiaDisplay = () => {
    if (!isArrhythmiaDisplay) return { text: value, color: "" };
    
    const [status, count] = String(value).split('|');
    
    if (status === "ARRITMIA DETECTADA") {
      return {
        text: count ? `ARRITMIA (${count})` : "ARRITMIA DETECTADA",
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
    <div className="bg-gray-800/20 backdrop-blur-md rounded p-2.5 min-w-[140px]">
      <h3 className="text-gray-400/90 text-xs mb-1">{label}</h3>
      <div className="flex items-baseline gap-1 justify-center">
        <span className={`${isArrhythmiaDisplay ? 'text-sm' : 'text-xl'} font-bold ${color || 'text-white/90'}`}>
          {isArrhythmiaDisplay ? text : value}
        </span>
        {!isArrhythmiaDisplay && unit && (
          <span className="text-gray-400/90 text-xs">{unit}</span>
        )}
      </div>
    </div>
  );
};

export default VitalSign;
