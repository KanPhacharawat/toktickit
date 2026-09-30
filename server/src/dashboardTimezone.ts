// Lab 4 specification.md §5.4 BR-17 — all timestamps are stored in UTC;
// dashboard day/week boundaries use Asia/Bangkok (UTC+7), a fixed offset with
// no daylight-saving rules to worry about.

export const DASHBOARD_TIME_ZONE = "Asia/Bangkok";

const BANGKOK_OFFSET_MS = 7 * 60 * 60 * 1000;

/**
 * The UTC instant corresponding to 00:00 today in Asia/Bangkok, relative to
 * `now`. Used by BR-43's `todayDelta` ("created since 00:00 Asia/Bangkok
 * today") so a ticket created at 23:30 UTC still counts as "today" once it
 * is past midnight in Bangkok.
 */
export function startOfTodayBangkok(now: Date = new Date()): Date {
  const shifted = new Date(now.getTime() + BANGKOK_OFFSET_MS);
  const wallStartOfDay = Date.UTC(shifted.getUTCFullYear(), shifted.getUTCMonth(), shifted.getUTCDate());
  return new Date(wallStartOfDay - BANGKOK_OFFSET_MS);
}
