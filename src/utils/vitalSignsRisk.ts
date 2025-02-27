
interface RiskSegment {
  color: string;
  label: string;
}

interface StabilityCheck {
  value: number;
  timestamp: number;
}

export class VitalSignsRisk {
  private static readonly STABILITY_WINDOW = 6000; // 6 segundos
  private static bpmHistory: StabilityCheck[] = [];
  private static spo2History: StabilityCheck[] = [];

  static updateBPMHistory(value: number) {
    const now = Date.now();
    this.bpmHistory = [
      ...this.bpmHistory.filter(check => now - check.timestamp < this.STABILITY_WINDOW),
      { value, timestamp: now }
    ];
  }

  static updateSPO2History(value: number) {
    const now = Date.now();
    this.spo2History = [
      ...this.spo2History.filter(check => now - check.timestamp < this.STABILITY_WINDOW),
      { value, timestamp: now }
    ];
  }

  static isStableValue(history: StabilityCheck[], range: [number, number]): boolean {
    if (history.length < 3) return false;
    
    const stableChecks = history.filter(check => 
      check.value >= range[0] && check.value <= range[1]
    );

    return stableChecks.length >= Math.ceil(history.length * 0.75); // 75% de las lecturas en el rango
  }

  static getBPMRisk(bpm: number): RiskSegment {
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
    this.updateSPO2History(spo2);

    if (this.isStableValue(this.spo2History, [0, 90])) {
      return { color: '#ea384c', label: 'INSUFICIENCIA RESPIRATORIA' };
    }
    if (this.isStableValue(this.spo2History, [90, 92])) {
      return { color: '#F97316', label: 'LEVE INSUFICIENCIA RESPIRATORIA' };
    }
    
    return { color: '#FFFFFF', label: 'NORMAL' };
  }

  static resetHistory() {
    this.bpmHistory = [];
    this.spo2History = [];
  }
}
