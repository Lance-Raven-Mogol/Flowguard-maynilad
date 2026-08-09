# FlowGuard — Pending Items Checklist
> Last updated: 2026-08-09

---

## ✅ TAPOS NA / CONFIRMED IMPLEMENTED

| Feature | Notes |
|---|---|
| OTP sa signup | Email OTP verification before account creation |
| OTP sa login | 6-digit OTP step after credentials |
| OTP on/off sa Settings | Toggle + verify modal sa Account Settings |
| Bell notifications | Unread-first feed with separate Earlier section, read actions, immediate cross-tab refresh, 3s fallback poll |
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
- **Form behavior:** Wala nang manual Status field; Quantity at Minimum Level ang automatic basis. Supplier selection ay lumalabas lang kapag External Supplier ang Source.
- **Verification:** Passed ang frontend/backend TypeScript typechecks at full production build.

### ✅ Priority 3 — Enhancements (Completed 2026-08-09)

#### 5. “Pending” → “Ongoing” label — COMPLETED
- Display label lang ang pinalitan; nananatiling `pending` ang DB value para walang breaking schema/data change.
- Applied sa Job Orders, Material Requests, Purchase Requests, at Supply Requests tables, dropdowns, metrics, at details.

#### 6. Inventory category summary/filter buttons — COMPLETED
- May clickable category buttons na sa ibabaw ng inventory table.
- Bawat category ay nagpapakita ng total stock quantity at nagfi-filter ng table kapag pinili.

#### 7. Supplier profiles — COMPLETED
- May dedicated `suppliers` table/resource at Supplier Profiles module para sa General Manager at Inventory Officer.
- Supplier records include contact person, email, phone, address, notes, status, at archive support.
- Materials at Purchase Requests ay naka-link na sa supplier profile gamit ang `supplier_id` dropdown.
- Applied successfully ang idempotent Supabase migration.

#### 8. Material category color coding — COMPLETED
- May color swatch na sa Category column ng inventory table.
- Ginagamit ang saved material color kapag valid; kung wala, may consistent generated color base sa category.

- **Verification:** Passed ang frontend/backend TypeScript typechecks at full production build.

### ✅ Item 3 — Incident Location Default (Completed 2026-08-09)

#### 3. Location field sa Incidents → user's barangay — FIXED
- Sa pag-create ng incident, ang `location` ay naka-default na sa barangay ng naka-login na user.
- Gumagamit ng `Boac` bilang fallback kapag walang barangay value ang account.
- Editable pa rin ang location kung kailangang ilagay ang mas eksaktong lugar.

---

## ❌ HINDI PA IMPLEMENTED

### 🟠 Priority 2 — Core Missing Features

#### 2. Category autocomplete sa inventory form
- **Problema:** Ang `category` field ng materials ay plain text input. Walang dropdown/autocomplete na nagsu-suggest ng existing categories na naka-enter na sa DB.
- **Gusto:** Kapag nag-type, lalabas agad ang existing categories (para less typing, consistent names).
- **Nasaan ang fix:** `frontend/src/config/modules.tsx` — `MaterialsModule` fields array, similar sa `MaterialCombobox` pattern na ginagamit sa MRF.

#### 4. Purchase Requests — hindi visible sa Inventory Officer
- **Problema:** Ang `PurchaseRequestsModule` ay nasa General Manager lang sa sidebar. Ang Inventory Officer ay wala nitong view kahit na may write permission siya (`WRITE['purchase-requests']` includes `inventory-officer`).
- **Nasaan ang fix:** `frontend/src/config/roleViews.tsx` — `inventory-officer` views array, dagdag ng Purchase Requests entry.

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
