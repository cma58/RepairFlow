# PHIXAR RepairFlow — Master Functional Vision
Version: 0.1 | Updated: 2026-11-07
Status: **Living specification**. Owner-confirmed decisions are distinguished from pending questions. This is a functional specification, not evidence that code is implemented or tested.

## Operating principles
- PHIXAR is one connected repair-shop workflow: customer intake, repair dossier, quotations, reservations, inventory, POS, refurbished, payment, pickup and aftercare.
- Staff must be able to work quickly at the counter, without unnecessary data re-entry.
- Never silently alter owner-confirmed business behavior during an audit. Improvements to architecture/security are allowed if business contracts remain intact.
- Audit agents must read this document and docs/PHIXAR-POS-VISION.md before changing related modules. Report gaps in Dutch. Do not merge/deploy or change live data without approval.

## A. Customer intake — confirmed
1. Two entry methods: self-service customer registration on a shop iPad; or direct registration by a staff member for customers who cannot/will not use the iPad.
2. iPad registration supports individual and business, collecting necessary contact information (name, phone, email), device identity and optional description of issue.
3. Once submitted, the registration must appear promptly in the staff desktop/cash-register interface as a new registration, selectable to continue intake.
4. Staff can create/select customer and device and take photos of condition at arrival for evidence; photos are optional/available as part of intake.
5. Business customer: billing address required. Private customer: address generally not required at intake; whether required for certain invoices/legal cases needs validation.
6. Customer can be selected for a repair, or staff can do a quick retail sale without unnecessary full customer registration, subject to invoicing requirements.

### Additional customer intake & iPad decisions — owner-confirmed 2026-11-07
1. Suggest existing customer matches based on phone number or email; **staff must confirm** before linking, to avoid false matches.
2. After successful submission, automatically clear the shared iPad session and return to the home screen. Do not erase an unsent offline draft prematurely.
3. Owner preference: **one checkbox covering intake terms and marketing**. **LEGAL/PRIVACY CONFLICT — DO NOT IMPLEMENT AS STATED:** optional marketing consent cannot be bundled with mandatory service/privacy acknowledgements. Use separate optional, unprechecked marketing opt-in pending legal review. Privacy notice is information, not consent for necessary processing. Ask owner to confirm compliant UX before implementation.
4. No customer signature required on iPad.
5. Required device fields: device type and brand; model if known; staff may complete the record.
6. Document incoming device condition with **photos only**, no mandatory damage checklist. Staff should be able to attach condition photos.
7. Unlock code is optional, only if necessary; protect it securely, restrict access, avoid plaintext storage/logging, and support a diagnostic process without it.
8. Supplied accessories: free-text field, not a required checklist.
9. Live staff queue with alert and **'Intake overnemen'** action. Claim/lock intake to prevent simultaneous duplicate processing.
10. If connectivity is lost, show clear error, retain draft securely and support safe resend. Never imply server receipt before confirmation; avoid duplicate submission.
11. Business registration fields: company name, billing address, VAT/enterprise number when applicable, contact person and email.
12. After **staff acceptance/final intake**, provide receipt with QR via email or printed paper. iPad self-registration alone is not device acceptance.
13. Preserve previous rule: individual address not mandatory by default; business billing address required.

## B. Repair workflow — confirmed
1. Select/create customer, start repair and register device/issue and intake condition/photos.
2. Usually begin with diagnosis. A fixed diagnostic fee is intended; exact amount awaits discussion with shop owner.
3. After diagnosis, prepare quotation with findings, proposed repairs and prices; customer must approve before paid repair.
4. **On approved quotation, reserve required parts.** Reserved parts remain physically in inventory but are unavailable for other jobs.
5. Perform repair; record work and any parts used. Complete device testing before marking ready.
6. Notify customer when ready (message or phone); customer can check status through QR-linked customer portal.
7. At pickup, POS can add accessories/products to the repair checkout. Split tender supported (cash, SumUp, transfer etc.).
8. **On successful checkout, finalize the inventory deduction** and release/close reservations atomically/idempotently. Special case: free warranty work or fully prepaid repair must still permit correct inventory consumption without a new charge.
9. **Warranty clock starts at actual pickup date**, not repair-completion date. Intended default commercial/service warranty is 12 months, possibly different by component; legal validity must be checked separately.
10. Scan QR from receipt: locate correct customer/original repair for authorized staff; show whether warranty period is active. QR alone must not expose private customer data.
11. A warranty claim is a new linked case and requires diagnosis/eligibility determination; being within time does not automatically establish free coverage.
12. Covered warranty claim: repair without customer charge, with parts and work recorded. Not covered: new quote requiring approval, then reservation, repair, test and checkout as normal.
13. On quote cancellation/change, reservations must be safely released or adjusted. All stock/payment operations must be auditable and not double-applied.

### Additional repair & warranty decisions — owner-confirmed 2026-11-07
1. Diagnosis is **free if customer proceeds with the repair**, otherwise charge the diagnostic fee. Exact price and special exceptions await owner decision; ensure any conditional fee is disclosed before diagnosis.
2. Quotation acceptance can occur through customer portal or email; staff may record oral acceptance with timestamp, identity, scope and evidence/notes. Approval must be auditable.
3. Declined quotation: keep dossier, set **Niet hersteld**, charge diagnosis where applicable, allow pickup.
4. Unrepairable: set **Niet herstelbaar**, retain diagnostic report and notify customer; do not delete history.
5. Unexpected extra damage/cost: **pause repair** and seek approval of supplementary quotation before proceeding.
6. Final test UX: **one 'Test geslaagd' button**; do not force a device-specific checklist. Record staff member and timestamp, and prevent false-ready status after a failed test.
7. Failed final test: return to repair or re-diagnosis, never mark ready for pickup.
8. Automatic email notification when ready; manually log telephone calls. SMS is a future option, not a confirmed live integration.
9. Pickup: receipt/QR plus further verification when needed; authorized third-party collection is supported with proper authorization and privacy controls.
10. Uncollected device: separate **Wacht op afhaling** status and automatic reminders; exact reminder cadence and retention/uncollected-device policy remain open.
11. Warranty return: new linked intake and diagnosis; staff records reasoned determination whether claim is covered. In-period != automatically covered.
12. Repeated warranty failure: each attempt linked to original dossier, preserving complete history and escalation.

### Repair-specific implementation notes
- Quotation and additional approval must be tied to the specific scope and price; do not treat an email sent as accepted without proof of customer approval.
- Ensure diagnosis-fee waiver on accepted repair does not cause double charge or inconsistent invoice.
- Free warranty repair and no-balance-due checkout must still settle stock and pickup correctly.
- Customer identity and authorized pickup must not rely on possession of a QR code alone.

## C. POS — confirmed
- Single cart may combine retail items, refurbished devices and repair services.
- Checkout can originate directly from repair dossier; support deposits, outstanding balances and no double collection.
- One sale may have multiple payment methods (split tender); keep verified versus staff-recorded settlement distinct.
- Customer may be selected/created; quick anonymous counter sale allowed where legally permissible.
- Receipt, VAT, payment and stock movements must be traceable. Receipt is not automatically a legally compliant invoice.
- Detailed POS rules also in docs/PHIXAR-POS-VISION.md.

### Additional POS & payments decisions — owner-confirmed 2026-11-07
1. Staff may grant limited discounts; larger discounts require manager approval. Define amount/percentage limits later.
2. Staff may manually adjust sale price with recorded reason; large deviations require manager approval. Define threshold later.
3. Deposits/prepayments attach to repair dossier and are automatically offset against amount due at pickup. Prevent double collection.
4. Releasing goods/device with outstanding balance requires explicit manager approval and a recorded receivable.
5. Refunds use a return/credit note linked to original transaction, with reason and authorization; do not delete historical sales.
6. Issue business invoices and invoices on private customer's request; otherwise provide legally permitted receipt. Belgian invoicing/e-invoicing/tax rules require validation.
7. Customer may choose printed receipt, email receipt or both.
8. **Owner-selected POS UX:** selecting Bancontact, SumUp or bank transfer immediately marks the payment as received in the cashier workflow. **CONTROL RISK / NEEDS VALIDATION:** this is an operator-recorded assertion, NOT proof that a payment provider settled or a transfer arrived. Preserve payment method, operator, timestamp, evidence/reference when available, and a distinct provider/bank reconciliation status; do not automatically represent bank funds as verified. For bank transfer especially, consider a pending/unverified exception requiring owner confirmation.
9. Daily close includes cash count, payment-method breakdown and variance reporting.
10. Cash drawer ledger tracks opening float, cash receipts, cash expenses/payouts and closing balance.
11. Incorrectly finalized sales require an auditable correction/void with reason; never silently delete.
12. Reports include turnover, gross margin, payment methods, repairs, refurbished devices and staff performance; enforce role-based visibility.

### POS implementation safeguards / pending configuration
- Define discount and price-override thresholds, manager roles and approval audit.
- Decide reconciliation treatment for immediate-received card/terminal/transfer payments; avoid treating unverified transfers as cleared funds.
- Specify cash close reopening, corrections, payment refunds and shift boundaries.
- Validate Belgian VAT, secondhand margin regime, consumer receipt/invoice rules, and applicable B2B structured e-invoicing.
- Preserve original sales, deposits, partial payments and refunds as linked immutable/auditable records.

## D. Refurbished — owner-confirmed decisions (14)
1. Sources: suppliers **and** devices taken over from customers.
2. Device types: smartphones, laptops, tablets, other; adaptive specs (brand/model, RAM, storage, processor, IMEI/serial where relevant, notes, buy/sell prices).
3. Condition labels: **Nieuwstaat / Goed / Gebruikt / Beschadigd** (no mandatory A/B/C grading).
4. Photos possible but optional.
5. Technical test checklist available but not mandatory for listing/sale.
6. Profit view: acquisition price + parts used + external costs compared with sale price; **do not include employee labor hours**. Tax treatment must be accounted for before calling it net profit.
7. Statuses: **In controle / In herstelling / Te koop / Gereserveerd / Verkocht / Afgekeurd / Onderdelen-donor**.
8. Sales: quick sale without customer, or choose existing/new customer, subject to legal requirements.
9. Inventory UI: switchable searchable/filterable table and photo cards; easy at-a-glance available stock.
10. Warranty configurable per device subject to mandatory legal minimum and consumer rights.
11. Customer trade-in: record necessary identity and purchase evidence/takeover form, with privacy/data-minimization safeguards.
12. Reservations: tied to a customer and expiry; automatic release if expired and no sale/other valid hold.
13. Return/warranty: dedicated case linked to original sale; do not erase transaction or automatically return item to saleable stock.
14. Identification: PHIXAR QR label or existing IMEI/serial, as appropriate.

### Refurbished implementation safeguards
- Prevent duplicate active sale of one IMEI/serial and duplicate checkout/stock movements.
- Reservation != sale. Track state transitions and history.
- Keep legally required consumer warranty rules separate from configurable commercial terms.
- Validate Belgian VAT/margin-scheme eligibility per transaction; not every second-hand purchase qualifies.

## E. Parts inventory — owner-confirmed decisions (2026-11-07)
1. New parts can be entered **manually or by barcode/QR scan**.
2. A single part record can list **multiple compatible device models**.
3. Keep supplier and purchase price as the **required purchase information**; other fields should not be mandatory by default.
4. Record a physical location for each part, such as cabinet, drawer or shelf.
5. **Automatically reserve parts when a repair quotation is approved**, allowing authorized manual corrections. Reserved stock remains on hand but is not available for other jobs.
6. Support **configurable minimum stock per part** and low-stock alerts.
7. Manage supplier purchase orders and **partial deliveries**.
8. Physical stock counts support scanning and manual adjustments **with a recorded reason**.
9. Damaged/defective parts are separately tracked as defective, supplier return or waste; never silently count as saleable stock.
10. Staff can use inventory, while **sensitive stock changes and purchase-price changes require manager approval**. Exact approval thresholds/permissions remain open.

### Existing cross-module inventory contracts
- For paid repairs, parts are reserved at approved quote and definitively deducted at successful checkout, closing reservations without double counting.
- For free warranty work and fully prepaid repairs, there must be an authorized zero-due completion path that still records real consumption, without fabricating payment.
- Cancelled/changed quotes release or adjust reservations. Never let reservations produce negative availability.
- Refurbished devices and repair parts are distinct inventory entities, though their costs and usage may be linked.

### Confirmed inventory edge-case decisions (2026-11-07)
11. **Part unavailable when quote approved:** reserve the available parts; automatically add missing parts to a procurement/to-order list. The repair must clearly show outstanding parts and must not falsely appear fully ready.
12. **Part already installed, customer has not paid/collected:** record installation immediately; keep physical on-hand and available-to-promise quantities accurate. The owner wants financial finalization at checkout, but installation, consumption, payment and accounting entries must be modeled separately to avoid fictitious stock or inaccurate accounting. Exact accounting recognition rules require validation.
13. **New part defective during installation:** mark it defective, remove it from saleable availability, preserve traceability and reserve a replacement part.
14. **Physical count discrepancy:** show the discrepancy, require a reason, and obtain manager approval before applying the stock correction.

### Still open (not approved)
- Exact mechanics for financial stock recognition, installed-but-unpaid repairs, cancellation after installation, and uncollected devices; accounting/legal review required.
- Purchase order receipt/return reconciliation, including partial deliveries and wrong parts.
- Transfers between stock locations or branches, if needed.
- Permission thresholds and escalation for stock adjustments.
These are questions, not approved implementation requirements.

## F. End-to-end shop scenarios — owner-confirmed 2026-11-08
1. **Abandoned iPad registration:** owner requests definitive deletion after 10 minutes if the customer leaves without being received. Scope this timer to **unclaimed, incomplete/unaccepted temporary intake submissions**, never an active form in use, an intake already claimed by staff, an accepted repair dossier, a legal transaction record, or other records subject to retention duties. Exact inactivity/start event and safe deletion criteria remain to confirm; no irreversible purge of confirmed records.
2. **Deposit plus approved extra work:** initial €180 repair, €50 deposit, approved €40 supplementary quote -> total €220, remaining due **€170**. Preserve the original quote, supplementary approval and deposit ledger; avoid double counting.
3. **Part reserved for customer A:** do not allocate it to customer B automatically. Staff may reassign only with recorded reason and traceable reservation release/reallocation; permission rules remain configurable.
4. **Repair pickup with accessories:** combine repaired device, case and screen protector in one POS basket, one checkout and one receipt, linked to the repair dossier. Preserve line-item tax, stock and warranty distinctions.
5. **Warranty claim after three months:** retrieve original sale/repair, create a linked warranty intake and perform diagnosis before reasoned coverage decision.
6. **Declined Bancontact terminal payment:** payment stays **unconfirmed/unpaid**, staff can retry or select another method. This overrides the earlier default 'mark received on selection' whenever terminal failure is known. Selection alone must never override an explicit decline.

### Cross-module consistency findings (reviewed 2026-11-08)
- **RESOLVED by precedence:** POS payment-method selection may initially register a cashier-reported receipt, but a known terminal decline must override it. Keep independent settlement/reconciliation status. Pending bank transfers still require a business rule before being considered verified.
- **OPEN — iPad deletion:** distinguish in-progress forms, submitted-but-unclaimed registrations, staff-claimed intakes and legally retained dossiers; 10-minute trigger and irreversible deletion need explicit confirmation. Prevent erasing legitimate customers or audit evidence.
- **CONFIRMED — arithmetic and links:** approved supplementary quote updates amount due, existing deposit offsets once; checkout can contain accessories while preserving repair identity.
- **CONFIRMED — reservations:** reservation for A excludes availability for B; release/reassignment requires recorded reason and consistent inventory ledger.
- **OPEN — physical vs financial stock:** installation immediately removes saleable availability, while the owner wants financial finalization at checkout. Accounting treatment for installed-but-unpaid, never-collected, warranty and failed repair cases needs validation.
- **OPEN — warranty clock:** begins at actual pickup as intended, not repair completion; legal minimum periods, scope and exceptions require validation.
- **LEGAL REVIEW — iPad marketing:** owner-selected single mandatory checkbox including marketing cannot be implemented as bundled consent; keep optional marketing opt-in separate from intake acknowledgement.
- **OPEN — payment finality:** define bank transfer proof, terminal/provider reconciliation and how unpaid/part-paid devices are released with manager authorization.
- **OPEN — receipt/fiscal rules:** combined checkout must retain correct VAT, invoices/credit notes, refurbished margin-scheme distinctions and Belgian B2B e-invoicing where applicable.

### Next owner decisions needed
1. What starts the 10-minute abandoned iPad-registration countdown, and should activity reset it? Delete only never-claimed submissions, not active forms or accepted dossiers.
2. Who may reassign a reserved part: any employee with reason or manager approval?
3. What happens to a part already installed if a customer cancels or never collects their device?
4. When should bank transfers count as paid: on cashier selection, proof shown, or bank receipt? Distinguish receipt and verification.
5. Define employee discount and price-override thresholds, diagnostic fee, and uncollected-device reminder cadence.

### Additional owner decisions — 2026-11-08 (exception resolution)
1. **iPad timer:** 10 minutes begins immediately upon opening the registration form. Owner preference is to delete abandoned temporary registration after this window. **Safety requirement / clarification:** do not delete an active customer's unsaved input without warning or recovery; never purge a staff-claimed intake or legally retained record. Need explicit UX decision on active form expiry and submission at minute 10.
2. **Reservation reassignment:** employee may reassign a part with a mandatory reason; original reservation and all changes remain in audit history. No manager approval required for this reassignment by default (other sensitive inventory corrections still require manager approval).
3. **Cancellation after installation:** owner requests automatic return of installed part to inventory. **PHYSICAL-INVENTORY CONFLICT / DO NOT IMPLEMENT LITERAL AUTOMATIC RESTOCK:** cancellation does not physically remove a mounted part, and a removed part may be damaged/non-resaleable. Record a return-to-stock workflow requiring physical removal, inspection and disposition; only confirmed reusable stock can become available. Ask owner to confirm whether this safeguard matches intent. Never increment saleable stock solely on cancellation.
4. **Bank transfer at pickup:** release device only after bank receipt is confirmed, except explicit manager-approved release with outstanding balance and audit. Cashier payment-method selection is not evidence of receipt.
5. **Staff-claimed iPad intake:** never auto-delete it; retain accepted dossier according to applicable retention policy.

### Reconciliation of owner decisions
- Previous 'staff can reassign reserved part with recorded reason' is now confirmed as no manager approval needed for this specific action.
- Previous 'mark bank transfer received upon method selection' applies only to POS operator input; actual device release requires confirmed bank receipt or manager exception. UI must distinguish recorded vs verified.
- Previous 10-minute unclaimed-registration deletion now uses **form opening** as timer start; precise active-form handling remains open.
- Previous installed-part physical stock accuracy conflicts with unconditional restocking on cancellation; restock must await physical return and inspection. Owner confirmation pending.

## F. Open decisions and legal validation
- Diagnostic fee and exceptions; exact status workflow and notification channel.
- Belgian invoicing and VAT including second-hand margin regime; consumer warranty/second-hand legal minimum; GDPR identity retention; permissions.
- Exact handling of unpaid pickup, fully prepaid repairs, free warranty repairs, returns and cancellations at the inventory ledger.
- Provider integrations and settlement verification, multi-branch operations, offline behavior and audit roles.
- The unresolved edge cases listed in section E.

## Change control
When user approves a module, append the exact decisions here. Keep a changelog and distinguish **CONFIRMED**, **PROPOSED**, **OPEN**, **LEGAL REVIEW**. Never silently rewrite previous owner-confirmed rules. No production code changes are authorized by this document alone.

## Changelog
- 2026-11-08: Added five owner decisions on intake timer, reservation reassignment, cancellation restock, transfer verification and claimed-intake retention; flagged physical stock and active-form safety conflicts.
- 2026-11-08: Added six owner-confirmed end-to-end scenarios and cross-module consistency findings, explicitly separating confirmed behavior from open/legal-review issues.
- 2026-11-07: Added 12 owner-confirmed POS/payment decisions and explicit reconciliation safeguards for immediately marked-as-received payments.
- 2026-11-07: Added 12 owner-confirmed repair/warranty exception rules, including conditional diagnosis fee, quote approvals, single-button final test and repeat-warranty traceability.
- 2026-11-07: Added 12 owner-confirmed iPad/intake choices; flagged bundled marketing checkbox as legally unsafe and pending compliant redesign.
- 2026-11-07: Consolidated owner-confirmed intake, repair, POS and refurbished decisions; parts inventory queued for questionnaire.
- 2026-11-07: Recorded ten owner-approved parts-inventory decisions; flagged critical edge cases for follow-up.
- 2026-11-07: Added four owner-confirmed inventory exception rules (shortages, installed-but-unpaid, defective parts, stock count differences).
