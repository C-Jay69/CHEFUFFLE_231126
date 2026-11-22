# ***RESTAURANT MANAGEMENT SYSTEM BUILD PROMPT***

NOV 18TH 2026

````
# SYSTEM & BUILD PROMPT: FULL-STACK AUTONOMOUS IMPLEMENTATION
## PROJECT: "SHIFT HAPPENS! by HYDRAFORGE AI"
### Complete Restaurant Operations Infrastructure & Real-Time Synchronized Engine

---

## 1. EXECUTIVE MISSION & ARCHITECTURAL DIRECTIVE

You are acting as the **Principal Full-Stack Software Engineer and Systems Architect**. Your task is to take the provided production design system, interactive UI screens, and domain schemas for **"SHIFT HAPPENS! by HYDRAFORGE AI"** and build the fully functioning, production-ready, interconnected full-stack web application.

This is **not** a collection of siloed features. It is a unified reactive operations engine where:
1. **POS Orders** deplete ingredient stock in real-time (`orders` ➔ `recipes` ➔ `stock_transactions` ➔ `ingredients`), push tickets to specific KDS station queues via WebSockets, and register real-time hourly sales against labor pacing.
2. **KDS Station Bump Actions** on Mains instantly push WebSocket events that auto-advance the dining room table status from *Stage 1: Starters* to *Stage 2: Entrée* on the Floor Plan & Manager Companion screens.
3. **Voice AI Phone Agent (Twilio + Gemini 1.5/2.0 + pgvector RAG)** answers guest inquiries, checks live table inventory, auto-reserves tables, flags dietary/allergen alerts directly to KDS & CRM, and respects 86'd inventory items in real time.
4. **Labor Pacing Cockpit** tracks real-time labor cost percentage (`(Sum of active clocked-in hourly wages) / (Gross sales in current trading window) * 100`) against a target threshold (e.g. 18.5%), providing automated cut recommendations.
5. **Menu Media Studio & Floor Plan Architect** allows drag-and-drop architectural geometry creation (`x, y, rotation, pax, zone`) and multi-ratio media processing (`1:1 POS tile`, `16:9 mobile QR`).

---

## 2. TECHNOLOGY STACK SPECIFICATION

| Tier | Mandatory Technology | Rationale & Configuration |
| :--- | :--- | :--- |
| **Monorepo Engine** | Turborepo / pnpm workspaces | Clean domain boundaries (`/apps/web`, `/apps/api`, `/packages/shared`, `/packages/db`) |
| **Frontend Framework** | Next.js 14+ (App Router) or React 18+ Vite PWA | Server-side rendering for portals + offline-capable PWA service workers for POS terminals |
| **Styling & Design System** | Tailwind CSS + Lucide Icons | Nocturnal Command token palette: `#000000`, `#0c1322`, `#141b2b`, `#1f2937`, accents `#a855f7` & `#22d3ee` |
| **Backend API** | Node.js (Express / Fastify) + TypeScript | Strict schema validation via Zod, clean REST endpoints & WebSocket gateway |
| **Real-Time Gateway** | Socket.io or native `ws` with Redis adapter | Low-latency bi-directional messaging between KDS, Floor Plan, POS, and Lineup |
| **Primary Database** | PostgreSQL 16+ with `pgvector` & `uuid-ossp` | ACID transactions, strict foreign keys, vector embeddings for menu/RAG |
| **ORM / Data Access** | Prisma or Drizzle ORM | Type-safe migrations, typed client, raw SQL access for recursive queries |
| **Cache & Pub/Sub** | Redis 7+ | Session stores, rate-limiting, WebSocket channel distribution, 86-item cache |
| **Third-Party APIs** | Twilio Voice/SMS, Stripe Elements, SendGrid | Voice webhooks, omnichannel table notifications, split-check transactions |

---

## 3. MONOREPO DIRECTORY ARCHITECTURE

```text
shift-happens/
├── package.json
├── turbo.json
├── pnpm-workspace.yaml
├── .env.example
├── apps/
│   ├── web/                              # Master Frontend (SPA/PWA)
│   │   ├── src/
│   │   │   ├── app/                      # Next.js App Router or React Router
│   │   │   │   ├── (auth)/               # Login, PIN Pad, Role switch
│   │   │   │   ├── (dashboard)/
│   │   │   │   │   ├── pos/              # Touch POS Terminal & Order Cart
│   │   │   │   │   ├── kds/              # Kitchen Display System (Station tabs)
│   │   │   │   │   ├── floor-plan/       # 6-Stage Course Matrix & Floor Plan
│   │   │   │   │   ├── architect/        # Floor Plan & Menu Media Studio
│   │   │   │   │   ├── reservations/     # Table CRM, Waitlist, Timeline
│   │   │   │   │   ├── inventory/        # Par Levels, Recipes, Suppliers
│   │   │   │   │   ├── scheduling/       # Dynamic Labor Pacing & Clock-in
│   │   │   │   │   ├── briefing/         # Pre-Shift Lineup Cockpit
│   │   │   │   │   ├── voice-ai/         # Call Logs, Agent Knowledge, Twilio Telemetry
│   │   │   │   │   └── onboarding/       # SOPs, Training & Quiz Modules
│   │   │   ├── components/               # Shared Nocturnal Command UI library
│   │   │   │   ├── shell/                # Global Sidebar, Header, Telemetry Banner
│   │   │   │   ├── ui/                   # Badges, Buttons, Modals, Sliders, Cards
│   │   │   │   └── tables/               # TableNode SVG canvas components
│   │   │   ├── hooks/                    # useSocket, useOrderCart, useLaborPacing
│   │   │   └── lib/                      # API client, audio alerts (chime.mp3)
│   ├── api/                              # Backend Service
│   │   ├── src/
│   │   │   ├── index.ts                  # HTTP & WebSocket initialization
│   │   │   ├── routes/                   # pos, kds, tables, reservations, inventory, voice
│   │   │   ├── controllers/              # Request handlers
│   │   │   ├── services/                 # Core Business Logic Engines
│   │   │   │   ├── pos-engine.ts         # Atomic sale, ingredient depletion, kitchen dispatch
│   │   │   │   ├── kds-engine.ts         # Ticket timers, station routing, bump event emitter
│   │   │   │   ├── stage-engine.ts       # Course transition logic (Starters -> Mains -> Entree -> Bus)
│   │   │   │   ├── labor-engine.ts       # Hourly wage vs. sales pacing algorithm
│   │   │   │   └── voice-agent.ts        # Twilio Media Streams + Gemini RAG handler
│   │   │   ├── sockets/                  # Socket.io event gateway & room handlers
│   │   │   └── middleware/               # Auth, tenant check, error handling
├── packages/
│   ├── db/                               # Database schema & migrations
│   │   ├── schema.prisma (or drizzle/)   # Relational models & enums
│   │   ├── seed.ts                       # Complete realistic seed data
│   │   └── client.ts                     # Exported typed DB instance
│   └── shared/                           # Shared TS types, Zod schemas, constants
│       ├── src/
│       │   ├── types/                    # DTOs, WebSocket events, Course stages
│       │   └── schemas/                  # Zod validation schemas
````

---

## **4\. RELATIONAL DATABASE SCHEMA (PostgreSQL DDL)**

Implement this exact PostgreSQL DDL with transactions, indexing, and vector extension:

```sql
-- Extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "vector";

-- Enums
CREATE TYPE user_role AS ENUM ('owner', 'general_manager', 'floor_manager', 'chef_expo', 'line_cook', 'server', 'bartender', 'host');
CREATE TYPE table_course_stage AS ENUM ('seated', 'starters', 'mains_firing', 'entree', 'dessert', 'check_dropped', 'dirty_bussing', 'ready');
CREATE TYPE order_status AS ENUM ('open', 'sent_to_kitchen', 'preparing', 'ready_at_pass', 'served', 'paid', 'void');
CREATE TYPE kds_station AS ENUM ('expo', 'grill', 'saute_fryer', 'cold_larder', 'pastry_dessert', 'bar');
CREATE TYPE stock_tx_reason AS ENUM ('sale_deduction', 'waste_spoilage', 'purchase_receipt', 'inventory_audit', 'transfer');
CREATE TYPE call_outcome AS ENUM ('reservation_booked', 'faq_answered', 'transferred_to_staff', 'voicemail', 'abandoned');

-- Core Entities
CREATE TABLE restaurants (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(255) NOT NULL,
    address TEXT NOT NULL,
    phone VARCHAR(50) NOT NULL,
    target_labor_percentage NUMERIC(5,2) DEFAULT 18.50,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE dining_tables (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    restaurant_id UUID REFERENCES restaurants(id) ON DELETE CASCADE,
    table_number VARCHAR(20) NOT NULL,
    zone VARCHAR(50) DEFAULT 'Main Dining Room',
    capacity INT NOT NULL DEFAULT 4,
    pos_x NUMERIC(8,2) DEFAULT 0,
    pos_y NUMERIC(8,2) DEFAULT 0,
    rotation INT DEFAULT 0,
    shape VARCHAR(20) DEFAULT 'square', -- 'circle', 'square', 'rectangle', 'booth'
    current_stage table_course_stage DEFAULT 'ready',
    current_party_name VARCHAR(100),
    current_party_size INT,
    seated_at TIMESTAMPTZ,
    stage_updated_at TIMESTAMPTZ,
    server_id UUID,
    is_active BOOLEAN DEFAULT TRUE,
    UNIQUE(restaurant_id, table_number)
);

CREATE TABLE menu_categories (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    restaurant_id UUID REFERENCES restaurants(id) ON DELETE CASCADE,
    name VARCHAR(100) NOT NULL,
    display_order INT DEFAULT 0
);

CREATE TABLE menu_items (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    restaurant_id UUID REFERENCES restaurants(id) ON DELETE CASCADE,
    category_id UUID REFERENCES menu_categories(id) ON DELETE SET NULL,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    price NUMERIC(10,2) NOT NULL,
    station kds_station DEFAULT 'grill',
    target_prep_time_seconds INT DEFAULT 840, -- 14 min
    image_url_pos TEXT,
    image_url_mobile TEXT,
    is_86ed BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE ingredients (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    restaurant_id UUID REFERENCES restaurants(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    category VARCHAR(100) NOT NULL, -- 'Proteins', 'Dairy', 'Produce', etc.
    current_stock NUMERIC(12,3) NOT NULL DEFAULT 0,
    par_level NUMERIC(12,3) NOT NULL,
    unit VARCHAR(20) NOT NULL, -- 'kg', 'litre', 'piece'
    unit_cost NUMERIC(10,2) NOT NULL,
    supplier_name VARCHAR(255),
    reorder_trigger NUMERIC(12,3) NOT NULL,
    last_updated TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE recipes (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    menu_item_id UUID UNIQUE REFERENCES menu_items(id) ON DELETE CASCADE
);

CREATE TABLE recipe_ingredients (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    recipe_id UUID REFERENCES recipes(id) ON DELETE CASCADE,
    ingredient_id UUID REFERENCES ingredients(id) ON DELETE RESTRICT,
    quantity_required NUMERIC(10,3) NOT NULL
);

CREATE TABLE orders (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    restaurant_id UUID REFERENCES restaurants(id) ON DELETE CASCADE,
    table_id UUID REFERENCES dining_tables(id) ON DELETE SET NULL,
    server_id UUID NOT NULL,
    order_number INT GENERATED ALWAYS AS IDENTITY,
    status order_status DEFAULT 'open',
    subtotal NUMERIC(10,2) DEFAULT 0,
    tax NUMERIC(10,2) DEFAULT 0,
    tip NUMERIC(10,2) DEFAULT 0,
    total NUMERIC(10,2) DEFAULT 0,
    allergy_notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    closed_at TIMESTAMPTZ
);

CREATE TABLE order_items (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    order_id UUID REFERENCES orders(id) ON DELETE CASCADE,
    menu_item_id UUID REFERENCES menu_items(id) ON DELETE RESTRICT,
    quantity INT NOT NULL DEFAULT 1,
    unit_price NUMERIC(10,2) NOT NULL,
    modifiers JSONB DEFAULT '[]'::jsonb,
    prep_status VARCHAR(50) DEFAULT 'firing', -- 'firing', 'bumped', 'ready', 'recalled'
    station kds_station NOT NULL,
    bumped_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE stock_transactions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    restaurant_id UUID REFERENCES restaurants(id) ON DELETE CASCADE,
    ingredient_id UUID REFERENCES ingredients(id) ON DELETE CASCADE,
    quantity_change NUMERIC(12,3) NOT NULL,
    reason stock_tx_reason NOT NULL,
    reference_order_id UUID REFERENCES orders(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE staff_shifts (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    restaurant_id UUID REFERENCES restaurants(id) ON DELETE CASCADE,
    user_name VARCHAR(100) NOT NULL,
    role user_role NOT NULL,
    hourly_rate NUMERIC(10,2) NOT NULL,
    scheduled_start TIMESTAMPTZ NOT NULL,
    scheduled_end TIMESTAMPTZ NOT NULL,
    clock_in TIMESTAMPTZ,
    clock_out TIMESTAMPTZ,
    status VARCHAR(50) DEFAULT 'active' -- 'active', 'clocked_out', 'scheduled'
);

CREATE TABLE knowledge_base (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    restaurant_id UUID REFERENCES restaurants(id) ON DELETE CASCADE,
    category VARCHAR(100) NOT NULL,
    title VARCHAR(255) NOT NULL,
    content TEXT NOT NULL,
    embedding vector(1536) -- OpenAI or Gemini text-embedding-004
);

CREATE TABLE call_logs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    restaurant_id UUID REFERENCES restaurants(id) ON DELETE CASCADE,
    caller_phone VARCHAR(50) NOT NULL,
    duration_seconds INT NOT NULL,
    summary TEXT,
    transcript TEXT,
    outcome call_outcome NOT NULL,
    reservation_id UUID,
    sentiment_score NUMERIC(3,2),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Crucial Indexes
CREATE INDEX idx_tables_restaurant_stage ON dining_tables(restaurant_id, current_stage);
CREATE INDEX idx_order_items_station ON order_items(station, prep_status);
CREATE INDEX idx_stock_tx_ingredient ON stock_transactions(ingredient_id, created_at);
CREATE INDEX idx_shifts_active ON staff_shifts(restaurant_id, clock_in) WHERE clock_out IS NULL;
```

---

## **5\. REAL-TIME EVENT WIRING & LOGIC WORKFLOWS**

### **A. The Atomic POS Checkout & Stock Depletion Engine**

When a POS order is submitted:

* Begin a PostgreSQL transaction.  
* Calculate items subtotal, tax, and order total.  
* For each order\_item:  
  * Fetch linked recipe and recipe\_ingredients.  
  * Decrement ingredients.current\_stock by (quantity \* quantity\_required).  
  * Insert stock\_transactions entry with reason 'sale\_deduction'.  
  * If current\_stock \<= reorder\_trigger, trigger an automated low-stock manager alert and emit an event to the Inventory dashboard.  
  * If current\_stock \<= 0, auto-flag menu\_items.is\_86ed \= true and broadcast GLOBAL\_86\_ITEM\_UPDATE across POS, KDS, and Voice AI agent.  
* Insert into orders and order\_items.  
* Commit transaction.  
* Emit WebSocket message to kds:station:{station\_name} with full ticket payload, allergy flags, and elapsed timer initialization.

### **B. Bi-Directional KDS Bump ➔ Floor Plan Course Auto-Advance**

When line cooks or the expeditor tap BUMP MAINS on Ticket \#8842 for Table 03:

* Update order\_items.prep\_status \= 'bumped' where order\_id \= \#8842 and station \= 'grill'.  
* Determine if all mains for the order have been bumped.  
* If confirmed, execute atomic update:

```sql
UPDATE dining_tables 
SET current_stage = 'entree', stage_updated_at = NOW() 
WHERE id = :table_id;
```

* Emit WebSocket event table:stage\_changed to room restaurant:{id}:

```json
{
  "event": "TABLE_STAGE_ADVANCED",
  "table_number": "03",
  "previous_stage": "starters",
  "new_stage": "entree",
  "triggered_by": "KDS_BUMP_MAINS",
  "ticket_id": "#8842",
  "timestamp": "2026-01-13T19:35:00Z"
}
```

* Client-side listener updates the Floor Plan canvas pill to **Stage 2: Entrée**, sounds an unobtrusive audio confirmation, and updates the Mobile Floor Manager Companion view.

### **C. Dynamic Real-Time Labor Cost Calculation Engine**

Run periodically (every 60 seconds) or on every new sale:

```ts
async function calculateRealTimeLaborPacing(restaurantId: string) {
  const currentHourStart = startOfCurrentHour();
  
  // 1. Calculate active hourly wages
  const activeStaff = await db.staffShifts.findMany({
    where: { restaurantId, clockIn: { not: null }, clockOut: null }
  });
  const currentHourlyBurn = activeStaff.reduce((sum, s) => sum + Number(s.hourlyRate), 0);

  // 2. Fetch gross sales in current trading window
  const windowSales = await db.orders.aggregate({
    _sum: { total: true },
    where: { 
      restaurantId, 
      status: { in: ['served', 'paid'] },
      createdAt: { gte: currentHourStart }
    }
  });
  const salesAmount = Number(windowSales._sum.total || 0);

  // 3. Compute real-time labor percentage
  const currentLaborPercentage = salesAmount > 0 
    ? (currentHourlyBurn / salesAmount) * 100 
    : 100.0;

  // 4. Evaluate against target threshold (18.5%)
  const isOverBudget = currentLaborPercentage > 18.5;

  return {
    activeStaffCount: activeStaff.length,
    currentHourlyBurn,
    currentHourSales: salesAmount,
    laborPercentage: currentLaborPercentage.toFixed(1),
    status: isOverBudget ? 'PACING_ALERT' : 'OPTIMAL',
    recommendation: isOverBudget 
      ? `Cut 1 Floater/Prep shift by 21:00 to rebalance to 17.8%` 
      : `Labor within target boundaries`
  };
}
```

### **D. Voice AI Phone Agent (Twilio Webhook \+ Gemini RAG Pipeline)**

* **Inbound Call Received:** Twilio hits /api/voice/inbound.  
* Connect caller audio stream via WebSockets to Gemini Multimodal Live API / Gemini 1.5 Flash.  
* System instructions inject:  
  * Live 86'd menu items (cached in Redis).  
  * Real-time table availability query tool (checkAvailability(date, time, party\_size)).  
  * Knowledge base vectors search using pgvector for ingredients, allergy questions, dress code, and opening hours.  
* If guest asks: *"Are the dry-aged steaks gluten-free?"* ➔ RAG tool retrieves recipe data directly from Postgres and responds: *"Yes, our 28-day dry-aged ribeye is naturally gluten-free; however, it is finished with compound rosemary garlic butter."*  
* If guest requests booking: Voice agent calls bookReservation(name, phone, party\_size, time). On success, writes to dining\_tables / reservations, triggers Twilio SMS confirmation, and posts live notification into the Host CRM and Pre-Shift Lineup view.

---

## **6\. FRONTEND IMPLEMENTATION GUIDELINES (Design Fidelity)**

* **Strictly adhere to the Nocturnal Command theme tokens:**  
  * Backgrounds: Primary Canvas \#0c1322, Surface Card \#141b2b, Surface High \#1f2937.  
  * Borders: Subtle \#1f2937, High-Contrast \#323949.  
  * Accents: Violet/Purple \#a855f7, Cyan/Teal \#22d3ee, Alert Crimson \#ef4444, Success Emerald \#10b981.  
* **Audio & Tactile Feedback:**  
  * Sound a crisp 440Hz/880Hz two-tone chime when high-priority allergen tickets land on KDS or when an overdue ticket exceeds 15 minutes.  
  * Include immediate optimistic UI updates on bump actions with graceful rollback on network error.  
* **PWA Touch Target Requirements:**  
  * Minimum button height of 48px across all POS and KDS touch targets.  
  * High-contrast visual hierarchy designed for harsh kitchen lighting and glare.

---

## **7\. STEP-BY-STEP EXECUTION ROADMAP**

When you begin generating the implementation, proceed in this exact sequence:

* **Step 1:** Establish root monorepo, environment variable validation (zod), and database schema with Prisma/Drizzle.  
* **Step 2:** Generate the Express/Fastify API server with WebSocket gateway (Socket.io) and Redis pub/sub.  
* **Step 3:** Implement core domain business logic modules (POS Engine, KDS Service, Stage Matrix, Labor Pacing).  
* **Step 4:** Build the React/Next.js UI screens matching the design system and wire them to live WebSocket events.  
* **Step 5:** Implement the Twilio Voice webhook \+ Gemini RAG conversational pipeline.  
* **Step 6:** Deliver automated integration tests simulating an order going from POS ➔ KDS bump ➔ Table Entrée advance ➔ Inventory deduction.

