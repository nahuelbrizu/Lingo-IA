// backend/src/services/pronunciationAssessment.ts

export interface PronunciationAssessmentResult {
  accuracyScore: number;
  fluencyScore: number;
  completenessScore: number;
  pronScore: number;
}

type AssessmentOutcome =
  | { ok: true; data: PronunciationAssessmentResult }
  | { ok: false; error: string };

/**
 * Llama a la API REST de Azure Speech (Pronunciation Assessment) con un clip
 * de audio corto grabado por el alumno repitiendo una frase puntual. Nunca
 * lanza: cualquier falla (red, credenciales, respuesta inesperada) se
 * atrapa y se devuelve como `{ ok: false, error }`, igual que
 * `handleToolUse` en `toolHandlers.ts` — el llamador siempre recibe algo que
 * puede mandarle de vuelta al cliente sin romper la conexión WebSocket.
 */
export async function assessPronunciation(
  audioBuffer: Buffer,
  referenceText: string,
  languageCode: string,
  sampleRate: number
): Promise<AssessmentOutcome> {
  try {
    const apiKey = process.env.AZURE_SPEECH_KEY;
    const region = process.env.AZURE_SPEECH_REGION;
    if (!apiKey || !region) {
      return { ok: false, error: 'Azure Speech no está configurado (falta la key o la región).' };
    }

    const assessmentConfig = Buffer.from(
      JSON.stringify({
        ReferenceText: referenceText,
        GradingSystem: 'HundredMark',
        Granularity: 'Phoneme',
        // Sin "Comprehensive", Azure solo devuelve AccuracyScore — los otros
        // tres (fluidez, completitud, puntaje general) no vienen en la
        // respuesta salvo que se pida explícitamente esta dimensión
        // (confirmado con una llamada real durante el desarrollo).
        Dimension: 'Comprehensive',
      })
    ).toString('base64');

    const url = `https://${region}.stt.speech.microsoft.com/speech/recognition/conversation/cognitiveservices/v1?language=${languageCode}&format=detailed`;

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Ocp-Apim-Subscription-Key': apiKey,
        'Content-Type': `audio/wav; codecs=audio/pcm; samplerate=${sampleRate}`,
        'Pronunciation-Assessment': assessmentConfig,
      },
      body: audioBuffer as unknown as BodyInit,
    });

    if (!response.ok) {
      return { ok: false, error: `Azure devolvió un error (HTTP ${response.status}).` };
    }

    const payload = await response.json();
    // Los 4 puntajes vienen como propiedades directas de NBest[0] en la
    // respuesta REST cruda (no anidados bajo una clave "PronunciationAssessment"
    // — eso es solo cómo el SDK oficial los expone después de parsearlos).
    const best = payload?.NBest?.[0];
    if (!best || typeof best.PronScore !== 'number') {
      return { ok: false, error: 'Azure no devolvió una evaluación de pronunciación (¿silencio o audio ilegible?).' };
    }

    return {
      ok: true,
      data: {
        accuracyScore: best.AccuracyScore,
        fluencyScore: best.FluencyScore,
        completenessScore: best.CompletenessScore,
        pronScore: best.PronScore,
      },
    };
  } catch (error) {
    console.error('[PronunciationAssessment] Error calling Azure Speech:', error);
    return { ok: false, error: 'No se pudo evaluar la pronunciación en este momento.' };
  }
}
