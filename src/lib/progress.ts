import type { Mode, SiteMode } from '../env';
import type { Settings } from './settings';

export interface Progress {
  signed: number;
  occupied_total: number;
  percent: number;
  goal_percent: number;
  mode: SiteMode;
  /** Mode whose signatures are counted (pledge/petition). When closed, the active version's mode. */
  counted_mode: Mode;
  updated_at: string;
}

/**
 * Spec §5 progress calculation. Counts distinct in-area, occupied, active households with
 * an active signature in the counted mode. With require_email_confirmation, only rows with
 * a confirmed email count. Never returns names.
 */
export async function computeProgress(
  db: D1Database,
  settings: Settings,
  countedMode: Mode,
  now: Date = new Date(),
): Promise<Progress> {
  const confirmClause = settings.require_email_confirmation
    ? "AND (s.email_confirmed_at IS NOT NULL OR s.entry_method = 'paper')"
    : '';
  const signedRow = await db
    .prepare(
      `SELECT COUNT(DISTINCT s.household_id) AS n
       FROM signatures s JOIN households h ON h.id = s.household_id
       WHERE s.status = 'active' AND s.mode = ?
         AND h.in_petition_area = 1 AND h.occupied = 1 AND h.active = 1
         ${confirmClause}`,
    )
    .bind(countedMode)
    .first<{ n: number }>();

  let occupied = settings.occupied_override;
  if (occupied === null) {
    const row = await db
      .prepare('SELECT COUNT(*) AS n FROM households WHERE in_petition_area = 1 AND occupied = 1 AND active = 1')
      .first<{ n: number }>();
    occupied = row?.n ?? 0;
  }
  const signed = signedRow?.n ?? 0;
  const percent = occupied > 0 ? Math.floor((signed * 1000) / occupied) / 10 : 0;
  return {
    signed,
    occupied_total: occupied,
    percent,
    goal_percent: settings.goal_percent,
    mode: settings.site_mode,
    counted_mode: countedMode,
    updated_at: now.toISOString(),
  };
}

/** Households needed to reach the goal (ceil), never negative. */
export function householdsToGoal(p: Progress): number {
  if (p.occupied_total <= 0) return 0;
  return Math.max(0, Math.ceil((p.goal_percent * p.occupied_total) / 100) - p.signed);
}
