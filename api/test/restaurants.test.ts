import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { authHeader, useTestApp } from './helpers.js';

const app = useTestApp();

const pizza = {
  name: 'Pizza Palace',
  city: 'Dublin',
  expectedOrderUrl: 'https://order.pizzapalace.example/',
  description: 'Wood-fired pizza in the city centre.',
};

async function createRestaurant(body: Record<string, unknown> = pizza) {
  const res = await request(app()).post('/restaurants').set(authHeader).send(body);
  expect(res.status).toBe(201);
  return res.body as { id: string } & typeof pizza;
}

describe('POST /restaurants', () => {
  it('creates a restaurant and returns it with an id', async () => {
    const res = await request(app()).post('/restaurants').set(authHeader).send(pizza);
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ ...pizza, id: expect.any(String) });
    expect(res.body).not.toHaveProperty('_id');
    expect(res.headers.location).toBe(`/restaurants/${res.body.id}`);
  });

  it('requires the admin token', async () => {
    const missing = await request(app()).post('/restaurants').send(pizza);
    expect(missing.status).toBe(401);

    const wrong = await request(app())
      .post('/restaurants')
      .set('Authorization', 'Bearer not-the-token')
      .send(pizza);
    expect(wrong.status).toBe(401);
  });

  it('rejects invalid input with field-level details', async () => {
    const res = await request(app())
      .post('/restaurants')
      .set(authHeader)
      .send({ name: '', city: 'Dublin', expectedOrderUrl: 'ftp://nope' });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
    const paths = res.body.error.details.map((d: { path: string }) => d.path);
    expect(paths).toEqual(expect.arrayContaining(['name', 'expectedOrderUrl']));
  });

  it('rejects malformed JSON', async () => {
    const res = await request(app())
      .post('/restaurants')
      .set(authHeader)
      .set('Content-Type', 'application/json')
      .send('{"name":');
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('INVALID_BODY');
  });

  it('returns 409 for a duplicate name + city (case-insensitive)', async () => {
    await createRestaurant();
    const res = await request(app())
      .post('/restaurants')
      .set(authHeader)
      .send({ ...pizza, name: 'PIZZA PALACE', city: 'dublin' });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('CONFLICT');
  });
});

describe('GET /restaurants/:id', () => {
  it('returns the restaurant', async () => {
    const created = await createRestaurant();
    const res = await request(app()).get(`/restaurants/${created.id}`);
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject(pizza);
  });

  it('returns 404 for an unknown id and 400 for a malformed one', async () => {
    const unknown = await request(app()).get('/restaurants/0123456789abcdef01234567');
    expect(unknown.status).toBe(404);

    const malformed = await request(app()).get('/restaurants/not-an-id');
    expect(malformed.status).toBe(400);
  });
});

describe('PATCH /restaurants/:id', () => {
  it('updates only the given fields', async () => {
    const created = await createRestaurant();
    const res = await request(app())
      .patch(`/restaurants/${created.id}`)
      .set(authHeader)
      .send({ description: 'Now with vegan options.' });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ ...pizza, description: 'Now with vegan options.' });
  });

  it('leaves fields that were not sent untouched', async () => {
    const created = await createRestaurant();
    const res = await request(app())
      .patch(`/restaurants/${created.id}`)
      .set(authHeader)
      .send({ city: 'Cork' });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ ...pizza, city: 'Cork' });
  });

  it('rejects an empty patch', async () => {
    const created = await createRestaurant();
    const res = await request(app()).patch(`/restaurants/${created.id}`).set(authHeader).send({});
    expect(res.status).toBe(400);
  });

  it('returns 404 for an unknown id and 401 without the token', async () => {
    const unknown = await request(app())
      .patch('/restaurants/0123456789abcdef01234567')
      .set(authHeader)
      .send({ city: 'Cork' });
    expect(unknown.status).toBe(404);

    const created = await createRestaurant();
    const noToken = await request(app()).patch(`/restaurants/${created.id}`).send({ city: 'Cork' });
    expect(noToken.status).toBe(401);
  });

  it('returns 409 when renaming onto an existing restaurant', async () => {
    await createRestaurant();
    const other = await createRestaurant({ ...pizza, name: 'Burger Barn' });
    const res = await request(app())
      .patch(`/restaurants/${other.id}`)
      .set(authHeader)
      .send({ name: 'Pizza Palace' });
    expect(res.status).toBe(409);
  });
});

describe('DELETE /restaurants/:id', () => {
  it('deletes the restaurant', async () => {
    const created = await createRestaurant();
    const res = await request(app()).delete(`/restaurants/${created.id}`).set(authHeader);
    expect(res.status).toBe(204);

    const after = await request(app()).get(`/restaurants/${created.id}`);
    expect(after.status).toBe(404);
  });

  it('returns 404 when already deleted', async () => {
    const res = await request(app())
      .delete('/restaurants/0123456789abcdef01234567')
      .set(authHeader);
    expect(res.status).toBe(404);
  });
});

describe('GET /restaurants (cursor pagination)', () => {
  it('pages through all restaurants newest-first with no gaps or repeats', async () => {
    const names: string[] = [];
    for (let i = 1; i <= 5; i++) {
      const name = `Restaurant ${i}`;
      await createRestaurant({ ...pizza, name });
      names.push(name);
    }

    const seen: string[] = [];
    let cursor: string | null = null;
    let pages = 0;
    do {
      const res: request.Response = await request(app())
        .get('/restaurants')
        .query(cursor ? { limit: 2, cursor } : { limit: 2 });
      expect(res.status).toBe(200);
      seen.push(...res.body.items.map((r: { name: string }) => r.name));
      cursor = res.body.nextCursor;
      pages++;
    } while (cursor);

    expect(pages).toBe(3);
    expect(seen).toEqual([...names].reverse());
  });

  it('returns an empty page with a null cursor when there is no data', async () => {
    const res = await request(app()).get('/restaurants');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ items: [], nextCursor: null });
  });

  it('validates limit and cursor', async () => {
    const badLimit = await request(app()).get('/restaurants').query({ limit: 500 });
    expect(badLimit.status).toBe(400);

    const badCursor = await request(app()).get('/restaurants').query({ cursor: 'garbage' });
    expect(badCursor.status).toBe(400);
  });
});
