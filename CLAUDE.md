# @classytic/realtime-agents — Architecture Notes

## OpenAI Adapter: Audio State Machine

The adapter tracks agent status (`thinking` → `speaking` → `idle`) using server events from the OpenAI Realtime API. The key challenge on **WebRTC** is that server events track when audio is **sent**, not when it's **heard** by the user.

### Event Flow (WebRTC, normal path)

```
response.created         → activeResponseRef = true,  status = "thinking"
transcript.delta         → responseHadAudio = true,    status = "speaking"
output_audio_buffer.started → audioPlayingRef = true,  status = "speaking"
response.done            → activeResponseRef = false   (defers to buffer.stopped)
output_audio_buffer.stopped → audioPlayingRef = false  → beginIdleTransition()
  └→ waitForSilence()    → polls AnalyserNode for actual audio silence
  └→ silence confirmed   → autoUnmute + status = "idle"
```

### Event Ordering

`response.done` and `buffer.stopped` can arrive in **either order**. Both paths converge to `beginIdleTransition()`:

- **response.done first** (common): defers to buffer.stopped, which calls `beginIdleTransition()`
- **buffer.stopped first**: skips idle (activeResponseRef still true), then response.done calls `beginIdleTransition()`

### Silence Detection (`waitForSilence`)

On WebRTC, `buffer.stopped` fires when the server finishes **sending** audio. The client's jitter buffer still has audio playing. We poll the `webrtcAnalyser` (AnalyserNode connected to the media track) for RMS energy. Idle fires only after 3 consecutive silent polls (150ms of confirmed silence).

This mirrors the **Gemini adapter's** `source.onended` pattern — both detect actual client-side playout completion, just via different mechanisms (Gemini uses AudioBufferSourceNode callbacks, OpenAI uses AnalyserNode energy detection).

**Fallback**: If the analyser isn't ready, falls back to a 500ms fixed delay.

### Key Constants

| Constant | Value | Purpose |
|----------|-------|---------|
| `SILENCE_POLL_MS` | 50ms | How often to sample the analyser |
| `SILENCE_THRESHOLD` | 3 | RMS below this = silence (0-128 scale) |
| `SILENCE_CONFIRM_COUNT` | 3 | Consecutive silent polls before idle |
| `SILENCE_MAX_WAIT_MS` | 3000ms | Safety cap if silence never detected |
| `AUDIO_STUCK_TIMEOUT_MS` | 30000ms | Safety cap if `buffer.stopped` never fires |

### Non-Interruptible Mode

When `interruptResponse: false`, the adapter auto-mutes the mic during AI speech to prevent WebRTC from clearing the audio buffer on any mic input. Unmute is deferred to `beginIdleTransition()` — after silence is confirmed — so the VAD doesn't trigger during the jitter buffer drain.

### `activeResponseRef` — Server-Confirmed Only

`activeResponseRef` is set **only** by the server's `response.created` event, never optimistically before sending `response.create`. If the server rejects a `response.create` (e.g., `conversation_already_has_active_response`), the flag stays false — preventing stuck states.

### Debug Logging

Enable via constructor (`debug: true`) or browser console (`window.__OPENAI_ADAPTER_DEBUG = true`). Logs every state transition with timestamps for diagnosing timing issues.

## Response Timer (`useResponseTimer`)

When `restrictResponseTime` is enabled, the timer forces AI takeover after grace expiry:

1. `mute(true, { source: 'system' })` — uses system source so `autoUnmuteAfterSpeaking` can restore the mic
2. `input_audio_buffer.clear` — discards buffered audio (no `commit` — avoids VAD auto-response race)
3. `response.create` with override instructions — sent after 500ms delay

The `commit` was intentionally removed: with `createResponse: true`, committing triggers the VAD to auto-create a competing response that cancels our forced one.
