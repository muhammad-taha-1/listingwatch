import { Schema, Types, model, type InferSchemaType } from 'mongoose';
import { toJSONOptions } from '../lib/json.js';

export const CHECK_OUTCOMES = ['ok', 'broken', 'wrong_destination', 'timeout'] as const;
export type CheckOutcome = (typeof CHECK_OUTCOMES)[number];

/** One link check of one restaurant within one run. */
const checkResultSchema = new Schema(
  {
    restaurantId: { type: Types.ObjectId, ref: 'Restaurant', required: true },
    runId: { type: Types.ObjectId, ref: 'CheckRun', required: true },
    result: { type: String, enum: CHECK_OUTCOMES, required: true },
    // Absent when no HTTP response came back (DNS failure, timeout, refused).
    statusCode: { type: Number },
    finalUrl: { type: String },
    latencyMs: { type: Number, required: true },
    // Short reason for non-ok results, e.g. "ENOTFOUND" or "HTTP 404".
    error: { type: String },
    checkedAt: { type: Date, required: true, default: () => new Date() },
  },
  { toJSON: toJSONOptions },
);

// Restaurant history, newest first.
checkResultSchema.index({ restaurantId: 1, checkedAt: -1 });
// All results of one run.
checkResultSchema.index({ runId: 1 });

export type CheckResultDoc = InferSchemaType<typeof checkResultSchema>;

export const CheckResult = model('CheckResult', checkResultSchema);
