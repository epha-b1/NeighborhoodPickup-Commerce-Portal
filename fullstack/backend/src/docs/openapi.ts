export const openApiSpec = {
  openapi: "3.0.3",
  info: {
    title: "NeighborhoodPickup Backend API",
    version: "1.0.0",
    description:
      "REST API for the NeighborhoodPickup commerce portal. This specification is generated from the active backend contract in source control.",
  },
  servers: [
    {
      url: "http://localhost:4000",
      description: "Local backend",
    },
  ],
  components: {
    securitySchemes: {
      cookieAuth: {
        type: "apiKey",
        in: "cookie",
        name: "neighborhoodpickup_session",
      },
    },
  },
  tags: [
    { name: "Auth" },
    { name: "Commerce" },
    { name: "Orders" },
    { name: "Discussions" },
    { name: "Appeals" },
    { name: "Finance" },
    { name: "Leaders" },
    { name: "Audit" },
    { name: "Behavior" },
  ],
  paths: {
    "/health": {
      get: {
        tags: ["Auth"],
        summary: "Health check",
        responses: {
          "200": { description: "Service is healthy" },
        },
      },
    },
    "/auth/login": {
      post: {
        tags: ["Auth"],
        summary: "Log in with local username/password",
        requestBody: { required: true },
        responses: {
          "200": { description: "Authenticated" },
          "401": { description: "Invalid credentials" },
          "423": { description: "Account locked" },
        },
      },
    },
    "/auth/logout": {
      post: {
        tags: ["Auth"],
        summary: "Log out current session",
        security: [{ cookieAuth: [] }],
        responses: {
          "204": { description: "Logged out" },
        },
      },
    },
    "/auth/me": {
      get: {
        tags: ["Auth"],
        summary: "Get current session user",
        security: [{ cookieAuth: [] }],
        responses: {
          "200": { description: "Current user" },
          "401": { description: "Not authenticated" },
        },
      },
    },
    "/buying-cycles/active": {
      get: {
        tags: ["Commerce"],
        summary: "List active buying cycles",
        security: [{ cookieAuth: [] }],
        responses: { "200": { description: "Active cycles" } },
      },
    },
    "/listings": {
      get: {
        tags: ["Commerce"],
        summary: "List cycle listings",
        security: [{ cookieAuth: [] }],
        responses: { "200": { description: "Listings" } },
      },
    },
    "/pickup-points/{id}": {
      get: {
        tags: ["Commerce"],
        summary: "Get pickup point detail",
        security: [{ cookieAuth: [] }],
        parameters: [{ name: "id", in: "path", required: true }],
        responses: {
          "200": { description: "Pickup point detail" },
          "404": { description: "Not found" },
        },
      },
    },
    "/favorites/toggle": {
      post: {
        tags: ["Commerce"],
        summary: "Toggle favorite for pickup point or leader",
        security: [{ cookieAuth: [] }],
        responses: {
          "200": { description: "Favorite state updated" },
        },
      },
    },
    "/orders/quote": {
      post: {
        tags: ["Orders"],
        summary: "Generate order quote",
        security: [{ cookieAuth: [] }],
        responses: {
          "200": { description: "Quote generated" },
          "400": { description: "Invalid payload" },
        },
      },
    },
    "/orders/checkout": {
      post: {
        tags: ["Orders"],
        summary: "Checkout order",
        security: [{ cookieAuth: [] }],
        responses: {
          "201": { description: "Order created" },
          "409": { description: "Capacity or inventory conflict" },
        },
      },
    },
    "/orders/{id}": {
      get: {
        tags: ["Orders"],
        summary: "Get order detail",
        security: [{ cookieAuth: [] }],
        parameters: [{ name: "id", in: "path", required: true }],
        responses: {
          "200": { description: "Order detail" },
          "404": { description: "Not found" },
        },
      },
    },
    "/finance/ledger": {
      get: {
        tags: ["Finance"],
        summary: "Get internal ledger entries",
        security: [{ cookieAuth: [] }],
        responses: {
          "200": { description: "Ledger rows" },
          "403": { description: "Forbidden" },
        },
      },
    },
    "/comments": {
      post: {
        tags: ["Discussions"],
        summary: "Create thread comment",
        security: [{ cookieAuth: [] }],
        responses: {
          "201": { description: "Comment created" },
        },
      },
    },
    "/threads/{id}/comments": {
      get: {
        tags: ["Discussions"],
        summary: "Get thread comments",
        security: [{ cookieAuth: [] }],
        parameters: [{ name: "id", in: "path", required: true }],
        responses: {
          "200": { description: "Thread comments" },
          "403": { description: "Forbidden" },
          "404": { description: "Not found" },
        },
      },
    },
    "/comments/{id}/flag": {
      post: {
        tags: ["Discussions"],
        summary: "Flag comment for moderation",
        security: [{ cookieAuth: [] }],
        parameters: [{ name: "id", in: "path", required: true }],
        responses: {
          "200": { description: "Comment flagged" },
          "404": { description: "Comment not found" },
        },
      },
    },
    "/notifications": {
      get: {
        tags: ["Discussions"],
        summary: "List local notifications",
        security: [{ cookieAuth: [] }],
        responses: { "200": { description: "Notifications" } },
      },
    },
    "/notifications/{id}/read-state": {
      patch: {
        tags: ["Discussions"],
        summary: "Update notification read state",
        security: [{ cookieAuth: [] }],
        parameters: [{ name: "id", in: "path", required: true }],
        responses: {
          "200": { description: "Read state updated" },
          "404": { description: "Not found" },
        },
      },
    },
    "/appeals": {
      get: {
        tags: ["Appeals"],
        summary: "List appeals",
        security: [{ cookieAuth: [] }],
        responses: { "200": { description: "Appeals list" } },
      },
      post: {
        tags: ["Appeals"],
        summary: "Create appeal",
        security: [{ cookieAuth: [] }],
        responses: {
          "201": { description: "Appeal created" },
        },
      },
    },
    "/appeals/{id}": {
      get: {
        tags: ["Appeals"],
        summary: "Get appeal detail",
        security: [{ cookieAuth: [] }],
        parameters: [{ name: "id", in: "path", required: true }],
        responses: {
          "200": { description: "Appeal detail" },
          "403": { description: "Forbidden" },
          "404": { description: "Not found" },
        },
      },
    },
    "/appeals/{id}/files": {
      post: {
        tags: ["Appeals"],
        summary: "Upload appeal files",
        security: [{ cookieAuth: [] }],
        parameters: [{ name: "id", in: "path", required: true }],
        responses: {
          "201": { description: "Files uploaded" },
          "400": { description: "Invalid files" },
        },
      },
    },
    "/appeals/{id}/timeline": {
      get: {
        tags: ["Appeals"],
        summary: "Get appeal timeline",
        security: [{ cookieAuth: [] }],
        parameters: [{ name: "id", in: "path", required: true }],
        responses: {
          "200": { description: "Timeline" },
          "404": { description: "Not found" },
        },
      },
    },
    "/appeals/{id}/status": {
      patch: {
        tags: ["Appeals"],
        summary: "Transition appeal status",
        security: [{ cookieAuth: [] }],
        parameters: [{ name: "id", in: "path", required: true }],
        responses: {
          "200": { description: "Status transitioned" },
          "403": { description: "Forbidden" },
          "409": { description: "Invalid transition" },
        },
      },
    },
    "/leaders/applications": {
      post: {
        tags: ["Leaders"],
        summary: "Submit leader application",
        security: [{ cookieAuth: [] }],
        responses: { "201": { description: "Application created" } },
      },
    },
    "/leaders/applications/me": {
      get: {
        tags: ["Leaders"],
        summary: "Get current leader application",
        security: [{ cookieAuth: [] }],
        responses: { "200": { description: "Current application" } },
      },
    },
    "/admin/leaders/applications/pending": {
      get: {
        tags: ["Leaders"],
        summary: "List pending leader applications",
        security: [{ cookieAuth: [] }],
        responses: { "200": { description: "Pending applications" } },
      },
    },
    "/admin/leaders/applications/{id}/decision": {
      post: {
        tags: ["Leaders"],
        summary: "Review leader application",
        security: [{ cookieAuth: [] }],
        parameters: [{ name: "id", in: "path", required: true }],
        responses: { "200": { description: "Decision applied" } },
      },
    },
    "/leaders/dashboard/metrics": {
      get: {
        tags: ["Leaders"],
        summary: "Get leader dashboard metrics",
        security: [{ cookieAuth: [] }],
        responses: { "200": { description: "Metrics" } },
      },
    },
    "/finance/commissions": {
      get: {
        tags: ["Finance"],
        summary: "Get commission summary",
        security: [{ cookieAuth: [] }],
        responses: { "200": { description: "Commission rows" } },
      },
    },
    "/finance/withdrawals/eligibility": {
      get: {
        tags: ["Finance"],
        summary: "Check withdrawal eligibility",
        security: [{ cookieAuth: [] }],
        responses: { "200": { description: "Eligibility status" } },
      },
    },
    "/finance/withdrawals": {
      post: {
        tags: ["Finance"],
        summary: "Request withdrawal",
        security: [{ cookieAuth: [] }],
        responses: {
          "201": { description: "Withdrawal created" },
          "400": { description: "Invalid request" },
          "409": { description: "Eligibility conflict" },
        },
      },
    },
    "/finance/reconciliation/export": {
      get: {
        tags: ["Finance"],
        summary: "Export reconciliation CSV",
        security: [{ cookieAuth: [] }],
        responses: { "200": { description: "CSV export" } },
      },
    },
    "/admin/withdrawal-blacklist": {
      get: {
        tags: ["Finance"],
        summary: "List withdrawal blacklist",
        security: [{ cookieAuth: [] }],
        responses: { "200": { description: "Blacklist entries" } },
      },
      post: {
        tags: ["Finance"],
        summary: "Create or replace blacklist entry",
        security: [{ cookieAuth: [] }],
        responses: { "201": { description: "Entry stored" } },
      },
    },
    "/admin/withdrawal-blacklist/{id}": {
      patch: {
        tags: ["Finance"],
        summary: "Patch blacklist entry",
        security: [{ cookieAuth: [] }],
        parameters: [{ name: "id", in: "path", required: true }],
        responses: {
          "200": { description: "Entry updated" },
          "404": { description: "Not found" },
        },
      },
      delete: {
        tags: ["Finance"],
        summary: "Delete blacklist entry",
        security: [{ cookieAuth: [] }],
        parameters: [{ name: "id", in: "path", required: true }],
        responses: {
          "204": { description: "Entry removed" },
          "404": { description: "Not found" },
        },
      },
    },
    "/audit/logs": {
      get: {
        tags: ["Audit"],
        summary: "Search audit logs",
        security: [{ cookieAuth: [] }],
        responses: { "200": { description: "Audit rows" } },
      },
    },
    "/audit/logs/export": {
      get: {
        tags: ["Audit"],
        summary: "Export audit logs CSV",
        security: [{ cookieAuth: [] }],
        responses: { "200": { description: "CSV export" } },
      },
    },
    "/audit/logs/verify-chain": {
      get: {
        tags: ["Audit"],
        summary: "Verify hash-chain integrity",
        security: [{ cookieAuth: [] }],
        responses: { "200": { description: "Verification result" } },
      },
    },
    "/behavior/events": {
      post: {
        tags: ["Behavior"],
        summary: "Ingest behavior events",
        security: [{ cookieAuth: [] }],
        responses: {
          "202": { description: "Accepted for async processing" },
        },
      },
    },
    "/behavior/summary": {
      get: {
        tags: ["Behavior"],
        summary: "Get behavior summary",
        security: [{ cookieAuth: [] }],
        responses: { "200": { description: "Summary rows" } },
      },
    },
    "/admin/jobs/retention-status": {
      get: {
        tags: ["Behavior"],
        summary: "Get retention job status",
        security: [{ cookieAuth: [] }],
        responses: { "200": { description: "Retention status" } },
      },
    },
    "/admin/jobs/retention-run": {
      post: {
        tags: ["Behavior"],
        summary: "Run retention jobs",
        security: [{ cookieAuth: [] }],
        responses: { "200": { description: "Retention run result" } },
      },
    },
  },
} as const;
