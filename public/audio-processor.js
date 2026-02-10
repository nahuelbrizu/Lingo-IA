// public/audio-processor.js

/**
 * AudioProcessor is an AudioWorkletProcessor that captures raw audio data,
 * converts it from Float32 to Int16 PCM format, and posts it back to the
 * main thread. This ensures that audio processing happens off the main
 * browser thread, preventing UI freezes and audio glitches.
 */
class AudioProcessor extends AudioWorkletProcessor {
  /**
   * The process method is called for every block of audio data.
   * @param {Float32Array[][]} inputs - An array of inputs, each containing channels of audio data.
   * @param {Float32Array[][]} outputs - An array of outputs for audio data to be played.
   * @param {Record<string, Float32Array>} parameters - Audio parameters.
   * @returns {boolean} - Must return true to keep the processor alive.
   */
  process(inputs, outputs, parameters) {
    // We only expect one input.
    const input = inputs[0];

    // We only expect mono audio (a single channel).
    if (input.length > 0) {
      const float32Data = input[0];

      // Convert the Float32 data to 16-bit PCM.
      // This is the format required by the Gemini API for streaming.
      const int16Data = new Int16Array(float32Data.length);
      for (let i = 0; i < float32Data.length; i++) {
        // Clamp the value between -1 and 1, then scale to the 16-bit integer range.
        int16Data[i] = Math.max(-1, Math.min(1, float32Data[i])) * 0x7FFF;
      }

      // Post the Int16Array's buffer back to the main thread.
      // The second argument [int16Data.buffer] is a list of Transferable objects,
      // which transfers ownership of the buffer to the main thread, avoiding a copy.
      this.port.postMessage(int16Data.buffer, [int16Data.buffer]);
    }

    // Return true to indicate the processor should not be terminated.
    return true;
  }
}

// Register the processor with the name 'audio-processor'.
// This name will be used to instantiate the AudioWorkletNode.
registerProcessor('audio-processor', AudioProcessor);
