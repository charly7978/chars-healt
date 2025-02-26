
# 🔄 Arquitectura del Sistema

## 📱 Componentes Centrales 

### 1. `src/App.tsx` - Núcleo de la Aplicación
- 🎯 Punto de entrada principal
- 🛣️ Configuración del router
- 📄 Renderizado de páginas (Index, NotFound)
- 🔔 Sistema de notificaciones (Toaster)

### 2. `src/pages/Index.js` - Orquestador Principal
- 🎭 Gestiona componentes principales:
  - 📸 CameraView
  - 📊 PPGSignalMeter
  - 💓 VitalSign
- 🎯 Integra hooks esenciales:
  - useSignalProcessor
  - useHeartBeatProcessor
  - useVitalSignsProcessor

### 3. 🪝 Hooks Fundamentales
```typescript
useSignalProcessor    → Procesamiento de señales raw
useHeartBeatProcessor → Análisis de latidos
useVitalSignsProcessor → Cálculo de métricas vitales
```

### 4. ⚙️ Procesadores Core
```typescript
PPGSignalProcessor.js   → Señales fotopletismográficas
HeartBeatProcessor.js   → Análisis de latidos
VitalSignsProcessor.js  → Cálculo de métricas
```

## 🔄 Flujo de Datos
```
📸 Cámara (CameraView) 
  ↓
📡 useSignalProcessor 
  ↓
🔄 PPGSignalProcessor 
  ↓
💓 useHeartBeatProcessor/useVitalSignsProcessor
  ↓
⚡ HeartBeatProcessor/VitalSignsProcessor
  ↓
📊 UI Components (PPGSignalMeter, VitalSign)
```

## 🎯 Características Clave
- Arquitectura modular
- Responsabilidades bien definidas
- Flujo de datos optimizado
- Procesamiento en tiempo real
