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
 * Aplica lo nuevo detectado en una sesión (en vivo o en el resumen de
 * cierre) sobre el estado ya guardado en la DB. Ver `mergeUnique`: el
 * resultado nunca es más chico que `existing`.
 */
export function mergeAnalyticProgress(
  existing: AnalyticSnapshot,
  newMasteredTopics: string[],
  newCommonMistakes: string[]
): AnalyticSnapshot {
  return {
    masteredTopics: mergeUnique(existing.masteredTopics, newMasteredTopics),
    commonMistakes: mergeUnique(existing.commonMistakes, newCommonMistakes),
  };
}
