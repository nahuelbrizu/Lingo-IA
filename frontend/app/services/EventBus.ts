// frontend/app/services/EventBus.ts

import { GlobalEvent } from './types';

type Subscriber = (event: GlobalEvent) => void;

/**
 * @class EventBus
 * @description
 * Un robusto bus de eventos global basado en el patrón Pub/Sub.
 * Optimizado para manejar suscripciones por tipo específico y wildcards.
 * Actúa como el sistema nervioso central desacoplado de la aplicación.
 */
class EventBus {
  private static instance: EventBus;
  
  // Suscriptores por tipo de evento específico: Map<EventType, Map<SubscriberID, Callback>>
  private typeSubscribers: Map<string, Map<string, Subscriber>> = new Map();
  
  // Suscriptores globales (wildcards) que escuchan TODO
  private wildcardSubscribers: Map<string, Subscriber> = new Map();

  private constructor() {}

  public static getInstance(): EventBus {
    if (!EventBus.instance) {
      EventBus.instance = new EventBus();
    }
    return EventBus.instance;
  }

  /**
   * Suscribe un callback a UN tipo de evento específico. (Más eficiente)
   * @param type - El tipo de evento (ej: 'VAD_SPEECH_DETECTED')
   * @param id - Un ID único para el suscriptor.
   * @param callback - La función a llamar.
   */
  public subscribeTo(type: string, id: string, callback: Subscriber): void {
    if (!this.typeSubscribers.has(type)) {
      this.typeSubscribers.set(type, new Map());
    }
    this.typeSubscribers.get(type)!.set(id, callback);
  }

  /**
   * Suscribe un callback a TODOS los eventos del bus. (Wildcard)
   * @param id - Un ID único para el suscriptor.
   * @param callback - La función a llamar.
   */
  public subscribe(id: string, callback: Subscriber): void {
    this.wildcardSubscribers.set(id, callback);
  }

  /**
   * Elimina una suscripción.
   * @param id - El ID único del suscriptor a eliminar.
   * @param type - (Opcional) El tipo específico de donde eliminarlo. Si no se provee, busca en wildcards.
   */
  public unsubscribe(id: string, type?: string): void {
    if (type) {
      this.typeSubscribers.get(type)?.delete(id);
    } else {
      this.wildcardSubscribers.delete(id);
      // Búsqueda exhaustiva en tipos por si acaso no se especificó el tipo
      this.typeSubscribers.forEach(subs => subs.delete(id));
    }
  }

  /**
   * Publica un evento a los suscriptores interesados.
   * @param event - El evento a publicar (sin timestamp).
   */
  public publish(event: Omit<GlobalEvent, 'timestamp'>): void {
    const completeEvent: GlobalEvent = { ...event, timestamp: Date.now() };

    // 1. Notificar a suscriptores de este tipo específico (O(1) lookup)
    const specificSubs = this.typeSubscribers.get(completeEvent.type);
    if (specificSubs) {
      specificSubs.forEach(callback => this.safeInvoke(callback, completeEvent));
    }

    // 2. Notificar a suscriptores wildcard
    this.wildcardSubscribers.forEach(callback => this.safeInvoke(callback, completeEvent));
  }

  /**
   * Ejecuta el callback capturando errores para no interrumpir el bus.
   */
  private safeInvoke(callback: Subscriber, event: GlobalEvent): void {
    try {
      callback(event);
    } catch (error) {
      console.error(`[EventBus] Error crítico en suscriptor al procesar [${event.type}]:`, error);
      // Aquí podríamos integrar un reporte a Sentry o similar
    }
  }

  /**
   * Limpia todos los suscriptores. Útil para HMR o Testing.
   */
  public clearAll(): void {
    this.typeSubscribers.clear();
    this.wildcardSubscribers.clear();
  }
}

export const globalEventBus = EventBus.getInstance();
