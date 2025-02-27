
interface RiskSegment {
  color: string;
  label: string;
}

interface StabilityCheck {
  value: number;
  timestamp: number;
}

interface BPCheck extends StabilityCheck {
  systolic: number;
  diastolic: number;
}

interface SegmentCount {
  segment: RiskSegment;
  count: number;
}

export class VitalSignsRisk {
  private static readonly STABILITY_WINDOW = 4000; // 4 segundos
  private static readonly MEASUREMENT_WINDOW = 40000; // 40 segundos para análisis final
  private static readonly SMOOTHING_FACTOR = 0.15; // Factor de suavizado (reducido para más suavidad)
  
  // Nuevos factores de suavizado para diferentes variables
  private static readonly BPM_SMOOTHING_ALPHA = 0.15;  // Más bajo = más suave
  private static readonly SPO2_SMOOTHING_ALPHA = 0.20; // Ligeramente más responsivo
  private static readonly BP_SMOOTHING_ALPHA = 0.10;   // Muy suave para presión arterial
  
  // Buffer para promedio móvil ponderado exponencialmente (EWMA)
  private static recentBpmValues: number[] = [];
  private static recentSpo2Values: number[] = [];
  private static recentSystolicValues: number[] = [];
  private static recentDiastolicValues: number[] = [];
  
  // Tamaño de ventana para promedios móviles
  private static readonly EWMA_WINDOW_SIZE = 8;
  
  private static bpmHistory: StabilityCheck[] = [];
  private static spo2History: StabilityCheck[] = [];
  private static bpHistory: BPCheck[] = [];
  
  private static lastBPM: number | null = null;
  private static lastSystolic: number | null = null;
  private static lastDiastolic: number | null = null;
  
  private static bpmSegmentHistory: RiskSegment[] = [];
  private static bpSegmentHistory: RiskSegment[] = [];

  // Método mejorado de suavizado mediante promedio móvil ponderado exponencialmente
  static smoothValue(newValue: number, lastValue: number | null, alpha: number = this.SMOOTHING_FACTOR): number {
    if (lastValue === null) return newValue;
    return lastValue + alpha * (newValue - lastValue);
  }

  // Implementación de un filtro de mediana para eliminar valores atípicos
  private static medianFilter(values: number[]): number {
    if (values.length === 0) return 0;
    if (values.length === 1) return values[0];
    
    // Crear copia para no modificar el array original
    const sortedValues = [...values].sort((a, b) => a - b);
    
    const middle = Math.floor(sortedValues.length / 2);
    if (sortedValues.length % 2 === 0) {
      return (sortedValues[middle - 1] + sortedValues[middle]) / 2;
    } else {
      return sortedValues[middle];
    }
  }

  static updateBPMHistory(value: number) {
    // Añadir al buffer de EWMA
    this.recentBpmValues.push(value);
    if (this.recentBpmValues.length > this.EWMA_WINDOW_SIZE) {
      this.recentBpmValues.shift();
    }
    
    // Aplicar filtro de mediana para eliminar valores atípicos
    const filteredValue = this.medianFilter(this.recentBpmValues);
    
    // Aplicar EWMA
    const smoothedValue = this.smoothValue(filteredValue, this.lastBPM, this.BPM_SMOOTHING_ALPHA);
    this.lastBPM = smoothedValue;
    
    const now = Date.now();
    this.bpmHistory = this.bpmHistory.filter(check => now - check.timestamp < this.MEASUREMENT_WINDOW);
    this.bpmHistory.push({ value: smoothedValue, timestamp: now });
  }

  static updateSPO2History(value: number) {
    // Añadir al buffer de EWMA
    this.recentSpo2Values.push(value);
    if (this.recentSpo2Values.length > this.EWMA_WINDOW_SIZE) {
      this.recentSpo2Values.shift();
    }
    
    // Aplicar filtro de mediana para eliminar valores atípicos
    const filteredValue = this.medianFilter(this.recentSpo2Values);
    
    // Aplicar EWMA 
    const smoothedValue = this.smoothValue(filteredValue, this.lastBPM, this.SPO2_SMOOTHING_ALPHA);
    
    const now = Date.now();
    this.spo2History = this.spo2History.filter(check => now - check.timestamp < this.MEASUREMENT_WINDOW);
    this.spo2History.push({ value: smoothedValue, timestamp: now });
  }

  static updateBPHistory(systolic: number, diastolic: number) {
    // Añadir al buffer de EWMA
    this.recentSystolicValues.push(systolic);
    this.recentDiastolicValues.push(diastolic);
    
    if (this.recentSystolicValues.length > this.EWMA_WINDOW_SIZE) {
      this.recentSystolicValues.shift();
      this.recentDiastolicValues.shift();
    }
    
    // Aplicar filtro de mediana para eliminar valores atípicos
    const filteredSystolic = this.medianFilter(this.recentSystolicValues);
    const filteredDiastolic = this.medianFilter(this.recentDiastolicValues);
    
    // Aplicar EWMA con factor de suavizado más bajo para BP
    const smoothedSystolic = this.smoothValue(filteredSystolic, this.lastSystolic, this.BP_SMOOTHING_ALPHA);
    const smoothedDiastolic = this.smoothValue(filteredDiastolic, this.lastDiastolic, this.BP_SMOOTHING_ALPHA);
    
    this.lastSystolic = smoothedSystolic;
    this.lastDiastolic = smoothedDiastolic;
    
    const now = Date.now();
    this.bpHistory = this.bpHistory.filter(check => now - check.timestamp < this.MEASUREMENT_WINDOW);
    this.bpHistory.push({ 
      systolic: smoothedSystolic, 
      diastolic: smoothedDiastolic, 
      timestamp: now, 
      value: smoothedSystolic 
    });
  }

  static isStableValue(history: StabilityCheck[], range: [number, number]): boolean {
    const now = Date.now();
    const oldestAllowed = now - this.STABILITY_WINDOW;
    const recentHistory = history.filter(check => check.timestamp >= oldestAllowed);
    
    if (recentHistory.length < 3) return false;
    
    const stableChecks = recentHistory.filter(check => 
      check.value >= range[0] && check.value <= range[1]
    );

    return stableChecks.length >= Math.ceil(recentHistory.length * 0.66); // Reducido de 0.75 a 0.66 para mayor flexibilidad
  }

  static isStableBP(range: { systolic: [number, number], diastolic: [number, number] }): boolean {
    const now = Date.now();
    const oldestAllowed = now - this.STABILITY_WINDOW;
    const recentHistory = this.bpHistory.filter(check => check.timestamp >= oldestAllowed);
    
    if (recentHistory.length < 3) return false;
    
    const stableChecks = recentHistory.filter(check => 
      check.systolic >= range.systolic[0] && 
      check.systolic <= range.systolic[1] &&
      check.diastolic >= range.diastolic[0] && 
      check.diastolic <= range.diastolic[1]
    );

    return stableChecks.length >= Math.ceil(recentHistory.length * 0.66); // Reducido de 0.75 a 0.66 para mayor flexibilidad
  }

  private static getMostFrequentSegment(segments: RiskSegment[]): RiskSegment {
    if (segments.length === 0) return { color: '#FFFFFF', label: '' };
    
    const counts: SegmentCount[] = [];
    
    segments.forEach(segment => {
      const existing = counts.find(c => c.segment.label === segment.label);
      if (existing) {
        existing.count++;
      } else {
        counts.push({ segment, count: 1 });
      }
    });
    
    return counts.sort((a, b) => b.count - a.count)[0].segment;
  }

  // Función para calcular el promedio del historial de BPM
  private static getAverageBPM(): number {
    if (this.bpmHistory.length === 0) return 0;
    
    // Usar solo los últimos 20 segundos de datos para el promedio
    const now = Date.now();
    const recentHistory = this.bpmHistory.filter(check => now - check.timestamp < 20000);
    
    if (recentHistory.length === 0) return 0;
    
    const sum = recentHistory.reduce((total, check) => total + check.value, 0);
    return Math.round(sum / recentHistory.length);
  }

  // Función para calcular el promedio del historial de SpO2
  private static getAverageSPO2(): number {
    if (this.spo2History.length === 0) return 0;
    
    // Usar solo los últimos 20 segundos de datos para el promedio
    const now = Date.now();
    const recentHistory = this.spo2History.filter(check => now - check.timestamp < 20000);
    
    if (recentHistory.length === 0) return 0;
    
    const sum = recentHistory.reduce((total, check) => total + check.value, 0);
    return Math.round(sum / recentHistory.length);
  }

  // Función para calcular el promedio del historial de presión arterial
  private static getAverageBP(): { systolic: number, diastolic: number } {
    if (this.bpHistory.length === 0) return { systolic: 0, diastolic: 0 };
    
    // Usar solo los últimos 20 segundos de datos para el promedio
    const now = Date.now();
    const recentHistory = this.bpHistory.filter(check => now - check.timestamp < 20000);
    
    if (recentHistory.length === 0) return { systolic: 0, diastolic: 0 };
    
    const systolicSum = recentHistory.reduce((total, check) => total + check.systolic, 0);
    const diastolicSum = recentHistory.reduce((total, check) => total + check.diastolic, 0);
    
    return {
      systolic: Math.round(systolicSum / recentHistory.length),
      diastolic: Math.round(diastolicSum / recentHistory.length)
    };
  }

  static getBPMRisk(bpm: number, isFinalReading: boolean = false): RiskSegment {
    if (bpm <= 0) return { color: '#FFFFFF', label: '' };
    
    this.updateBPMHistory(bpm);

    // Si es lectura final, siempre calculamos el promedio
    if (isFinalReading) {
      const avgBPM = this.getAverageBPM();
      
      if (avgBPM > 0) {
        // Determinar el riesgo basado en el promedio
        if (avgBPM >= 140) {
          return { color: '#ea384c', label: 'TAQUICARDIA' };
        } else if (avgBPM >= 110) {
          return { color: '#F97316', label: 'LEVE TAQUICARDIA' };
        } else if (avgBPM >= 50) {
          return { color: '#FFFFFF', label: 'NORMAL' };
        } else if (avgBPM >= 40) {
          return { color: '#F97316', label: 'BRADICARDIA' };
        }
      }
      
      // Si no hay suficientes datos para calcular el promedio, usar el historial de segmentos
      if (this.bpmSegmentHistory.length > 0) {
        return this.getMostFrequentSegment(this.bpmSegmentHistory);
      }
    }

    // Procesamiento normal para lecturas en tiempo real
    let currentSegment: RiskSegment;

    if (this.isStableValue(this.bpmHistory, [140, 300])) {
      currentSegment = { color: '#ea384c', label: 'TAQUICARDIA' };
    } else if (this.isStableValue(this.bpmHistory, [110, 139])) {
      currentSegment = { color: '#F97316', label: 'LEVE TAQUICARDIA' };
    } else if (this.isStableValue(this.bpmHistory, [50, 110])) {
      currentSegment = { color: '#FFFFFF', label: 'NORMAL' };
    } else if (this.isStableValue(this.bpmHistory, [40, 49])) {
      currentSegment = { color: '#F97316', label: 'BRADICARDIA' };
    } else {
      currentSegment = { color: '#FFFFFF', label: 'EVALUANDO...' };
    }

    // Guardar el segmento actual para análisis final
    if (currentSegment.label !== 'EVALUANDO...') {
      this.bpmSegmentHistory.push(currentSegment);
    }

    return currentSegment;
  }

  static getSPO2Risk(spo2: number, isFinalReading: boolean = false): RiskSegment {
    if (spo2 <= 0) return { color: '#FFFFFF', label: '' };
    
    this.updateSPO2History(spo2);
    
    // Si es lectura final, siempre calculamos el promedio
    if (isFinalReading) {
      const avgSPO2 = this.getAverageSPO2();
      if (avgSPO2 > 0) {
        // Determinar el riesgo basado en el promedio
        if (avgSPO2 <= 90) {
          return { color: '#ea384c', label: 'INSUFICIENCIA RESPIRATORIA' };
        } else if (avgSPO2 <= 92) {
          return { color: '#F97316', label: 'LEVE INSUFICIENCIA RESPIRATORIA' };
        } else {
          return { color: '#0EA5E9', label: 'NORMAL' };
        }
      }
    }
    
    // Procesamiento normal para lecturas en tiempo real
    let currentSegment: RiskSegment;

    if (this.isStableValue(this.spo2History, [0, 90])) {
      currentSegment = { color: '#ea384c', label: 'INSUFICIENCIA RESPIRATORIA' };
    } else if (this.isStableValue(this.spo2History, [90, 92])) {
      currentSegment = { color: '#F97316', label: 'LEVE INSUFICIENCIA RESPIRATORIA' };
    } else if (this.isStableValue(this.spo2History, [93, 100])) {
      currentSegment = { color: '#0EA5E9', label: 'NORMAL' };
    } else {
      currentSegment = { color: '#FFFFFF', label: 'EVALUANDO...' };
    }
    
    return currentSegment;
  }

  static getBPRisk(pressure: string, isFinalReading: boolean = false): RiskSegment {
    if (pressure === "0/0" || pressure === "--/--") {
      return { color: '#FFFFFF', label: '' };
    }

    const [systolic, diastolic] = pressure.split('/').map(Number);
    if (!systolic || !diastolic) {
      return { color: '#FFFFFF', label: 'EVALUANDO...' };
    }

    this.updateBPHistory(systolic, diastolic);

    // Si es lectura final, siempre calculamos el promedio
    if (isFinalReading) {
      const avgBP = this.getAverageBP();
      
      if (avgBP.systolic > 0 && avgBP.diastolic > 0) {
        // Determinar el riesgo basado en el promedio
        if (avgBP.systolic >= 150 && avgBP.diastolic >= 100) {
          return { color: '#ea384c', label: 'PRESIÓN ALTA' };
        } else if (avgBP.systolic >= 140 && avgBP.diastolic >= 90) {
          return { color: '#F97316', label: 'LEVE PRESIÓN ALTA' };
        } else if (avgBP.systolic >= 114 && avgBP.systolic <= 126 && 
                 avgBP.diastolic >= 76 && avgBP.diastolic <= 84) {
          return { color: '#0EA5E9', label: 'PRESIÓN NORMAL' };
        } else if (avgBP.systolic >= 100 && avgBP.systolic <= 110 && 
                 avgBP.diastolic >= 60 && avgBP.diastolic <= 70) {
          return { color: '#F97316', label: 'LEVE PRESIÓN BAJA' };
        }
      }
      
      // Si no hay suficientes datos para calcular el promedio, usar el historial de segmentos
      if (this.bpSegmentHistory.length > 0) {
        return this.getMostFrequentSegment(this.bpSegmentHistory);
      }
    }

    // Procesamiento normal para lecturas en tiempo real
    let currentSegment: RiskSegment;

    if (this.isStableBP({ 
      systolic: [150, 300], 
      diastolic: [100, 200] 
    })) {
      currentSegment = { color: '#ea384c', label: 'PRESIÓN ALTA' };
    } else if (this.isStableBP({ 
      systolic: [140, 149], 
      diastolic: [90, 99] 
    })) {
      currentSegment = { color: '#F97316', label: 'LEVE PRESIÓN ALTA' };
    } else if (this.isStableBP({ 
      systolic: [114, 126],
      diastolic: [76, 84]
    })) {
      currentSegment = { color: '#0EA5E9', label: 'PRESIÓN NORMAL' };
    } else if (this.isStableBP({ 
      systolic: [100, 110], 
      diastolic: [60, 70] 
    })) {
      currentSegment = { color: '#F97316', label: 'LEVE PRESIÓN BAJA' };
    } else {
      currentSegment = { color: '#FFFFFF', label: 'EVALUANDO...' };
    }

    // Guardar el segmento actual para análisis final
    if (currentSegment.label !== 'EVALUANDO...') {
      this.bpSegmentHistory.push(currentSegment);
    }

    return currentSegment;
  }

  static resetHistory() {
    this.bpmHistory = [];
    this.spo2History = [];
    this.bpHistory = [];
    this.lastBPM = null;
    this.lastSystolic = null;
    this.lastDiastolic = null;
    this.bpmSegmentHistory = [];
    this.bpSegmentHistory = [];
    this.recentBpmValues = [];
    this.recentSpo2Values = [];
    this.recentSystolicValues = [];
    this.recentDiastolicValues = [];
  }
}
