import { invoke } from '@tauri-apps/api/core';
import { listen, type UnlistenFn } from '@tauri-apps/api/event';
import type {
  BindingRole,
  CounterStrafingAssessmentRecord,
  CounterStrafingAssessmentSnapshot,
  CounterStrafingSettings,
  CounterStrafingSnapshot,
  ShootingErrorRecord,
} from '@core/counter-strafing/types';

export async function loadCounterStrafingSettings(): Promise<CounterStrafingSettings> {
  return invoke<CounterStrafingSettings>('load_counter_strafing_settings_cmd');
}

export async function saveCounterStrafingSettings(
  settings: CounterStrafingSettings,
): Promise<CounterStrafingSnapshot> {
  return invoke<CounterStrafingSnapshot>('save_counter_strafing_settings_cmd', { settings });
}

export async function resetCounterStrafingSettings(): Promise<CounterStrafingSnapshot> {
  return invoke<CounterStrafingSnapshot>('reset_counter_strafing_settings_cmd');
}

export async function getCounterStrafingSnapshot(): Promise<CounterStrafingSnapshot> {
  return invoke<CounterStrafingSnapshot>('get_counter_strafing_snapshot');
}

export async function startCounterStrafing(): Promise<CounterStrafingSnapshot> {
  return invoke<CounterStrafingSnapshot>('start_counter_strafing');
}

export async function stopCounterStrafing(): Promise<CounterStrafingSnapshot> {
  return invoke<CounterStrafingSnapshot>('stop_counter_strafing');
}

export async function clearCounterStrafingRecords(): Promise<CounterStrafingSnapshot> {
  return invoke<CounterStrafingSnapshot>('clear_counter_strafing_records');
}

export async function showCounterStrafingHud(): Promise<CounterStrafingSnapshot> {
  return invoke<CounterStrafingSnapshot>('show_counter_strafing_hud');
}

export async function hideCounterStrafingHud(): Promise<CounterStrafingSnapshot> {
  return invoke<CounterStrafingSnapshot>('hide_counter_strafing_hud');
}

export async function saveCounterStrafingAssessmentHudBounds(bounds: {
  x: number;
  y: number;
  width: number;
  height: number;
}): Promise<void> {
  return invoke<void>('save_counter_strafing_assessment_hud_bounds', bounds);
}

export async function getCounterStrafingAssessmentSnapshot(): Promise<CounterStrafingAssessmentSnapshot> {
  return invoke<CounterStrafingAssessmentSnapshot>('get_counter_strafing_assessment_snapshot');
}

export async function clearCounterStrafingAssessmentRecords(): Promise<CounterStrafingAssessmentSnapshot> {
  return invoke<CounterStrafingAssessmentSnapshot>('clear_counter_strafing_assessment_records');
}

export async function showCounterStrafingAssessmentHud(): Promise<CounterStrafingAssessmentSnapshot> {
  return invoke<CounterStrafingAssessmentSnapshot>('show_counter_strafing_assessment_hud');
}

export async function hideCounterStrafingAssessmentHud(): Promise<CounterStrafingAssessmentSnapshot> {
  return invoke<CounterStrafingAssessmentSnapshot>('hide_counter_strafing_assessment_hud');
}

export async function onCounterStrafingAssessmentRecord(
  handler: (record: CounterStrafingAssessmentRecord) => void,
): Promise<UnlistenFn> {
  return listen<CounterStrafingAssessmentRecord>('counter-strafing-assessment-record', (event) => {
    handler(event.payload);
  });
}

export async function onCounterStrafingAssessmentSnapshot(
  handler: (snapshot: CounterStrafingAssessmentSnapshot) => void,
): Promise<UnlistenFn> {
  return listen<CounterStrafingAssessmentSnapshot>('counter-strafing-assessment-snapshot', (event) => {
    handler(event.payload);
  });
}

export async function saveHudBounds(bounds: {
  x: number;
  y: number;
  width: number;
  height: number;
}): Promise<void> {
  return invoke<void>('save_hud_bounds', bounds);
}

export async function startBindingCapture(role: BindingRole): Promise<CounterStrafingSnapshot> {
  return invoke<CounterStrafingSnapshot>('start_binding_capture', { role });
}

export async function cancelBindingCapture(): Promise<CounterStrafingSnapshot> {
  return invoke<CounterStrafingSnapshot>('cancel_binding_capture');
}

export async function resetKeyMap(): Promise<CounterStrafingSnapshot> {
  return invoke<CounterStrafingSnapshot>('reset_key_map');
}

export async function onCounterStrafingShot(
  handler: (record: ShootingErrorRecord) => void,
): Promise<UnlistenFn> {
  return listen<ShootingErrorRecord>('counter-strafing-shot', (event) => {
    handler(event.payload);
  });
}

export async function onCounterStrafingSnapshot(
  handler: (snapshot: CounterStrafingSnapshot) => void,
): Promise<UnlistenFn> {
  return listen<CounterStrafingSnapshot>('counter-strafing-snapshot', (event) => {
    handler(event.payload);
  });
}

export async function onCounterStrafingStatus(
  handler: (snapshot: CounterStrafingSnapshot) => void,
): Promise<UnlistenFn> {
  return listen<CounterStrafingSnapshot>('counter-strafing-status', (event) => {
    handler(event.payload);
  });
}
