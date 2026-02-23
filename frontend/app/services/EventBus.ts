// frontend/app/services/EventBus.ts

import { GlobalEvent } from './types';

type Subscriber = (event: GlobalEvent) => void;

/**
 * @class EventBus
 * @description
 * Un simple pero robusto bus de eventos global basado en el patrón Pub/Sub.
 * Es un singleton que actúa como el sistema nervioso central para la comunicación
 * desacoplada entre los diferentes módulos de la aplicación.
 */
class EventBus {
  private static instance: EventBus;
  private subscribers: Map<string, Subscriber> = new Map();

  private constructor() {}

  public static getInstance(): EventBus {
    if (!EventBus.instance) {
      EventBus.instance = new EventBus();
    }
    return EventBus.instance;
  }

  /**
   * Suscribe un callback a todos los eventos del bus.
   * @param id - Un ID único para el suscriptor, para poder desuscribirse.
   * @param callback - La función a llamar cuando se publica un evento.
   */
  public subscribe(id: string, callback: Subscriber): void {
    this.subscribers.set(id, callback);
  }

  /**
   * Desuscribe un callback del bus.
   * @param id - El ID único del suscriptor a eliminar.
   */
  public unsubscribe(id: string): void {
    this.subscribers.delete(id);
  }

  /**
   * Publica un evento a todos los suscriptores.
   * @param event - El evento a publicar.
   */
  public publish(event: Omit<GlobalEvent, 'timestamp'>): void {
    const completeEvent: GlobalEvent = { ...event, timestamp: Date.now() };
    this.subscribers.forEach(callback => {
      try {
        callback(completeEvent);
      } catch (error) {
        console.error(`[EventBus] Error en un suscriptor al procesar el evento ${completeEvent.type}:`, error);
      }
    });
  }
}

export const globalEventBus = EventBus.getInstance();
