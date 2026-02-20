import { z } from 'zod';
import { 
  insertFlightSchema, 
  predictRequestSchema, 
  predictResponseSchema,
  monteCarloResponseSchema,
  analyticsResponseSchema,
  gateWithFlightSchema,
  flights
} from './schema';

export const errorSchemas = {
  validation: z.object({
    message: z.string(),
    field: z.string().optional(),
  }),
  notFound: z.object({
    message: z.string(),
  }),
  internal: z.object({
    message: z.string(),
  }),
};

export const api = {
  gates: {
    list: {
      method: 'GET' as const,
      path: '/api/gates' as const,
      responses: {
        200: z.array(gateWithFlightSchema),
      },
    },
  },
  flights: {
    listIncoming: {
      method: 'GET' as const,
      path: '/api/flights/incoming' as const,
      responses: {
        200: z.array(z.custom<typeof flights.$inferSelect>()),
      },
    },
    get: {
      method: 'GET' as const,
      path: '/api/flights/:id' as const,
      responses: {
        200: z.custom<typeof flights.$inferSelect>(),
        404: errorSchemas.notFound,
      },
    },
  },
  predict: {
    predictTat: {
      method: 'POST' as const,
      path: '/api/predict' as const,
      input: predictRequestSchema,
      responses: {
        200: predictResponseSchema,
        400: errorSchemas.validation,
      },
    },
    monteCarlo: {
      method: 'POST' as const,
      path: '/api/montecarlo' as const,
      input: predictRequestSchema,
      responses: {
        200: monteCarloResponseSchema,
        400: errorSchemas.validation,
      },
    },
  },
  analytics: {
    getStats: {
      method: 'GET' as const,
      path: '/api/analytics' as const,
      responses: {
        200: analyticsResponseSchema,
      },
    },
  },
};

export function buildUrl(path: string, params?: Record<string, string | number>): string {
  let url = path;
  if (params) {
    Object.entries(params).forEach(([key, value]) => {
      if (url.includes(`:${key}`)) {
        url = url.replace(`:${key}`, String(value));
      }
    });
  }
  return url;
}
