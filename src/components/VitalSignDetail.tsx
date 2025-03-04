import React from 'react';

interface VitalSignDetailProps {
  title: string;
  value: string | number;
  unit?: string;
  riskLevel?: string;
  type: "heartRate" | "spo2" | "bloodPressure" | "arrhythmia" | "respiration" | "glucose" | "hemoglobin";
  onBack: () => void;
  secondaryValue?: string | number;
  secondaryUnit?: string;
  trend?: 'stable' | 'rising' | 'falling' | 'rising_rapidly' | 'falling_rapidly' | 'unknown';
}

const VitalSignDetail: React.FC<VitalSignDetailProps> = ({
  title,
  value,
  unit,
  riskLevel,
  type,
  onBack,
  secondaryValue,
  secondaryUnit,
  trend
}) => {
  return (
    <div className="vital-sign-detail">
      <h2>{title}</h2>
      <p>{value} {unit}</p>
      {secondaryValue !== undefined && (
        <p>{secondaryValue} {secondaryUnit}</p>
      )}
      {riskLevel && <p>Risk Level: {riskLevel}</p>}
      {trend && <p>Trend: {trend}</p>}
      <button onClick={onBack}>Back</button>
    </div>
  );
};

export default VitalSignDetail;
