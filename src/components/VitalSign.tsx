
interface VitalSignProps {
  label: string;
  value: string | number;
  unit?: string;
}

const VitalSign = ({ label, value, unit }: VitalSignProps) => {
  const isArrhythmiaDisplay = label === "Arrhythmias";
  
  const getArrhythmiaDisplay = () => {
    if (!isArrhythmiaDisplay) return { text: value, color: "" };
    
    if (typeof value === "number") {
      // Cuando aún no ha comenzado la medición o está en 0
      return {
        text: "SIN ARRITMIAS",
        color: "text-[#0FA0CE]" // Azul
      };
    }
    
    // Durante la medición - valor es string con el estado
    return {
      text: value === "ARRITMIA DETECTADA" ? "ARRITMIA DETECTADA" : "SIN ARRITMIAS",
      color: value === "ARRITMIA DETECTADA" ? "text-medical-red" : "text-[#0FA0CE]"
    };
  };

  const { text, color } = getArrhythmiaDisplay();

  return (
    <div className="bg-gray-800/20 backdrop-blur-md rounded p-1.5">
      <h3 className="text-gray-400/90 text-xs mb-0.5">{label}</h3>
      <div className="flex items-baseline gap-0.5">
        <span className={`text-base font-bold ${color || 'text-white/90'}`}>
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
