// Declaraciones de tipos personalizadas para evitar errores de tipos faltantes

// Para estree
declare module 'estree' {
  export interface Node {}
}

// Para json-schema
declare module 'json-schema' {
  export interface JSONSchema {}
}

// Para phoenix
declare module 'phoenix' {
  export class Socket {}
  export class Channel {}
}

// Para ws
declare module 'ws' {
  export class WebSocket {}
} 