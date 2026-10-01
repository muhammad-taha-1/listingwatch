/**
 * Shared mongoose toJSON options: expose `id` instead of `_id` and drop `__v`,
 * so every API response uses the same shape.
 */
export const toJSONOptions = {
  versionKey: false,
  transform(_doc: unknown, ret: Record<string, unknown>) {
    ret.id = String(ret._id);
    delete ret._id;
    return ret;
  },
};
