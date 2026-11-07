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

## C. POS — confirmed
- Single cart may combine retail items, refurbished devices and repair services.
- Checkout can originate directly from repair dossier; support deposits, outstanding balances and no double collection.
- One sale may have multiple payment methods (split tender); keep verified versus staff-recorded settlement distinct.
- Customer may be selected/created; quick anonymous counter sale allowed where legally permissible.
- Receipt, VAT, payment and stock movements must be traceable. Receipt is not automatically a legally compliant invoice.
- Detailed POS rules also in docs/PHIXAR-POS-VISION.md.

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

### Open edge cases (NOT YET APPROVED)
- What happens if a quoted part is out of stock: block approval, backorder, or partial reservation?
- At what point should physical usage be logged if a part is installed but repair/payment is cancelled or device remains uncollected?
- How to handle wrong parts, failed installations, supplier returns and partial deliveries; exact reversal/approval steps.
- Whether a part may be transferred across locations/branches and how reserved stock is treated.
- How to identify and resolve stock-count discrepancies and concurrent reservations.
These are questions, not approved implementation requirements.

## F. Open decisions and legal validation
- Diagnostic fee and exceptions; exact status workflow and notification channel.
- Belgian invoicing and VAT including second-hand margin regime; consumer warranty/second-hand legal minimum; GDPR identity retention; permissions.
- Exact handling of unpaid pickup, fully prepaid repairs, free warranty repairs, returns and cancellations at the inventory ledger.
- Provider integrations and settlement verification, multi-branch operations, offline behavior and audit roles.
- The unresolved edge cases listed in section E.

## Change control
When user approves a module, append the exact decisions here. Keep a changelog and distinguish **CONFIRMED**, **PROPOSED**, **OPEN**, **LEGAL REVIEW**. Never silently rewrite previous owner-confirmed rules. No production code changes are authorized by this document alone.

## Changelog
- 2026-11-07: Consolidated owner-confirmed intake, repair, POS and refurbished decisions; parts inventory queued for questionnaire.
- 2026-11-07: Recorded ten owner-approved parts-inventory decisions; flagged critical edge cases for follow-up.
