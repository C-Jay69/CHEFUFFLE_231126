import type { ZodTypeAny, z } from 'zod';

export function parse<T extends ZodTypeAny>(schema: T, value: unknown): z.infer<T> {
  return schema.parse(value);
}
