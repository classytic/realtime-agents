/**
 * @classytic/realtime-agents — Shared PCM Audio Utilities
 *
 * Low-level PCM 16-bit encoding/decoding used by both OpenAI (WebSocket)
 * and Gemini adapters for manual audio I/O.
 */

/** Decode a base64 string into a Uint8Array. */
export function base64ToUint8Array(base64: string): Uint8Array {
  const binaryString = atob(base64);
  const len = binaryString.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes;
}

/** Encode a Uint8Array into a base64 string. */
export function uint8ArrayToBase64(bytes: Uint8Array): string {
  let binary = '';
  const len = bytes.byteLength;
  for (let i = 0; i < len; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

/**
 * Convert Float32Array audio samples to PCM 16-bit as a base64 blob.
 *
 * Used by Gemini's `sendRealtimeInput` and can be used for any
 * transport that expects base64-encoded PCM16.
 */
export function createPcmBlob(
  data: Float32Array,
  sampleRate = 16000,
): { data: string; mimeType: string } {
  const l = data.length;
  const int16 = new Int16Array(l);
  for (let i = 0; i < l; i++) {
    const sample = Math.max(-1, Math.min(1, data[i]));
    int16[i] = sample < 0 ? sample * 0x8000 : sample * 0x7fff;
  }
  return {
    data: uint8ArrayToBase64(new Uint8Array(int16.buffer)),
    mimeType: `audio/pcm;rate=${sampleRate}`,
  };
}

/**
 * Convert Float32Array audio samples to PCM 16-bit ArrayBuffer.
 *
 * Used by OpenAI WebSocket transport's `sendAudio(buffer)`.
 */
export function float32ToPcm16(data: Float32Array): ArrayBuffer {
  const l = data.length;
  const int16 = new Int16Array(l);
  for (let i = 0; i < l; i++) {
    const sample = Math.max(-1, Math.min(1, data[i]));
    int16[i] = sample < 0 ? sample * 0x8000 : sample * 0x7fff;
  }
  return int16.buffer;
}

/**
 * Decode PCM 16-bit data into an AudioBuffer for playback.
 *
 * @param data - Raw PCM 16-bit bytes
 * @param ctx - AudioContext to create the buffer in
 * @param sampleRate - Sample rate of the incoming data (default: 24000)
 * @param numChannels - Number of audio channels (default: 1)
 */
export async function decodeAudioData(
  data: Uint8Array,
  ctx: AudioContext,
  sampleRate = 24000,
  numChannels = 1,
): Promise<AudioBuffer> {
  const dataInt16 = new Int16Array(data.buffer);
  const frameCount = dataInt16.length / numChannels;
  const buffer = ctx.createBuffer(numChannels, frameCount, sampleRate);

  for (let channel = 0; channel < numChannels; channel++) {
    const channelData = buffer.getChannelData(channel);
    for (let i = 0; i < frameCount; i++) {
      channelData[i] = dataInt16[i * numChannels + channel] / 32768.0;
    }
  }
  return buffer;
}
