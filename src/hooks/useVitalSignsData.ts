
import { useState, useRef } from 'react';
import { VitalSignsRisk } from '@/utils/vitalSignsRisk';

export interface VitalSigns {
  spo2: number;
  pressure: string;
  arrhythmiaStatus: string;
  respiration: {
    rate: number;
    depth: number;
    regularity: number;
  };
  hasRespirationData: boolean;
  glucose: {
    value: number;
    trend: 'stable' | 'rising' | 'falling' | 'rising_rapidly' | 'falling_rapidly' | 'unknown';
  };
  lipids: {
    totalCholesterol: number;
    hdl: number;
    ldl: number;
    triglycerides: number;
  } | null;
  lastArrhythmiaData: {
    timestamp: number;
    rmssd: number;
    rrVariation: number;
  } | null;
}

export interface FinalValues {
  heartRate: number;
  spo2: number;
  pressure: string;
  respiration: {
    rate: number;
    depth: number;
    regularity: number;
  };
  glucose: {
    value: number;
    trend: 'stable' | 'rising' | 'falling' | 'rising_rapidly' | 'falling_rapidly' | 'unknown';
  };
  lipids: {
    totalCholesterol: number;
    hdl: number;
    ldl: number;
    triglycerides: number;
  } | null;
}

export function useVitalSignsData() {
  const [vitalSigns, setVitalSigns] = useState<VitalSigns>({ 
    spo2: 0, 
    pressure: "--/--",
    arrhythmiaStatus: "--",
    respiration: { rate: 0, depth: 0, regularity: 0 },
    hasRespirationData: false,
    glucose: { value: 0, trend: 'unknown' },
    lipids: null,
    lastArrhythmiaData: null
  });
  
  const [heartRate, setHeartRate] = useState(0);
  const [arrhythmiaCount, setArrhythmiaCount] = useState<string | number>("--");
  const [lastArrhythmiaData, setLastArrhythmiaData] = useState<{
    timestamp: number;
    rmssd: number;
    rrVariation: number;
  } | null>(null);
  
  const [finalValues, setFinalValues] = useState<FinalValues | null>(null);
  
  const allHeartRateValuesRef = useRef<number[]>([]);
  const allSpo2ValuesRef = useRef<number[]>([]);
  const allSystolicValuesRef = useRef<number[]>([]);
  const allDiastolicValuesRef = useRef<number[]>([]);
  const allRespirationRateValuesRef = useRef<number[]>([]);
  const allRespirationDepthValuesRef = useRef<number[]>([]);
  const allGlucoseValuesRef = useRef<number[]>([]);
  const allLipidValuesRef = useRef<{
    totalCholesterol: number[];
    hdl: number[];
    ldl: number[];
    triglycerides: number[];
  }>({
    totalCholesterol: [],
    hdl: [],
    ldl: [],
    triglycerides: []
  });
  
  const hasValidValuesRef = useRef(false);
  
  const resetValues = () => {
    setHeartRate(0);
    setVitalSigns({ 
      spo2: 0, 
      pressure: "--/--",
      arrhythmiaStatus: "--",
      respiration: { rate: 0, depth: 0, regularity: 0 },
      hasRespirationData: false,
      glucose: { value: 0, trend: 'unknown' },
      lipids: null,
      lastArrhythmiaData: null
    });
    setArrhythmiaCount("--");
    setLastArrhythmiaData(null);
    setFinalValues(null);
    
    hasValidValuesRef.current = false;
    
    allHeartRateValuesRef.current = [];
    allSpo2ValuesRef.current = [];
    allSystolicValuesRef.current = [];
    allDiastolicValuesRef.current = [];
    allRespirationRateValuesRef.current = [];
    allRespirationDepthValuesRef.current = [];
    allGlucoseValuesRef.current = [];
    allLipidValuesRef.current = {
      totalCholesterol: [],
      hdl: [],
      ldl: [],
      triglycerides: []
    };
  };
  
  const calculateFinalValues = () => {
    try {
      console.log("Calculando PROMEDIOS REALES con todos los valores capturados...");
      
      const validHeartRates = allHeartRateValuesRef.current.filter(v => v > 0);
      const validSpo2Values = allSpo2ValuesRef.current.filter(v => v > 0);
      const validSystolicValues = allSystolicValuesRef.current.filter(v => v > 0);
      const validDiastolicValues = allDiastolicValuesRef.current.filter(v => v > 0);
      const validRespRates = allRespirationRateValuesRef.current.filter(v => v > 0);
      const validRespDepths = allRespirationDepthValuesRef.current.filter(v => v > 0);
      const validGlucoseValues = allGlucoseValuesRef.current.filter(v => v > 0);
      const validLipidValues = allLipidValuesRef.current.totalCholesterol.filter(v => v > 0);
      
      console.log("Valores acumulados para promedios:", {
        heartRateValues: validHeartRates.length,
        spo2Values: validSpo2Values.length,
        systolicValues: validSystolicValues.length,
        diastolicValues: validDiastolicValues.length,
        respirationRates: validRespRates.length,
        respirationDepths: validRespDepths.length,
        glucoseValues: validGlucoseValues.length,
        lipidValues: validLipidValues.length
      });
      
      let avgHeartRate = 0;
      if (validHeartRates.length > 0) {
        avgHeartRate = Math.round(validHeartRates.reduce((a, b) => a + b, 0) / validHeartRates.length);
      } else {
        avgHeartRate = heartRate;
      }
      
      let avgSpo2 = 0;
      if (validSpo2Values.length > 0) {
        avgSpo2 = Math.round(validSpo2Values.reduce((a, b) => a + b, 0) / validSpo2Values.length);
      } else {
        avgSpo2 = vitalSigns.spo2;
      }
      
      let finalBPString = vitalSigns.pressure;
      if (validSystolicValues.length > 0 && validDiastolicValues.length > 0) {
        let avgSystolic = Math.round(validSystolicValues.reduce((a, b) => a + b, 0) / validSystolicValues.length);
        let avgDiastolic = Math.round(validDiastolicValues.reduce((a, b) => a + b, 0) / validDiastolicValues.length);
        finalBPString = `${avgSystolic}/${avgDiastolic}`;
      }
      
      let avgRespRate = 0;
      if (validRespRates.length > 0) {
        avgRespRate = Math.round(validRespRates.reduce((a, b) => a + b, 0) / validRespRates.length);
      } else {
        avgRespRate = vitalSigns.respiration.rate;
      }
      
      let avgRespDepth = 0;
      if (validRespDepths.length > 0) {
        avgRespDepth = Math.round(validRespDepths.reduce((a, b) => a + b, 0) / validRespDepths.length);
      } else {
        avgRespDepth = vitalSigns.respiration.depth;
      }
      
      let avgGlucose = 0;
      if (validGlucoseValues.length > 0) {
        avgGlucose = Math.round(validGlucoseValues.reduce((a, b) => a + b, 0) / validGlucoseValues.length);
      } else {
        avgGlucose = vitalSigns.glucose.value;
      }
      
      let finalLipids = null;
      if (allLipidValuesRef.current.totalCholesterol.length > 0) {
        const avgTotalCholesterol = Math.round(
          allLipidValuesRef.current.totalCholesterol.reduce((a, b) => a + b, 0) / 
          allLipidValuesRef.current.totalCholesterol.length
        );
        
        const avgHDL = Math.round(
          allLipidValuesRef.current.hdl.reduce((a, b) => a + b, 0) / 
          allLipidValuesRef.current.hdl.length
        );
        
        const avgLDL = Math.round(
          allLipidValuesRef.current.ldl.reduce((a, b) => a + b, 0) / 
          allLipidValuesRef.current.ldl.length
        );
        
        const avgTriglycerides = Math.round(
          allLipidValuesRef.current.triglycerides.reduce((a, b) => a + b, 0) / 
          allLipidValuesRef.current.triglycerides.length
        );
        
        finalLipids = {
          totalCholesterol: avgTotalCholesterol,
          hdl: avgHDL,
          ldl: avgLDL,
          triglycerides: avgTriglycerides
        };
      } else {
        finalLipids = vitalSigns.lipids;
      }
      
      console.log("PROMEDIOS REALES calculados:", {
        heartRate: avgHeartRate,
        spo2: avgSpo2,
        pressure: finalBPString,
        respiration: { rate: avgRespRate, depth: avgRespDepth },
        glucose: avgGlucose,
        lipids: finalLipids
      });
      
      let glucoseTrend: 'stable' | 'rising' | 'falling' | 'rising_rapidly' | 'falling_rapidly' | 'unknown' = 'unknown';
      if (validGlucoseValues.length >= 3) {
        const recentValues = validGlucoseValues.slice(-3);
        const changes = [];
        for (let i = 1; i < recentValues.length; i++) {
          changes.push(recentValues[i] - recentValues[i-1]);
        }
        
        const avgChange = changes.reduce((a, b) => a + b, 0) / changes.length;
        
        if (Math.abs(avgChange) < 2) {
          glucoseTrend = 'stable';
        } else if (avgChange > 5) {
          glucoseTrend = 'rising_rapidly';
        } else if (avgChange > 2) {
          glucoseTrend = 'rising';
        } else if (avgChange < -5) {
          glucoseTrend = 'falling_rapidly';
        } else if (avgChange < -2) {
          glucoseTrend = 'falling';
        }
      }
      
      const finalVals = {
        heartRate: avgHeartRate > 0 ? avgHeartRate : heartRate,
        spo2: avgSpo2 > 0 ? avgSpo2 : vitalSigns.spo2,
        pressure: finalBPString,
        respiration: {
          rate: avgRespRate > 0 ? avgRespRate : vitalSigns.respiration.rate,
          depth: avgRespDepth > 0 ? avgRespDepth : vitalSigns.respiration.depth,
          regularity: vitalSigns.respiration.regularity
        },
        glucose: {
          value: avgGlucose > 0 ? avgGlucose : vitalSigns.glucose.value,
          trend: glucoseTrend
        },
        lipids: finalLipids
      };
      
      setFinalValues(finalVals);
        
      hasValidValuesRef.current = true;
      
      // Clear array buffers
      resetArrayBuffers();
      
      return finalVals;
    } catch (error) {
      console.error("Error en calculateFinalValues:", error);
      const fallbackValues = {
        heartRate: heartRate,
        spo2: vitalSigns.spo2,
        pressure: vitalSigns.pressure,
        respiration: vitalSigns.respiration,
        glucose: vitalSigns.glucose,
        lipids: vitalSigns.lipids
      };
      
      setFinalValues(fallbackValues);
      hasValidValuesRef.current = true;
      
      return fallbackValues;
    }
  };
  
  const resetArrayBuffers = () => {
    allHeartRateValuesRef.current = [];
    allSpo2ValuesRef.current = [];
    allSystolicValuesRef.current = [];
    allDiastolicValuesRef.current = [];
    allRespirationRateValuesRef.current = [];
    allRespirationDepthValuesRef.current = [];
    allGlucoseValuesRef.current = [];
    allLipidValuesRef.current = {
      totalCholesterol: [],
      hdl: [],
      ldl: [],
      triglycerides: []
    };
  };
  
  const processVitalsData = (vitalsData: any) => {
    if (!vitalsData) return;
    
    try {
      if (vitalsData.spo2 > 0) {
        setVitalSigns(current => ({
          ...current,
          spo2: vitalsData.spo2
        }));
        allSpo2ValuesRef.current.push(vitalsData.spo2);
      }
      
      if (vitalsData.pressure !== "--/--" && vitalsData.pressure !== "0/0") {
        setVitalSigns(current => ({
          ...current,
          pressure: vitalsData.pressure
        }));
        
        const [systolic, diastolic] = vitalsData.pressure.split('/').map(Number);
        if (systolic > 0 && diastolic > 0) {
          allSystolicValuesRef.current.push(systolic);
          allDiastolicValuesRef.current.push(diastolic);
        }
      }
      
      setVitalSigns(current => ({
        ...current,
        arrhythmiaStatus: vitalsData.arrhythmiaStatus
      }));
      
      if (vitalsData.hasRespirationData && vitalsData.respiration) {
        console.log("Procesando datos de respiración:", vitalsData.respiration);
        setVitalSigns(current => ({
          ...current,
          respiration: vitalsData.respiration,
          hasRespirationData: true
        }));
        
        if (vitalsData.respiration.rate > 0) {
          allRespirationRateValuesRef.current.push(vitalsData.respiration.rate);
        }
        
        if (vitalsData.respiration.depth > 0) {
          allRespirationDepthValuesRef.current.push(vitalsData.respiration.depth);
        }
      }
      
      if (vitalsData.glucose && vitalsData.glucose.value > 0) {
        setVitalSigns(current => ({
          ...current,
          glucose: vitalsData.glucose
        }));
        
        allGlucoseValuesRef.current.push(vitalsData.glucose.value);
      }
      
      if (vitalsData.lipids) {
        setVitalSigns(current => ({
          ...current,
          lipids: vitalsData.lipids
        }));
        
        if (vitalsData.lipids.totalCholesterol > 0) {
          allLipidValuesRef.current.totalCholesterol.push(vitalsData.lipids.totalCholesterol);
        }
        if (vitalsData.lipids.hdl > 0) {
          allLipidValuesRef.current.hdl.push(vitalsData.lipids.hdl);
        }
        if (vitalsData.lipids.ldl > 0) {
          allLipidValuesRef.current.ldl.push(vitalsData.lipids.ldl);
        }
        if (vitalsData.lipids.triglycerides > 0) {
          allLipidValuesRef.current.triglycerides.push(vitalsData.lipids.triglycerides);
        }
      }
      
      if (vitalsData.lastArrhythmiaData) {
        setLastArrhythmiaData(vitalsData.lastArrhythmiaData);
        setVitalSigns(current => ({
          ...current,
          lastArrhythmiaData: vitalsData.lastArrhythmiaData
        }));
        
        const [status, count] = vitalsData.arrhythmiaStatus.split('|');
        setArrhythmiaCount(count || "0");
      }
    } catch (error) {
      console.error("Error procesando datos vitales:", error);
    }
  };
  
  const processHeartRateData = (bpm: number) => {
    if (bpm > 0) {
      setHeartRate(bpm);
      allHeartRateValuesRef.current.push(bpm);
    }
  };
  
  const evaluateRisks = () => {
    try {
      if (heartRate > 0) {
        VitalSignsRisk.getBPMRisk(heartRate, true);
      }
    } catch (err) {
      console.error("Error al evaluar riesgo BPM:", err);
    }
    
    try {
      if (vitalSigns.pressure !== "--/--" && vitalSigns.pressure !== "0/0") {
        VitalSignsRisk.getBPRisk(vitalSigns.pressure, true);
      }
    } catch (err) {
      console.error("Error al evaluar riesgo BP:", err);
    }
    
    try {
      if (vitalSigns.spo2 > 0) {
        VitalSignsRisk.getSPO2Risk(vitalSigns.spo2, true);
      }
    } catch (err) {
      console.error("Error al evaluar riesgo SPO2:", err);
    }
  };
  
  return {
    vitalSigns,
    setVitalSigns,
    heartRate,
    setHeartRate,
    arrhythmiaCount,
    setArrhythmiaCount,
    lastArrhythmiaData,
    setLastArrhythmiaData,
    finalValues,
    setFinalValues,
    allHeartRateValuesRef,
    allSpo2ValuesRef,
    allSystolicValuesRef,
    allDiastolicValuesRef,
    allRespirationRateValuesRef,
    allRespirationDepthValuesRef,
    allGlucoseValuesRef,
    allLipidValuesRef,
    resetValues,
    calculateFinalValues,
    resetArrayBuffers,
    processVitalsData,
    processHeartRateData,
    evaluateRisks
  };
}
