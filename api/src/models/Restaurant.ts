import { Schema, model, type InferSchemaType } from 'mongoose';
import { z } from 'zod';
import { toJSONOptions } from '../lib/json.js';

// ---- API input validation (zod) -------------------------------------------
// Shared by the routes and the CSV importer so both enforce the same rules.

const restaurantFields = z.object({
  name: z.string().trim().min(1).max(200),
  city: z.string().trim().min(1).max(100),
  expectedOrderUrl: z
    .string()
    .trim()
    .pipe(z.url({ protocol: /^https?$/, error: 'Must be an http(s) URL' })),
  description: z.string().trim().max(2000),
});

export const restaurantInputSchema = restaurantFields.extend({
  description: restaurantFields.shape.description.default(''),
});

// Built from the default-free fields: a default here would silently overwrite
// fields the client didn't send.
export const restaurantPatchSchema = restaurantFields
  .partial()
  .refine((value) => Object.keys(value).length > 0, 'Provide at least one field to update');

export type RestaurantInput = z.infer<typeof restaurantInputSchema>;

// ---- Persistence (mongoose) ------------------------------------------------

const restaurantSchema = new Schema(
  {
    name: { type: String, required: true, trim: true },
    city: { type: String, required: true, trim: true },
    expectedOrderUrl: { type: String, required: true, trim: true },
    description: { type: String, default: '' },
  },
  { timestamps: true, toJSON: toJSONOptions },
);

// One restaurant per (name, city), case-insensitive, so re-running an import
// or the seed script doesn't create duplicates.
restaurantSchema.index(
  { name: 1, city: 1 },
  { unique: true, collation: { locale: 'en', strength: 2 } },
);

export type RestaurantDoc = InferSchemaType<typeof restaurantSchema>;

export const Restaurant = model('Restaurant', restaurantSchema);
