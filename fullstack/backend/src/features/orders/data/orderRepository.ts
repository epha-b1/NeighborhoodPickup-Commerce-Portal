import { dbPool } from '../../../db/pool';
import type {
  LedgerRow,
  ListingPriceRecord,
  OrderDetail,
  OrderQuoteItemInput,
  PricingRuleVersionRecord
} from '../types';

export const getTaxJurisdictionByCode = async (code: string): Promise<{
  id: number;
  code: string;
  taxRate: number;
} | null> => {
  const [rows] = await dbPool.query<{ id: number; code: string; tax_rate: string }[]>(
    'SELECT id, code, tax_rate FROM tax_jurisdictions WHERE code = ? LIMIT 1',
    [code]
  );

  if (rows.length === 0) {
    return null;
  }

  return {
    id: rows[0].id,
    code: rows[0].code,
    taxRate: Number(rows[0].tax_rate)
  };
};

export const getActivePricingRuleVersions = async (): Promise<PricingRuleVersionRecord[]> => {
  const [rows] = await dbPool.query<
    {
      id: number;
      pricing_rule_id: number;
      code: string;
      name: string;
      rule_type: PricingRuleVersionRecord['ruleType'];
      config_json: string;
    }[]
  >(
    `SELECT prv.id,
            pr.id AS pricing_rule_id,
            pr.code,
            pr.name,
            pr.rule_type,
            prv.config_json
     FROM pricing_rules pr
     JOIN pricing_rule_versions prv ON prv.pricing_rule_id = pr.id
     WHERE pr.is_active = 1
       AND prv.effective_from <= UTC_TIMESTAMP()
       AND (prv.effective_to IS NULL OR prv.effective_to >= UTC_TIMESTAMP())
     ORDER BY pr.id, prv.version_no DESC`
  );

  const firstVersionPerRule = new Map<number, (typeof rows)[number]>();
  for (const row of rows) {
    if (!firstVersionPerRule.has(row.pricing_rule_id)) {
      firstVersionPerRule.set(row.pricing_rule_id, row);
    }
  }

  return Array.from(firstVersionPerRule.values()).map((row) => ({
    id: row.id,
    pricingRuleId: row.pricing_rule_id,
    code: row.code,
    name: row.name,
    ruleType: row.rule_type,
    config: JSON.parse(row.config_json)
  }));
};

export const getListingPricingRecords = async (params: {
  cycleId: number;
  pickupPointId: number;
  items: OrderQuoteItemInput[];
}): Promise<ListingPriceRecord[]> => {
  if (params.items.length === 0) {
    return [];
  }

  const listingIds = params.items.map((item) => item.listingId);
  const placeholders = listingIds.map(() => '?').join(',');

  const [rows] = await dbPool.query<
    {
      listing_id: number;
      title: string;
      unit_price: string;
      available_quantity: number;
      reserved_quantity: number;
    }[]
  >(
    `SELECT l.id AS listing_id,
            l.title,
            l.base_price AS unit_price,
            COALESCE(li.available_quantity, 0) AS available_quantity,
            COALESCE(li.reserved_quantity, 0) AS reserved_quantity
     FROM listings l
     LEFT JOIN listing_inventory li ON li.listing_id = l.id
     WHERE l.cycle_id = ?
       AND l.pickup_point_id = ?
       AND l.status = 'ACTIVE'
       AND l.id IN (${placeholders})`,
    [params.cycleId, params.pickupPointId, ...listingIds]
  );

  return rows.map((row) => ({
    listingId: row.listing_id,
    title: row.title,
    unitPrice: Number(row.unit_price),
    availableQuantity: Number(row.available_quantity),
    reservedQuantity: Number(row.reserved_quantity)
  }));
};

export const getPickupWindowCapacity = async (pickupWindowId: number): Promise<{
  id: number;
  pickupPointId: number;
  windowDate: string;
  startTime: string;
  endTime: string;
  capacityTotal: number;
  reservedSlots: number;
} | null> => {
  const [rows] = await dbPool.query<
    {
      id: number;
      pickup_point_id: number;
      window_date: string;
      start_time: string;
      end_time: string;
      capacity_total: number;
      reserved_slots: number;
    }[]
  >(
    `SELECT id,
            pickup_point_id,
            DATE_FORMAT(window_date, '%Y-%m-%d') AS window_date,
            TIME_FORMAT(start_time, '%H:%i:%s') AS start_time,
            TIME_FORMAT(end_time, '%H:%i:%s') AS end_time,
            capacity_total,
            reserved_slots
     FROM pickup_windows
     WHERE id = ?
     LIMIT 1`,
    [pickupWindowId]
  );

  if (rows.length === 0) {
    return null;
  }

  const row = rows[0];
  return {
    id: row.id,
    pickupPointId: row.pickup_point_id,
    windowDate: row.window_date,
    startTime: row.start_time,
    endTime: row.end_time,
    capacityTotal: Number(row.capacity_total),
    reservedSlots: Number(row.reserved_slots)
  };
};

export const listAlternativePickupWindows = async (params: {
  pickupPointId: number;
  minimumRemaining: number;
  excludeWindowId: number;
  limit: number;
}): Promise<
  Array<{
    pickupWindowId: number;
    windowDate: string;
    startTime: string;
    endTime: string;
    remainingCapacity: number;
  }>
> => {
  const [rows] = await dbPool.query<
    {
      pickup_window_id: number;
      window_date: string;
      start_time: string;
      end_time: string;
      remaining_capacity: number;
    }[]
  >(
    `SELECT pw.id AS pickup_window_id,
            DATE_FORMAT(pw.window_date, '%Y-%m-%d') AS window_date,
            TIME_FORMAT(pw.start_time, '%H:%i:%s') AS start_time,
            TIME_FORMAT(pw.end_time, '%H:%i:%s') AS end_time,
            GREATEST(pw.capacity_total - pw.reserved_slots, 0) AS remaining_capacity
     FROM pickup_windows pw
     WHERE pw.pickup_point_id = ?
       AND pw.id <> ?
       AND pw.window_date >= UTC_DATE()
       AND GREATEST(pw.capacity_total - pw.reserved_slots, 0) >= ?
     ORDER BY pw.window_date ASC, pw.start_time ASC
     LIMIT ?`,
    [params.pickupPointId, params.excludeWindowId, params.minimumRemaining, params.limit]
  );

  return rows.map((row) => ({
    pickupWindowId: row.pickup_window_id,
    windowDate: row.window_date,
    startTime: row.start_time,
    endTime: row.end_time,
    remainingCapacity: Number(row.remaining_capacity)
  }));
};

export const createOrderTransaction = async (params: {
  userId: number;
  cycleId: number;
  pickupPointId: number;
  taxJurisdictionId: number;
  quote: {
    subtotal: number;
    discountTotal: number;
    subsidyTotal: number;
    taxTotal: number;
    grandTotal: number;
    trace: unknown;
    lineItems: Array<{
      listingId: number;
      quantity: number;
      unitPrice: number;
      subtotal: number;
      lineDiscount: number;
      lineSubsidy: number;
      lineTax: number;
      lineTotal: number;
      pricingBreakdown: unknown;
    }>;
  };
  pickupWindow: {
    id: number;
    windowDate: string;
    startTime: string;
    endTime: string;
  };
}): Promise<{ orderId: number; settlementId: number }> => {
  const conn = await dbPool.getConnection();

  try {
    await conn.beginTransaction();

    const [windowRows] = await conn.query<
      { capacity_total: number; reserved_slots: number; pickup_point_id: number }[]
    >(
      'SELECT capacity_total, reserved_slots, pickup_point_id FROM pickup_windows WHERE id = ? FOR UPDATE',
      [params.pickupWindow.id]
    );

    if (windowRows.length === 0) {
      throw new Error('INVALID_PICKUP_WINDOW');
    }

    const window = windowRows[0];
    if (window.pickup_point_id !== params.pickupPointId) {
      throw new Error('MISMATCH_PICKUP_POINT');
    }

    if (window.reserved_slots + 1 > window.capacity_total) {
      throw new Error('CAPACITY_EXCEEDED');
    }

    for (const lineItem of params.quote.lineItems) {
      const [inventoryRows] = await conn.query<
        { available_quantity: number; reserved_quantity: number }[]
      >(
        'SELECT available_quantity, reserved_quantity FROM listing_inventory WHERE listing_id = ? FOR UPDATE',
        [lineItem.listingId]
      );

      if (inventoryRows.length === 0) {
        throw new Error('MISSING_INVENTORY');
      }

      const inventory = inventoryRows[0];
      const remaining = inventory.available_quantity - inventory.reserved_quantity;
      if (remaining < lineItem.quantity) {
        throw new Error(`INSUFFICIENT_INVENTORY:${lineItem.listingId}`);
      }
    }

    const [orderResult] = await conn.query<any>(
      `INSERT INTO orders
        (user_id, cycle_id, pickup_point_id, status, tax_jurisdiction_id, subtotal_amount, discount_amount, subsidy_amount, tax_amount, total_amount, pricing_trace_json)
       VALUES (?, ?, ?, 'CONFIRMED', ?, ?, ?, ?, ?, ?, ?)`,
      [
        params.userId,
        params.cycleId,
        params.pickupPointId,
        params.taxJurisdictionId,
        params.quote.subtotal,
        params.quote.discountTotal,
        params.quote.subsidyTotal,
        params.quote.taxTotal,
        params.quote.grandTotal,
        JSON.stringify(params.quote.trace)
      ]
    );

    const orderId = Number(orderResult.insertId);

    for (const lineItem of params.quote.lineItems) {
      await conn.query(
        `INSERT INTO order_items
          (order_id, listing_id, quantity, unit_price, line_subtotal, line_discount, line_subsidy, line_tax, line_total, pricing_breakdown_json)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          orderId,
          lineItem.listingId,
          lineItem.quantity,
          lineItem.unitPrice,
          lineItem.subtotal,
          lineItem.lineDiscount,
          lineItem.lineSubsidy,
          lineItem.lineTax,
          lineItem.lineTotal,
          JSON.stringify(lineItem.pricingBreakdown)
        ]
      );

      await conn.query(
        `UPDATE listing_inventory
         SET reserved_quantity = reserved_quantity + ?
         WHERE listing_id = ?`,
        [lineItem.quantity, lineItem.listingId]
      );
    }

    await conn.query(
      `INSERT INTO order_pickup_window
        (order_id, pickup_window_id, selected_date, selected_start_time, selected_end_time)
       VALUES (?, ?, ?, ?, ?)`,
      [
        orderId,
        params.pickupWindow.id,
        params.pickupWindow.windowDate,
        params.pickupWindow.startTime,
        params.pickupWindow.endTime
      ]
    );

    await conn.query(
      `INSERT INTO order_status_history
        (order_id, from_status, to_status, changed_by_user_id, reason)
       VALUES (?, NULL, 'CONFIRMED', ?, 'Checkout confirmed')`,
      [orderId, params.userId]
    );

    await conn.query(
      `UPDATE pickup_windows
       SET reserved_slots = reserved_slots + 1
       WHERE id = ?`,
      [params.pickupWindow.id]
    );

    await conn.query(
      `INSERT INTO pickup_capacity_snapshots (pickup_window_id, capacity_total, capacity_reserved)
       SELECT id, capacity_total, reserved_slots FROM pickup_windows WHERE id = ?`,
      [params.pickupWindow.id]
    );

    const [settlementResult] = await conn.query<any>(
      'INSERT INTO settlements (order_id, status, settled_amount, note) VALUES (?, ?, ?, ?)',
      [orderId, 'POSTED', params.quote.grandTotal, 'Auto settlement from checkout']
    );

    const settlementId = Number(settlementResult.insertId);

    const [accounts] = await conn.query<{ id: number; code: string }[]>(
      'SELECT id, code FROM ledger_accounts WHERE code IN (?, ?)',
      ['RECEIVABLE_INTERNAL', 'SALES_REVENUE']
    );

    const accountMap = new Map(accounts.map((account) => [account.code, account.id]));
    const receivableId = accountMap.get('RECEIVABLE_INTERNAL');
    const revenueId = accountMap.get('SALES_REVENUE');

    if (!receivableId || !revenueId) {
      throw new Error('MISSING_LEDGER_ACCOUNT');
    }

    await conn.query(
      `INSERT INTO ledger_entries
        (settlement_id, order_id, account_id, direction, amount, memo)
       VALUES (?, ?, ?, 'DEBIT', ?, 'Internal receivable'), (?, ?, ?, 'CREDIT', ?, 'Sales revenue')`,
      [
        settlementId,
        orderId,
        receivableId,
        params.quote.grandTotal,
        settlementId,
        orderId,
        revenueId,
        params.quote.grandTotal
      ]
    );

    await conn.query('UPDATE settlements SET posted_at = CURRENT_TIMESTAMP WHERE id = ?', [
      settlementId
    ]);

    await conn.commit();

    return { orderId, settlementId };
  } catch (error) {
    await conn.rollback();
    throw error;
  } finally {
    conn.release();
  }
};

export const getOrderDetailById = async (params: {
  orderId: number;
  userId: number;
  roles: string[];
}): Promise<OrderDetail | null> => {
  const isFinance = params.roles.includes('FINANCE_CLERK') || params.roles.includes('ADMINISTRATOR');

  const [orderRows] = await dbPool.query<
    {
      id: number;
      user_id: number;
      cycle_id: number;
      pickup_point_id: number;
      status: string;
      subtotal_amount: string;
      discount_amount: string;
      subsidy_amount: string;
      tax_amount: string;
      total_amount: string;
      pricing_trace_json: string;
      pickup_window_id: number;
      selected_date: string;
      selected_start_time: string;
      selected_end_time: string;
    }[]
  >(
    `SELECT o.id,
            o.user_id,
            o.cycle_id,
            o.pickup_point_id,
            o.status,
            o.subtotal_amount,
            o.discount_amount,
            o.subsidy_amount,
            o.tax_amount,
            o.total_amount,
            o.pricing_trace_json,
            opw.pickup_window_id,
            DATE_FORMAT(opw.selected_date, '%Y-%m-%d') AS selected_date,
            TIME_FORMAT(opw.selected_start_time, '%H:%i:%s') AS selected_start_time,
            TIME_FORMAT(opw.selected_end_time, '%H:%i:%s') AS selected_end_time
     FROM orders o
     JOIN order_pickup_window opw ON opw.order_id = o.id
     WHERE o.id = ?
       AND (? = 1 OR o.user_id = ?)
     LIMIT 1`,
    [params.orderId, isFinance ? 1 : 0, params.userId]
  );

  if (orderRows.length === 0) {
    return null;
  }

  const order = orderRows[0];

  const [itemRows] = await dbPool.query<
    {
      listing_id: number;
      quantity: number;
      unit_price: string;
      line_subtotal: string;
      line_discount: string;
      line_subsidy: string;
      line_tax: string;
      line_total: string;
      pricing_breakdown_json: string;
    }[]
  >(
    `SELECT listing_id,
            quantity,
            unit_price,
            line_subtotal,
            line_discount,
            line_subsidy,
            line_tax,
            line_total,
            pricing_breakdown_json
     FROM order_items
     WHERE order_id = ?`,
    [params.orderId]
  );

  return {
    id: order.id,
    userId: order.user_id,
    cycleId: order.cycle_id,
    pickupPointId: order.pickup_point_id,
    status: order.status,
    pickupWindow: {
      pickupWindowId: order.pickup_window_id,
      date: order.selected_date,
      startTime: order.selected_start_time,
      endTime: order.selected_end_time
    },
    totals: {
      subtotal: Number(order.subtotal_amount),
      discount: Number(order.discount_amount),
      subsidy: Number(order.subsidy_amount),
      tax: Number(order.tax_amount),
      total: Number(order.total_amount)
    },
    pricingTrace: JSON.parse(order.pricing_trace_json),
    items: itemRows.map((item) => ({
      listingId: item.listing_id,
      quantity: Number(item.quantity),
      unitPrice: Number(item.unit_price),
      lineSubtotal: Number(item.line_subtotal),
      lineDiscount: Number(item.line_discount),
      lineSubsidy: Number(item.line_subsidy),
      lineTax: Number(item.line_tax),
      lineTotal: Number(item.line_total),
      pricingBreakdown: JSON.parse(item.pricing_breakdown_json)
    }))
  };
};

export const getLedgerRows = async (): Promise<LedgerRow[]> => {
  const [rows] = await dbPool.query<
    {
      id: number;
      order_id: number;
      settlement_id: number;
      account_code: string;
      account_name: string;
      direction: 'DEBIT' | 'CREDIT';
      amount: string;
      memo: string | null;
      created_at: Date | string;
    }[]
  >(
    `SELECT le.id,
            le.order_id,
            le.settlement_id,
            la.code AS account_code,
            la.name AS account_name,
            le.direction,
            le.amount,
            le.memo,
            le.created_at
     FROM ledger_entries le
     JOIN ledger_accounts la ON la.id = le.account_id
     ORDER BY le.created_at DESC, le.id DESC
     LIMIT 500`
  );

  return rows.map((row) => ({
    id: row.id,
    orderId: row.order_id,
    settlementId: row.settlement_id,
    accountCode: row.account_code,
    accountName: row.account_name,
    direction: row.direction,
    amount: Number(row.amount),
    memo: row.memo,
    createdAt: new Date(row.created_at).toISOString()
  }));
};