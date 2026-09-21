import { type } from 'arktype';

export const eventUpdate = type({
  eventId: 'string.trim |> string > 0',
  bib: 'string.trim |> string > 0',
  lane: 'number.integer',
  revision: 'number.integer >= 1',
  status: "'PROVISIONAL' | 'CONFIRMED' | 'OFFICIAL'",
  timeMs: 'number.integer > 0',
  recordedAt: 'string?',
});

export type EventUpdate = typeof eventUpdate.infer;
