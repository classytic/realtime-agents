/**
 * @classytic/realtime-agents/openai - Codec Utilities
 *
 * WebRTC codec preference helpers for OpenAI Realtime API.
 */

/**
 * Apply preferred codec on a peer connection's audio transceivers.
 * Safe to call multiple times.
 */
export function applyCodecPreferences(pc: RTCPeerConnection, codec: string): void {
  try {
    const caps = (
      RTCRtpSender as unknown as {
        getCapabilities?: (kind: string) => { codecs: { mimeType: string }[] } | null;
      }
    ).getCapabilities?.('audio');
    if (!caps) return;

    const pref = caps.codecs.find(
      (c) => c.mimeType.toLowerCase() === `audio/${codec.toLowerCase()}`,
    );
    if (!pref) return;

    pc.getTransceivers()
      .filter((t) => t.sender && t.sender.track?.kind === 'audio')
      .forEach((t) =>
        t.setCodecPreferences([pref as any]),
      );
  } catch (err) {
    console.error('[OpenAIAdapter] applyCodecPreferences error', err);
  }
}

/**
 * Map codec name to OpenAI Realtime API audio format string.
 */
export function audioFormatForCodec(codec: string): string {
  switch (codec.toLowerCase()) {
    case 'pcm16':
      return 'pcm16';
    case 'g711_ulaw':
      return 'g711_ulaw';
    case 'g711_alaw':
      return 'g711_alaw';
    default:
      return 'pcm16'; // Default for opus — Realtime API uses pcm16
  }
}
