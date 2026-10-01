import { Schema, model, type InferSchemaType } from 'mongoose';
import { toJSONOptions } from '../lib/json.js';

export const CHECK_TRIGGERS = ['manual', 'schedule'] as const;
export type CheckTrigger = (typeof CHECK_TRIGGERS)[number];

export const RUN_STATUSES = ['running', 'completed', 'failed'] as const;

const totalsSchema = new Schema(
  {
    ok: { type: Number, default: 0 },
    broken: { type: Number, default: 0 },
    wrong_destination: { type: Number, default: 0 },
    timeout: { type: Number, default: 0 },
    // Checks that crashed unexpectedly and produced no result document.
    // (Not called "errors": mongoose reserves that path name.)
    crashed: { type: Number, default: 0 },
  },
  { _id: false },
);

/** One pass of the link checker over all restaurants. */
const checkRunSchema = new Schema(
  {
    startedAt: { type: Date, required: true, default: () => new Date() },
    finishedAt: { type: Date },
    trigger: { type: String, enum: CHECK_TRIGGERS, required: true },
    status: { type: String, enum: RUN_STATUSES, required: true, default: 'running' },
    restaurantCount: { type: Number, default: 0 },
    totals: { type: totalsSchema, default: () => ({}) },
  },
  { toJSON: toJSONOptions },
);

// Recent runs, newest first.
checkRunSchema.index({ startedAt: -1 });

export type CheckRunDoc = InferSchemaType<typeof checkRunSchema>;

export const CheckRun = model('CheckRun', checkRunSchema);
