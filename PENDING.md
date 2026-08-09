# FlowGuard — Pending Items Checklist
> Last updated: 2026-08-09

---

## ✅ TAPOS NA / CONFIRMED IMPLEMENTED

| Feature | Notes |
|---|---|
| OTP sa signup | Email OTP verification before account creation |
| OTP sa login | 6-digit OTP step after credentials |
| OTP on/off sa Settings | Toggle + verify modal sa Account Settings |
| Bell notifications | Per-incident alerts, mark-all on open, 10s poll |
| Barangay save sa profile | Now saved via updateProfile |
| Soft-delete / Resign ng user | Archive button, account preserved |
| Restore ng archived user | Restore button sa User Management |
| Role change dropdown | GM can change any user's role inline |
| Audit log module | Read-only, visible to GM, logs all key actions |
| Start date / Join date | Set on user creation, shown in User Management |
| Purchase Requests module | Available to GM |
| E-Billing / Payments module | Available to GM |
| Size + weight + color fields | Added to materials form and DB |
| Supply Requests module | Available to all roles |
| Barangay dropdown sa Signup | 33 barangays of Boac listed |

### ✅ Priority 1 — Bug Fixes (Completed 2026-08-09)

#### 1. Zero stock → status auto-update — FIXED
- **Fix:** Sa direct create/update ng material, awtomatikong kino-compute ang status mula sa `quantity` at `min_level`.
- **Rules:** `quantity = 0` → `out_of_stock`; `quantity <= min_level` → `low_stock`; `quantity > min_level` → `in_stock`.
- **Implemented sa:** Backend `resource.service.ts` at frontend Materials/LiveModule save-and-display flow.
- **Verification:** Passed ang frontend/backend TypeScript typechecks at full production build.

---

## ❌ HINDI PA IMPLEMENTED

### 🟠 Priority 2 — Core Missing Features

#### 2. Category autocomplete sa inventory form
- **Problema:** Ang `category` field ng materials ay plain text input. Walang dropdown/autocomplete na nagsu-suggest ng existing categories na naka-enter na sa DB.
- **Gusto:** Kapag nag-type, lalabas agad ang existing categories (para less typing, consistent names).
- **Nasaan ang fix:** `frontend/src/config/modules.tsx` — `MaterialsModule` fields array, similar sa `MaterialCombobox` pattern na ginagamit sa MRF.

#### 3. Location field sa Incidents → hindi nag-de-default sa user's barangay
- **Problema:** Ang `location` field sa incident create form ay blank. Dapat ang default value ay yung barangay ng naka-login na user (na naka-save na sa account).
- **Nasaan ang fix:** `frontend/src/config/modules.tsx` — `IncidentsModule` fields array, `location` field — idagdag ang `default: user!.barangay ?? 'Boac'`.

#### 4. Purchase Requests — hindi visible sa Inventory Officer
- **Problema:** Ang `PurchaseRequestsModule` ay nasa General Manager lang sa sidebar. Ang Inventory Officer ay wala nitong view kahit na may write permission siya (`WRITE['purchase-requests']` includes `inventory-officer`).
- **Nasaan ang fix:** `frontend/src/config/roleViews.tsx` — `inventory-officer` views array, dagdag ng Purchase Requests entry.

---

### 🟡 Priority 3 — Enhancements

#### 5. "Pending" → "Ongoing" label
- **Problema:** Lahat ng modules (job orders, material requests, purchase requests, supply requests) ay gumagamit ng `label: 'Pending'` sa status display. Gusto nilang "Ongoing" para sa in-progress na items.
- **Klaripikasyon needed:** Palitan ba ang DB value (`pending` → `ongoing`) o display label lang? Palitan ng label lang ang mas safe (no breaking change).
- **Nasaan ang fix:** `frontend/src/config/modules.tsx` — `JOB_STATUS`, `MR_STATUS`, `PR_STATUS`, `SR_STATUS` arrays.

#### 6. Inventory summary — category breakdown / top-button filters
- **Problema:** Ang metrics sa Inventory ay generic lang (Total SKUs, Out of Stock, Low Stock, Total Value). Walang per-category quantity breakdown.
- **Gusto:** Quick view ng stocks per category (e.g. "Pipes: 50 units", "Valves: 12 pcs") as filter tabs or summary buttons sa top ng inventory.
- **Nasaan ang fix:** `frontend/src/config/modules.tsx` — `MaterialsModule` metrics + bagong category filter/tabs component.

#### 7. Supplier profiles — dedicated module
- **Problema:** Ang `supplier` field sa materials at purchase requests ay plain text pa. Walang dedicated Supplier records kung saan pwedeng i-manage ang supplier info at i-link.
- **Scope:** Bagong table (`suppliers`), bagong resource def, bagong module, bagong view sa relevant roles.

#### 8. Color coding ng materials per category sa table
- **Problema:** May `color` field sa DB at form para sa kulay ng material mismo (e.g. blue pipe). Pero walang visual color indicator per category sa table rows.
- **Gusto:** Color swatch o colored badge sa table display para madaling ma-identify ang type ng material.
- **Nasaan ang fix:** `frontend/src/config/modules.tsx` — `MaterialsModule` columns, idagdag ang color swatch cell.

---

## ⚪ OUT OF SCOPE / DEPENDE SA DECISION

| Item | Notes |
|---|---|
| Multi-account background session | Unclear ang intent — baka tab switching lang |
| E-billing online payment integration | Explicitly out of scope sa paper (billing/payment processing) |
| Barcode / QR scanner integration | Modeled in data (SKU) pero scanner hardware integration is future work |

---

## Files Reference

| File | Relevant To |
|---|---|
| `backend/src/services/resource.service.ts` | #1 zero-stock auto-status |
| `backend/src/services/auth.service.ts` | OTP, profile |
| `backend/src/config/resources.ts` | Resource definitions |
| `backend/supabase/schema.sql` | DB schema / migrations |
| `frontend/src/config/modules.tsx` | #2 category autocomplete, #3 location default, #5 label change, #6 inventory summary, #8 color coding |
| `frontend/src/config/roleViews.tsx` | #4 Purchase Requests for Inventory Officer |
| `frontend/src/controllers/StatsContext.tsx` | Bell notifications |
| `frontend/src/controllers/NotificationsContext.tsx` | Bell notifications |
| `frontend/src/views/dashboard/AccountSettings.tsx` | OTP settings, barangay |
