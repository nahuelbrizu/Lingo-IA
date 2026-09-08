// backend/src/utils/progress.ts

/**
 * Combina dos listas de strings sin duplicados (comparación case-insensitive,
 * se queda con la grafía de la primera aparición). Puramente aditivo: nunca
 * saca nada de `existing`, solo agrega lo nuevo de `incoming` que no esté ya
 * cubierto. Ni el orden de los argumentos ni el LLM que generó `incoming`
 * tienen forma de hacer desaparecer algo que ya estaba — el código es la
 * única fuente de verdad del merge.
 */
export function mergeUnique(existing: string[], incoming: string[]): string[] {
  const merged: string[] = [];
  const seen = new Set<string>();
  for (const item of [...existing, ...incoming]) {
    const key = item.toLowerCase();
    if (!seen.has(key)) {
      seen.add(key);
      merged.push(item);
    }
  }
  return merged;
}

export interface AnalyticSnapshot {
  masteredTopics: string[];
  commonMistakes: string[];
}

/**
 * Tope por lista para que el perfil del alumno (que se reinyecta entero en
 * el system prompt de CADA turno, ver buildProfileSnippet) no crezca sin
 * límite a lo largo de meses de uso — eso encarecería cada llamada a Claude
 * para siempre. Al ser aditivo puro (mergeUnique nunca borra), hace falta
 * este corte en algún lado; se recorta acá, en el único lugar donde se
 * decide qué queda persistido, no donde se arma el prompt.
 */
export const MAX_ITEMS_PER_LIST = 15;

/** Se queda con los últimos `max` elementos (los agregados más recientemente). */
function capToRecent(items: string[], max: number): string[] {
  return items.length > max ? items.slice(items.length - max) : items;
}

/**
 * Aplica lo nuevo detectado en una sesión (en vivo o en el resumen de
 * cierre) sobre el estado ya guardado en la DB. Ver `mergeUnique`: nunca
 * saca algo por omisión del modelo; el único recorte posible es el cap de
 * arriba, aplicado siempre por antigüedad, nunca por decisión del LLM.
 */
export function mergeAnalyticProgress(
  existing: AnalyticSnapshot,
  newMasteredTopics: string[],
  newCommonMistakes: string[]
): AnalyticSnapshot {
  return {
    masteredTopics: capToRecent(mergeUnique(existing.masteredTopics, newMasteredTopics), MAX_ITEMS_PER_LIST),
    commonMistakes: capToRecent(mergeUnique(existing.commonMistakes, newCommonMistakes), MAX_ITEMS_PER_LIST),
  };
}
