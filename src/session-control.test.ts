import { describe, it, expect, vi } from 'vitest';
import {
  SessionControl,
  SESSION_CONTROL_DEFAULTS,
  toOpenAIConfig,
  toGeminiConnectConfig,
} from './session-control';
import type { SessionControlState } from './session-control';

describe('SessionControl', () => {
  it('initializes with defaults', () => {
    const control = new SessionControl();
    const state = control.getState();

    expect(state.interruptible).toBe(true);
    expect(state.eagerness).toBe('medium');
    expect(state.autoRespond).toBe(true);
    expect(state.noiseReduction).toBe('off');
    expect(state.outputModalities).toEqual(['audio']);
  });

  it('accepts initial state overrides', () => {
    const control = new SessionControl({
      initialState: { interruptible: false, eagerness: 'low' },
    });
    const state = control.getState();

    expect(state.interruptible).toBe(false);
    expect(state.eagerness).toBe('low');
    expect(state.autoRespond).toBe(true); // default preserved
  });

  it('setInterruptible updates state and notifies', () => {
    const onChange = vi.fn();
    const control = new SessionControl({ onStateChange: onChange });

    control.setInterruptible(false);

    expect(control.getState().interruptible).toBe(false);
    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({ interruptible: false }),
    );
  });

  it('setEagerness updates state', () => {
    const control = new SessionControl();
    control.setEagerness('high');
    expect(control.getState().eagerness).toBe('high');
  });

  it('setAutoRespond updates state', () => {
    const control = new SessionControl();
    control.setAutoRespond(false);
    expect(control.getState().autoRespond).toBe(false);
  });

  it('setNoiseReduction updates state', () => {
    const control = new SessionControl();
    control.setNoiseReduction('far_field');
    expect(control.getState().noiseReduction).toBe('far_field');
  });

  it('setOutputModalities updates state', () => {
    const control = new SessionControl();
    control.setOutputModalities(['text', 'audio']);
    expect(control.getState().outputModalities).toEqual(['text', 'audio']);
  });

  it('reset restores defaults', () => {
    const control = new SessionControl();
    control.setInterruptible(false);
    control.setEagerness('high');
    control.setNoiseReduction('near_field');

    control.reset();

    expect(control.getState()).toEqual(SESSION_CONTROL_DEFAULTS);
  });

  it('calls applyToOpenAI on every state change', () => {
    const apply = vi.fn();
    const control = new SessionControl({ applyToOpenAI: apply });

    control.setInterruptible(false);
    expect(apply).toHaveBeenCalledTimes(1);

    control.setEagerness('low');
    expect(apply).toHaveBeenCalledTimes(2);

    // Verify the config shape (camelCase nested under audio.input)
    const lastCall = apply.mock.calls[1]![0] as Record<string, unknown>;
    expect(lastCall).toHaveProperty('audio');
    expect(lastCall).toHaveProperty('outputModalities');
  });

  it('does not call applyToOpenAI when not provided', () => {
    // Should not throw
    const control = new SessionControl();
    control.setInterruptible(false);
    expect(control.getState().interruptible).toBe(false);
  });
});

describe('toOpenAIConfig', () => {
  it('maps state to OpenAI camelCase format', () => {
    const state: SessionControlState = {
      interruptible: false,
      eagerness: 'low',
      autoRespond: false,
      noiseReduction: 'far_field',
      outputModalities: ['text', 'audio'],
    };

    const config = toOpenAIConfig(state);
    const audio = config.audio as { input: Record<string, unknown> };

    expect(audio.input.turnDetection).toEqual({
      type: 'semantic_vad',
      eagerness: 'low',
      interruptResponse: false,
      createResponse: false,
    });
    expect(audio.input.noiseReduction).toEqual({ type: 'far_field' });
    expect(config.outputModalities).toEqual(['text', 'audio']);
  });

  it('sets noise reduction to null when off', () => {
    const state: SessionControlState = {
      ...SESSION_CONTROL_DEFAULTS,
      noiseReduction: 'off',
    };

    const config = toOpenAIConfig(state);
    const audio = config.audio as { input: Record<string, unknown> };
    expect(audio.input.noiseReduction).toBeNull();
  });
});

describe('toGeminiConnectConfig', () => {
  it('maps state to Gemini LiveConnectConfig format', () => {
    const state: SessionControlState = {
      interruptible: false,
      eagerness: 'high',
      autoRespond: true,
      noiseReduction: 'off',
      outputModalities: ['audio'],
    };

    const config = toGeminiConnectConfig(state);

    expect(config.realtimeInputConfig).toEqual({
      automaticActivityDetection: {
        disabled: false,
        startOfSpeechSensitivity: 'START_SENSITIVITY_HIGH',
        endOfSpeechSensitivity: 'END_SENSITIVITY_HIGH',
      },
      activityHandling: 'NO_INTERRUPTION',
    });
    expect(config.responseModalities).toEqual(['AUDIO']);
  });

  it('maps interruptible=true to START_OF_ACTIVITY_INTERRUPTS', () => {
    const state: SessionControlState = {
      ...SESSION_CONTROL_DEFAULTS,
      interruptible: true,
    };

    const config = toGeminiConnectConfig(state);
    expect(
      (config.realtimeInputConfig as Record<string, unknown>).activityHandling,
    ).toBe('START_OF_ACTIVITY_INTERRUPTS');
  });

  it('maps medium eagerness to Gemini defaults (no sensitivity override)', () => {
    const state: SessionControlState = {
      ...SESSION_CONTROL_DEFAULTS,
      eagerness: 'medium',
    };

    const config = toGeminiConnectConfig(state);
    const aad = (config.realtimeInputConfig as Record<string, unknown>)
      .automaticActivityDetection as Record<string, unknown>;

    // Medium = no sensitivity override, just disabled: false
    expect(aad.startOfSpeechSensitivity).toBeUndefined();
    expect(aad.endOfSpeechSensitivity).toBeUndefined();
  });

  it('maps text+audio modalities', () => {
    const state: SessionControlState = {
      ...SESSION_CONTROL_DEFAULTS,
      outputModalities: ['text', 'audio'],
    };

    const config = toGeminiConnectConfig(state);
    expect(config.responseModalities).toEqual(['TEXT', 'AUDIO']);
  });
});

describe('SessionControl.toProviderConfig', () => {
  it('returns OpenAI format for openai provider', () => {
    const control = new SessionControl();
    const config = control.toProviderConfig('openai');
    expect(config).toHaveProperty('audio');
    expect(config).toHaveProperty('outputModalities');
  });

  it('returns Gemini format for gemini provider', () => {
    const control = new SessionControl();
    const config = control.toProviderConfig('gemini');
    expect(config).toHaveProperty('realtimeInputConfig');
  });
});
