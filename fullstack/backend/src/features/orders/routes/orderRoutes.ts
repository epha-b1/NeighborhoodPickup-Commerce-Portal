import { Router, type Response } from 'express';
import { z } from 'zod';
import { requireAuth, requireRoles } from '../../../middleware/rbac';
import { checkoutOrder, getLedger, getOrderById, quoteOrder } from '../services/orderService';

const quoteInputSchema = z.object({
  cycleId: z.coerce.number().int().positive(),
  pickupPointId: z.coerce.number().int().positive(),
  pickupWindowId: z.coerce.number().int().positive(),
  taxJurisdictionCode: z.string().trim().min(1),
  items: z
    .array(
      z.object({
        listingId: z.coerce.number().int().positive(),
        quantity: z.coerce.number().int().positive()
      })
    )
    .min(1)
});

const handleOrderError = (error: unknown, response: Response): boolean => {
  if (error instanceof z.ZodError) {
    response.status(400).json({
      error: 'Invalid request payload.',
      details: error.issues
    });
    return true;
  }

  if (error instanceof Error && error.message === 'INVALID_TAX_JURISDICTION') {
    response.status(400).json({
      error: 'Tax jurisdiction not found.'
    });
    return true;
  }

  if (error instanceof Error && error.message.startsWith('INSUFFICIENT_INVENTORY:')) {
    response.status(409).json({
      error: 'Insufficient inventory for one or more items.'
    });
    return true;
  }

  return false;
};

export const orderRouter = Router();

orderRouter.post('/orders/quote', requireAuth, requireRoles('MEMBER'), async (request, response, next) => {
  try {
    const payload = quoteInputSchema.parse(request.body);
    const quote = await quoteOrder(payload);
    response.json(quote);
  } catch (error) {
    if (handleOrderError(error, response)) {
      return;
    }
    next(error);
  }
});

orderRouter.post('/orders/checkout', requireAuth, requireRoles('MEMBER'), async (request, response, next) => {
  try {
    const payload = quoteInputSchema.parse(request.body);
    const result = await checkoutOrder({
      userId: request.auth!.userId,
      input: payload
    });

    if (!result.ok) {
      const status = result.code === 'CAPACITY_EXCEEDED' ? 409 : 400;
      response.status(status).json(result);
      return;
    }

    response.status(201).json(result);
  } catch (error) {
    if (handleOrderError(error, response)) {
      return;
    }
    next(error);
  }
});

orderRouter.get('/orders/:id', requireAuth, async (request, response, next) => {
  try {
    const orderId = z.coerce.number().int().positive().parse(request.params.id);
    const order = await getOrderById({
      orderId,
      userId: request.auth!.userId,
      roles: request.auth!.roles
    });

    if (!order) {
      response.status(404).json({ error: 'Order not found.' });
      return;
    }

    response.json(order);
  } catch (error) {
    if (handleOrderError(error, response)) {
      return;
    }
    next(error);
  }
});

orderRouter.get('/finance/ledger', requireAuth, requireRoles('FINANCE_CLERK', 'ADMINISTRATOR'), async (_request, response, next) => {
  try {
    const rows = await getLedger();
    response.json({ data: rows });
  } catch (error) {
    next(error);
  }
});