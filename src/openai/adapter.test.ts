import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { OpenAIAdapter } from './adapter';

// =============================================================================
// Mock Helpers
// =============================================================================

function createMockTrack(readyState: MediaStreamTrackState = 'live'): MediaStreamTrack {
  return {
    kind: 'audio',
    id: crypto.randomUUID(),
    readyState,
    enabled: true,
    muted: false,
    label: 'mock-audio',
    contentHint: '',
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    stop: vi.fn(),
    clone: vi.fn(),
    getCapabilities: vi.fn(() => ({})),
    getConstraints: vi.fn(() => ({})),
    getSettings: vi.fn(() => ({})),
    applyConstraints: vi.fn(),
    dispatchEvent: vi.fn(),
    onended: null,
    onmute: null,
    onunmute: null,
  } as unknown as MediaStreamTrack;
}

function createMockStream(tracks?: MediaStreamTrack[]): MediaStream {
  const t = tracks ?? [createMockTrack()];
  return {
    id: crypto.randomUUID(),
    active: true,
    getTracks: () => t,
    getAudioTracks: () => t.filter((tk) => tk.kind === 'audio'),
    getVideoTracks: () => t.filter((tk) => tk.kind === 'video'),
    addTrack: vi.fn(),
    removeTrack: vi.fn(),
    clone: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  } as unknown as MediaStream;
}

function createMockSender(kind: 'audio' | 'video' = 'audio'): RTCRtpSender {
  return {
    track: { kind } as MediaStreamTrack,
    replaceTrack: vi.fn(() => Promise.resolve()),
    getParameters: vi.fn(),
    setParameters: vi.fn(),
    getStats: vi.fn(),
    dtmf: null,
    transport: null,
  } as unknown as RTCRtpSender;
}

function createMockPeerConnection(
  opts: {
    connectionState?: RTCPeerConnectionState;
    senders?: RTCRtpSender[];
  } = {},
): RTCPeerConnection {
  const { connectionState = 'connected', senders = [createMockSender()] } = opts;
  return {
    connectionState,
    iceConnectionState: connectionState === 'connected' ? 'connected' : 'disconnected',
    getSenders: vi.fn(() => senders),
    close: vi.fn(),
  } as unknown as RTCPeerConnection;
}

/** Access private session field to inject a mock */
function injectMockSession(
  adapter: OpenAIAdapter,
  pc?: RTCPeerConnection,
): { session: Record<string, unknown> } {
  const mockSession = {
    transport: {
      connectionState: {
        peerConnection: pc,
      },
      sendEvent: vi.fn(),
      on: vi.fn(),
    },
    on: vi.fn(),
    close: vi.fn(),
    mute: vi.fn(),
    usage: null,
  };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (adapter as any).session = mockSession;
  return { session: mockSession };
}

/** Set private field on adapter */
function setPrivate(adapter: OpenAIAdapter, field: string, value: unknown): void {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (adapter as any)[field] = value;
}

/** Get private field from adapter */
function getPrivate(adapter: OpenAIAdapter, field: string): unknown {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (adapter as any)[field];
}

// =============================================================================
// Tests
// =============================================================================

describe('OpenAIAdapter — replaceAudioTrack', () => {
  let adapter: OpenAIAdapter;

  beforeEach(() => {
    adapter = new OpenAIAdapter({ transport: 'webrtc' });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('throws when no session is connected', async () => {
    const stream = createMockStream();
    await expect(adapter.replaceAudioTrack(stream)).rejects.toThrow(
      'no active session',
    );
  });

  it('throws when stream has no audio tracks', async () => {
    injectMockSession(adapter, createMockPeerConnection());
    const stream = createMockStream([]);
    await expect(adapter.replaceAudioTrack(stream)).rejects.toThrow(
      'No audio track',
    );
  });

  it('replaces track successfully on first attempt', async () => {
    const sender = createMockSender();
    const pc = createMockPeerConnection({ senders: [sender] });
    injectMockSession(adapter, pc);

    const stream = createMockStream();
    await adapter.replaceAudioTrack(stream);

    expect(sender.replaceTrack).toHaveBeenCalledWith(
      stream.getAudioTracks()[0],
    );
  });

  it('throws when PeerConnection is in closed state', async () => {
    const pc = createMockPeerConnection({ connectionState: 'closed' });
    injectMockSession(adapter, pc);

    const stream = createMockStream();
    await expect(adapter.replaceAudioTrack(stream)).rejects.toThrow(
      "'closed' state",
    );
  });

  it('throws when PeerConnection is in failed state', async () => {
    const pc = createMockPeerConnection({ connectionState: 'failed' });
    injectMockSession(adapter, pc);

    const stream = createMockStream();
    await expect(adapter.replaceAudioTrack(stream)).rejects.toThrow(
      "'failed' state",
    );
  });

  it('retries when no peer connection on first attempt', async () => {
    const sender = createMockSender();
    const pc = createMockPeerConnection({ senders: [sender] });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const delaySpy = vi.spyOn(adapter as any, 'delay').mockResolvedValue(undefined);

    // Start with no PC, then provide one on second attempt
    const mockSession = {
      transport: {
        connectionState: { peerConnection: undefined as RTCPeerConnection | undefined },
        sendEvent: vi.fn(),
        on: vi.fn(),
      },
      on: vi.fn(),
      close: vi.fn(),
      usage: null,
    };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (adapter as any).session = mockSession;

    // After first delay, make PC available
    delaySpy.mockImplementation(async () => {
      mockSession.transport.connectionState.peerConnection = pc;
    });

    const stream = createMockStream();
    await adapter.replaceAudioTrack(stream);

    expect(delaySpy).toHaveBeenCalledOnce();
    expect(sender.replaceTrack).toHaveBeenCalled();
  });

  it('retries when no audio sender on first attempt', async () => {
    const sender = createMockSender();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const delaySpy = vi.spyOn(adapter as any, 'delay').mockResolvedValue(undefined);

    // Start with empty senders, then add one
    const pc = createMockPeerConnection({ senders: [] });
    injectMockSession(adapter, pc);

    delaySpy.mockImplementation(async () => {
      (pc.getSenders as ReturnType<typeof vi.fn>).mockReturnValue([sender]);
    });

    const stream = createMockStream();
    await adapter.replaceAudioTrack(stream);

    expect(delaySpy).toHaveBeenCalledOnce();
    expect(sender.replaceTrack).toHaveBeenCalled();
  });

  it('retries when replaceTrack throws on first attempt', async () => {
    const sender = createMockSender();
    (sender.replaceTrack as ReturnType<typeof vi.fn>)
      .mockRejectedValueOnce(new Error('InvalidStateError'))
      .mockResolvedValueOnce(undefined);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const delaySpy = vi.spyOn(adapter as any, 'delay').mockResolvedValue(undefined);

    const pc = createMockPeerConnection({ senders: [sender] });
    injectMockSession(adapter, pc);

    const stream = createMockStream();
    await adapter.replaceAudioTrack(stream);

    expect(delaySpy).toHaveBeenCalledOnce();
    expect(sender.replaceTrack).toHaveBeenCalledTimes(2);
  });

  it('throws after all retries exhausted', async () => {
    const sender = createMockSender();
    (sender.replaceTrack as ReturnType<typeof vi.fn>).mockRejectedValue(
      new Error('InvalidStateError'),
    );
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.spyOn(adapter as any, 'delay').mockResolvedValue(undefined);

    const pc = createMockPeerConnection({ senders: [sender] });
    injectMockSession(adapter, pc);

    const stream = createMockStream();
    await expect(adapter.replaceAudioTrack(stream)).rejects.toThrow(
      'failed after',
    );
    expect(sender.replaceTrack).toHaveBeenCalledTimes(4); // initial + 3 retries
  });
});

describe('OpenAIAdapter — replaceAudioTrack (WebSocket)', () => {
  it('throws when WebSocket audio pipeline not initialized', async () => {
    const adapter = new OpenAIAdapter({ transport: 'websocket' });
    injectMockSession(adapter);

    const stream = createMockStream();
    await expect(adapter.replaceAudioTrack(stream)).rejects.toThrow(
      'WebSocket audio pipeline not initialized',
    );
  });
});

// =============================================================================
// Non-interruptible auto-mute
// =============================================================================

describe('OpenAIAdapter — non-interruptible auto-mute', () => {
  let adapter: OpenAIAdapter;

  beforeEach(() => {
    adapter = new OpenAIAdapter({ transport: 'webrtc' });
    injectMockSession(adapter, createMockPeerConnection());
  });

  afterEach(() => vi.restoreAllMocks());

  it('autoMuteForSpeaking mutes when interruptible=false', () => {
    setPrivate(adapter, 'interruptible', false);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (adapter as any).autoMuteForSpeaking();

    expect(getPrivate(adapter, 'autoMutedForNonInterrupt')).toBe(true);
  });

  it('autoMuteForSpeaking is idempotent', () => {
    setPrivate(adapter, 'interruptible', false);
    const spy = vi.spyOn(adapter as any, 'applyMute');

    (adapter as any).autoMuteForSpeaking();
    (adapter as any).autoMuteForSpeaking();

    expect(spy).toHaveBeenCalledTimes(1);
  });

  it('autoMuteForSpeaking does nothing when interruptible=true', () => {
    setPrivate(adapter, 'interruptible', true);
    const spy = vi.spyOn(adapter as any, 'applyMute');

    (adapter as any).autoMuteForSpeaking();

    expect(spy).not.toHaveBeenCalled();
    expect(getPrivate(adapter, 'autoMutedForNonInterrupt')).toBe(false);
  });

  it('autoUnmuteAfterSpeaking unmutes when user did not manually mute', () => {
    setPrivate(adapter, 'interruptible', false);
    setPrivate(adapter, 'autoMutedForNonInterrupt', true);
    setPrivate(adapter, 'userMuted', false);
    const spy = vi.spyOn(adapter as any, 'applyMute');

    (adapter as any).autoUnmuteAfterSpeaking();

    expect(spy).toHaveBeenCalledWith(false);
    expect(getPrivate(adapter, 'autoMutedForNonInterrupt')).toBe(false);
  });

  it('autoUnmuteAfterSpeaking respects user manual mute', () => {
    setPrivate(adapter, 'interruptible', false);
    setPrivate(adapter, 'autoMutedForNonInterrupt', true);
    setPrivate(adapter, 'userMuted', true);
    const spy = vi.spyOn(adapter as any, 'applyMute');

    (adapter as any).autoUnmuteAfterSpeaking();

    expect(spy).not.toHaveBeenCalled();
    expect(getPrivate(adapter, 'autoMutedForNonInterrupt')).toBe(false);
  });

  it('autoUnmuteAfterSpeaking is idempotent', () => {
    setPrivate(adapter, 'autoMutedForNonInterrupt', false);
    const spy = vi.spyOn(adapter as any, 'applyMute');

    (adapter as any).autoUnmuteAfterSpeaking();

    expect(spy).not.toHaveBeenCalled();
  });
});

// =============================================================================
// Mute — user intent tracking
// =============================================================================

describe('OpenAIAdapter — mute user intent tracking', () => {
  let adapter: OpenAIAdapter;

  beforeEach(() => {
    adapter = new OpenAIAdapter({ transport: 'webrtc' });
    injectMockSession(adapter, createMockPeerConnection());
  });

  afterEach(() => vi.restoreAllMocks());

  it('mute(true) sets userMuted when not auto-muted', () => {
    adapter.mute(true);
    expect(getPrivate(adapter, 'userMuted')).toBe(true);
  });

  it('mute(false) clears userMuted', () => {
    setPrivate(adapter, 'userMuted', true);
    adapter.mute(false);
    expect(getPrivate(adapter, 'userMuted')).toBe(false);
  });

  it('mute does not set userMuted during auto-mute', () => {
    setPrivate(adapter, 'autoMutedForNonInterrupt', true);
    setPrivate(adapter, 'userMuted', false);
    // Calling mute while auto-muted should not change userMuted
    adapter.mute(true);
    expect(getPrivate(adapter, 'userMuted')).toBe(false);
  });

  it('applyMute on WebRTC disables source MediaStream tracks', () => {
    const track = createMockTrack();
    const stream = createMockStream([track]);
    setPrivate(adapter, 'webrtcMediaStream', stream);

    (adapter as any).applyMute(true);

    expect(track.enabled).toBe(false);
  });

  it('applyMute on WebRTC re-enables source MediaStream tracks', () => {
    const track = createMockTrack();
    track.enabled = false;
    const stream = createMockStream([track]);
    setPrivate(adapter, 'webrtcMediaStream', stream);

    (adapter as any).applyMute(false);

    expect(track.enabled).toBe(true);
  });

  it('applyMute on WebSocket sets wsIsMuted flag', () => {
    const wsAdapter = new OpenAIAdapter({ transport: 'websocket' });
    injectMockSession(wsAdapter);

    (wsAdapter as any).applyMute(true);

    expect(getPrivate(wsAdapter, 'wsIsMuted')).toBe(true);
  });
});

// =============================================================================
// shouldSuppressStatusChange
// =============================================================================

describe('OpenAIAdapter — shouldSuppressStatusChange', () => {
  let adapter: OpenAIAdapter;

  beforeEach(() => {
    adapter = new OpenAIAdapter({ transport: 'webrtc' });
  });

  it('returns true when non-interruptible + audio playing', () => {
    setPrivate(adapter, 'interruptible', false);
    setPrivate(adapter, 'audioPlayingRef', true);
    expect((adapter as any).shouldSuppressStatusChange()).toBe(true);
  });

  it('returns true when non-interruptible + active response', () => {
    setPrivate(adapter, 'interruptible', false);
    setPrivate(adapter, 'activeResponseRef', true);
    expect((adapter as any).shouldSuppressStatusChange()).toBe(true);
  });

  it('returns false when interruptible (even with active audio)', () => {
    setPrivate(adapter, 'interruptible', true);
    setPrivate(adapter, 'audioPlayingRef', true);
    setPrivate(adapter, 'activeResponseRef', true);
    expect((adapter as any).shouldSuppressStatusChange()).toBe(false);
  });

  it('returns false when non-interruptible but no active audio/response', () => {
    setPrivate(adapter, 'interruptible', false);
    setPrivate(adapter, 'audioPlayingRef', false);
    setPrivate(adapter, 'activeResponseRef', false);
    expect((adapter as any).shouldSuppressStatusChange()).toBe(false);
  });
});

// =============================================================================
// buildPartialSessionPayload
// =============================================================================

describe('OpenAIAdapter — buildPartialSessionPayload', () => {
  let adapter: OpenAIAdapter;

  beforeEach(() => {
    adapter = new OpenAIAdapter({ transport: 'webrtc' });
  });

  it('converts turnDetection camelCase to snake_case', () => {
    const result = (adapter as any).buildPartialSessionPayload({
      audio: {
        input: {
          turnDetection: {
            type: 'semantic_vad',
            eagerness: 'low',
            interruptResponse: false,
            createResponse: true,
          },
        },
      },
    });

    expect(result).toEqual({
      audio: {
        input: {
          turn_detection: {
            type: 'semantic_vad',
            eagerness: 'low',
            interrupt_response: false,
            create_response: true,
          },
        },
      },
    });
  });

  it('converts timing fields to snake_case', () => {
    const result = (adapter as any).buildPartialSessionPayload({
      audio: {
        input: {
          turnDetection: {
            prefixPaddingMs: 100,
            silenceDurationMs: 500,
            threshold: 0.5,
          },
        },
      },
    });

    const td = result.audio.input.turn_detection;
    expect(td.prefix_padding_ms).toBe(100);
    expect(td.silence_duration_ms).toBe(500);
    expect(td.threshold).toBe(0.5);
  });

  it('handles noiseReduction (including null)', () => {
    const result = (adapter as any).buildPartialSessionPayload({
      audio: { input: { noiseReduction: null } },
    });
    expect(result.audio.input.noise_reduction).toBeNull();
  });

  it('converts outputModalities', () => {
    const result = (adapter as any).buildPartialSessionPayload({
      outputModalities: ['text', 'audio'],
    });
    expect(result.output_modalities).toEqual(['text', 'audio']);
  });

  it('includes only provided fields', () => {
    const result = (adapter as any).buildPartialSessionPayload({
      audio: { input: { noiseReduction: { type: 'far_field' } } },
    });
    expect(result.output_modalities).toBeUndefined();
    expect(result.audio.input.turn_detection).toBeUndefined();
    expect(result.audio.input.noise_reduction).toEqual({ type: 'far_field' });
  });

  it('returns empty object for empty config', () => {
    const result = (adapter as any).buildPartialSessionPayload({});
    expect(result).toEqual({});
  });
});

// =============================================================================
// updateSessionConfig — interruptible state tracking
// =============================================================================

describe('OpenAIAdapter — updateSessionConfig', () => {
  let adapter: OpenAIAdapter;

  beforeEach(() => {
    adapter = new OpenAIAdapter({ transport: 'webrtc' });
    injectMockSession(adapter, createMockPeerConnection());
  });

  afterEach(() => vi.restoreAllMocks());

  it('updates interruptible from camelCase config', () => {
    adapter.updateSessionConfig!({
      audio: { input: { turnDetection: { interruptResponse: false } } },
    });
    expect(getPrivate(adapter, 'interruptible')).toBe(false);
  });

  it('updates interruptible from snake_case config', () => {
    adapter.updateSessionConfig!({
      audio: { input: { turn_detection: { interrupt_response: false } } },
    });
    expect(getPrivate(adapter, 'interruptible')).toBe(false);
  });

  it('sends session.update via transport', () => {
    adapter.updateSessionConfig!({
      audio: { input: { turnDetection: { eagerness: 'high' } } },
    });
    const transport = (adapter as any).session.transport;
    expect(transport.sendEvent).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'session.update' }),
    );
  });

  it('warns when no session connected', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const noSessionAdapter = new OpenAIAdapter({ transport: 'webrtc' });
    noSessionAdapter.updateSessionConfig!({ audio: {} });
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining('Cannot update config'),
    );
  });
});

// =============================================================================
// replaceAudioTrack updates webrtcMediaStream
// =============================================================================

describe('OpenAIAdapter — replaceAudioTrack updates webrtcMediaStream', () => {
  it('updates webrtcMediaStream after WebRTC track replacement', async () => {
    const adapter = new OpenAIAdapter({ transport: 'webrtc' });
    const sender = createMockSender();
    const pc = createMockPeerConnection({ senders: [sender] });
    injectMockSession(adapter, pc);

    const oldStream = createMockStream();
    setPrivate(adapter, 'webrtcMediaStream', oldStream);

    const newStream = createMockStream();
    await adapter.replaceAudioTrack(newStream);

    expect(getPrivate(adapter, 'webrtcMediaStream')).toBe(newStream);
  });
});

// =============================================================================
// Disconnect cleanup
// =============================================================================

describe('OpenAIAdapter — disconnect resets state', () => {
  it('resets all non-interruptible state on disconnect', () => {
    const adapter = new OpenAIAdapter({ transport: 'webrtc' });
    injectMockSession(adapter, createMockPeerConnection());

    // Set up dirty state
    setPrivate(adapter, 'interruptible', false);
    setPrivate(adapter, 'autoMutedForNonInterrupt', true);
    setPrivate(adapter, 'userMuted', true);
    setPrivate(adapter, 'webrtcMediaStream', createMockStream());
    setPrivate(adapter, 'activeResponseRef', true);
    setPrivate(adapter, 'audioPlayingRef', true);

    adapter.disconnect();

    expect(getPrivate(adapter, 'interruptible')).toBe(true);
    expect(getPrivate(adapter, 'autoMutedForNonInterrupt')).toBe(false);
    expect(getPrivate(adapter, 'userMuted')).toBe(false);
    expect(getPrivate(adapter, 'webrtcMediaStream')).toBeNull();
    expect(getPrivate(adapter, 'activeResponseRef')).toBe(false);
    expect(getPrivate(adapter, 'audioPlayingRef')).toBe(false);
  });
});

// =============================================================================
// Debug logging
// =============================================================================

describe('OpenAIAdapter — debug logging', () => {
  afterEach(() => {
    OpenAIAdapter.debug = false;
    vi.restoreAllMocks();
  });

  it('debug can be enabled via constructor option', () => {
    new OpenAIAdapter({ debug: true });
    expect(OpenAIAdapter.debug).toBe(true);
  });

  it('debug can be toggled via static setter', () => {
    OpenAIAdapter.debug = true;
    expect(OpenAIAdapter.debug).toBe(true);
    OpenAIAdapter.debug = false;
    expect(OpenAIAdapter.debug).toBe(false);
  });
});
