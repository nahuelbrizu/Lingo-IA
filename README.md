# Arquitectura del Motor Conversacional en Tiempo Real

Este documento detalla la arquitectura del sistema de conversación multi-sesión, diseñado para ser robusto, escalable y performante. La arquitectura se basa en principios de sistemas event-driven, máquinas de estado finitas y gestión de concurrencia para manejar interacciones de voz complejas en tiempo real.

## 1. Principios de Diseño

- **Separación de Responsabilidades (SRP):** Cada módulo tiene una única y bien definida responsabilidad (ej. transporte de red, captura de audio, lógica de estado).
- **Inmutabilidad y Flujo de Datos Unidireccional:** La lógica de estado es manejada por un reducer puro (FSM) que no tiene efectos secundarios. El estado fluye en una sola dirección: `Evento → FSM → Comando → Efecto Secundario`.
- **Aislamiento de Sesiones:** Cada conversación es una unidad aislada con su propio estado. La interferencia entre sesiones (cross-talk) es prevenida a nivel de arquitectura.
- **Cancelación Explícita:** Todos los flujos de trabajo asíncronos (streaming de LLM, TTS) son cancelables mediante un `generationId`, lo que permite interrupciones de baja latencia (barge-in).
- **Gestión Centralizada de Recursos:** Los recursos de hardware compartidos (micrófono, altavoces) son gestionados por singletons globales con contadores de referencia para un uso eficiente.

## 2. Diagrama de Arquitectura Conceptual

```plaintext
                   +--------------------------------+
                   |           UI Layer             |
                   | (React Components/Hooks)       |
                   +--------------------------------+
                                  ^
                                  | (State Updates, Events)
                                  v
+-------------------------------------------------------------------------+
|                         Event Bus (Global)                              |
+-------------------------------------------------------------------------+
       ^                                      |
       | (Events from Services)               | (Events to Session Manager)
       |                                      v
+-------------------------------------------------------------------------+
|                          SessionManager (Singleton)                     |
|-------------------------------------------------------------------------|
| - Registry: Map<sessionId, SessionInstance>                             |
| - Factory: createSession() / destroySession()                           |
| - Router: Enruta eventos a la sesión correcta                           |
| - Focus Control: Gestiona activeListeningSessionId                      |
+-------------------------------------------------------------------------+
                                  |
                                  | (Dispatches events to a specific instance)
                                  v
+-------------------------------------------------------------------------+
|                           SessionInstance                               |
|-------------------------------------------------------------------------|
| - Orchestrator (Maneja efectos secundarios)                             |
| - FSM (Reducer puro, calcula el siguiente estado y comandos)            |
| - State (chatHistory, activeGenerationId, tombstone)                    |
+-------------------------------------------------------------------------+
       ^                         ^                         ^
       | (Commands)              | (Audio Chunks)          | (TTS Audio Chunks)
       v                         v                         v
+------------------+     +------------------+     +-----------------------+
| WebSocketService |     | AudioInputManager|     | AudioOutputManager    |
| (1 por Sesión)   |     | (Singleton)      |     | (Singleton)           |
+------------------+     +------------------+     +-----------------------+
```

## 3. Componentes Clave

### 3.1. Singletons Globales (`/app/services`)

- **`EventBus`:** Un bus de eventos Pub/Sub simple que actúa como el sistema nervioso central para la comunicación desacoplada.
- **`AudioInputManager`:** Gestiona el acceso al micrófono. Utiliza un **contador de referencias** para iniciar `getUserMedia` solo cuando la primera sesión lo necesita y detenerlo cuando la última sesión termina. Despacha chunks de audio directamente a las sesiones suscritas para máxima eficiencia.
- **`AudioOutputManager`:** Gestiona el `AudioContext` y la reproducción de audio. Implementa un **lock por `sessionId`** para prevenir que el audio de múltiples sesiones se mezcle. Incluye un **watchdog timer** para liberar el lock si la reproducción se atasca, previniendo deadlocks.

### 3.2. Arquitectura de Sesión (`/app/hooks/useConversation`)

- **`SessionManager`:** El orquestador de la concurrencia.
  - **Registry/Factory:** Crea, registra y destruye `SessionInstance`.
  - **Router:** Escucha el `EventBus` global y enruta cada evento a la `SessionInstance` correspondiente basándose en el `sessionId`.
  - **Focus Manager:** Controla qué sesión tiene el "foco de escucha" (`activeListeningSessionId`) para garantizar que solo una sesión procese activamente el audio del micrófono a la vez.
  - **Garbage Collector:** Implementa un `setInterval` para destruir automáticamente las sesiones que han estado inactivas por más de un umbral definido, previniendo fugas de memoria.

- **`SessionInstance`:** Encapsula todo lo relacionado con una única conversación.
  - **`SessionOrchestrator`:** El "cerebro" de la sesión.
    - Recibe eventos del `SessionManager`.
    - Pasa el estado actual y el evento al `fsmReducer`.
    - Ejecuta los `Commands` devueltos por la FSM, interactuando con los servicios (TTS, LLM, etc.).
    - Gestiona el `activeGenerationId` y el `tombstone` set para la cancelación.
  - **`FSM` (Reducer Puro):** Una función pura `(state, event) => ({ newState, commands })`. No tiene efectos secundarios. Su única responsabilidad es calcular el siguiente estado y la lista de acciones a realizar. Esto la hace extremadamente predecible y fácil de testear unitariamente.

### 3.3. El Mecanismo `generationId`

El `generationId` es la piedra angular para prevenir race conditions en un entorno de streaming.

1.  **Creación:** Se crea un `generationId` único en el `Orchestrator` en el momento en que se inicia una nueva respuesta de IA (después de que el usuario termina de hablar).
2.  **Propagación:** El `generationId` se propaga a través de toda la cadena de procesamiento: `LLMService` → `TTSService` → `AudioOutputManager`.
3.  **Invalidación (Barge-in):** Cuando el usuario interrumpe, el `Orchestrator` establece inmediatamente su `activeGenerationId` a `null` y añade el ID cancelado a un `tombstone` set.
4.  **Validación:** Todos los servicios y el `Orchestrator` validan los eventos entrantes. Si un evento llega con un `generationId` que no coincide con el `activeGenerationId`, es un "evento fantasma" de una generación anterior y se descarta de forma segura.

## 4. Testing

La validación de esta arquitectura se basa en un "Test Harness" de grado de producción (`/app/hooks/useConversation/__tests__/harness`).

- **Tests de Aislamiento y Fugas (`Isolation.test.ts`):** Verifica que el `SessionManager` limpia correctamente los recursos y que no hay "cross-talk" entre sesiones. Simula ciclos masivos de creación/destrucción para asegurar que los contadores de referencias y las desuscripciones funcionen.
- **Fuzz Testing (`Fuzz.test.ts`):** Un motor de fuzzing "state-aware" ejecuta miles de secuencias de eventos aleatorios y corruptos contra el `Orchestrator`. Después de cada evento, un **`InvariantChecker`** valida que el estado interno del sistema no se haya corrompido. Si se detecta una violación, el test falla con la secuencia exacta de eventos para una reproducción determinista.
- **Tests de Performance (`BargeIn.perf.test.ts`):** Un test automatizado mide la latencia de "barge-in" desde la detección de voz hasta la parada del audio. Calcula métricas como el promedio y el **percentil 95 (p95)** y falla el pipeline de CI/CD si no se cumple el Objetivo de Nivel de Servicio (SLO) definido (ej. p95 < 100ms).

Este enfoque de testing en múltiples capas garantiza la robustez, consistencia y performance del sistema bajo condiciones adversas.
# audioProject
