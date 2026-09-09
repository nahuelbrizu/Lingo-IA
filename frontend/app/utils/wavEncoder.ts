// frontend/app/utils/wavEncoder.ts

/**
 * Codifica samples PCM en Float32 (el formato nativo de Web Audio API) como
 * un archivo WAV mono de 16 bits — el formato que espera la API de Azure
 * Pronunciation Assessment. Devuelve un ArrayBuffer (no un Blob) para que sea
 * trivial de testear con DataView y de convertir a base64 sin pasos async.
 */
export function encodePcmToWav(samples: Float32Array, sampleRate: number): ArrayBuffer {
  const bitsPerSample = 16;
  const channels = 1;
  const bytesPerSample = bitsPerSample / 8;
  const blockAlign = channels * bytesPerSample;
  const byteRate = sampleRate * blockAlign;
  const dataSize = samples.length * bytesPerSample;

  const buffer = new ArrayBuffer(44 + dataSize);
  const view = new DataView(buffer);

  const writeString = (offset: number, text: string) => {
    for (let i = 0; i < text.length; i++) view.setUint8(offset + i, text.charCodeAt(i));
  };

  writeString(0, 'RIFF');
  view.setUint32(4, 36 + dataSize, true);
  writeString(8, 'WAVE');
  writeString(12, 'fmt ');
  view.setUint32(16, 16, true); // tamaño del sub-chunk "fmt "
  view.setUint16(20, 1, true); // formato PCM
  view.setUint16(22, channels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, byteRate, true);
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, bitsPerSample, true);
  writeString(36, 'data');
  view.setUint32(40, dataSize, true);

  let offset = 44;
  for (let i = 0; i < samples.length; i++) {
    // Clampeamos a [-1, 1] antes de escalar — un sample fuera de rango (poco
    // común, pero posible con ganancia de hardware agresiva) desbordaría el
    // Int16 y envolvería a un valor con el signo invertido en vez de sonar
    // simplemente "recortado".
    const clamped = Math.max(-1, Math.min(1, samples[i]));
    const scaled = clamped < 0 ? clamped * 0x8000 : clamped * 0x7fff;
    view.setInt16(offset, Math.round(scaled), true);
    offset += 2;
  }

  return buffer;
}
