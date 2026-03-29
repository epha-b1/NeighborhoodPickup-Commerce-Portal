import { ROLE_NAMES, type RoleName } from '../auth/roles';
import { hashPassword } from '../auth/passwordHash';
import { isPasswordPolicyValid, passwordPolicyMessage } from '../auth/passwordPolicy';
import { dbPool } from './pool';

type SeedUser = { username: string; role: RoleName; password: string };

const seedUsers: SeedUser[] = [
  { username: 'member1', role: 'MEMBER', password: 'Member#Pass123' },
  { username: 'leader1', role: 'GROUP_LEADER', password: 'Leader#Pass123' },
  { username: 'reviewer1', role: 'REVIEWER', password: 'Reviewer#Pass123' },
  { username: 'finance1', role: 'FINANCE_CLERK', password: 'Finance#Pass123' },
  { username: 'admin1', role: 'ADMINISTRATOR', password: 'Admin#Pass12345' }
];

const upsertRole = async (name: RoleName): Promise<void> => {
  await dbPool.query('INSERT IGNORE INTO roles (name) VALUES (?)', [name]);
};

const ensureUser = async (params: {
  username: string;
  passwordHash: string;
  role: RoleName;
}): Promise<{ id: number }> => {
  const conn = await dbPool.getConnection();
  try {
    await conn.beginTransaction();

    const [existingUsers] = await conn.query<{ id: number }[]>(
      'SELECT id FROM users WHERE username = ? LIMIT 1',
      [params.username]
    );

    let userId: number;

    if (existingUsers.length === 0) {
      const [insertUser] = await conn.query<any>(
        'INSERT INTO users (username, password_hash) VALUES (?, ?)',
        [params.username, params.passwordHash]
      );
      userId = Number(insertUser.insertId);
    } else {
      userId = existingUsers[0].id;
      await conn.query('UPDATE users SET password_hash = ?, is_active = 1 WHERE id = ?', [
        params.passwordHash,
        userId
      ]);
    }

    const [roleRows] = await conn.query<{ id: number }[]>(
      'SELECT id FROM roles WHERE name = ? LIMIT 1',
      [params.role]
    );

    if (roleRows.length === 0) {
      throw new Error(`Missing role ${params.role}`);
    }

    await conn.query('INSERT IGNORE INTO user_roles (user_id, role_id) VALUES (?, ?)', [
      userId,
      roleRows[0].id
    ]);

    await conn.commit();
    return { id: userId };
  } catch (error) {
    await conn.rollback();
    throw error;
  } finally {
    conn.release();
  }
};

const ensurePickupPoint = async (): Promise<number> => {
  const [rows] = await dbPool.query<{ id: number }[]>(
    "SELECT id FROM pickup_points WHERE name = 'Downtown Community Hall' LIMIT 1"
  );

  if (rows.length > 0) {
    return rows[0].id;
  }

  const businessHours = JSON.stringify({
    monday: ['08:00-18:00'],
    tuesday: ['08:00-18:00'],
    wednesday: ['08:00-18:00'],
    thursday: ['08:00-18:00'],
    friday: ['08:00-18:00'],
    saturday: ['09:00-15:00'],
    sunday: []
  });

  const [result] = await dbPool.query<any>(
    `INSERT INTO pickup_points
      (name, address_line1, address_line2, city, state_region, postal_code, business_hours_json, daily_capacity, is_active)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1)`,
    [
      'Downtown Community Hall',
      '145 Market Street',
      'Unit B',
      'Springfield',
      'IL',
      '62701',
      businessHours,
      120
    ]
  );

  return Number(result.insertId);
};

const ensurePickupWindows = async (pickupPointId: number): Promise<void> => {
  const [existing] = await dbPool.query<{ total: number }[]>(
    'SELECT COUNT(*) AS total FROM pickup_windows WHERE pickup_point_id = ? AND window_date >= UTC_DATE()',
    [pickupPointId]
  );

  if (Number(existing[0]?.total ?? 0) > 0) {
    return;
  }

  await dbPool.query(
    `INSERT INTO pickup_windows
      (pickup_point_id, window_date, start_time, end_time, capacity_total, reserved_slots)
     VALUES
      (?, UTC_DATE(), '09:00:00', '11:00:00', 50, 35),
      (?, UTC_DATE(), '11:00:00', '13:00:00', 50, 50),
      (?, DATE_ADD(UTC_DATE(), INTERVAL 1 DAY), '09:00:00', '11:00:00', 60, 20),
      (?, DATE_ADD(UTC_DATE(), INTERVAL 1 DAY), '13:00:00', '15:00:00', 60, 10)`,
    [pickupPointId, pickupPointId, pickupPointId, pickupPointId]
  );

  const [windows] = await dbPool.query<
    { id: number; capacity_total: number; reserved_slots: number }[]
  >('SELECT id, capacity_total, reserved_slots FROM pickup_windows WHERE pickup_point_id = ?', [
    pickupPointId
  ]);

  for (const window of windows) {
    await dbPool.query(
      `INSERT INTO pickup_capacity_snapshots (pickup_window_id, capacity_total, capacity_reserved)
       VALUES (?, ?, ?)`,
      [window.id, window.capacity_total, window.reserved_slots]
    );
  }
};

const ensureCyclesAndListings = async (params: {
  pickupPointId: number;
  leaderUserId: number;
}): Promise<number> => {
  const [cycleRows] = await dbPool.query<{ id: number }[]>(
    "SELECT id FROM buying_cycles WHERE name = 'March Fresh Produce Wave' LIMIT 1"
  );

  let activeCycleId: number;

  if (cycleRows.length === 0) {
    const [result] = await dbPool.query<any>(
      `INSERT INTO buying_cycles (name, description, status, starts_at, ends_at)
       VALUES (?, ?, 'ACTIVE', DATE_SUB(UTC_TIMESTAMP(), INTERVAL 1 DAY), DATE_ADD(UTC_TIMESTAMP(), INTERVAL 7 DAY))`,
      ['March Fresh Produce Wave', 'Community-sourced produce for neighborhood pickup.']
    );
    activeCycleId = Number(result.insertId);
  } else {
    activeCycleId = cycleRows[0].id;
  }

  const [closedRows] = await dbPool.query<{ id: number }[]>(
    "SELECT id FROM buying_cycles WHERE name = 'Expired Winter Essentials' LIMIT 1"
  );

  if (closedRows.length === 0) {
    await dbPool.query(
      `INSERT INTO buying_cycles (name, description, status, starts_at, ends_at)
       VALUES (?, ?, 'CLOSED', DATE_SUB(UTC_TIMESTAMP(), INTERVAL 30 DAY), DATE_SUB(UTC_TIMESTAMP(), INTERVAL 20 DAY))`,
      ['Expired Winter Essentials', 'Historical cycle for filtering tests.']
    );
  }

  const [listingRows] = await dbPool.query<{ id: number }[]>(
    'SELECT id FROM listings WHERE cycle_id = ? LIMIT 1',
    [activeCycleId]
  );

  if (listingRows.length === 0) {
    const listingsToSeed = [
      {
        title: 'Organic Kale Bundle',
        description: 'Fresh kale harvested within 24 hours.',
        basePrice: '5.99',
        unitLabel: 'bundle',
        available: 120,
        reserved: 20
      },
      {
        title: 'Farm Eggs (Dozen)',
        description: 'Free-range eggs from local co-op farms.',
        basePrice: '6.49',
        unitLabel: 'dozen',
        available: 80,
        reserved: 12
      },
      {
        title: 'Sweet Potato 2kg Pack',
        description: 'Bulk roots good for family meals.',
        basePrice: '7.25',
        unitLabel: 'pack',
        available: 60,
        reserved: 15
      }
    ];

    for (const listing of listingsToSeed) {
      const [insertListing] = await dbPool.query<any>(
        `INSERT INTO listings
          (cycle_id, pickup_point_id, leader_user_id, title, description, base_price, unit_label, status)
         VALUES (?, ?, ?, ?, ?, ?, ?, 'ACTIVE')`,
        [
          activeCycleId,
          params.pickupPointId,
          params.leaderUserId,
          listing.title,
          listing.description,
          listing.basePrice,
          listing.unitLabel
        ]
      );

      const listingId = Number(insertListing.insertId);

      await dbPool.query(
        `INSERT INTO listing_inventory (listing_id, available_quantity, reserved_quantity)
         VALUES (?, ?, ?)`,
        [listingId, listing.available, listing.reserved]
      );
    }
  }

  return activeCycleId;
};

const ensureFavorites = async (
  memberUserId: number,
  pickupPointId: number,
  leaderUserId: number
): Promise<void> => {
  await dbPool.query(
    'INSERT IGNORE INTO favorites (user_id, pickup_point_id, leader_user_id) VALUES (?, ?, NULL)',
    [memberUserId, pickupPointId]
  );

  await dbPool.query(
    'INSERT IGNORE INTO favorites (user_id, pickup_point_id, leader_user_id) VALUES (?, NULL, ?)',
    [memberUserId, leaderUserId]
  );
};

const ensureTaxJurisdiction = async (): Promise<void> => {
  await dbPool.query(
    `INSERT INTO tax_jurisdictions (code, name, tax_rate)
     VALUES ('US-IL-SPRINGFIELD', 'Springfield IL Local Tax', 0.0825)
     ON DUPLICATE KEY UPDATE name = VALUES(name), tax_rate = VALUES(tax_rate)`
  );
};

const ensurePricingRules = async (): Promise<void> => {
  const pricingRules = [
    {
      code: 'MEMBER_PRICE_PROMO',
      name: 'Member price adjustment',
      ruleType: 'MEMBER_PRICING',
      config: { memberUnitPrice: 5.49 }
    },
    {
      code: 'TIER_QTY_3',
      name: 'Tiered discount quantity >= 3',
      ruleType: 'TIERED_DISCOUNT',
      config: { minQuantity: 3, percent: 0.05 }
    },
    {
      code: 'CAP_10_PERCENT',
      name: 'Capped discount up to 3.00',
      ruleType: 'CAPPED_DISCOUNT',
      config: { percent: 0.1, maxDiscount: 3.0 }
    },
    {
      code: 'SUBSIDY_LOCAL',
      name: 'Local subsidy per unit',
      ruleType: 'SUBSIDY',
      config: { subsidyPerUnit: 0.25 }
    }
  ];

  for (const rule of pricingRules) {
    await dbPool.query(
      `INSERT INTO pricing_rules (code, name, rule_type, is_active, applies_scope)
       VALUES (?, ?, ?, 1, 'GLOBAL')
       ON DUPLICATE KEY UPDATE name = VALUES(name), rule_type = VALUES(rule_type), is_active = 1`,
      [rule.code, rule.name, rule.ruleType]
    );

    const [ruleRow] = await dbPool.query<{ id: number }[]>(
      'SELECT id FROM pricing_rules WHERE code = ? LIMIT 1',
      [rule.code]
    );

    if (ruleRow.length === 0) {
      throw new Error(`Failed to load pricing rule ${rule.code}`);
    }

    const ruleId = ruleRow[0].id;

    const [versionRows] = await dbPool.query<{ id: number }[]>(
      'SELECT id FROM pricing_rule_versions WHERE pricing_rule_id = ? AND version_no = 1 LIMIT 1',
      [ruleId]
    );

    if (versionRows.length === 0) {
      await dbPool.query(
        `INSERT INTO pricing_rule_versions
          (pricing_rule_id, version_no, config_json, effective_from, effective_to)
         VALUES (?, 1, ?, DATE_SUB(UTC_TIMESTAMP(), INTERVAL 1 DAY), NULL)`,
        [ruleId, JSON.stringify(rule.config)]
      );
    } else {
      await dbPool.query(
        `UPDATE pricing_rule_versions
         SET config_json = ?, effective_to = NULL
         WHERE id = ?`,
        [JSON.stringify(rule.config), versionRows[0].id]
      );
    }
  }
};

const ensureLedgerAccounts = async (): Promise<void> => {
  const accounts = [
    {
      code: 'RECEIVABLE_INTERNAL',
      name: 'Internal Receivables',
      accountType: 'ASSET'
    },
    {
      code: 'SALES_REVENUE',
      name: 'Sales Revenue',
      accountType: 'REVENUE'
    }
  ];

  for (const account of accounts) {
    await dbPool.query(
      `INSERT INTO ledger_accounts (code, name, account_type, is_active)
       VALUES (?, ?, ?, 1)
       ON DUPLICATE KEY UPDATE name = VALUES(name), account_type = VALUES(account_type), is_active = 1`,
      [account.code, account.name, account.accountType]
    );
  }
};

const ensureDiscussionSeed = async (params: {
  listingId: number;
  orderId: number;
  memberUserId: number;
  leaderUserId: number;
}): Promise<void> => {
  const [listingDiscussionRows] = await dbPool.query<{ id: number }[]>(
    "SELECT id FROM discussions WHERE context_type = 'LISTING' AND context_id = ? LIMIT 1",
    [params.listingId]
  );

  let listingDiscussionId: number;
  if (listingDiscussionRows.length === 0) {
    const [insertDiscussion] = await dbPool.query<any>(
      `INSERT INTO discussions (context_type, context_id, created_by_user_id)
       VALUES ('LISTING', ?, ?)`,
      [params.listingId, params.memberUserId]
    );
    listingDiscussionId = Number(insertDiscussion.insertId);
  } else {
    listingDiscussionId = listingDiscussionRows[0].id;
  }

  const [commentRows] = await dbPool.query<{ id: number }[]>(
    'SELECT id FROM comments WHERE discussion_id = ? LIMIT 1',
    [listingDiscussionId]
  );

  if (commentRows.length === 0) {
    const [c1] = await dbPool.query<any>(
      `INSERT INTO comments (discussion_id, parent_comment_id, user_id, body, quoted_comment_id)
       VALUES (?, NULL, ?, ?, NULL)`,
      [listingDiscussionId, params.memberUserId, 'Anyone picking up from this location tomorrow? @leader1']
    );

    const firstCommentId = Number(c1.insertId);

    const [c2] = await dbPool.query<any>(
      `INSERT INTO comments (discussion_id, parent_comment_id, user_id, body, quoted_comment_id)
       VALUES (?, ?, ?, ?, ?)`,
      [
        listingDiscussionId,
        firstCommentId,
        params.leaderUserId,
        '> Anyone picking up from this location tomorrow?\nYes, pickup starts at 09:00.',
        firstCommentId
      ]
    );

    await dbPool.query('UPDATE comments SET reply_count = reply_count + 1 WHERE id = ?', [
      firstCommentId
    ]);

    const secondCommentId = Number(c2.insertId);

    await dbPool.query(
      `INSERT IGNORE INTO comment_mentions (comment_id, mentioned_user_id, mention_text)
       VALUES (?, ?, ?)`,
      [firstCommentId, params.leaderUserId, '@leader1']
    );

    await dbPool.query(
      `INSERT INTO notifications
        (user_id, notification_type, source_comment_id, discussion_id, message, read_state)
       VALUES (?, 'MENTION', ?, ?, ?, 'UNREAD'),
              (?, 'REPLY', ?, ?, ?, 'UNREAD')`,
      [
        params.leaderUserId,
        firstCommentId,
        listingDiscussionId,
        'member1 mentioned you in a discussion.',
        params.memberUserId,
        secondCommentId,
        listingDiscussionId,
        'leader1 replied to your comment.'
      ]
    );
  }

  const [orderDiscussionRows] = await dbPool.query<{ id: number }[]>(
    "SELECT id FROM discussions WHERE context_type = 'ORDER' AND context_id = ? LIMIT 1",
    [params.orderId]
  );

  if (orderDiscussionRows.length === 0) {
    await dbPool.query(
      `INSERT INTO discussions (context_type, context_id, created_by_user_id)
       VALUES ('ORDER', ?, ?)`,
      [params.orderId, params.memberUserId]
    );
  }
};

const ensureDemoOrderForDiscussion = async (params: {
  memberUserId: number;
  cycleId: number;
  pickupPointId: number;
  listingId: number;
  taxJurisdictionId: number;
  pickupWindowId: number;
}): Promise<number> => {
  const [existing] = await dbPool.query<{ id: number }[]>(
    `SELECT id
     FROM orders
     WHERE user_id = ?
     ORDER BY id ASC
     LIMIT 1`,
    [params.memberUserId]
  );

  if (existing.length > 0) {
    return existing[0].id;
  }

  const [insertOrder] = await dbPool.query<any>(
    `INSERT INTO orders
      (user_id, cycle_id, pickup_point_id, status, tax_jurisdiction_id, subtotal_amount, discount_amount, subsidy_amount, tax_amount, total_amount, pricing_trace_json)
     VALUES (?, ?, ?, 'CONFIRMED', ?, 10.00, 1.00, 0.50, 0.70, 9.20, ?)`,
    [
      params.memberUserId,
      params.cycleId,
      params.pickupPointId,
      params.taxJurisdictionId,
      JSON.stringify({ seeded: true })
    ]
  );

  const orderId = Number(insertOrder.insertId);

  await dbPool.query(
    `INSERT INTO order_items
      (order_id, listing_id, quantity, unit_price, line_subtotal, line_discount, line_subsidy, line_tax, line_total, pricing_breakdown_json)
     VALUES (?, ?, 2, 5.00, 10.00, 1.00, 0.50, 0.70, 9.20, ?)`,
    [orderId, params.listingId, JSON.stringify({ seeded: true })]
  );

  const [windowRows] = await dbPool.query<
    { window_date: string; start_time: string; end_time: string }[]
  >(
    `SELECT DATE_FORMAT(window_date, '%Y-%m-%d') AS window_date,
            TIME_FORMAT(start_time, '%H:%i:%s') AS start_time,
            TIME_FORMAT(end_time, '%H:%i:%s') AS end_time
     FROM pickup_windows
     WHERE id = ? LIMIT 1`,
    [params.pickupWindowId]
  );

  const windowRow = windowRows[0];

  await dbPool.query(
    `INSERT INTO order_pickup_window
      (order_id, pickup_window_id, selected_date, selected_start_time, selected_end_time)
     VALUES (?, ?, ?, ?, ?)`,
    [
      orderId,
      params.pickupWindowId,
      windowRow.window_date,
      windowRow.start_time,
      windowRow.end_time
    ]
  );

  await dbPool.query(
    `INSERT INTO order_status_history
      (order_id, from_status, to_status, changed_by_user_id, reason)
     VALUES (?, NULL, 'CONFIRMED', ?, 'Seeded order')`,
    [orderId, params.memberUserId]
  );

  await dbPool.query(
    `INSERT INTO settlements (order_id, status, settled_amount, note, posted_at)
     VALUES (?, 'POSTED', 9.20, 'Seeded settlement', CURRENT_TIMESTAMP)`,
    [orderId]
  );

  const [settlementRows] = await dbPool.query<{ id: number }[]>(
    'SELECT id FROM settlements WHERE order_id = ? LIMIT 1',
    [orderId]
  );

  const settlementId = settlementRows[0].id;

  const [accounts] = await dbPool.query<{ id: number; code: string }[]>(
    'SELECT id, code FROM ledger_accounts WHERE code IN (?, ?)',
    ['RECEIVABLE_INTERNAL', 'SALES_REVENUE']
  );

  const receivable = accounts.find((a) => a.code === 'RECEIVABLE_INTERNAL');
  const revenue = accounts.find((a) => a.code === 'SALES_REVENUE');

  if (receivable && revenue) {
    await dbPool.query(
      `INSERT INTO ledger_entries
        (settlement_id, order_id, account_id, direction, amount, memo)
       VALUES (?, ?, ?, 'DEBIT', 9.20, 'Seeded receivable'),
              (?, ?, ?, 'CREDIT', 9.20, 'Seeded revenue')`,
      [settlementId, orderId, receivable.id, settlementId, orderId, revenue.id]
    );
  }

  return orderId;
};

const main = async (): Promise<void> => {
  for (const role of ROLE_NAMES) {
    await upsertRole(role);
  }

  const users = new Map<string, number>();

  for (const account of seedUsers) {
    if (!isPasswordPolicyValid(account.password)) {
      throw new Error(`Seed password invalid for ${account.username}. ${passwordPolicyMessage}`);
    }

    const passwordHash = await hashPassword(account.password);
    const created = await ensureUser({
      username: account.username,
      passwordHash,
      role: account.role
    });
    users.set(account.username, created.id);
  }

  const pickupPointId = await ensurePickupPoint();
  await ensurePickupWindows(pickupPointId);

  const leaderUserId = users.get('leader1');
  const memberUserId = users.get('member1');

  if (!leaderUserId || !memberUserId) {
    throw new Error('Seed users missing for leader1/member1.');
  }

  const cycleId = await ensureCyclesAndListings({
    pickupPointId,
    leaderUserId
  });

  await ensureFavorites(memberUserId, pickupPointId, leaderUserId);
  await ensureTaxJurisdiction();
  await ensurePricingRules();
  await ensureLedgerAccounts();

  const [taxRows] = await dbPool.query<{ id: number }[]>(
    'SELECT id FROM tax_jurisdictions WHERE code = ? LIMIT 1',
    ['US-IL-SPRINGFIELD']
  );

  const [listingRows] = await dbPool.query<{ id: number }[]>(
    'SELECT id FROM listings WHERE cycle_id = ? ORDER BY id ASC LIMIT 1',
    [cycleId]
  );

  const [windowRows] = await dbPool.query<{ id: number }[]>(
    'SELECT id FROM pickup_windows WHERE pickup_point_id = ? ORDER BY id ASC LIMIT 1',
    [pickupPointId]
  );

  const orderId = await ensureDemoOrderForDiscussion({
    memberUserId,
    cycleId,
    pickupPointId,
    listingId: listingRows[0].id,
    taxJurisdictionId: taxRows[0].id,
    pickupWindowId: windowRows[0].id
  });

  await ensureDiscussionSeed({
    listingId: listingRows[0].id,
    orderId,
    memberUserId,
    leaderUserId
  });

  console.log('Seed completed.');
};

main()
  .then(async () => {
    await dbPool.end();
  })
  .catch(async (error) => {
    console.error(error);
    await dbPool.end();
    process.exit(1);
  });