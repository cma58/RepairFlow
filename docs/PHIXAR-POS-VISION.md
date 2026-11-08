# PHIXAR RepairFlow — POS Vision & Protected Business Rules

Status: **Approved functional vision** (2026-11-07).
Owner confirmation: combined cart **YES**; split payments **YES**; checkout directly from repair dossier **YES**.
Scope: intended product behavior, **not** proof that each feature is implemented or production-ready.

## 1. Product vision
PHIXAR POS is an integrated part of RepairFlow, not an isolated cash register. It must share consistent customers, repairs, retail stock, refurbished devices, payments and audit records. A cashier should not have to enter the same information twice. Preserve traceability and data integrity.

## 2. Confirmed checkout workflows
- **Combined cart (approved):** a single checkout can contain retail devices, accessories, refurbished devices, and billable repair services. Every line retains its source/type, price, VAT treatment and relevant identifiers.
- **Repair-linked checkout (approved):** initiate payment from an existing repair dossier; link the resulting sale/payment back to that dossier. Support advance payments and remaining balances without recording the same payment twice.
- **Split tender (approved):** one sale may be settled using multiple payment methods (e.g., part cash, part Bancontact). The sum of allocations must reconcile to the amount due, with any outstanding balance explicitly represented. Never silently treat partial payment as fully paid.
- Support selecting an existing customer; whether anonymous counter sales are permitted depends on applicable business/legal requirements and is not a license to bypass legally required customer identification.

## 3. Stock, IMEI and repair integrity
- Deduct retail inventory only through a traceable, validated sale/stock movement, with protection against duplicate submission and negative stock.
- Track refurbished devices by unique IMEI/serial where applicable; a device must not be simultaneously available for multiple active sales.
- Record parts consumed by repairs against the correct repair and inventory movement.
- Reject corrupt or ambiguous records instead of silently overwriting them. Missing/empty initial inventory is different from malformed inventory.
- Define and test return, cancellation and reversal paths before implementing them.

## 4. Payments and financial records
- Current payment-method concepts: cash, Bancontact, SumUp, received bank transfer.
- **Recorded by employee is not equivalent to provider-confirmed settlement.** Keep source, verification state, time and responsible actor auditable.
- Support deposits, split payments, balances and future refunds/reversals without double counting.
- Generate traceable receipts with items, amounts, VAT treatment and tender breakdown. A receipt is not automatically a compliant invoice.
- Belgian VAT, invoices, credit notes, GDPR and applicable e-invoicing/Peppol requirements require implementation-specific and professional validation; this document does not certify legal compliance.
- Monetary calculations must use safe integer minor units or another precisely defined decimal strategy, not floating-point assumptions.

## 5. Protected product decisions — Claude / coding agents
The following **must not be redesigned away** during a code audit:
1. POS is integrated with repairs, customers, retail and refurbished stock.
2. One cart can combine repair services and products.
3. A sale can use multiple payment methods.
4. A repair can be paid directly from its dossier, including advances and remaining balances.
5. IMEI, stock and financial events remain traceable and protected against duplication.
6. Payment status distinguishes manually recorded amounts from verified settlement.

Agents **may** fix defects, improve security, restructure internals, add tests and propose safer technical architecture, but must preserve these functional contracts. Do not replace them with a generic one-payment, retail-only POS. Any intentional business-rule change requires explicit owner approval. Never merge to main, deploy production, or destructively modify live data without explicit approval.

## 6. Not yet decided — do not invent requirements
- Exact VAT rules by sale type, country, customer and invoice context.
- Refund/return policy, credit-note approval and manager override thresholds.
- Exact permission matrix and branch/multi-store rollout behavior.
- Provider integrations, settlement reconciliation and cash drawer hardware.
- Offline mode, reservation timeouts and specific receipt/invoice layout.
- Whether every POS sale requires a customer record.

For each undecided area, document options and ask the owner before introducing irreversible business behavior.

## 7. Agent acceptance scenarios
A. Create one cart with an accessory, a refurbished IMEI device and a repair charge; settle using cash + Bancontact; verify allocations, receipts, stock and links.
B. Open a repair dossier, take an advance, later collect the balance; verify totals, no duplicate revenue and accurate repair status.
C. Attempt to sell the same refurbished IMEI twice; second attempt must be rejected safely.
D. Retry checkout after network interruption; verify idempotency and no duplicate sale/stock deduction.
E. Enter invalid stock, payment amounts, malformed persisted data or unauthorized customer references; fail safely and preserve auditability.
F. Refund or reverse a payment only according to a separately approved business policy; do not invent it.

## 8. Implementation reality check
The repository includes browser/localStorage POS components and separate server/database-oriented POS code. Their existence does not establish that they are wired together. The agent must map actual behavior, identify missing integrations, and report **IMPLEMENTED / TESTED / VERIFIED / BLOCKED / NOT IMPLEMENTED** for each requirement.

## 9. Mandatory instruction for code-audit agents
**Read this document before editing POS, repair payment, inventory, refurbished, customer or payment modules.** Treat sections 1–5 as approved business intent. Audit actual code against it, create regression tests, and distinguish missing features from bugs. Explain discrepancies and propose changes in Dutch.
