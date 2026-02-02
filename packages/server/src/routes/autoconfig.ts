import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { autoconfigLookupInputSchema } from '@imap-browser/shared';
import { autoconfigService } from '../services/autoconfig/autoconfig-service.js';

export async function registerAutoconfigRoutes(fastify: FastifyInstance): Promise<void> {
  // Lookup email autoconfig - no auth required (pre-account-creation)
  fastify.post('/api/autoconfig/lookup', async (req: FastifyRequest, reply: FastifyReply) => {
    const parseResult = autoconfigLookupInputSchema.safeParse(req.body);

    if (!parseResult.success) {
      return reply.status(400).send({
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Invalid input',
          details: parseResult.error.flatten(),
        },
      });
    }

    try {
      const result = await autoconfigService.lookup(parseResult.data.email);

      return {
        success: true,
        data: result,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Autoconfig lookup failed';
      return reply.status(500).send({
        success: false,
        error: {
          code: 'AUTOCONFIG_FAILED',
          message,
        },
      });
    }
  });
}
