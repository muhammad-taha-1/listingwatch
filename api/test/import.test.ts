import { readFile } from 'node:fs/promises';
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { authHeader, useTestApp } from './helpers.js';

const app = useTestApp();

function postCsv(body: string) {
  return request(app())
    .post('/restaurants/import')
    .set(authHeader)
    .set('Content-Type', 'text/csv')
    .send(body);
}

const header = 'name,city,expectedOrderUrl,description';

describe('POST /restaurants/import', () => {
  it('inserts valid rows and reports invalid ones by line', async () => {
    const csv = [
      header,
      'Pizza Palace,Dublin,https://pizza.example/,"Wood-fired pizza, made daily."',
      ',Cork,https://nameless.example/,Missing name',
      'Bad Url Cafe,Galway,not-a-url,',
      'Too,Many,Columns,https://x.example/,extra',
      'Burger Barn,Dublin,https://burger.example/,',
    ].join('\n');

    const res = await postCsv(csv);
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ inserted: 2, skipped: 0, failed: 3 });
    expect(res.body.errors.map((e: { line: number }) => e.line)).toEqual([3, 4, 5]);
    expect(res.body.errors[0].issues[0].path).toBe('name');

    const list = await request(app()).get('/restaurants');
    expect(list.body.items.map((r: { name: string }) => r.name).sort()).toEqual([
      'Burger Barn',
      'Pizza Palace',
    ]);
    // Quoted field with a comma survives intact
    const pizza = list.body.items.find((r: { name: string }) => r.name === 'Pizza Palace');
    expect(pizza.description).toBe('Wood-fired pizza, made daily.');
  });

  it('is idempotent: re-importing skips existing restaurants without changing them', async () => {
    const csv = `${header}\nPizza Palace,Dublin,https://pizza.example/,Original`;
    await postCsv(csv);

    const again = await postCsv(
      `${header}\npizza palace,DUBLIN,https://other.example/,Changed\nNew Place,Cork,https://new.example/,`,
    );
    expect(again.body).toMatchObject({ inserted: 1, skipped: 1, failed: 0 });

    const list = await request(app()).get('/restaurants');
    const pizza = list.body.items.find((r: { name: string }) => r.name === 'Pizza Palace');
    expect(pizza).toMatchObject({ description: 'Original', expectedOrderUrl: 'https://pizza.example/' });
  });

  it('rejects a file with the wrong header', async () => {
    const res = await postCsv('title,town,url\nA,B,https://a.example/');
    expect(res.status).toBe(400);
    expect(res.body.error.details).toMatchObject({ missing: ['name', 'city', 'expectedOrderUrl'] });
  });

  it('rejects malformed CSV and empty bodies', async () => {
    const malformed = await postCsv(`${header}\n"Unclosed,Dublin,https://a.example/,`);
    expect(malformed.status).toBe(400);

    const empty = await postCsv('');
    expect(empty.status).toBe(400);
  });

  it('requires the admin token', async () => {
    const res = await request(app())
      .post('/restaurants/import')
      .set('Content-Type', 'text/csv')
      .send(`${header}\nA,B,https://a.example/,`);
    expect(res.status).toBe(401);
  });

  it('imports the seed file with no invalid rows', async () => {
    const csv = await readFile(new URL('../scripts/sample-restaurants.csv', import.meta.url), 'utf8');
    const res = await postCsv(csv);
    expect(res.body.failed).toBe(0);
    expect(res.body.errors).toEqual([]);
    expect(res.body.inserted).toBe(30);
  });
});
