/**
 * @classytic/realtime-agents/gemini - Gemini Adapter
 *
 * Implements RealtimeAdapter using Gemini Live API with WebSocket transport.
 * Handles audio I/O via AudioContext + AudioWorklet, transcription, tool calls,
 * video support, and real-time usage tracking.
 */

import { GoogleGenAI, Modality } from '@google/genai';
import type { LiveServerMessage } from '@google/genai';
import type {
  RealtimeAdapter,
  ConnectOptions,
  TransportEventHandlers,
  AgentTool,
  HistoryEntry,
  UsageInfo,
} from '../types.js';
import { createPcmBlob, base64ToUint8Array, decodeAudioData } from '../audio/pcm-utils.js';
import { getAudioWorkletUrl } from '../audio/worklet.js';
import { mapToolsToFunctionDeclarations } from './map-tools.js';
import { GEMINI_DEFAULT_VOICE } from './voices.js';
import type { GeminiAdapterOptions } from './types.js';

export class GeminiAdapter implements RealtimeAdapter {
  readonly providerName = 'gemini';

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private session: any = null;
  /** Resolved Gemini Live session (set after the connect promise resolves) */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private resolvedSession: any = null;
  private handlers: TransportEventHandlers | null = null;
  /** Guard flag — set to false on cleanup to prevent stale audio sends */
  private connected = false;
  private inputAudioContext: AudioContext | null = null;
  private outputAudioContext: AudioContext | null = null;
  private inputSource: MediaStreamAudioSourceNode | null = null;
  private audioWorkletNode: AudioWorkletNode | null = null;
  private aiAnalyser: AnalyserNode | null = null;
  private animationFrameId: number | null = null;
  private nextStartTime = 0;
  private isMuted = false;
  /** Active audio sources — tracked so interrupt() can stop them */
  private activeSources: Set<AudioBufferSourceNode> = new Set();

  private activeTools: Map<string, AgentTool> = new Map();

  /** The MediaStream used for audio (and optionally video) input */
  private mediaStream: MediaStream | null = null;
  /** Whether the media stream was provided externally (don't stop tracks on cleanup) */
  private externalStream = false;

  // Usage tracking — accumulated from usageMetadata in server messages
  private usageData: UsageInfo = { inputTokens: 0, outputTokens: 0, totalTokens: 0 };

  // Stable transcript IDs — one per turn direction, reset on turn boundaries
  private currentUserItemId: string | null = null;
  private currentAssistantItemId: string | null = null;
  private transcriptIdCounter = 0;

  private readonly model: string;
  private readonly inputSampleRate: number;
  private readonly outputSampleRate: number;
  private readonly enableInputTranscription: boolean;
  private readonly enableOutputTranscription: boolean;
  private readonly enableVideo: boolean;
  private readonly videoFrameInterval: number;
  private readonly sessionResumption?: { handle?: string; transparent?: boolean };
  private readonly contextManagement: { mode: 'auto' | 'disabled'; triggerTokens?: number; retentionRatio?: number };

  /** Latest session resumption handle received from the server */
  private lastSessionHandle: string | null = null;

  /** Video frame capture state — captures JPEG frames and sends via sendRealtimeInput */
  private videoCaptureTimer: ReturnType<typeof setInterval> | null = null;
  private videoCaptureVideo: HTMLVideoElement | null = null;

  constructor(options: GeminiAdapterOptions = {}) {
    this.model = options.model ?? 'gemini-2.5-flash-native-audio-preview-12-2025';
    this.inputSampleRate = options.inputSampleRate ?? 16000;
    this.outputSampleRate = options.outputSampleRate ?? 24000;
    this.enableInputTranscription = options.inputTranscription ?? true;
    this.enableOutputTranscription = options.outputTranscription ?? true;
    this.enableVideo = options.enableVideo ?? false;
    this.videoFrameInterval = options.videoFrameInterval ?? 5000;
    this.sessionResumption = options.sessionResumption;
    this.contextManagement = {
      mode: options.contextManagement?.mode ?? 'auto',
      triggerTokens: options.contextManagement?.triggerTokens,
      retentionRatio: options.contextManagement?.retentionRatio ?? 0.8,
    };
  }

  /** Get the active media stream (useful for rendering video preview) */
  getMediaStream(): MediaStream | null {
    return this.mediaStream;
  }

  /** Get the AnalyserNode for AI audio output visualization */
  getOutputAnalyser(): AnalyserNode | null {
    return this.aiAnalyser;
  }

  /** Get the input AudioContext (useful for building input visualizers) */
  getInputAudioContext(): AudioContext | null {
    return this.inputAudioContext;
  }

  /**
   * Get the latest session resumption handle from the server.
   *
   * Save this value and pass it to `GeminiAdapterOptions.sessionResumption.handle`
   * on reconnect to resume the session where it left off.
   */
  getSessionResumptionHandle(): string | null {
    return this.lastSessionHandle;
  }

  async connect(options: ConnectOptions, handlers: TransportEventHandlers): Promise<void> {
    if (this.connected || this.session) {
      console.warn('[GeminiAdapter] Already connected — ignoring duplicate connect()');
      return;
    }

    this.handlers = handlers;
    this.usageData = { inputTokens: 0, outputTokens: 0, totalTokens: 0 };
    this.transcriptIdCounter = 0;
    this.currentUserItemId = null;
    this.currentAssistantItemId = null;
    this.externalStream = false;
    this.connected = true;
    this.resolvedSession = null;

    const apiKey = await options.getCredentials();
    const ai = new GoogleGenAI({ apiKey });

    // Map tools
    this.activeTools.clear();
    for (const tool of options.agent.tools) {
      this.activeTools.set(tool.name, tool);
    }

    const functionDeclarations = mapToolsToFunctionDeclarations(options.agent.tools);

    // Audio contexts
    this.inputAudioContext = new AudioContext({ sampleRate: this.inputSampleRate });
    this.outputAudioContext = new AudioContext({ sampleRate: this.outputSampleRate });

    this.aiAnalyser = this.outputAudioContext.createAnalyser();
    this.aiAnalyser.fftSize = 256;

    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const sessionPromise: any = ai.live.connect({
        model: this.model,
        config: {
          responseModalities: [Modality.AUDIO],
          ...(this.enableInputTranscription ? { inputAudioTranscription: {} } : {}),
          ...(this.enableOutputTranscription ? { outputAudioTranscription: {} } : {}),
          speechConfig: {
            voiceConfig: {
              prebuiltVoiceConfig: {
                voiceName: options.agent.voice ?? GEMINI_DEFAULT_VOICE,
              },
            },
          },
          tools:
            functionDeclarations.length > 0
              ? [{ functionDeclarations }]
              : undefined,
          systemInstruction: options.agent.instructions,
          ...(this.sessionResumption ? { sessionResumption: this.sessionResumption } : {}),
          ...this.buildCompressionConfig(),
        },
        callbacks: {
          onopen: () => {
            handlers.onStatusChange('connected');
            handlers.onAgentStatusChange('idle');
            this.startAudioInput(sessionPromise, options.mediaStream);
            // Pre-seed conversation context with previous turns
            if (options.history?.length) {
              this.preloadHistory(sessionPromise, options.history);
            }
          },
          onmessage: async (message: LiveServerMessage) => {
            try {
              await this.handleServerMessage(message);
            } catch (err) {
              const error = err instanceof Error ? err : new Error(String(err));
              console.error('[GeminiAdapter] Error handling server message:', error);
              this.handlers?.onError(error);
            }
          },
          onclose: () => {
            handlers.onStatusChange('disconnected');
            handlers.onAgentStatusChange('idle');
            this.cleanup();
          },
          onerror: (err: unknown) => {
            const error = err instanceof Error ? err : new Error(String(err));
            handlers.onError(error);
            this.cleanup();
          },
        },
      });

      this.session = sessionPromise;
      // Track the resolved session for proper close on cleanup
      sessionPromise.then((s: unknown) => { this.resolvedSession = s; });
    } catch (err) {
      this.cleanup();
      const error = err instanceof Error ? err : new Error(String(err));
      handlers.onError(error);
      throw error;
    }
  }

  disconnect(): void {
    this.cleanup();
    this.handlers = null;
  }

  sendMessage(text: string): void {
    if (!this.connected || !this.resolvedSession) return;

    // Text messages have no server-side transcription — emit locally
    const itemId = `gemini-user-${++this.transcriptIdCounter}`;
    this.emitHistoryAdded(itemId, 'user');
    this.handlers?.onTranscriptDelta(itemId, text);
    this.handlers?.onTranscriptComplete({ role: 'user', text, itemId });

    try {
      this.resolvedSession.sendClientContent({ turns: [{ role: 'user', parts: [{ text }] }], turnComplete: true });
    } catch { /* WebSocket closing */ }
  }

  sendImage(dataUrl: string): void {
    if (!this.connected || !this.resolvedSession) return;
    const base64Data = dataUrl.includes(',') ? dataUrl.split(',')[1] : dataUrl;
    try {
      this.resolvedSession.sendRealtimeInput({
        media: {
          mimeType: 'image/jpeg',
          data: base64Data,
        },
      });
    } catch { /* WebSocket closing */ }
  }

  mute(muted: boolean): void {
    this.isMuted = muted;
  }

  interrupt(): void {
    // Stop all scheduled/playing audio sources immediately
    for (const source of this.activeSources) {
      try { source.stop(); } catch { /* already stopped */ }
    }
    this.activeSources.clear();

    if (this.outputAudioContext) {
      this.nextStartTime = this.outputAudioContext.currentTime;
    }
    this.handlers?.onAgentStatusChange('idle');
  }

  pushToTalkStart(): void {
    this.isMuted = false;
  }

  pushToTalkStop(): void {
    this.isMuted = true;
  }

  sendRawEvent(_event: unknown): void {
    console.warn('[GeminiAdapter] sendRawEvent is not supported');
  }

  sendSimulatedUserMessage(text: string): void {
    this.sendMessage(text);
  }

  getUsage(): Record<string, unknown> | null {
    if (this.usageData.totalTokens === 0) return null;
    return { ...this.usageData };
  }

  // ── Internal: Audio/Video Input ──

  private async startAudioInput(
    sessionPromise: Promise<unknown>,
    externalStream?: MediaStream,
  ): Promise<void> {
    if (!this.inputAudioContext) return;

    try {
      await this.inputAudioContext.audioWorklet.addModule(getAudioWorkletUrl());
    } catch (e) {
      console.error('[GeminiAdapter] Failed to load audio worklet', e);
      return;
    }

    // Use external stream if provided, otherwise request a new one
    try {
      if (externalStream) {
        this.mediaStream = externalStream;
        this.externalStream = true;
      } else {
        this.mediaStream = await navigator.mediaDevices.getUserMedia({
          audio: true,
          video: this.enableVideo,
        });
        this.externalStream = false;
      }
    } catch (e) {
      this.handlers?.onError(
        e instanceof Error ? e : new Error('Microphone access denied'),
      );
      return;
    }

    // Await the session once — then use it synchronously in onmessage.
    // This eliminates the .then() microtask gap that caused sends to hit
    // a CLOSING WebSocket before our `connected` guard could fire.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const session = await sessionPromise as any;
    if (!this.connected) return; // session may have closed while awaiting

    this.inputSource = this.inputAudioContext.createMediaStreamSource(this.mediaStream);
    this.audioWorkletNode = new AudioWorkletNode(this.inputAudioContext, 'recorder-processor');

    this.audioWorkletNode.port.onmessage = (e: MessageEvent<Float32Array>) => {
      if (this.isMuted || !this.connected) return;
      const pcmBlob = createPcmBlob(e.data);
      try {
        session.sendRealtimeInput({ media: pcmBlob });
      } catch {
        // WebSocket may be closing — silently ignore
      }
    };

    this.inputSource.connect(this.audioWorkletNode);
    // Route through a silent gain node to keep graph alive without echo/feedback
    const silentGain = this.inputAudioContext.createGain();
    silentGain.gain.value = 0;
    this.audioWorkletNode.connect(silentGain);
    silentGain.connect(this.inputAudioContext.destination);

    // Start video frame capture if the stream has video tracks
    this.startVideoCapture(session);
  }

  /**
   * Build the `contextWindowCompression` config for the Gemini Live session.
   *
   * - mode 'auto' (default): enables sliding window so sessions can run indefinitely.
   * - mode 'disabled': no compression — sessions limited to ~15 min audio / ~2 min video.
   */
  private buildCompressionConfig(): Record<string, unknown> {
    if (this.contextManagement.mode === 'disabled') return {};

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const slidingWindow: any = {};
    if (this.contextManagement.triggerTokens && this.contextManagement.retentionRatio) {
      slidingWindow.targetTokens = String(
        Math.round(this.contextManagement.triggerTokens * this.contextManagement.retentionRatio),
      );
    } else if (this.contextManagement.retentionRatio) {
      // No explicit trigger — use default 80% of 128k (~102400), apply ratio
      slidingWindow.targetTokens = String(Math.round(102400 * this.contextManagement.retentionRatio));
    }

    return {
      contextWindowCompression: {
        ...(this.contextManagement.triggerTokens
          ? { triggerTokens: String(this.contextManagement.triggerTokens) }
          : {}),
        slidingWindow,
      },
    };
  }

  /**
   * Periodically capture JPEG frames from the video track and send to the model.
   *
   * The Gemini Live API doesn't accept a raw MediaStream for video — it needs
   * individual frames sent via `sendRealtimeInput({ media })`. This method sets
   * up the capture loop automatically when video tracks are present.
   *
   * Set `videoFrameInterval: 0` in adapter options to disable auto-capture
   * (you can still call `sendImage()` manually for on-demand snapshots).
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private startVideoCapture(session: any): void {
    if (!this.mediaStream || this.videoFrameInterval <= 0) return;

    const videoTrack = this.mediaStream.getVideoTracks()[0];
    if (!videoTrack) return;

    const video = document.createElement('video');
    video.srcObject = this.mediaStream;
    video.muted = true;
    video.playsInline = true;
    video.play();
    this.videoCaptureVideo = video;

    const canvas = document.createElement('canvas');
    canvas.width = 640;
    canvas.height = 480;
    const ctx = canvas.getContext('2d')!;

    this.videoCaptureTimer = setInterval(() => {
      if (!this.connected || !videoTrack.enabled || video.readyState < 2) return;
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      const dataUrl = canvas.toDataURL('image/jpeg', 0.7);
      const base64Data = dataUrl.split(',')[1];
      try {
        session.sendRealtimeInput({
          media: { mimeType: 'image/jpeg', data: base64Data },
        });
      } catch { /* WebSocket closing */ }
    }, this.videoFrameInterval);
  }

  // ── Internal: Handle Server Messages ──

  private async handleServerMessage(message: LiveServerMessage): Promise<void> {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const msg = message as any;

    // ── Voice Activity Detection ──
    if (msg.voiceActivity) {
      const type = msg.voiceActivity.voiceActivityType;
      if (type === 'ACTIVITY_START') {
        // New user speech turn — create a stable ID and transcript item
        this.currentUserItemId = `gemini-user-${++this.transcriptIdCounter}`;
        this.emitHistoryAdded(this.currentUserItemId, 'user');
        this.handlers?.onAgentStatusChange('listening');
        this.handlers?.onUserSpeechStart?.();
      } else if (type === 'ACTIVITY_END') {
        this.handlers?.onUserSpeechStop?.();
      }
    }

    // ── Transcription events ──
    const serverContent = message.serverContent;
    if (serverContent) {
      // User speech transcription
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const inputTx = (serverContent as any).inputTranscription;
      if (inputTx?.text) {
        // Reuse current user item ID or create one if voice activity didn't fire
        if (!this.currentUserItemId) {
          this.currentUserItemId = `gemini-user-${++this.transcriptIdCounter}`;
          this.emitHistoryAdded(this.currentUserItemId, 'user');
        }
        const itemId = this.currentUserItemId;
        this.handlers?.onTranscriptDelta(itemId, inputTx.text);
        this.handlers?.onAgentStatusChange('listening');
      }

      // Model speech transcription
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const outputTx = (serverContent as any).outputTranscription;
      if (outputTx?.text) {
        // Reuse current assistant item ID or create one
        if (!this.currentAssistantItemId) {
          this.currentAssistantItemId = `gemini-assistant-${++this.transcriptIdCounter}`;
          this.emitHistoryAdded(this.currentAssistantItemId, 'assistant');
        }
        const itemId = this.currentAssistantItemId;
        this.handlers?.onTranscriptDelta(itemId, outputTx.text);
      }

      // ── Turn complete — finalize transcripts and reset IDs ──
      if (serverContent.turnComplete) {
        // Finalize user transcript if pending
        if (this.currentUserItemId) {
          this.handlers?.onTranscriptComplete({
            role: 'user',
            text: '', // Text was already sent via deltas
            itemId: this.currentUserItemId,
          });
        }
        // Finalize assistant transcript if pending
        if (this.currentAssistantItemId) {
          this.handlers?.onTranscriptComplete({
            role: 'assistant',
            text: '', // Text was already sent via deltas
            itemId: this.currentAssistantItemId,
          });
        }
        // Reset for next turn
        this.currentUserItemId = null;
        this.currentAssistantItemId = null;
        this.handlers?.onAgentStatusChange('idle');
      }
    }

    // ── Usage metadata (real-time) ──
    if (msg.usageMetadata) {
      const usage = msg.usageMetadata;
      const updated: UsageInfo = {
        inputTokens: typeof usage.promptTokenCount === 'number' ? usage.promptTokenCount : this.usageData.inputTokens,
        outputTokens: typeof usage.responseTokenCount === 'number' ? usage.responseTokenCount : this.usageData.outputTokens,
        totalTokens: typeof usage.totalTokenCount === 'number' ? usage.totalTokenCount : this.usageData.totalTokens,
      };
      this.usageData = updated;
      this.handlers?.onUsageUpdate?.(updated);
    }

    // ── Session resumption updates ──
    if (msg.sessionResumptionUpdate) {
      const update = msg.sessionResumptionUpdate;
      if (update.newHandle) {
        this.lastSessionHandle = update.newHandle;
      }
      this.handlers?.onTransportEvent?.({
        type: 'session_resumption_update',
        handle: update.newHandle ?? null,
        resumable: update.resumable ?? false,
        lastConsumedClientMessageIndex: update.lastConsumedClientMessageIndex ?? null,
      });
    }

    // ── Tool calls ──
    if (message.toolCall) {
      const functionCalls = message.toolCall.functionCalls;
      if (functionCalls && functionCalls.length > 0) {
        this.handlers?.onAgentStatusChange('thinking');

        // Notify tool start
        for (const fc of functionCalls) {
          this.handlers?.onToolStart?.(fc.name ?? 'unknown', fc.args);
        }

        const responses = await Promise.all(
          functionCalls.map(async (fc) => {
            const toolName = fc.name ?? 'unknown';
            const tool = this.activeTools.get(toolName);
            if (!tool) {
              return {
                id: fc.id ?? '',
                name: toolName,
                response: { result: { error: 'unknown_function' } },
              };
            }

            // Tool approval — check with consumer before executing
            if (this.handlers?.onToolApprovalRequest) {
              const approved = await this.handlers.onToolApprovalRequest(toolName, fc.args);
              if (!approved) {
                this.handlers?.onToolEnd?.(toolName, { denied: true });
                return {
                  id: fc.id ?? '',
                  name: toolName,
                  response: { result: { error: 'tool_call_denied_by_user' } },
                };
              }
            }

            try {
              const result = await tool.execute(fc.args);
              this.handlers?.onToolEnd?.(toolName, result);

              // Handle image results (e.g. capture_user_video)
              if (
                result &&
                typeof result === 'object' &&
                'base64Image' in (result as Record<string, unknown>)
              ) {
                if (this.connected && this.resolvedSession) {
                  try {
                    this.resolvedSession.sendRealtimeInput({
                      media: {
                        mimeType: 'image/jpeg',
                        data: (result as Record<string, unknown>).base64Image,
                      },
                    });
                  } catch { /* WebSocket closing */ }
                }
                return {
                  id: fc.id ?? '',
                  name: toolName,
                  response: { result: { status: 'image_sent' } },
                };
              }

              return {
                id: fc.id ?? '',
                name: toolName,
                response: { result },
              };
            } catch (err: unknown) {
              const errMsg = err instanceof Error ? err.message : String(err);
              this.handlers?.onToolEnd?.(toolName, { error: errMsg });
              return {
                id: fc.id ?? '',
                name: toolName,
                response: { result: { error: errMsg } },
              };
            }
          }),
        );

        if (this.connected && this.resolvedSession) {
          try {
            this.resolvedSession.sendToolResponse({ functionResponses: responses });
          } catch { /* WebSocket closing */ }
        }
      }
    }

    // ── Audio output ──
    if (!this.outputAudioContext || !this.aiAnalyser) return;

    const base64Audio =
      message.serverContent?.modelTurn?.parts?.[0]?.inlineData?.data;

    if (base64Audio) {
      this.handlers?.onAgentStatusChange('speaking');

      if (this.nextStartTime < this.outputAudioContext.currentTime) {
        this.nextStartTime = this.outputAudioContext.currentTime;
      }

      try {
        const audioBuffer = await decodeAudioData(
          base64ToUint8Array(base64Audio),
          this.outputAudioContext,
        );

        const source = this.outputAudioContext.createBufferSource();
        source.buffer = audioBuffer;
        source.connect(this.aiAnalyser);
        this.aiAnalyser.connect(this.outputAudioContext.destination);

        this.activeSources.add(source);
        source.start(this.nextStartTime);
        this.nextStartTime += audioBuffer.duration;

        source.onended = () => {
          this.activeSources.delete(source);
          this.handlers?.onAgentStatusChange('idle');
        };
      } catch (e) {
        console.error('[GeminiAdapter] Audio decode error', e);
      }
    }

    // ── Interruption from server ──
    if (message.serverContent?.interrupted) {
      for (const src of this.activeSources) {
        try { src.stop(); } catch { /* already stopped */ }
      }
      this.activeSources.clear();
      this.nextStartTime = this.outputAudioContext.currentTime;
      this.handlers?.onAgentStatusChange('idle');
    }
  }

  /**
   * Emit a history_added transport event to create a transcript item
   * before deltas arrive (Gemini has no native equivalent of OpenAI's history_added).
   */
  private emitHistoryAdded(itemId: string, role: 'user' | 'assistant'): void {
    this.handlers?.onTransportEvent?.({
      type: 'history_added',
      item: { type: 'message', role, itemId, content: [] },
    });
  }

  /**
   * Send previous conversation turns to prime the model context.
   *
   * Uses `sendClientContent` with `turnComplete: true` so the model fully
   * integrates the history. If the last turn is from the user, the model
   * will respond immediately (desired behaviour for pre-seeded questions).
   */
  private async preloadHistory(
    sessionPromise: Promise<unknown>,
    history: readonly HistoryEntry[],
  ): Promise<void> {
    const turns = history.map((entry) => ({
      role: entry.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: entry.text }],
    }));
    // Await session if not yet resolved (called from onopen)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const session = (this.resolvedSession ?? await sessionPromise) as any;
    if (!this.connected) return;
    try {
      session.sendClientContent({ turns, turnComplete: true });
    } catch { /* WebSocket closing */ }
  }

  // ── Internal: Cleanup ──

  private cleanup(): void {
    // Disable the connection guard first to prevent any further sends
    this.connected = false;

    // Immediately stop the audio worklet from enqueuing new sends
    if (this.audioWorkletNode) {
      this.audioWorkletNode.port.onmessage = null;
    }

    if (this.animationFrameId) {
      cancelAnimationFrame(this.animationFrameId);
      this.animationFrameId = null;
    }
    if (this.inputSource) {
      this.inputSource.disconnect();
      this.inputSource = null;
    }
    if (this.audioWorkletNode) {
      this.audioWorkletNode.disconnect();
      this.audioWorkletNode = null;
    }
    if (this.inputAudioContext) {
      this.inputAudioContext.close();
      this.inputAudioContext = null;
    }
    if (this.outputAudioContext) {
      this.outputAudioContext.close();
      this.outputAudioContext = null;
    }
    // Stop video frame capture
    if (this.videoCaptureTimer) {
      clearInterval(this.videoCaptureTimer);
      this.videoCaptureTimer = null;
    }
    if (this.videoCaptureVideo) {
      this.videoCaptureVideo.srcObject = null;
      this.videoCaptureVideo = null;
    }
    // Stop media tracks only if we created them (not externally provided)
    if (this.mediaStream && !this.externalStream) {
      this.mediaStream.getTracks().forEach((track) => track.stop());
    }
    this.mediaStream = null;
    this.externalStream = false;
    for (const src of this.activeSources) {
      try { src.stop(); } catch { /* already stopped */ }
    }
    this.activeSources.clear();
    this.aiAnalyser = null;
    // Close the actual WebSocket session before nullifying
    if (this.resolvedSession) {
      try { this.resolvedSession.close(); } catch { /* already closed */ }
      this.resolvedSession = null;
    }
    this.session = null;
    this.activeTools.clear();
    this.currentUserItemId = null;
    this.currentAssistantItemId = null;
    // Don't reset lastSessionHandle — consumers may need it after disconnect
  }
}
