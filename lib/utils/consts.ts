export const ENV_IDEMPOTENCY_TABLE = 'IDEMPOTENCY_TABLE';
export const ENV_EVENT_RESULTS_TABLE = 'EVENT_RESULTS_TABLE';
export const ENV_SYSTEM_STATS_TABLE = 'EVENT_STATS_TABLE';
export const ENV_QUEUE_URL = 'QUEUE_URL';
export const ENV_INGEST_API_KEY = 'API_KEY';

export const SYSTEM_STATS = {
  ATHLETES_TRACKED: 'tracked',
  UPDATES_ACCEPTED: 'accepted',
  UPDATES_IGNORED: 'ignored',
  UPDATES_REJECTED: 'rejected',
} as const;

export type SystemStats = (typeof SYSTEM_STATS)[keyof typeof SYSTEM_STATS];
