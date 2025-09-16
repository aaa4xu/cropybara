import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AlertsLevel, AlertsState } from './AlertsState.svelte';

describe('AlertsState', () => {
  let state: AlertsState;

  beforeEach(() => {
    (AlertsState as unknown as { instance: AlertsState | null }).instance = null;
    state = AlertsState.use();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('returns the same singleton instance for repeated use calls', () => {
    const again = AlertsState.use();
    expect(again).toBe(state);
  });

  it('adds alerts with incrementing identifiers', () => {
    state.display(AlertsLevel.Info, 'First message', 1000);
    state.display(AlertsLevel.Warning, 'Second message', 1000);

    expect(state.alerts).toHaveLength(2);
    expect(state.alerts[0]).toMatchObject({ id: 0, level: AlertsLevel.Info, message: 'First message' });
    expect(state.alerts[1]).toMatchObject({ id: 1, level: AlertsLevel.Warning, message: 'Second message' });
  });

  it('removes alerts by identifier', () => {
    state.display(AlertsLevel.Error, 'Problem occurred', 1000);
    const alertId = state.alerts[0].id;

    state.remove(alertId);

    expect(state.alerts).toHaveLength(0);
  });

  it('ignores removal of alerts that do not exist', () => {
    state.display(AlertsLevel.Info, 'Still here', 1000);

    state.remove(123);

    expect(state.alerts).toHaveLength(1);
    expect(state.alerts[0].message).toBe('Still here');
  });

  it('automatically removes alerts after the configured duration', () => {
    vi.useFakeTimers();

    state.display(AlertsLevel.Success, 'Will disappear', 500);
    expect(state.alerts).toHaveLength(1);

    vi.advanceTimersByTime(500);

    expect(state.alerts).toHaveLength(0);
  });
});
