import { describe, it, expect } from 'vitest';
import { encodePcmToWav } from '../wavEncoder';

function readHeaderString(view: DataView, offset: number, length: number): string {
  let s = '';
  for (let i = 0; i < length; i++) s += String.fromCharCode(view.getUint8(offset + i));
  return s;
}

describe('encodePcmToWav', () => {
  it('writes a valid 44-byte RIFF/WAVE header for mono 16-bit PCM', () => {
    const samples = new Float32Array([0, 0.5, -0.5, 1, -1]);
    const buffer = encodePcmToWav(samples, 16000);
    const view = new DataView(buffer);

    expect(readHeaderString(view, 0, 4)).toBe('RIFF');
    expect(readHeaderString(view, 8, 4)).toBe('WAVE');
    expect(readHeaderString(view, 12, 4)).toBe('fmt ');
    expect(readHeaderString(view, 36, 4)).toBe('data');

    // PCM format tag
    expect(view.getUint16(20, true)).toBe(1);
    // mono
    expect(view.getUint16(22, true)).toBe(1);
    // sample rate
    expect(view.getUint32(24, true)).toBe(16000);
    // byte rate = sampleRate * channels * bitsPerSample/8
    expect(view.getUint32(28, true)).toBe(16000 * 1 * 2);
    // block align = channels * bitsPerSample/8
    expect(view.getUint16(32, true)).toBe(2);
    // bits per sample
    expect(view.getUint16(34, true)).toBe(16);

    // data chunk size = numSamples * 2 bytes
    expect(view.getUint32(40, true)).toBe(samples.length * 2);
    // overall file size field = 36 + data size
    expect(view.getUint32(4, true)).toBe(36 + samples.length * 2);

    expect(buffer.byteLength).toBe(44 + samples.length * 2);
  });

  it('converts Float32 samples to Int16 PCM correctly, clamping at +/-1.0', () => {
    const samples = new Float32Array([0, 0.5, -0.5, 1, -1, 2, -2]);
    const buffer = encodePcmToWav(samples, 16000);
    const view = new DataView(buffer);

    const readInt16 = (i: number) => view.getInt16(44 + i * 2, true);

    expect(readInt16(0)).toBe(0);
    expect(readInt16(1)).toBe(Math.round(0.5 * 0x7fff));
    expect(readInt16(2)).toBe(Math.round(-0.5 * 0x8000));
    expect(readInt16(3)).toBe(0x7fff); // +1.0 clamps to max positive Int16
    expect(readInt16(4)).toBe(-0x8000); // -1.0 maps to min Int16
    expect(readInt16(5)).toBe(0x7fff); // 2.0 clamps, same as +1.0
    expect(readInt16(6)).toBe(-0x8000); // -2.0 clamps, same as -1.0
  });

  it('produces an empty data chunk for an empty samples array', () => {
    const buffer = encodePcmToWav(new Float32Array([]), 16000);
    expect(buffer.byteLength).toBe(44);
    const view = new DataView(buffer);
    expect(view.getUint32(40, true)).toBe(0);
  });
});
