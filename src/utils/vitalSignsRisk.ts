
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
  private static readonly STABILITY_WINDOW = 6000; // 6 segundos
  private static readonly MEASUREMENT_WINDOW = 40000; // 40 segundos para análisis final
  private static readonly SMOOTHING_FACTOR = 0.25; // Factor de suavizado (25%)
  
  private static bpmHistory: StabilityCheck[] = [];
  private static spo2History: StabilityCheck[] = [];
  private static bpHistory: BPCheck[] = [];
  
  private static lastBPM: number | null = null;
  private static lastSystolic: number | null = null;
  private static lastDiastolic: number | null = null;
  
  private static bpmSegmentHistory: RiskSegment[] = [];
  private static bpSegmentHistory: RiskSegment[] = [];

  static smoothValue(newValue: number, lastValue: number | null): number {
    if (lastValue === null) return newValue;
    return lastValue + this.SMOOTHING_FACTOR * (newValue - lastValue);
  }

  static updateBPMHistory(value: number) {
    const smoothedValue = this.smoothValue(value, this.lastBPM);
    this.lastBPM = smoothedValue;
    
    const now = Date.now();
    this.bpmHistory = this.bpmHistory.filter(check => now - check.timestamp < this.MEASUREMENT_WINDOW);
    this.bpmHistory.push({ value: smoothedValue, timestamp: now });
  }

  static updateSPO2History(value: number) {
    const now = Date.now();
    this.spo2History = this.spo2History.filter(check => now - check.timestamp < this.MEASUREMENT_WINDOW);
    this.spo2History.push({ value, timestamp: now });
  }

  static updateBPHistory(systolic: number, diastolic: number) {
    const smoothedSystolic = this.smoothValue(systolic, this.lastSystolic);
    const smoothedDiastolic = this.smoothValue(diastolic, this.lastDiastolic);
    
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

    return stableChecks.length >= Math.ceil(recentHistory.length * 0.75);
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

    return stableChecks.length >= Math.ceil(recentHistory.length * 0.75);
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

  static getBPMRisk(bpm: number, isFinalReading: boolean = false): RiskSegment {
    if (bpm === 0) return { color: '#FFFFFF', label: '' };
    
    this.updateBPMHistory(bpm);

    let currentSegment: RiskSegment;

    if (this.isStableValue(this.bpmHistory, [140, 300])) {
      currentSegment = { color: '#ea384c', label: 'ALTA TAQUICARDIA' };
    } else if (this.isStableValue(this.bpmHistory, [100, 139])) {
      currentSegment = { color: '#F97316', label: 'TAQUICARDIA' };
    } else if (this.isStableValue(this.bpmHistory, [50, 89])) {
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

    if (isFinalReading && currentSegment.label === 'EVALUANDO...') {
      return this.getMostFrequentSegment(this.bpmSegmentHistory);
    }

    return currentSegment;
  }

  static getSPO2Risk(spo2: number): RiskSegment {
    if (spo2 === 0) return { color: '#FFFFFF', label: '' };
    
    this.updateSPO2History(spo2);

    if (this.isStableValue(this.spo2History, [0, 90])) {
      return { color: '#ea384c', label: 'INSUFICIENCIA RESPIRATORIA' };
    }
    if (this.isStableValue(this.spo2History, [90, 92])) {
      return { color: '#F97316', label: 'LEVE INSUFICIENCIA RESPIRATORIA' };
    }
    if (this.isStableValue(this.spo2History, [93, 100])) {
      return { color: '#FFFFFF', label: 'NORMAL' };
    }
    
    return { color: '#FFFFFF', label: 'EVALUANDO...' };
  }

  static getBPRisk(pressure: string, isFinalReading: boolean = false): RiskSegment {
    if (pressure === "0/0") {
      return { color: '#FFFFFF', label: '' };
    }
    
    if (pressure === "--/--") {
      return { color: '#FFFFFF', label: 'EVALUANDO...' };
    }

    const [systolic, diastolic] = pressure.split('/').map(Number);
    if (!systolic || !diastolic) {
      return { color: '#FFFFFF', label: 'EVALUANDO...' };
    }

    this.updateBPHistory(systolic, diastolic);

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
      currentSegment = { color: '#FFFFFF', label: 'PRESIÓN NORMAL' };
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

    if (isFinalReading && currentSegment.label === 'EVALUANDO...') {
      return this.getMostFrequentSegment(this.bpSegmentHistory);
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
  }
}
