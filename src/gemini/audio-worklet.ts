/**
 * @classytic/realtime-agents/gemini - AudioWorklet Processor
 *
 * Inline AudioWorklet code for capturing microphone input
 * as Float32Array chunks via the worklet message port.
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

export function getAudioWorkletUrl(): string {
  const blob = new Blob([RECORDER_WORKLET_CODE], { type: 'application/javascript' });
  return URL.createObjectURL(blob);
}
