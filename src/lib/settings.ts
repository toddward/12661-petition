import type { SiteMode } from '../env';

export interface Settings {
  site_mode: SiteMode;
  goal_percent: number;
  occupied_override: number | null;
  organizer_name: string;
  organizer_email: string;
  organizer_phone: string;
  co_organizers: string;
  retention_days_ip: number;
  retention_days_all: number;
  require_email_confirmation: boolean;
  final_decision_date: string; // YYYY-MM-DD or ''
  privacy_updated: string; // YYYY-MM-DD
}

export const DEFAULT_SETTINGS: Settings = {
  site_mode: 'pledge',
  goal_percent: 75,
  occupied_override: null,
  organizer_name: 'Todd Wardzinski',
  organizer_email: '',
  organizer_phone: '',
  co_organizers: '',
  retention_days_ip: 365,
  retention_days_all: 730,
  require_email_confirmation: false,
  final_decision_date: '',
  privacy_updated: '2026-11-13',
};

/** Keys an admin may edit from /admin/settings (site_mode has its own confirmation flow). */
export const EDITABLE_SETTING_KEYS = [
  'organizer_name',
  'organizer_email',
  'organizer_phone',
  'co_organizers',
  'goal_percent',
  'occupied_override',
  'retention_days_ip',
  'retention_days_all',
  'require_email_confirmation',
  'final_decision_date',
  'privacy_updated',
] as const;
export type EditableSettingKey = (typeof EDITABLE_SETTING_KEYS)[number];

function toInt(v: string | undefined, fallback: number): number {
  if (v === undefined || v.trim() === '') return fallback;
  const n = Number.parseInt(v, 10);
  return Number.isFinite(n) ? n : fallback;
}

export function parseSettings(rows: { key: string; value: string }[]): Settings {
  const map = new Map(rows.map((r) => [r.key, r.value]));
  const mode = map.get('site_mode');
  const override = map.get('occupied_override');
  const overrideN = override && override.trim() !== '' ? Number.parseInt(override, 10) : NaN;
  return {
    site_mode: mode === 'petition' || mode === 'closed' || mode === 'pledge' ? mode : DEFAULT_SETTINGS.site_mode,
    goal_percent: toInt(map.get('goal_percent'), DEFAULT_SETTINGS.goal_percent),
    occupied_override: Number.isFinite(overrideN) && overrideN > 0 ? overrideN : null,
    organizer_name: map.get('organizer_name') ?? DEFAULT_SETTINGS.organizer_name,
    organizer_email: map.get('organizer_email') ?? '',
    organizer_phone: map.get('organizer_phone') ?? '',
    co_organizers: map.get('co_organizers') ?? '',
    retention_days_ip: toInt(map.get('retention_days_ip'), DEFAULT_SETTINGS.retention_days_ip),
    retention_days_all: toInt(map.get('retention_days_all'), DEFAULT_SETTINGS.retention_days_all),
    require_email_confirmation: map.get('require_email_confirmation') === 'true',
    final_decision_date: map.get('final_decision_date') ?? '',
    privacy_updated: map.get('privacy_updated') || DEFAULT_SETTINGS.privacy_updated,
  };
}

export async function getSettings(db: D1Database): Promise<Settings> {
  const { results } = await db.prepare('SELECT key, value FROM settings').all<{ key: string; value: string }>();
  return parseSettings(results);
}

export function setSettingStmt(db: D1Database, key: string, value: string): D1PreparedStatement {
  return db
    .prepare('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value')
    .bind(key, value);
}

export async function setSetting(db: D1Database, key: string, value: string): Promise<void> {
  await setSettingStmt(db, key, value).run();
}
