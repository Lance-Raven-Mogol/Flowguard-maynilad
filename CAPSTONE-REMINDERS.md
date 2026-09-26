# FlowGuard — Capstone Panel Reminders (Status Check)
> Checked against the codebase: 2026-09-26 (commit `4aec3de`)
> Updated: 2026-09-26 — #1 tapos na (email OTP); bagong MRF flow + multi-material MRF (tingnan sa ibaba); #5 at #14 na-update
> Updated: 2026-09-26 — Lahat ng yellow tapos na: #3, #4, #6, #7, #10 (tingnan sa ibaba). ⚠️ May bagong DB migration: `backend/supabase/capstone-yellow-migration.sql`
> Updated: 2026-09-26 — Complaint statuses: isang salita na lang (Pending, Ongoing, Estimating, Billing, Resolved, Cancelled, Declined)
> Updated: 2026-09-26 — Quick wins tapos na: #5 (Stock column), #11 (GM print), #12 (tinanggal ang customer Requests), #13 (required photo)

Legend: ✅ Tapos na · 🟡 Meron na pero kailangan i-adjust · ❌ Wala pa

## Summary

| # | Reminder | Status |
|---|---|---|
| 1 | Ibalik ang authentication code sa Gmail | ✅ |
| 2 | Paid vs. free complaints (sakop ng organization) | ❌ |
| 3 | Traditional payment (walk-in / cash) | ✅ |
| 4 | Categorize ang complaints | ✅ |
| 5 | MRF — column para sa natitirang stock | ✅ |
| 6 | Inventory — bawal ma-0, warning levels | ✅ |
| 7 | Warning kapag 10 na lang ang stock | ✅ |
| 8 | FIFO (first in, first out) | ❌ |
| 9 | Report ng lahat ng transactions | ❌ |
| 10 | Barcode scanner para match ang actual vs. system | ✅ |
| 11 | GM — print function | ✅ |
| 12 | Customer — alisin ang Request function | ✅ |
| 13 | Photo required sa complaint | ✅ |
| 14 | Identity kung sino ang nag-out ng item | ✅ |
| 15 | Audit logs sa Admin | ✅ |
| 16 | Tech dept — full payment + breakdown/receipt, hindi estimate | ❌ |
| 17 | Purok sa location | ❌ |
| 18 | Water-quality complaints (mabaho, madumi, mahina) — libre | ❌ |
| 19 | Zone specialist site visit — dropdowns | ❌ |
| 20 | In-house / contractor — specific names | ✅ (i-confirm lang) |

---

## ✅ 1. Authentication code thru Gmail — Alojado (DONE 2026-09-26)
- **Ginawa:** Tinanggal ang TOTP / authenticator-app flow. Bumalik sa **email OTP gamit ang nodemailer (Gmail SMTP)**.
  - **Signup:** fill up ng form → may 6-digit code na ipapadala sa email (valid ng 10 mins) → kapag na-verify, saka pa lang gagawin ang account.
  - **Login (kapag naka-on ang 2FA):** kapag tama ang password, may code na ipapadala sa email (valid ng 5 mins).
  - **Forgot password:** ilagay ang email → may reset code na ipapadala → code + bagong password. Pare-pareho ang sagot kahit walang account ang email, para hindi malaman kung sino ang may account.
  - **Account Settings:** kapag in-on ang 2FA, may code na ipapadala sa email para ma-confirm. Walang kailangang code kapag io-off.
  - May **"Resend code"** button sa lahat ng screen, na may 60s cooldown. Max 5 maling attempts bawat code.
- **Tinanggal:** `backend/src/services/totp.service.ts`, ang `speakeasy` / `qrcode` / `@types/*` sa backend, ang QR + setup key screens, ang Installation Guide carousel at ang 8 screenshots nito (`frontend/src/assets/images/1.png`–`9.png`), at ang `totp-*` / `guide-*` CSS.
- **Files:** `auth.service.ts`, `mailer.service.ts` (may subject/text na para sa signup / login / reset / 2FA), `auth.controller.ts`, `auth.routes.ts` (bagong `POST /auth/forgot-password`, tinanggal ang `/auth/otp/enable`), `authService.ts`, `AuthContext.tsx`, `SignupPage.tsx`, `LoginPage.tsx`, `ForgotPasswordPage.tsx`, `AccountSettings.tsx`, at ang bagong `views/auth/OtpCodeInput.tsx`.
- **Tests:** Na-rewrite ang `backend/tests/password-reset.test.mjs` para sa email codes: reset, lockout, login 2FA, at signup. 4/4 pass.
- **Mga dapat tandaan:**
  - Sa production, kapag hindi naipadala ang email, may error na lalabas sa user (503). Sa dev naman, lalabas ang code sa backend console.
  - Naka-memory lang ang codes, kaya mawawala ang pending codes kapag nag-restart ang Render server. Mag-request na lang ulit ng code.
  - Na-test na: gumagana ang pag-send gamit ang Gmail app password.
  - **Napupunta sa Spam:** dahil bago ang sender at automated ang emails. May plain-text version na ang email at `replyTo` para bumaba ang spam score. Bago ang demo, i-click ang **"Not spam"** at idagdag ang `thecapstone01@gmail.com` sa Contacts ng mga email na gagamitin. Para sa siguradong inbox, kailangan ng sariling domain + email service (Resend / Brevo). Optional ito at hindi kailangan para sa capstone.
  - **Security:** naka-hardcode pa rin ang Gmail app password sa `backend/src/config/env.ts`, at naka-commit ito sa git. Mas mabuting ilipat sa `SMTP_USER` / `SMTP_PASS` env vars (sa `backend/.env` at sa Render), tapos gumawa ng bagong app password.

## ✅ Bagong MRF flow + multi-material MRF (DONE 2026-09-26)
- **Flow:** Team Leader nag-file ng MRF → **Inventory Officer** nag-verify ng stock → **General Manager** nag-approve → balik sa **Inventory Officer** para i-release. Pwedeng mag-reject ang IO sa verification o ang GM sa approval.
  - Status labels: `pending` = *For Stock Verification*, `verified` = *For GM Approval*, `approved` = *For Release*, `released`, `rejected`.
  - Bawas sa inventory ang stock pagka-approve ng GM, para naka-reserve na ito at hindi makuha ng ibang MRF. Kapag kulang ang stock, hindi pwedeng i-verify o i-approve.
  - Server-side ang pagbabantay kung sino ang pwedeng gumawa ng bawat step (`MRF_TRANSITIONS` sa `resource.service.ts`).
- **Multi-material:** Isang MRF, maraming materials ("+ Add another material"). Nakikita ito sa JO → Materials, sa Requests tab (Item/Qty columns + items table sa View), at sa Log Leftovers.
- Team leader lang ng JO ang pwedeng mag-request (contractor / in-house), at para lang sa ongoing na JO.
- **Tests:** `backend/tests/mrf-workflow.test.mjs`. Patakbuhin gamit ang `node --experimental-test-module-mocks --test tests/mrf-workflow.test.mjs`.
- ⚠️ **Kailangan ng DB migration:** patakbuhin ang `backend/supabase/mrf-workflow-migration.sql` sa Supabase SQL Editor.

## ❌ 2. Paid vs. free complaints
- **Ngayon:** Lahat ng incident ay dumadaan sa `for_estimation` → `for_billing`, at laging hinihingi ng zone specialist ang `bill_to_customer_id` (`modules.tsx:1163`). Walang konsepto ng "libre / sakop ng Maynilad".
- **Gagawin:**
  - Mag-add ng `billable` (boolean) o `coverage` (`customer` | `organization`) sa `incidents`, naka-derive mula sa complaint category (tingnan ang #4 at #18).
  - Kapag organization-covered: huwag nang hingin ang Bill To, laktawan ang `for_estimation` / `for_billing`, at dumiretso sa `resolved` pagkatapos ma-complete ang JO.
  - Ipakita ang "Walang bayad / Covered by Maynilad" na badge sa incident list at details.
  - Idokumento sa paper kung aling complaints ang may bayad at alin ang wala.

## ✅ 3. Traditional payment (walk-in / cash) (DONE 2026-09-26)
- **Record Cash** button sa Billing (Commercial Dept / GM) para sa bills na Unpaid / Overdue / Rejected. Ilalagay ang **amount received, OR number, at payment date**. Walang upload ng proof. Magiging **Paid** agad ang bill, `Cash (Walk-in)` ang payment method, at naka-save kung sino ang nag-record (`recorded_by`). Kapag may linked complaint na nasa *Billing* (o *Declined*), magiging **Resolved** ito.
- **Customer:** dropdown na ang payment method (GCash / Maya / Bank Transfer) at may note na sa office ang cash. Hindi pwedeng mag-submit ang customer ng "Cash (Walk-in)".
- **Bill details / print:** OR Number, Amount Received, at Recorded By. May bagong **Paid Via** column sa Billing table.
- Server-side ang checks (`resource.service.ts`): Commercial / GM lang, kailangan ang OR number, bawal sa bill na bayad na.
- **Tests:** `mrf-workflow.test.mjs` → "walk-in cash".

## ✅ 4. Categorize ang complaints (DONE 2026-09-26)
- Grouped na ang **Concern** dropdown sa complaint form:
  - **Water Quality:** Mabaho ang tubig, Madumi / malabo ang tubig
  - **Water Supply:** Mahina ang tubig, Walang tubig
  - **Leak / Pipe:** Pipe leak, Burst main
  - **Service Request:** New connection, Reconnection, Meter transfer / replacement, Disconnection
  - **Other:** Other concern. Ang lumang "General complaint" ay para lang sa lumang records.
- Sa Incidents table, may **Category** (may kulay) at **Concern** columns, at may **category quick filters** (All / Water Quality / … na may bilang).
- Naka-define na sa `INCIDENT_CATEGORIES` (`modules.tsx`) ang `free` flag bawat category: libre ang Water Quality/Supply, may bayad ang Service Request, depende ang Leak. Gagamitin ito sa #2 / #18.
- ⚠️ **DB:** kailangang patakbuhin ang `capstone-yellow-migration.sql`, dahil papalitan nito ang `incidents_type_check` constraint.

## ✅ 5. MRF — column para sa natitirang stock (DONE 2026-09-26)
- **Requests table:** May bagong **Stock** column. Para sa MRF na *For Stock Verification* o *For GM Approval*, live itong nagche-check laban sa inventory: **Stock OK** (green) o **Short (N items)** (red). `—` kapag approved na (naka-reserve na ang stock) o kapag hindi MRF.
- **View / Verify Stock / Review & Approve:** nandoon pa rin ang per-material table (Requested, In Stock, Check). Sa MRF form, "N in stock" sa bawat material.

## ✅ 6. Inventory — bawal ma-0, may warning levels (DONE 2026-09-26)
- Bagong **Safety Stock** (`materials.safety_level`, default 1) sa bawat material. Hindi ito pwedeng i-release ng MRF, kaya **hindi na mauubos sa 0** ang item. Server-side ito (`checkMrfStock`) sa verify at approve: *"2 available after 1 safety stock, 3 requested"*. Kung talagang kailangan, pwedeng ibaba ng IO / GM ang safety stock ng item.
- **Levels** (Level column, badge + progress bar sa Material List):
  - **Normal**
  - **Reorder**: ≤ reorder point (`min_level`)
  - **Critical**: ≤ 10
  - **Safety Stock**: nasa safety level na
- MRF form, View, at Requests "Stock" column: **Available** na ang ipinapakita (stock minus safety stock).
- Metrics: *Critical / Safety* at *Reorder*.
- **Tests:** "safety stock is never released".

## ✅ 7. Warning kapag 10 na lang ang items (DONE 2026-09-26)
- **Warning banner** sa taas ng Inventory (IO / GM): "N items need restocking". Kasama ang listahan (level, natitira, reorder point) at **Create Purchase Request** button sa bawat item. Pre-filled ang button (name, category, unit, price, supplier) at ang quantity ay pabalik sa 2× ng reorder point.
- Bell alert: "N material(s) need restocking", para sa stock na ≤ 10 o nasa reorder point.
- Sa MRF form, may warning kapag ≤ 10 na lang ang matitira pagkatapos ng request: *"only N left after this — needs restocking"*.

## ❌ 8. FIFO (First In, First Out)
- **Ngayon:** Iisang `quantity` lang bawat material. Walang batch / lot / date received.
- **Gagawin:**
  - Bagong table na `material_batches` (`material_id`, `batch_no`, `qty_received`, `qty_remaining`, `received_at`, `supplier_id`, `purchase_request_ref`).
  - Stock-in (purchase received / restock): gagawa ng bagong batch.
  - Stock-out (MRF release): babawasan muna ang pinakalumang batch. I-log kung aling batch ang nagamit.
  - Ang `materials.quantity` ay sum ng `qty_remaining` ng lahat ng batch.
  - UI: "Batches" section sa material details (oldest first, naka-highlight ang "Next to use").

## ❌ 9. Report ng lahat ng transactions
- **Meron na:** Audit Log (read-only, may stock_movement entries). Pero log lang ito, hindi report.
- **Gagawin:** Bagong **Reports** view (GM, at Inventory Officer para sa stock):
  - Filters: date range, type (Stock In/Out, Payments, Job Orders, Complaints), user.
  - Summary totals (e.g. total collected, total stock out per item).
  - **Export CSV** + **Print** (tingnan ang #11).

## ✅ 10. Barcode / QR scanner + Stock Count (DONE 2026-09-26)
- Bagong tab na **Inventory → Stock Count (Scan)** (IO / GM):
  - Pwedeng mag-scan gamit ang **camera** (QR label o 1D barcode, `html5-qrcode`), **USB/Bluetooth barcode scanner** (nagta-type ito at nag-e-Enter), o i-type ang SKU.
  - Ipapakita ang **System** quantity. Ilalagay ang **Actual count**, tapos makikita ang **Variance** (Match / ±N).
  - Pagka-save, magiging actual count ang system quantity. Naka-log ito sa Inventory History bilang **Counted** (audit: `movement_type: stock_count`, `system_quantity`, `counted_quantity`, `variance`, note).
  - May listahan ng lahat ng na-count sa session.
- Nababasa ng scanner ang mga existing QR label (`/material/<SKU>`).
- Kailangan ng **HTTPS** para sa camera (OK sa Vercel; sa localhost din).
- Tinanggal na sa "Out of scope" sa `PENDING.md`.
- *Hindi pa kasama:* scan-to-verify sa MRF release (optional ito sa reminder).
- **Tests:** "stock count logs system vs. actual".

## ✅ 11. GM — print function — Recalla (DONE 2026-09-26)
- **Print button sa bawat table** (GM lang): nasa taas ng Incidents, Job Orders, Inventory, Requests, Suppliers, Billing, Asset Lifecycle, Service Advisories, at Audit Log. Kung ano ang nakikita sa table (kasama ang search filter at archived view), iyon ang ipi-print.
- **Print button sa detail modals** (GM lang): Complaint, Job Order, Materials ng JO, Request, Asset, Bill / Payment.
- Bubukas ang malinis na print window na may header (FlowGuard, title, petsa, at kung sino ang nag-print). Hiwalay na window ito kaya hindi naaapektuhan ng `@media print` ng QR label.
- **Files:** bagong `views/components/print.ts` (`printHtml`, `printTable`), `LiveModule.tsx`, `Modal.tsx` (`printable` / `printedBy` props), `modules.tsx` (`useGmPrint`).
- *Hindi pa kasama:* User Management (hindi LiveModule). Ang Reports view (#9) ay wala pa.

## ✅ 12. Customer — alisin ang Request function (DONE 2026-09-26)
- Tinanggal ang **Requests** menu ng customer (`roleViews.tsx`) at ang `customer` sa `writeRoles` ng `material-requests` (backend `resources.ts` at frontend `WRITE`). Kapag nag-POST pa rin ang customer, 403 na.
- Tinanggal ang customer-only code: Payment Option (COD / GCash) + Delivery Address sa request form, ang "Approve → Issue Bill" modal para sa customer item requests (`ApprovalBillingRow` → `RequestStatusActions`, status lang), ang "Approved Item Requests" sa **Issue Final Bill** (incidents na lang), at ang customer request alerts/badges sa `StatsContext.tsx`.
- Tinanggal ang `payment_option` / `delivery_address` sa allowed columns. Naiwan ang DB columns para hindi masira ang lumang data (walang migration na kailangan).
- Walang binanggit na Requests sa customer Help Center FAQ, kaya walang binago roon.

## ✅ 13. Photo — required na (DONE 2026-09-26)
- Label: **"Photos (required)"**. Hindi makaka-submit ng bagong complaint kapag walang photo ("Attach at least one photo.").
- Bagong `required` option sa `ModuleField` ng `LiveModule` (hiwalay na check para sa empty array).
- **Backend:** `resource.service.ts` — 400 kapag walang photo sa bagong incident, at hindi pwedeng tanggalin lahat ng photo sa update. Ang lumang complaints na walang photo ay pwede pa ring i-edit.

## ✅ 14. Identity ng nag-out ng item (DONE 2026-09-26)
- Bawat MRF ay may **`verified_by` / `verified_at`** (Inventory Officer na nag-check ng stock), **`approved_by` / `approved_at`** (GM), at **`released_by` / `released_at`** (Inventory Officer na nag-release). Auto-fill ito ng server mula sa naka-login na user, at makikita sa **View** ng request.
- May audit log (`stock_movement` / `stock_out`) din sa bawat material, kasama ang reference ng MRF at ng job order.
- *Optional pa:* `received_by` kung gusto ring i-record kung sinong team member ang tumanggap ng materials.

## ✅ 15. Audit logs sa Admin
- May **Audit Log** view na ang General Manager (`roleViews.tsx`, `AuditLogsModule` sa `modules.tsx:4292`). Awtomatikong nagla-log ang backend ng create/update/stock movements.
- *Optional:* Kung may hiwalay na "Admin" role ang panel, i-clarify na GM ang admin ng system. Pwede ring dagdagan ng filters (user, action, date).

## ❌ 16. Tech dept — full payment + breakdown (hindi estimate)
- **Ngayon:** Nag-i-input ang tech team ng iisang `estimated_cost`, tapos `for_estimation` ang status (`modules.tsx:1183-1195`). Walang breakdown kung saan galing ang halaga.
- **Gagawin:**
  - Palitan ng **itemized charges**: materials (galing sa MRFs ng JO; may listahan na sa `modules.tsx:1946`), labor, at iba pang fees. Auto-compute ang total.
  - I-rename ang "Estimated Cost" bilang **"Total Amount Due"** at ang status `for_estimation` bilang **"For Payment"** (display label lang kung ayaw galawin ang DB).
  - Ipakita ang breakdown sa bill at sa customer. Mag-generate ng printable **receipt / statement of account** na may line items.

## ❌ 17. Purok sa location
- **Ngayon:** Barangay + free-text location lang (`modules.tsx:1385`).
- **Gagawin:** Mag-add ng `purok` field (dropdown, e.g. Purok 1–7, o free text kung iba-iba bawat barangay) sa incidents at sa customer profile/signup. Format ng display: `Purok 3, Santol, Boac`. Idagdag sa `resources.ts` allowed + `schema.sql` migration.

## ❌ 18. Water-quality complaints — libre, may sariling flow
- **Idadagdag sa types:** Mabaho ang tubig, Madumi ang tubig, Mahina ang tubig, etc. (tingnan ang #4).
- **Flow (walang bayad):** Customer files → **Commercial Dept** receives → **Zone Specialist** verifies → back to **Commercial Dept** to create the JO → **Tech Dept** assigns team → completed → **Resolved** (walang billing).
- **Gagawin:** Gamitin ang `billable = false` (#2). Laktawan ang Bill To, estimate/charges, at billing steps. I-check kung pumapasok muna sa Commercial Dept ang complaint bago sa zone specialist (sa ngayon, diretso sa zone specialist ang notification ayon sa Help FAQ).

## ❌ 19. Zone specialist site visit — dropdowns
- **Ngayon:** Isang textarea lang ang "Site Visit Plan" (`modules.tsx:1271-1278`, saved sa `site_action`).
- **Gagawin:** Palitan ng structured form:
  - **Visit date:** date picker/dropdown (+ AM/PM)
  - **Kasama:** multi-select dropdown ng users (zone specialist / tech / in-house)
  - **Materials na dadalhin:** multi-select mula sa inventory (may qty)
  - (Optional) Notes textarea
- Mga bagong columns: `site_visit_date`, `site_visit_period`, `site_visit_companions` (jsonb), `site_visit_materials` (jsonb). Pwede ring i-add sa Team Schedule para lumabas sa calendar.

## ✅ 20. In-house / contractor — specific names
- May **Team Name**, **Team Leader** (dropdown ng actual users), at **Team Members** na ang JO assignment (`modules.tsx:515-600`). Ipinapakita ang mga ito sa table at details.
- *I-confirm sa panel:* Kung ang ibig nilang sabihin ay ilagay din ng in-house/contractor ang **pangalan ng aktwal na gumawa** kapag nag-update ng status (e.g. "Completed by: ___"), mag-add ng `completed_by` na auto-fill mula sa naka-login na user.

---

## Suggested order
1. ~~Mabilis lang: #12, #13, #5, #14, #11~~ — tapos na lahat.
2. Complaint flow: #4 → #18 → #2 → #16 (magkakaugnay, sabay-sabay dapat).
3. Location/visit: #17, #19.
4. Inventory: ~~#6, #7~~ → #8 (FIFO) → ~~#10~~ → #9 (reports).
5. ~~Payments: #3~~ — tapos na.
