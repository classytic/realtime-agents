/**
 * @classytic/realtime-agents — Shared AudioWorklet Processor
 *
 * Inline AudioWorklet code for capturing microphone input
 * as Float32Array chunks via the worklet message port.
 *
 * Used by both Gemini and OpenAI (WebSocket) adapters.
 */

export const RECORDER_WORKLET_CODE = `
class RecorderProcessor extends AudioWorkletProcessor {
  process(inputs, outputs, parameters) {
    const input = inputs[0];
    if (input && input.length > 0) {
      const channelData = input[0];
      this.port.postMessage(channelData);
    }
    return true;
  }
}
registerProcessor('recorder-processor', RecorderProcessor);
`;

/** Cached blob URL — reuse across adapters to prevent duplicate `registerProcessor` errors. */
let cachedWorkletUrl: string | null = null;

/** Get a blob URL for the recorder worklet. Cached to prevent double-registration errors. */
export function getAudioWorkletUrl(): string {
  if (!cachedWorkletUrl) {
    const blob = new Blob([RECORDER_WORKLET_CODE], { type: 'application/javascript' });
    cachedWorkletUrl = URL.createObjectURL(blob);
  }
  return cachedWorkletUrl;
}
