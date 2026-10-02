import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AiReview } from '../src/models/AiReview.js';
import { AiReviewError, type AiReviewer, type ReviewResult } from '../src/services/aiReviewer.js';
import { authHeader, useTestApp } from './helpers.js';

// A fake reviewer, so these tests never call the real API.
const review = vi.fn<AiReviewer['review']>();
const app = useTestApp({ aiReviewer: { review } });

const pizza = {
  name: 'Pizza Palace',
  city: 'Dublin',
  expectedOrderUrl: 'https://order.pizzapalace.example/',
  description: 'The best pizza in the world.',
};

const result: ReviewResult = {
  score: 50,
  issues: [{ type: 'unverifiable_claim', detail: '"Best in the world" cannot be checked.' }],
  suggestedDescription: 'Pizza in Dublin. Order online.',
  model: 'claude-haiku-4-5-20251001',
  inputTokens: 600,
  outputTokens: 120,
  costUsd: 0.0012,
  attempts: 1,
};

async function createRestaurant(body: Record<string, unknown> = pizza) {
  const res = await request(app()).post('/restaurants').set(authHeader).send(body);
  expect(res.status).toBe(201);
  return res.body as { id: string };
}

beforeEach(() => {
  review.mockReset();
  review.mockResolvedValue(result);
});

describe('POST /restaurants/:id/review', () => {
  it('reviews the description and stores the result', async () => {
    const { id } = await createRestaurant();

    const res = await request(app()).post(`/restaurants/${id}/review`).set(authHeader);

    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({
      id: expect.any(String),
      restaurantId: id,
      reviewedDescription: pizza.description,
      score: 50,
      issues: result.issues,
      suggestedDescription: result.suggestedDescription,
      model: result.model,
      inputTokens: 600,
      outputTokens: 120,
      costUsd: 0.0012,
      createdAt: expect.any(String),
    });
    expect(review).toHaveBeenCalledWith(
      { name: pizza.name, city: pizza.city, description: pizza.description },
      expect.anything(),
    );
    expect(await AiReview.countDocuments({ restaurantId: id })).toBe(1);
  });

  it('requires the admin token and does not call the model without it', async () => {
    const { id } = await createRestaurant();

    const res = await request(app()).post(`/restaurants/${id}/review`);

    expect(res.status).toBe(401);
    expect(review).not.toHaveBeenCalled();
  });

  it('returns 404 for an unknown restaurant and 400 for a bad id', async () => {
    const missing = await request(app())
      .post('/restaurants/0123456789abcdef01234567/review')
      .set(authHeader);
    expect(missing.status).toBe(404);

    const bad = await request(app()).post('/restaurants/not-an-id/review').set(authHeader);
    expect(bad.status).toBe(400);
    expect(review).not.toHaveBeenCalled();
  });

  it('rejects a restaurant with no description without calling the model', async () => {
    const { id } = await createRestaurant({ ...pizza, description: '' });

    const res = await request(app()).post(`/restaurants/${id}/review`).set(authHeader);

    expect(res.status).toBe(400);
    expect(res.body.error.message).toMatch(/no description/);
    expect(review).not.toHaveBeenCalled();
  });

  it('returns 502 and stores nothing when the review fails', async () => {
    const { id } = await createRestaurant();
    review.mockRejectedValue(new AiReviewError('The AI model returned invalid output 2 times'));

    const res = await request(app()).post(`/restaurants/${id}/review`).set(authHeader);

    expect(res.status).toBe(502);
    expect(res.body.error).toMatchObject({
      code: 'AI_REVIEW_FAILED',
      message: 'The AI model returned invalid output 2 times',
    });
    expect(await AiReview.countDocuments()).toBe(0);
  });
});

describe('GET /restaurants/:id/reviews', () => {
  it('lists reviews newest first', async () => {
    const { id } = await createRestaurant();
    review.mockResolvedValueOnce({ ...result, score: 40 }).mockResolvedValueOnce({ ...result, score: 80 });
    await request(app()).post(`/restaurants/${id}/review`).set(authHeader).expect(201);
    await request(app()).post(`/restaurants/${id}/review`).set(authHeader).expect(201);

    const res = await request(app()).get(`/restaurants/${id}/reviews`);

    expect(res.status).toBe(200);
    expect(res.body.items.map((r: { score: number }) => r.score)).toEqual([80, 40]);
  });

  it('honours limit and returns 404 for an unknown restaurant', async () => {
    const { id } = await createRestaurant();
    await request(app()).post(`/restaurants/${id}/review`).set(authHeader).expect(201);
    await request(app()).post(`/restaurants/${id}/review`).set(authHeader).expect(201);

    const limited = await request(app()).get(`/restaurants/${id}/reviews?limit=1`);
    expect(limited.body.items).toHaveLength(1);

    const missing = await request(app()).get('/restaurants/0123456789abcdef01234567/reviews');
    expect(missing.status).toBe(404);
  });
});
