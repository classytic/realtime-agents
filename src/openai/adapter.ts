/**
 * @classytic/realtime-agents/openai - OpenAI Adapter
 *
 * Implements RealtimeAdapter using the OpenAI Agents SDK.
 * Supports both WebRTC (default, browser) and WebSocket transports.
 *
 * - **WebRTC**: Audio I/O handled automatically by the browser.
 * - **WebSocket**: Audio captured via AudioWorklet and played via AudioContext.
 */

import {
  RealtimeSession,
  OpenAIRealtimeWebRTC,
  OpenAIRealtimeWebSocket,
  type RealtimeSessionConfig,
} from "@openai/agents/realtime";
import type {
  RealtimeAdapter,
  ConnectOptions,
  TransportEventHandlers,
  UsageInfo,
} from "../types.js";
import { float32ToPcm16, decodeAudioData } from "../audio/pcm-utils.js";
import { getAudioWorkletUrl } from "../audio/worklet.js";
import { applyCodecPreferences, audioFormatForCodec } from "./codec-utils.js";
import { buildRealtimeAgent } from "./map-tools.js";
import type {
  OpenAIAdapterOptions,
  OpenAISessionProviderOptions,
} from "./types.js";

/** Default sample rate for OpenAI Realtime PCM16 audio */
const OPENAI_SAMPLE_RATE = 24000;

function mergeOpenAISessionConfig(
  ...configs: Array<Partial<RealtimeSessionConfig> | undefined>
): Partial<RealtimeSessionConfig> {
  let merged: Partial<RealtimeSessionConfig> = {};

  for (const config of configs) {
    if (!config) continue;

    const previousAudio = (
      merged as {
        audio?: {
          input?: Record<string, unknown>;
          output?: Record<string, unknown>;
        };
      }
    ).audio;
    const nextAudio = (
      config as {
        audio?: {
          input?: Record<string, unknown>;
          output?: Record<string, unknown>;
        };
      }
    ).audio;

    merged = {
      ...merged,
      ...config,
      providerData: {
        ...(merged.providerData ?? {}),
        ...(config.providerData ?? {}),
      },
      audio:
        previousAudio || nextAudio
          ? {
            ...(previousAudio ?? {}),
            ...(nextAudio ?? {}),
            input:
              previousAudio?.input || nextAudio?.input
                ? {
                  ...(previousAudio?.input ?? {}),
                  ...(nextAudio?.input ?? {}),
                }
                : undefined,
            output:
              previousAudio?.output || nextAudio?.output
                ? {
                  ...(previousAudio?.output ?? {}),
                  ...(nextAudio?.output ?? {}),
                }
                : undefined,
          }
          : undefined,
    };
  }

  return merged;
}

function mergeOpenAISessionOptions(
  base: OpenAISessionProviderOptions | undefined,
  override: OpenAISessionProviderOptions | undefined,
): OpenAISessionProviderOptions {
  const traceMetadata = {
    ...(base?.traceMetadata ?? {}),
    ...(override?.traceMetadata ?? {}),
  };

  return {
    ...base,
    ...override,
    sessionConfig: mergeOpenAISessionConfig(
      base?.sessionConfig,
      override?.sessionConfig,
    ),
    outputGuardrails: override?.outputGuardrails ?? base?.outputGuardrails,
    outputGuardrailSettings:
      override?.outputGuardrailSettings ?? base?.outputGuardrailSettings,
    traceMetadata:
      Object.keys(traceMetadata).length > 0 ? traceMetadata : undefined,
  };
}

export class OpenAIAdapter implements RealtimeAdapter {
  readonly providerName = "openai";

  private session: RealtimeSession | null = null;
  private handlers: TransportEventHandlers | null = null;
  private activeResponseRef = false;
  private audioPlayingRef = false;
  /** Whether the current response produced any audio output (speaking). */
  private responseHadAudio = false;
  private usageSnapshot: UsageInfo | null = null;

  private readonly transport: "webrtc" | "websocket";
  private readonly codec: string;
  private readonly model: string;
  private readonly transcriptionModel: string;
  private readonly transcriptionLanguage?: string;
  private readonly transcriptionPrompt?: string;
  private readonly vadEagerness: string;
  private readonly sessionOptions?: OpenAISessionProviderOptions;
  private readonly contextManagement: {
    mode: "auto" | "disabled";
    retentionRatio?: number;
  };

  // ── WebRTC output audio visualization ──
  private webrtcAudioCtx: AudioContext | null = null;
  private webrtcAnalyser: AnalyserNode | null = null;
  private webrtcPollTimer: ReturnType<typeof setInterval> | null = null;

  // ── WebSocket-only audio pipeline ──
  private wsConnected = false;
  private wsIsMuted = false;
  private wsOutputCtx: AudioContext | null = null;
  private wsInputCtx: AudioContext | null = null;
  private wsWorkletNode: AudioWorkletNode | null = null;
  private wsInputSource: MediaStreamAudioSourceNode | null = null;
  private wsMediaStream: MediaStream | null = null;
  private wsOwnsMediaStream = false;
  private wsAnalyser: AnalyserNode | null = null;
  private wsActiveSources: Set<AudioBufferSourceNode> = new Set();
  private wsNextStartTime = 0;

  constructor(options: OpenAIAdapterOptions = {}) {
    this.transport = options.transport ?? "webrtc";
    this.codec = options.codec ?? "opus";
    this.model = options.model ?? "gpt-realtime";
    this.transcriptionModel =
      options.transcriptionModel ?? "gpt-4o-mini-transcribe";
    this.transcriptionLanguage = options.transcriptionLanguage;
    this.transcriptionPrompt = options.transcriptionPrompt;
    this.vadEagerness = options.vadEagerness ?? "medium";
    this.sessionOptions = options.sessionOptions;
    this.contextManagement = {
      mode: options.contextManagement?.mode ?? "auto",
      retentionRatio: options.contextManagement?.retentionRatio ?? 0.8,
    };
  }

  /**
   * Build the `providerData` for context truncation in the OpenAI session config.
   *
   * - mode 'auto' (default): `retention_ratio` at 0.8 — optimizes prompt caching
   * - mode 'disabled': `truncation: { type: 'disabled' }` — errors at 28k tokens
   */
  private buildTruncationConfig(): Partial<RealtimeSessionConfig> {
    if (this.contextManagement.mode === "disabled") {
      return { providerData: { truncation: { type: "disabled" } } };
    }
    if (this.contextManagement.retentionRatio) {
      return {
        providerData: {
          truncation: {
            type: "retention_ratio",
            retention_ratio: this.contextManagement.retentionRatio,
          },
        },
      };
    }
    // Default 'auto' — no extra config needed, OpenAI handles it
    return {};
  }

  /** Get the AnalyserNode for audio output visualization (all transports). */
  getOutputAnalyser(): AnalyserNode | null {
    return this.wsAnalyser ?? this.webrtcAnalyser;
  }

  async connect(
    options: ConnectOptions,
    handlers: TransportEventHandlers,
  ): Promise<void> {
    if (this.session) {
      console.warn("[OpenAIAdapter] Session already connected");
      return;
    }

    this.handlers = handlers;
    const agent = buildRealtimeAgent(options.agent);
    const audioFormat = audioFormatForCodec(this.codec);
    const ephemeralKey = await options.getCredentials();
    const openaiSessionOptions = mergeOpenAISessionOptions(
      this.sessionOptions,
      options.providerOptions?.openai as OpenAISessionProviderOptions | undefined,
    );

    const transportLayer =
      this.transport === "websocket"
        ? new OpenAIRealtimeWebSocket()
        : new OpenAIRealtimeWebRTC({
            audioElement: options.audioElement,
            mediaStream: options.mediaStream,
            changePeerConnection: async (pc: RTCPeerConnection) => {
              applyCodecPreferences(pc, this.codec);
              return pc;
            },
          });

    this.session = new RealtimeSession(agent, {
      transport: transportLayer,
      model: this.model,
      config: mergeOpenAISessionConfig({
        outputModalities: ["audio"],
        audio: {
          input: {
            format: audioFormat,
            transcription: {
              model: this.transcriptionModel,
              ...(this.transcriptionLanguage
                ? { language: this.transcriptionLanguage }
                : {}),
              ...(this.transcriptionPrompt
                ? { prompt: this.transcriptionPrompt }
                : {}),
            },
            turnDetection: {
              type: "semantic_vad",
              eagerness: this.vadEagerness as
                | "low"
                | "medium"
                | "high"
                | "auto",
              createResponse: true,
              interruptResponse: true,
            },
          },
          output: {
            format: audioFormat,
            speed: 1,
          },
        },
        ...this.buildTruncationConfig(),
      }, openaiSessionOptions.sessionConfig),
      context: options.context ?? {},
      outputGuardrails: openaiSessionOptions.outputGuardrails as any,
      outputGuardrailSettings: openaiSessionOptions.outputGuardrailSettings as any,
      historyStoreAudio: openaiSessionOptions.historyStoreAudio,
      tracingDisabled: openaiSessionOptions.tracingDisabled,
      workflowName: openaiSessionOptions.workflowName,
      groupId: openaiSessionOptions.groupId,
      traceMetadata: openaiSessionOptions.traceMetadata as any,
      automaticallyTriggerResponseForMcpToolCalls:
        openaiSessionOptions.automaticallyTriggerResponseForMcpToolCalls,
      toolErrorFormatter: openaiSessionOptions.toolErrorFormatter as any,
    });

    this.wireSessionEvents();
    await this.session.connect({ apiKey: ephemeralKey });

    // Start transport-specific audio pipeline
    if (this.transport === "websocket") {
      await this.startWebSocketAudio(options.mediaStream);
    } else if (options.audioElement) {
      this.startWebRTCAnalyser(options.audioElement);
    }

    // Pre-seed conversation history if provided
    if (options.history?.length) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const transport = (this.session as any)?.transport;
      for (const entry of options.history) {
        transport?.sendEvent({
          type: "conversation.item.create",
          item: {
            type: "message",
            role: entry.role,
            content: [
              {
                type: entry.role === "user" ? "input_text" : "text",
                text: entry.text,
              },
            ],
          },
        });
      }
      const lastEntry = options.history[options.history.length - 1];
      if (lastEntry.role === "user") {
        this.activeResponseRef = true;
        transport?.sendEvent({ type: "response.create" });
      }
    }
  }

  disconnect(): void {
    if (this.session) {
      // Capture usage before closing
      try {
        const usage = this.session.usage;
        if (usage) {
          this.usageSnapshot = this.mapUsage(usage);
        }
      } catch {
        /* usage not available */
      }
      this.session.close();
      this.session = null;
    }
    this.cleanupWebRTCAnalyser();
    this.cleanupWebSocketAudio();
    this.activeResponseRef = false;
    this.audioPlayingRef = false;
    this.responseHadAudio = false;
    this.handlers = null;
  }

  sendMessage(text: string): void {
    if (!this.session) throw new Error("Session not connected");
    this.session.sendMessage(text);
  }

  sendImage(dataUrl: string, options?: { triggerResponse?: boolean }): void {
    if (!this.session) {
      console.warn(
        "[OpenAIAdapter] sendImage called after disconnect — ignoring",
      );
      return;
    }
    this.session.addImage(dataUrl, {
      triggerResponse: options?.triggerResponse ?? false,
    });
  }

  mute(muted: boolean): void {
    if (this.transport === "websocket") {
      // WebSocket transport throws on session.mute — handle at adapter level
      this.wsIsMuted = muted;
    } else {
      this.session?.mute(muted);
    }
  }

  interrupt(): void {
    if (!this.session) return;
    try {
      this.session.interrupt();
    } catch {
      /* no active response — safe to ignore */
    }
    this.activeResponseRef = false;

    // Stop WebSocket audio playback
    if (this.transport === "websocket") {
      for (const source of this.wsActiveSources) {
        try {
          source.stop();
        } catch {
          /* already stopped */
        }
      }
      this.wsActiveSources.clear();
      if (this.wsOutputCtx) {
        this.wsNextStartTime = this.wsOutputCtx.currentTime;
      }
    }
  }

  pushToTalkStart(): void {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (this.session as any)?.transport?.sendEvent({
      type: "input_audio_buffer.clear",
    });
  }

  pushToTalkStop(): void {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const transport = (this.session as any)?.transport;
    transport?.sendEvent({ type: "input_audio_buffer.commit" });
    if (!this.activeResponseRef) {
      this.activeResponseRef = true;
      transport?.sendEvent({ type: "response.create" });
    }
  }

  sendRawEvent(event: unknown): void {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (this.session as any)?.transport?.sendEvent(event);
  }

  sendSimulatedUserMessage(
    text: string,
    options?: { triggerResponse?: boolean },
  ): void {
    if (!this.session) return;
    const { triggerResponse = true } = options ?? {};
    const id = crypto.randomUUID().slice(0, 32);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const transport = (this.session as any)?.transport;
    transport?.sendEvent({
      type: "conversation.item.create",
      item: {
        id,
        type: "message",
        role: "user",
        content: [{ type: "input_text", text }],
      },
    });
    if (triggerResponse && !this.activeResponseRef) {
      this.activeResponseRef = true;
      transport?.sendEvent({ type: "response.create" });
    }
  }

  async replaceAudioTrack(newStream: MediaStream): Promise<void> {
    if (!this.session) {
      console.warn("[OpenAIAdapter] Cannot replace audio track — no active session");
      return;
    }

    const newTrack = newStream.getAudioTracks()[0];
    if (!newTrack) {
      console.warn("[OpenAIAdapter] No audio track in provided stream");
      return;
    }

    if (this.transport === "webrtc") {
      // Access the peer connection from the SDK transport
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const transport = (this.session as any)?.transport;
      const pc: RTCPeerConnection | undefined =
        transport?.connectionState?.peerConnection;
      if (!pc) {
        console.warn("[OpenAIAdapter] No peer connection available for track replacement");
        return;
      }
      const sender = pc.getSenders().find((s) => s.track?.kind === "audio");
      if (sender) {
        await sender.replaceTrack(newTrack);
      } else {
        console.warn("[OpenAIAdapter] No audio sender found on peer connection");
      }
    } else {
      // WebSocket transport: reconnect the AudioWorklet input source
      if (this.wsInputCtx && this.wsWorkletNode) {
        if (this.wsInputSource) {
          this.wsInputSource.disconnect();
        }
        this.wsMediaStream = newStream;
        this.wsOwnsMediaStream = false;
        this.wsInputSource = this.wsInputCtx.createMediaStreamSource(newStream);
        this.wsInputSource.connect(this.wsWorkletNode);
      }
    }
  }

  updateSessionConfig(config: Record<string, unknown>): void {
    if (!this.session) {
      console.warn("[OpenAIAdapter] Cannot update config — no active session");
      return;
    }
    try {
      (this.session as any).updateSessionConfig?.(config);
    } catch (e) {
      console.warn("[OpenAIAdapter] Failed to update session config:", e);
    }
  }

  getUsage(): UsageInfo | null {
    if (this.session) {
      try {
        const usage = this.session.usage;
        if (usage) {
          return this.mapUsage(usage);
        }
      } catch {
        /* fall through */
      }
    }
    return this.usageSnapshot;
  }

  // ── WebSocket Audio Pipeline ──

  // ── WebRTC Output Analyser ──

  /**
   * Create an AnalyserNode from the WebRTC <audio> element's srcObject.
   * The SDK sets srcObject asynchronously via peerConnection.ontrack,
   * so we poll until the MediaStream is available.
   */
  private startWebRTCAnalyser(audioElement: HTMLAudioElement): void {
    this.webrtcPollTimer = setInterval(() => {
      const stream = audioElement.srcObject as MediaStream | null;
      if (stream && stream.getAudioTracks().length > 0) {
        if (this.webrtcPollTimer) {
          clearInterval(this.webrtcPollTimer);
          this.webrtcPollTimer = null;
        }
        const ctx = new AudioContext();
        ctx.resume();
        const analyser = ctx.createAnalyser();
        analyser.fftSize = 256;
        const source = ctx.createMediaStreamSource(stream);
        source.connect(analyser);
        // Don't connect to ctx.destination — <audio> element handles playback
        this.webrtcAudioCtx = ctx;
        this.webrtcAnalyser = analyser;
      }
    }, 200);
  }

  private cleanupWebRTCAnalyser(): void {
    if (this.webrtcPollTimer) {
      clearInterval(this.webrtcPollTimer);
      this.webrtcPollTimer = null;
    }
    if (this.webrtcAudioCtx) {
      this.webrtcAudioCtx.close();
      this.webrtcAudioCtx = null;
    }
    this.webrtcAnalyser = null;
  }

  // ── WebSocket Audio Pipeline ──

  /**
   * Start manual audio I/O for WebSocket transport.
   *
   * WebSocket does not handle mic/speaker like WebRTC — we must:
   * 1. Capture mic via AudioWorklet → convert to PCM16 → transport.sendAudio()
   * 2. Listen for decoded audio from transport → play via AudioContext
   */
  private async startWebSocketAudio(
    externalStream?: MediaStream,
  ): Promise<void> {
    if (!this.session) return;

    this.wsConnected = true;
    this.wsIsMuted = false;

    // Output context for audio playback (24kHz = OpenAI default)
    this.wsOutputCtx = new AudioContext({ sampleRate: OPENAI_SAMPLE_RATE });
    this.wsAnalyser = this.wsOutputCtx.createAnalyser();
    this.wsAnalyser.fftSize = 256;

    // Input context for mic capture (24kHz to match OpenAI PCM16)
    this.wsInputCtx = new AudioContext({ sampleRate: OPENAI_SAMPLE_RATE });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const transport = (this.session as any)?.transport;

    // ── Audio output: listen for decoded audio from transport ──
    if (transport && typeof transport.on === "function") {
      transport.on("audio", (audioEvent: { data: ArrayBuffer }) => {
        if (!this.wsConnected || !this.wsOutputCtx || !this.wsAnalyser) return;
        this.playAudioChunk(audioEvent.data);
      });
    }

    // ── Audio input: mic capture via worklet ──
    try {
      await this.wsInputCtx.audioWorklet.addModule(getAudioWorkletUrl());
    } catch (e) {
      console.error("[OpenAIAdapter] Failed to load audio worklet", e);
      return;
    }

    try {
      if (externalStream) {
        this.wsMediaStream = externalStream;
        this.wsOwnsMediaStream = false;
      } else {
        this.wsMediaStream = await navigator.mediaDevices.getUserMedia({
          audio: true,
        });
        this.wsOwnsMediaStream = true;
      }
    } catch (e) {
      this.handlers?.onError(
        e instanceof Error ? e : new Error("Microphone access denied"),
      );
      return;
    }

    this.wsInputSource = this.wsInputCtx.createMediaStreamSource(
      this.wsMediaStream,
    );
    this.wsWorkletNode = new AudioWorkletNode(
      this.wsInputCtx,
      "recorder-processor",
    );

    this.wsWorkletNode.port.onmessage = (e: MessageEvent<Float32Array>) => {
      if (this.wsIsMuted || !this.wsConnected || !transport) return;
      const pcm16Buffer = float32ToPcm16(e.data);
      try {
        transport.sendAudio(pcm16Buffer);
      } catch {
        // Transport closed — stop sending
      }
    };

    this.wsInputSource.connect(this.wsWorkletNode);
    // Route through a silent gain node to keep graph alive without echo/feedback
    const silentGain = this.wsInputCtx.createGain();
    silentGain.gain.value = 0;
    this.wsWorkletNode.connect(silentGain);
    silentGain.connect(this.wsInputCtx.destination);
  }

  /** Decode a PCM16 ArrayBuffer chunk and schedule it for playback. */
  private async playAudioChunk(data: ArrayBuffer): Promise<void> {
    if (!this.wsOutputCtx || !this.wsAnalyser) return;

    try {
      const audioBuffer = await decodeAudioData(
        new Uint8Array(data),
        this.wsOutputCtx,
        OPENAI_SAMPLE_RATE,
      );

      if (this.wsNextStartTime < this.wsOutputCtx.currentTime) {
        this.wsNextStartTime = this.wsOutputCtx.currentTime;
      }

      const source = this.wsOutputCtx.createBufferSource();
      source.buffer = audioBuffer;
      source.connect(this.wsAnalyser);
      this.wsAnalyser.connect(this.wsOutputCtx.destination);

      this.wsActiveSources.add(source);
      source.start(this.wsNextStartTime);
      this.wsNextStartTime += audioBuffer.duration;

      source.onended = () => {
        this.wsActiveSources.delete(source);
      };
    } catch (e) {
      console.error("[OpenAIAdapter] WebSocket audio decode error", e);
    }
  }

  /** Clean up WebSocket audio resources. */
  private cleanupWebSocketAudio(): void {
    this.wsConnected = false;

    if (this.wsInputSource) {
      this.wsInputSource.disconnect();
      this.wsInputSource = null;
    }
    if (this.wsWorkletNode) {
      this.wsWorkletNode.disconnect();
      this.wsWorkletNode = null;
    }
    if (this.wsInputCtx) {
      this.wsInputCtx.close();
      this.wsInputCtx = null;
    }
    for (const src of this.wsActiveSources) {
      try {
        src.stop();
      } catch {
        /* already stopped */
      }
    }
    this.wsActiveSources.clear();
    if (this.wsOutputCtx) {
      this.wsOutputCtx.close();
      this.wsOutputCtx = null;
    }
    this.wsAnalyser = null;
    if (this.wsMediaStream && this.wsOwnsMediaStream) {
      this.wsMediaStream.getTracks().forEach((track) => track.stop());
    }
    this.wsMediaStream = null;
    this.wsOwnsMediaStream = false;
  }

  // ── Internal: wire OpenAI SDK events to TransportEventHandlers ──

  private wireSessionEvents(): void {
    if (!this.session || !this.handlers) return;

    const session = this.session;
    const handlers = this.handlers;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const sess = session as any;

    // ── Transport-level disconnect detection ──
    // RealtimeSession does NOT forward `disconnected` or `connection_change`
    // events — they are transport-layer events emitted by OpenAIRealtimeBase._onClose(),
    // not parsed server messages. The session only re-emits `*` (server events)
    // via `transport_event`. We must listen on the transport directly.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const transportRef = (sess as any).transport;
    if (transportRef && typeof transportRef.on === "function") {
      transportRef.on("disconnected", () => {
        this.handleUnexpectedDisconnect(handlers);
      });
    }

    // Error events
    sess.on("error", (...args: unknown[]) => {
      const error = this.parseError(args[0]);
      if (error) {
        handlers.onError(error);

        // Fallback: detect connection-level errors by message pattern
        // (in case `disconnected` doesn't fire for some edge case)
        if (this.isConnectionLossError(error) && this.session) {
          this.handleUnexpectedDisconnect(handlers);
        }
      }
    });

    // History / agent events
    sess.on("agent_handoff", (...args: unknown[]) => {
      const toAgent = args[2] as { name?: string } | undefined;
      handlers.onAgentHandoff?.(toAgent?.name ?? "unknown");
    });

    sess.on("agent_tool_start", (...args: unknown[]) => {
      const functionCall = args[2] as
        | { name?: string; arguments?: unknown }
        | undefined;
      handlers.onToolStart?.(
        functionCall?.name ?? "unknown",
        functionCall?.arguments,
      );
    });

    sess.on("agent_tool_end", (...args: unknown[]) => {
      const functionCall = args[2] as { name?: string } | undefined;
      const result = args[3];
      handlers.onToolEnd?.(functionCall?.name ?? "unknown", result);
    });

    sess.on("history_added", (...args: unknown[]) => {
      const item = args[0] as Record<string, unknown>;
      handlers.onTransportEvent?.({ type: "history_added", item });
    });

    sess.on("history_updated", (...args: unknown[]) => {
      const items = args[0] as Record<string, unknown>[];
      handlers.onTransportEvent?.({ type: "history_updated", items });
    });

    sess.on("guardrail_tripped", (...args: unknown[]) => {
      handlers.onGuardrailTripped?.(args[2]);
    });

    // ── Transport events ──
    sess.on(
      "transport_event",
      (event: { type: string; [key: string]: unknown }) => {
        switch (event.type) {
          // ── Response lifecycle ──
          case "response.created":
            this.activeResponseRef = true;
            this.responseHadAudio = false;
            handlers.onAgentStatusChange("thinking");
            break;
          case "response.done": {
            this.activeResponseRef = false;
            const hadAudio = this.responseHadAudio;
            this.responseHadAudio = false;
            queueMicrotask(() => this.emitUsageUpdate());
            // WebRTC: audio may still be playing through the media track.
            // Only go idle if the audio buffer has already stopped.
            if (!this.audioPlayingRef) {
              // If the response produced no audio (AI decided not to respond,
              // e.g. during a mid-sentence VAD pause), stay in "listening"
              // instead of flashing "idle" — the AI is still actively listening.
              handlers.onAgentStatusChange(hadAudio ? "idle" : "listening");
            }
            break;
          }

          // ── Audio output ──
          // WebSocket: response.output_audio.delta fires per PCM chunk
          // WebRTC: audio goes via RTP media track — transcript deltas and
          //         output_audio_buffer events track playback state instead
          case "response.output_audio.delta":
          case "response.output_audio_transcript.delta":
            this.responseHadAudio = true;
            handlers.onAgentStatusChange("speaking");
            break;
          case "output_audio_buffer.started":
            this.audioPlayingRef = true;
            this.responseHadAudio = true;
            handlers.onAgentStatusChange("speaking");
            break;
          case "output_audio_buffer.stopped":
          case "output_audio_buffer.cleared":
            this.audioPlayingRef = false;
            if (!this.activeResponseRef) {
              handlers.onAgentStatusChange("idle");
            }
            break;

          // ── Voice activity detection ──
          case "input_audio_buffer.speech_started":
            handlers.onAgentStatusChange("listening");
            handlers.onUserSpeechStart?.();
            break;
          case "input_audio_buffer.speech_stopped":
            handlers.onAgentStatusChange("thinking");
            handlers.onUserSpeechStop?.();
            break;
        }
        handlers.onTransportEvent?.(event);
      },
    );

    // Tool approval
    sess.on(
      "tool_approval_requested",
      async (
        _context: unknown,
        _agent: unknown,
        approvalRequest: {
          approvalItem?: { name?: string; arguments?: unknown };
        },
      ) => {
        const toolName = approvalRequest?.approvalItem?.name ?? "unknown";
        const toolArgs = approvalRequest?.approvalItem?.arguments;

        if (handlers.onToolApprovalRequest) {
          const approved = await handlers.onToolApprovalRequest(
            toolName,
            toolArgs,
          );
          if (approved) {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            session.approve(approvalRequest.approvalItem as any);
          } else {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            session.reject(approvalRequest.approvalItem as any);
          }
        } else {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          session.approve(approvalRequest.approvalItem as any);
        }
      },
    );

    // MCP tool completion
    sess.on("mcp_tool_call_completed", () => {
      if (!this.activeResponseRef) {
        this.activeResponseRef = true;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (session as any).transport?.sendEvent({ type: "response.create" });
      }
    });
  }

  /** Read the latest usage from the session and emit to handlers */
  private emitUsageUpdate(): void {
    if (!this.session || !this.handlers?.onUsageUpdate) return;
    try {
      const usage = this.session.usage;
      if (usage) {
        this.handlers.onUsageUpdate(this.mapUsage(usage));
      }
    } catch {
      /* usage not available */
    }
  }

  private mapUsage(usage: {
    inputTokens?: number;
    outputTokens?: number;
    totalTokens?: number;
    requests?: number;
    inputTokensDetails?: Record<string, unknown> | Record<string, unknown>[];
    outputTokensDetails?: Record<string, unknown> | Record<string, unknown>[];
  }): UsageInfo {
    return {
      inputTokens: usage.inputTokens ?? 0,
      outputTokens: usage.outputTokens ?? 0,
      totalTokens: usage.totalTokens ?? 0,
      requests: usage.requests,
      inputTokensDetails: this.flattenDetails(usage.inputTokensDetails),
      outputTokensDetails: this.flattenDetails(usage.outputTokensDetails),
      rawUsage: usage,
    };
  }

  /** Flatten token detail arrays/objects into a single Record<string, number> for UsageInfo */
  private flattenDetails(
    details: Record<string, unknown> | Record<string, unknown>[] | undefined,
  ): Record<string, number> | undefined {
    if (!details) return undefined;
    const source = Array.isArray(details)
      ? Object.assign({}, ...details)
      : details;
    const result: Record<string, number> = {};
    for (const [key, value] of Object.entries(source)) {
      if (typeof value === "number") {
        result[key] = value;
      } else if (value && typeof value === "object") {
        for (const [subKey, subVal] of Object.entries(
          value as Record<string, unknown>,
        )) {
          if (typeof subVal === "number") {
            result[`${key}.${subKey}`] = subVal;
          }
        }
      }
    }
    return Object.keys(result).length > 0 ? result : undefined;
  }

  /**
   * Handle an unexpected transport disconnect (WebRTC ICE failure, WebSocket close, etc.).
   * Cleans up internal state and signals 'disconnected' to the session hook,
   * which triggers useAutoReconnect if enabled.
   */
  private handleUnexpectedDisconnect(handlers: TransportEventHandlers): void {
    if (!this.session) return; // already handled or intentional disconnect
    this.session = null;
    this.cleanupWebRTCAnalyser();
    this.cleanupWebSocketAudio();
    this.activeResponseRef = false;
    this.audioPlayingRef = false;
    handlers.onAgentStatusChange("idle");
    handlers.onStatusChange("disconnected");
  }

  /** No-op — OpenAI has no session resumption. History injection is handled at the hook level. */
  prepareReconnect(): void {
    // Nothing to do — OpenAI sessions always start fresh.
    // useAutoReconnect injects transcript history via ConnectOptions.history.
  }

  /**
   * Check if an error indicates a transport-level connection loss.
   * Used to trigger automatic reconnection via useAutoReconnect.
   */
  private isConnectionLossError(error: Error): boolean {
    const msg = error.message.toLowerCase();
    return (
      (msg.includes("websocket") &&
        (msg.includes("close") || msg.includes("error"))) ||
      (msg.includes("connection") &&
        (msg.includes("failed") ||
          msg.includes("closed") ||
          msg.includes("lost"))) ||
      (msg.includes("ice") && msg.includes("failed")) ||
      msg.includes("network") ||
      msg.includes("rtcpeerconnection")
    );
  }

  /**
   * Parse various error formats from the OpenAI SDK into a standard Error.
   * Returns null for expected/ignorable errors.
   */
  private parseError(errorArg: unknown): Error | null {
    let error: Error;
    let errorCode: string | undefined;

    if (errorArg instanceof Error) {
      error = errorArg;
    } else if (typeof errorArg === "string") {
      error = new Error(errorArg);
    } else if (errorArg && typeof errorArg === "object") {
      const errObj = errorArg as Record<string, unknown>;
      if (errObj.error && typeof errObj.error === "object") {
        errorCode = (errObj.error as Record<string, unknown>).code as
          | string
          | undefined;
      }
      let message: unknown = "Unknown error occurred";
      try {
        message =
          errObj.message ||
          errObj.error ||
          errObj.reason ||
          JSON.stringify(errorArg);
      } catch {
        message = "Error object could not be stringified";
      }
      if (typeof message === "object") {
        try {
          message = JSON.stringify(message);
        } catch {
          message = "[object Object]";
        }
      }
      error = new Error(String(message));
    } else {
      error = new Error("Unknown error occurred");
    }

    // Filter expected errors that happen during normal interrupt/end scenarios
    const isExpected =
      errorCode === "conversation_already_has_active_response" ||
      errorCode === "response_cancel_not_active" ||
      error.message.includes("conversation_already_has_active_response") ||
      error.message.includes("response_cancel_not_active");

    if (isExpected) {
      console.log("[OpenAIAdapter] Expected error (ignored):", error.message);
      return null;
    }

    return error;
  }
}
