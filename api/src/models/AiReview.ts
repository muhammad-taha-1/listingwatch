import { Schema, Types, model, type InferSchemaType } from 'mongoose';
import { toJSONOptions } from '../lib/json.js';

/** What the reviewer judges. A fixed list so the dashboard can group issues. */
export const ISSUE_TYPES = [
  'clarity',
  'cuisine',
  'location',
  'call_to_action',
  'unverifiable_claim',
  'other',
] as const;
export type IssueType = (typeof ISSUE_TYPES)[number];

/** Rubric criteria, each scored 0-20 by the model; the overall score is their sum. */
export const CRITERIA = ['clarity', 'cuisine', 'location', 'call_to_action', 'honesty'] as const;
export type Criterion = (typeof CRITERIA)[number];
export const CRITERION_MAX = 20;

const criterionSchema = new Schema(
  {
    score: { type: Number, required: true, min: 0, max: CRITERION_MAX },
    reason: { type: String, required: true },
  },
  { _id: false },
);

const criteriaSchema = new Schema(
  {
    clarity: { type: criterionSchema, required: true },
    cuisine: { type: criterionSchema, required: true },
    location: { type: criterionSchema, required: true },
    call_to_action: { type: criterionSchema, required: true },
    honesty: { type: criterionSchema, required: true },
  },
  { _id: false },
);

const issueSchema = new Schema(
  {
    type: { type: String, enum: ISSUE_TYPES, required: true },
    detail: { type: String, required: true },
  },
  { _id: false },
);

/** One LLM review of one restaurant's listing description. */
const aiReviewSchema = new Schema(
  {
    restaurantId: { type: Types.ObjectId, ref: 'Restaurant', required: true },
    // The description as it was when reviewed; it may be edited afterwards.
    reviewedDescription: { type: String, required: true },
    // Sum of the criteria scores, computed in code rather than chosen by the model.
    score: { type: Number, required: true, min: 0, max: 100 },
    criteria: { type: criteriaSchema, required: true },
    issues: { type: [issueSchema], default: [] },
    suggestedDescription: { type: String, required: true },
    model: { type: String, required: true },
    // Totals across all attempts, i.e. what we were billed for.
    inputTokens: { type: Number, required: true },
    outputTokens: { type: Number, required: true },
    // Stored rather than derived, so old reviews keep the price they were made at.
    costUsd: { type: Number, required: true },
  },
  { timestamps: { createdAt: true, updatedAt: false }, toJSON: toJSONOptions },
);

// Reviews of one restaurant, newest first (_id breaks same-millisecond ties).
aiReviewSchema.index({ restaurantId: 1, createdAt: -1, _id: -1 });

export type AiReviewDoc = InferSchemaType<typeof aiReviewSchema>;

export const AiReview = model('AiReview', aiReviewSchema);
