
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
  private static readonly STABILITY_WINDOW = 3000; // 3 segundos para mostrar un estado estable
  private static readonly MEASUREMENT_WINDOW = 40000; // 40 segundos para análisis final
  private static readonly SMOOTHING_FACTOR = 0.15;
  
  // Factores de suavizado
  private static readonly BPM_SMOOTHING_ALPHA = 0.15;
  private static readonly SPO2_SMOOTHING_ALPHA = 0.15;
  private static readonly BP_SMOOTHING_ALPHA = 0.03; // Reducido de 0.05 a 0.03 para menos suavizado
  
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
  private static lastSPO2: number | null = null;
  private static lastSystolic: number | null = null;
  private static lastDiastolic: number | null = null;
  
  private static bpmSegmentHistory: RiskSegment[] = [];
  private static spo2SegmentHistory: RiskSegment[] = [];
  private static bpSegmentHistory: RiskSegment[] = [];

  // Método de suavizado
  static smoothValue(newValue: number, lastValue: number | null, alpha: number = this.SMOOTHING_FACTOR): number {
    if (lastValue === null) return newValue;
    return lastValue + alpha * (newValue - lastValue);
  }

  // Filtro de mediana para eliminar valores atípicos
  private static medianFilter(values: number[]): number {
    if (values.length === 0) return 0;
    if (values.length === 1) return values[0];
    
    const sortedValues = [...values].sort((a, b) => a - b);
    
    const middle = Math.floor(sortedValues.length / 2);
    if (sortedValues.length % 2 === 0) {
      return (sortedValues[middle - 1] + sortedValues[middle]) / 2;
    } else {
      return sortedValues[middle];
    }
  }

  static updateBPMHistory(value: number) {
    if (value <= 0) return; // No registrar valores inválidos
    
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
    
    // Log para depuración
    console.log("VitalSignsRisk - Actualizado BPM History:", {
      rawValue: value,
      smoothedValue,
      historyLength: this.bpmHistory.length,
      timestamp: new Date().toISOString()
    });
  }

  static updateSPO2History(value: number) {
    if (value <= 0) return; // No registrar valores inválidos
    
    // Añadir al buffer de EWMA - SIN FORZAR VALORES
    this.recentSpo2Values.push(value);
    if (this.recentSpo2Values.length > this.EWMA_WINDOW_SIZE) {
      this.recentSpo2Values.shift();
    }
    
    // Aplicar filtro de mediana para eliminar valores atípicos
    const filteredValue = this.medianFilter(this.recentSpo2Values);
    
    // Aplicar EWMA
    const smoothedValue = this.smoothValue(filteredValue, this.lastSPO2, this.SPO2_SMOOTHING_ALPHA);
    this.lastSPO2 = smoothedValue;
    
    const now = Date.now();
    this.spo2History = this.spo2History.filter(check => now - check.timestamp < this.MEASUREMENT_WINDOW);
    this.spo2History.push({ value: smoothedValue, timestamp: now });
    
    // Log para depuración
    console.log("VitalSignsRisk - Actualizado SPO2 History:", {
      rawValue: value,
      smoothedValue,
      historyLength: this.spo2History.length,
      timestamp: new Date().toISOString()
    });
  }

  static updateBPHistory(systolic: number, diastolic: number) {
    if (systolic <= 0 || diastolic <= 0) return; // No registrar valores inválidos
    
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
    
    // Log para depuración
    console.log("VitalSignsRisk - Actualizado BP History:", {
      rawSystolic: systolic,
      rawDiastolic: diastolic,
      smoothedSystolic,
      smoothedDiastolic,
      historyLength: this.bpHistory.length,
      timestamp: new Date().toISOString()
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

    return stableChecks.length >= Math.ceil(recentHistory.length * 0.7);
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

    return stableChecks.length >= Math.ceil(recentHistory.length * 0.7);
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
  static getAverageBPM(): number {
    if (this.bpmHistory.length === 0) return 0;
    
    // Usar todo el historial de datos para el promedio final
    const validReadings = this.bpmHistory.filter(check => check.value > 0);
    
    if (validReadings.length === 0) return 0;
    
    const sum = validReadings.reduce((total, check) => total + check.value, 0);
    const avg = Math.round(sum / validReadings.length);
    
    // Log para depuración
    console.log("VitalSignsRisk - Calculado promedio BPM:", {
      average: avg,
      totalSamples: validReadings.length,
      timestamp: new Date().toISOString()
    });
    
    return avg;
  }

  // Función para calcular el promedio del historial de SpO2
  static getAverageSPO2(): number {
    if (this.spo2History.length === 0) return 0;
    
    // Usar todo el historial de datos para el promedio final
    const validReadings = this.spo2History.filter(check => check.value > 0);
    
    if (validReadings.length === 0) return 0;
    
    const sum = validReadings.reduce((total, check) => total + check.value, 0);
    const avg = Math.round(sum / validReadings.length);
    
    // Log para depuración
    console.log("VitalSignsRisk - Calculado promedio SPO2:", {
      average: avg,
      totalSamples: validReadings.length,
      timestamp: new Date().toISOString()
    });
    
    return avg;
  }

  // Función para calcular el promedio del historial de presión arterial
  static getAverageBP(): { systolic: number, diastolic: number } {
    if (this.bpHistory.length === 0) return { systolic: 0, diastolic: 0 };
    
    // Usar todo el historial de datos para el promedio final
    const validReadings = this.bpHistory.filter(check => check.systolic > 0 && check.diastolic > 0);
    
    if (validReadings.length === 0) return { systolic: 0, diastolic: 0 };
    
    const systolicSum = validReadings.reduce((total, check) => total + check.systolic, 0);
    const diastolicSum = validReadings.reduce((total, check) => total + check.diastolic, 0);
    
    const avgResult = {
      systolic: Math.round(systolicSum / validReadings.length),
      diastolic: Math.round(diastolicSum / validReadings.length)
    };
    
    // Log para depuración
    console.log("VitalSignsRisk - Calculado promedio BP:", {
      average: `${avgResult.systolic}/${avgResult.diastolic}`,
      totalSamples: validReadings.length,
      timestamp: new Date().toISOString()
    });
    
    return avgResult;
  }

  static getBPMRisk(bpm: number, isFinalReading: boolean = false): RiskSegment {
    if (bpm <= 0) return { color: '#FFFFFF', label: '' };
    
    this.updateBPMHistory(bpm);

    // Si es lectura final, siempre calculamos el promedio
    if (isFinalReading) {
      const avgBPM = this.getAverageBPM();
      
      if (avgBPM > 0) {
        // Mostrar valor real y categorizar para colores de visualización
        if (avgBPM >= 140) {
          return { color: '#ea384c', label: 'TAQUICARDIA' };
        } else if (avgBPM >= 110) {
          return { color: '#F97316', label: 'LEVE TAQUICARDIA' };
        } else if (avgBPM >= 50) {
          return { color: '#0EA5E9', label: 'NORMAL' }; // Cambiado a azul (era #FFFFFF)
        } else if (avgBPM >= 40) {
          return { color: '#F97316', label: 'BRADICARDIA' };
        } else {
          // Para valores extremadamente bajos que antes no se mostraban
          return { color: '#ea384c', label: 'BRADICARDIA SEVERA' };
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
      currentSegment = { color: '#0EA5E9', label: 'NORMAL' }; // Cambiado a azul (era #FFFFFF)
    } else if (this.isStableValue(this.bpmHistory, [40, 49])) {
      currentSegment = { color: '#F97316', label: 'BRADICARDIA' };
    } else if (this.isStableValue(this.bpmHistory, [0, 39])) {
      currentSegment = { color: '#ea384c', label: 'BRADICARDIA SEVERA' };
    } else if (this.isStableValue(this.bpmHistory, [301, 999])) {
      currentSegment = { color: '#ea384c', label: 'TAQUICARDIA SEVERA' };
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
      console.log("Cálculo final de SpO2:", { avgSPO2, isFinalReading });
      
      if (avgSPO2 > 0) {
        // Determinar el riesgo basado en el promedio
        if (avgSPO2 <= 90) {
          return { color: '#ea384c', label: 'INSUFICIENCIA RESPIRATORIA' };
        } else if (avgSPO2 <= 92) {
          return { color: '#F97316', label: 'LEVE INSUFICIENCIA RESPIRATORIA' };
        } else if (avgSPO2 <= 100) {
          return { color: '#0EA5E9', label: 'NORMAL' };
        } else {
          // Valores por encima de 100 (que normalmente no existen en SpO2 real)
          return { color: '#FFFFFF', label: 'VALOR FUERA DE RANGO' };
        }
      }
      
      // Si no hay suficientes datos para calcular el promedio, usar el historial de segmentos
      if (this.spo2SegmentHistory.length > 0) {
        return this.getMostFrequentSegment(this.spo2SegmentHistory);
      }
    }
    
    // RESTAURADO: Comportamiento original para tiempo real con rangos extendidos
    let currentSegment: RiskSegment;
    
    // Comprobar la estabilidad de la señal
    const isStable = 
      this.isStableValue(this.spo2History, [0, 90]) || 
      this.isStableValue(this.spo2History, [90, 92]) || 
      this.isStableValue(this.spo2History, [93, 100]) ||
      this.isStableValue(this.spo2History, [101, 999]);
    
    // Si hay pocos valores o la señal es inestable, mostrar "EVALUANDO..."
    if (this.spo2History.length < 5 || !isStable) {
      currentSegment = { color: '#FFFFFF', label: 'EVALUANDO...' };
      console.log("SpO2 inestable o insuficientes datos:", {
        historyLength: this.spo2History.length,
        isStable,
        status: 'EVALUANDO'
      });
    } 
    // Si la señal es estable, determinar el nivel de riesgo
    else {
      if (this.isStableValue(this.spo2History, [0, 90])) {
        currentSegment = { color: '#ea384c', label: 'INSUFICIENCIA RESPIRATORIA' };
      } else if (this.isStableValue(this.spo2History, [90, 92])) {
        currentSegment = { color: '#F97316', label: 'LEVE INSUFICIENCIA RESPIRATORIA' };
      } else if (this.isStableValue(this.spo2History, [93, 100])) {
        currentSegment = { color: '#0EA5E9', label: 'NORMAL' };
      } else if (this.isStableValue(this.spo2History, [101, 999])) {
        currentSegment = { color: '#FFFFFF', label: 'VALOR FUERA DE RANGO' };
      } else {
        // Esto no debería ocurrir dado el chequeo de isStable previo
        currentSegment = { color: '#FFFFFF', label: 'EVALUANDO...' };
      }
      
      console.log("SpO2 estable:", {
        valor: spo2,
        estado: currentSegment.label
      });
    }
    
    // Guardar el segmento actual para análisis final solo si no es "EVALUANDO..."
    if (currentSegment.label !== 'EVALUANDO...') {
      this.spo2SegmentHistory.push(currentSegment);
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
        // Determinar categoría para mostrar colores - sin limitar valores
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
        } else if (avgBP.systolic < 100 || avgBP.diastolic < 60) {
          return { color: '#ea384c', label: 'PRESIÓN BAJA' };
        } else if (avgBP.systolic > 180 || avgBP.diastolic > 120) {
          return { color: '#ea384c', label: 'PRESIÓN MUY ALTA' };
        } else {
          // Valores que no entran en categorías estándar
          return { color: '#FFFFFF', label: 'PRESIÓN ATÍPICA' };
        }
      }
      
      // Si no hay suficientes datos para calcular el promedio, usar el historial de segmentos
      if (this.bpSegmentHistory.length > 0) {
        return this.getMostFrequentSegment(this.bpSegmentHistory);
      }
    }

    // Procesamiento normal para lecturas en tiempo real - con rangos expandidos
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
    } else if (this.isStableBP({ 
      systolic: [0, 99], 
      diastolic: [0, 59] 
    })) {
      currentSegment = { color: '#ea384c', label: 'PRESIÓN BAJA' };
    } else if (this.isStableBP({ 
      systolic: [301, 999], 
      diastolic: [201, 999] 
    })) {
      currentSegment = { color: '#ea384c', label: 'PRESIÓN EXTREMADAMENTE ALTA' };
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
    console.log("VitalSignsRisk - Reseteando todo el historial");
    this.bpmHistory = [];
    this.spo2History = [];
    this.bpHistory = [];
    this.lastBPM = null;
    this.lastSPO2 = null;
    this.lastSystolic = null;
    this.lastDiastolic = null;
    this.bpmSegmentHistory = [];
    this.spo2SegmentHistory = [];
    this.bpSegmentHistory = [];
    this.recentBpmValues = [];
    this.recentSpo2Values = [];
    this.recentSystolicValues = [];
    this.recentDiastolicValues = [];
  }
}
