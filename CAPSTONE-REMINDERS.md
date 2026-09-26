# FlowGuard — Capstone Panel Reminders (Status Check)
> Checked against the codebase: 2026-09-26 (commit `4aec3de`)
> Updated: 2026-09-26 — #1 tapos na (email OTP); bagong MRF flow + multi-material MRF (tingnan sa ibaba); #5 at #14 na-update

Legend: ✅ Tapos na · 🟡 Meron na pero kailangan i-adjust · ❌ Wala pa

## Summary

| # | Reminder | Status |
|---|---|---|
| 1 | Ibalik ang authentication code sa Gmail | ✅ |
| 2 | Paid vs. free complaints (sakop ng organization) | ❌ |
| 3 | Traditional payment (walk-in / cash) | 🟡 |
| 4 | Categorize ang complaints | 🟡 |
| 5 | MRF — column para sa natitirang stock | 🟡 |
| 6 | Inventory — bawal ma-0, warning levels | 🟡 |
| 7 | Warning kapag 10 na lang ang stock | 🟡 |
| 8 | FIFO (first in, first out) | ❌ |
| 9 | Report ng lahat ng transactions | ❌ |
| 10 | Barcode scanner para match ang actual vs. system | 🟡 |
| 11 | GM — print function | ❌ |
| 12 | Customer — alisin ang Request function | ❌ |
| 13 | Photo required sa complaint | ❌ |
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

## 🟡 3. Traditional payment (walk-in / cash)
- **Meron na:** Cash on Delivery para sa customer general requests (`modules.tsx:3336`). Sa billing, free-text ang payment method (`"GCash / Maya / Bank"`, `modules.tsx:4597`).
- **Kulang:** Walang option na **Walk-in / Cash sa office** para sa bills. Sa ngayon, ang customer ang nagre-record ng payment at kailangan ng proof.
- **Gagawin:**
  - Gawing dropdown ang payment method: `GCash`, `Maya`, `Bank Transfer`, `Cash (Walk-in)`.
  - Commercial Dept / GM: "Record Cash Payment" button sa bill. Ilalagay dito ang amount, OR number, at date, tapos auto-`paid` na. Walang upload ng proof.
  - Isama ang payment method sa receipt/report.

## 🟡 4. Categorize ang complaints
- **Ngayon:** `INCIDENT_TYPE_OPTIONS` (`modules.tsx:690`) = General Complaint, Pipe Leak, New Connection, Disconnection, Other. Masyadong general.
- **Gagawin:** Gawing grouped categories, halimbawa:
  - **Water Quality (libre):** Mabaho ang tubig, Madumi / malabo ang tubig
  - **Water Supply (libre):** Mahina ang tubig, Walang tubig
  - **Leak / Pipe (libre o may bayad depende kung public line o private):** Pipe leak, Burst main
  - **Service Request (may bayad):** New connection, Reconnection, Meter transfer / replacement, Disconnection
  - **Other**
- Mag-add ng category filter/metric sa Incidents module. Gamitin ang category para ma-set ang `billable` (#2).

## 🟡 5. MRF — column para sa natitirang stock
- **Meron na (2026-09-26):** Sa **View** ng MRF at sa **Verify Stock / Review & Approve** modal, may table ng bawat material na may **Requested**, **In Stock** (live), at **Check** (Available / Short by N / Custom). Sa MRF form naman, lumalabas sa bawat material ang "N in stock" at nagiging pula kapag kulang.
- **Kulang pa:** Wala pa sa mismong Requests table bilang column. Mahirap itong ipakita bilang isang column dahil pwedeng maraming material ang isang MRF. Kung hihingin pa ng panel, pwedeng maglagay ng column na "Stock OK / May kulang".

## 🟡 6. Inventory — bawal ma-0, may warning levels
- **Meron na:** Auto status `in_stock` / `low_stock` / `out_of_stock` base sa `min_level` (`resource.service.ts:47-53`). Hinaharang din ang release kapag mas malaki ang request kaysa sa stock (`resource.service.ts:166-170`).
- **Kulang:** Pwede pa ring ma-release hanggang **0 exactly**. Iisa lang din ang level (min_level).
- **Gagawin:**
  - Sa `settleStockDeduction`: i-block (o hingan ng GM override) ang release kapag `remaining < reserve/safety level`. Hindi dapat ma-0.
  - Mag-add ng mga level, halimbawa: **Normal**, **Reorder** (≤ reorder point), **Critical** (≤ 10), **Reserved/Safety** (hindi pwedeng galawin).
  - Ipakita ang level bilang badge + progress bar sa Material List.

## 🟡 7. Warning kapag 10 na lang ang items
- **Meron na:** Default ng `min_level` ay 10 (`modules.tsx:2475`). May bell alert na "X material(s) low on stock" (`StatsContext.tsx:329`).
- **Gagawin:** Gawing mas malinaw na **"Kailangan nang mag-add ng stock"**:
  - Warning banner sa taas ng Inventory kasama ang listahan ng items.
  - "Create Purchase Request" shortcut button sa bawat low item.
  - Warning din sa MRF form kapag ang ire-request ay magpapababa sa ≤ 10.

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

## 🟡 10. Barcode / QR scanner
- **Meron na:** Printable QR label bawat material (`panels.tsx:203`, button sa `modules.tsx:2542`). Kapag na-scan gamit ang phone camera, bubukas ang public Material Page.
- **Kulang:** Walang in-app scanner at walang stock count/reconciliation.
- **Gagawin:**
  - In-app scanner gamit ang `html5-qrcode` o ang `BarcodeDetector` API (camera) + support sa USB barcode scanner (keyboard input).
  - **Stock Count mode:** mag-scan ng item → ilagay ang actual count → ipakita ang *system vs. actual* variance → i-save bilang adjustment na may audit log.
  - Pwede ring gamitin ang scan sa MRF release para siguradong tama ang item na lalabas.
  - Tanggalin sa "Out of scope" sa `PENDING.md`.

## ❌ 11. GM — print function — Recalla
- **Ngayon:** Ang QR label lang ang may `window.print()`.
- **Gagawin:** Mag-add ng **Print** button sa GM views: Incidents, Job Orders, Inventory, Billing, Audit Log, Reports, at sa bawat detail modal (JO, bill/receipt). Gumamit ng `@media print` stylesheet na nagtatago ng sidebar at topbar. Pinakamadaling ilagay sa `LiveModule` para lahat ng table ay may print.

## ❌ 12. Customer — alisin ang Request function
- **Ngayon:** May **Requests** menu ang customer (`roleViews.tsx`, customer views). Kasama ang `customer` sa `writeRoles` ng `material-requests` (`resources.ts`).
- **Gagawin:**
  - Tanggalin ang `requests` view sa customer sa `roleViews.tsx`.
  - Tanggalin ang `'customer'` sa `RESOURCES['material-requests'].writeRoles`.
  - Linisin ang customer-only code (general request + Cash on Delivery / GCash flow, `mySupplies` alerts sa `StatsContext.tsx:293`, at billing ng approved general requests sa `modules.tsx:4830`).
  - I-update ang Help Center FAQ.

## ❌ 13. Photo — gawing required
- **Ngayon:** `{ name: 'images', label: 'Photos (optional)' }` (`modules.tsx:1393`). Walang validation.
- **Gagawin:** Palitan ang label ng "Photos (required)". Mag-validate ng hindi bababa sa 1 photo sa frontend, at idagdag ang `images` sa backend validation (hindi pwedeng empty array). Tandaan: `required` sa `resources.ts` ay para sa non-empty value, kaya kailangan ng hiwalay na check para sa empty array.

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
1. Mabilis lang: #12 (alisin ang customer requests), #13 (required photo), #5 (stock column), #14 (released_by), #11 (print).
2. Complaint flow: #4 → #18 → #2 → #16 (magkakaugnay, sabay-sabay dapat).
3. Location/visit: #17, #19.
4. Inventory: #6, #7 → #8 (FIFO) → #10 (scanner/stock count) → #9 (reports).
5. Payments: #3.
