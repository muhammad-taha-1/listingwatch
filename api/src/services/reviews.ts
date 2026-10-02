import type { Logger } from 'pino';
import { ValidationError } from '../lib/errors.js';
import { AiReview } from '../models/AiReview.js';
import type { Restaurant } from '../models/Restaurant.js';
import type { AiReviewer } from './aiReviewer.js';

type RestaurantDocument = InstanceType<typeof Restaurant>;

/**
 * Review one restaurant's description with the LLM and store the result.
 * Shared by POST /restaurants/:id/review and scripts/review-all.ts.
 */
export async function reviewRestaurant(
  restaurant: RestaurantDocument,
  aiReviewer: AiReviewer,
  log?: Logger,
) {
  const { name, city, description } = restaurant;
  if (description.trim() === '') {
    throw new ValidationError(undefined, 'This restaurant has no description to review');
  }

  const result = await aiReviewer.review({ name, city, description }, log);
  return AiReview.create({
    restaurantId: restaurant._id,
    reviewedDescription: description,
    score: result.score,
    criteria: result.criteria,
    issues: result.issues,
    suggestedDescription: result.suggestedDescription,
    model: result.model,
    inputTokens: result.inputTokens,
    outputTokens: result.outputTokens,
    costUsd: result.costUsd,
  });
}
