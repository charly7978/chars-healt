
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

export class VitalSignsRisk {
  private static readonly STABILITY_WINDOW = 6000; // 6 segundos
  private static bpmHistory: StabilityCheck[] = [];
  private static spo2History: StabilityCheck[] = [];
  private static bpHistory: BPCheck[] = [];

  static updateBPMHistory(value: number) {
    const now = Date.now();
    this.bpmHistory = this.bpmHistory.filter(check => now - check.timestamp < this.STABILITY_WINDOW);
    this.bpmHistory.push({ value, timestamp: now });
  }

  static updateSPO2History(value: number) {
    const now = Date.now();
    this.spo2History = this.spo2History.filter(check => now - check.timestamp < this.STABILITY_WINDOW);
    this.spo2History.push({ value, timestamp: now });
  }

  static updateBPHistory(systolic: number, diastolic: number) {
    const now = Date.now();
    this.bpHistory = this.bpHistory.filter(check => now - check.timestamp < this.STABILITY_WINDOW);
    this.bpHistory.push({ systolic, diastolic, timestamp: now, value: systolic });
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

  static getBPMRisk(bpm: number): RiskSegment {
    if (bpm === 0) return { color: '#FFFFFF', label: '' };
    
    this.updateBPMHistory(bpm);

    if (this.isStableValue(this.bpmHistory, [140, 300])) {
      return { color: '#ea384c', label: 'ALTA TAQUICARDIA' };
    }
    if (this.isStableValue(this.bpmHistory, [100, 139])) {
      return { color: '#F97316', label: 'TAQUICARDIA' };
    }
    if (this.isStableValue(this.bpmHistory, [50, 89])) {
      return { color: '#FFFFFF', label: 'NORMAL' };
    }
    if (this.isStableValue(this.bpmHistory, [40, 49])) {
      return { color: '#F97316', label: 'BRADICARDIA' };
    }
    
    return { color: '#FFFFFF', label: 'EVALUANDO...' };
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

  static getBPRisk(pressure: string): RiskSegment {
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

    // Presión alta
    if (this.isStableBP({ 
      systolic: [150, 300], 
      diastolic: [100, 200] 
    })) {
      return { color: '#ea384c', label: 'PRESIÓN ALTA' };
    }

    // Leve presión alta
    if (this.isStableBP({ 
      systolic: [140, 149], 
      diastolic: [90, 99] 
    })) {
      return { color: '#F97316', label: 'LEVE PRESIÓN ALTA' };
    }

    // Presión normal (120/80 ±5%)
    if (this.isStableBP({ 
      systolic: [114, 126], // 120 ±5%
      diastolic: [76, 84]   // 80 ±5%
    })) {
      return { color: '#FFFFFF', label: 'PRESIÓN NORMAL' };
    }

    // Leve presión baja
    if (this.isStableBP({ 
      systolic: [100, 110], 
      diastolic: [60, 70] 
    })) {
      return { color: '#F97316', label: 'LEVE PRESIÓN BAJA' };
    }

    return { color: '#FFFFFF', label: 'EVALUANDO...' };
  }

  static resetHistory() {
    this.bpmHistory = [];
    this.spo2History = [];
    this.bpHistory = [];
  }
}
