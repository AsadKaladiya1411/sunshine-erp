# Proposed Source Resolution

Status: proposal only. This document does not amend any authoritative source, schema, migration, or application code.

Authority used for business, domain, entity, and database questions:

`Final Architecture → Phase-3 Domain Modeling → Phase-4 Entity Modeling → Database Design`

Authority used for technology questions: `Final Technologies`, subject to the explicit project decision that AWS/cloud is excluded from the current implementation.

## A — Naming variations

### A-01 — Unit-of-measure table name

**Source statements involved**

- Database Design, entity catalogue: `UOM → uoms`.
- Database Design, detailed foreign-key declarations: `FK → uoms.id`.
- Database Design, Table 174: `units_of_measurement`.
- Phase-4 Entity Modeling: `Unit of Measurement (UOM)`.

**Authoritative source:** Phase-4 Entity Modeling is authoritative for the entity concept and name. Database Design Table 174 is the most detailed applicable source for the physical table name.

**Proposed resolution — SAFE TO APPLY:** Keep the conceptual name **Unit of Measurement (UOM)** and use `units_of_measurement` as the one canonical physical table name. Treat `uoms` as a naming variation in the Database Design catalogue and foreign-key text; reconcile those references to `units_of_measurement` when the authoritative sources are next revised.

### A-02 — Notification configuration/settings name

**Source statements involved**

- Database Design, common entity catalogue: `Notification Configuration → notification_configurations`.
- Database Design, Table 176: `notification_settings`.
- Final Architecture: `Notification Settings`.
- Phase-3 Domain Modeling: `Notification Settings`.

**Authoritative source:** Final Architecture, followed by Phase-3 Domain Modeling.

**Proposed resolution — SAFE TO APPLY:** Use **Notification Settings** as the canonical entity name and `notification_settings` as its physical table name. Treat `Notification Configuration → notification_configurations` as a catalogue naming variation, not a second entity.

### A-03 — R&D table-name variants

**Source statements involved**

- Database Design, R&D catalogue: `trials`, `samples`, `sample_tests`, `trial_approvals`, `rd_documents`.
- Database Design, detailed definitions: `research_trials`, `research_samples`, `r_and_d_sample_tests`, `research_approvals`, `research_documents`.

**Authoritative source:** The R&D concepts and hierarchy are governed first by Final Architecture and Phase-3 Domain Modeling; neither settles these physical-name pairs. Database Design is the applicable source for physical names, but it contains both variants.

**Proposed resolution — REQUIRES BUSINESS DECISION:** Do not select or rename any of these variants until the project owner resolves D-04 and D-05, because the correct canonical names depend on the approved R&D hierarchy and its boundary with Production. After that decision, designate exactly one physical name for each approved entity and retire only confirmed aliases.

### A-04 — Production packing versus sales packing

**Source statements involved**

- Database Design, Sales catalogue: `packings`.
- Database Design, Production catalogue: `packings`.
- Database Design, detailed Production table: `packings`.
- Database Design, detailed Sales table: `sales_packings`.

**Authoritative source:** Final Architecture and Phase-3 Domain Modeling establish Packing in both Production and Sales. Database Design supplies the distinct detailed physical names.

**Proposed resolution — SAFE TO APPLY:** Preserve the two domain concepts. Use `packings` for Production Packing and `sales_packings` for Sales Packing. Correct only the Sales catalogue alias from `packings` to `sales_packings`.

### A-05 — Inventory domain number

**Source statements involved**

- Database Design heading: `Domain 5-inventory`.
- Final Architecture: `Warehouse Domain 5` and `Inventory Domain 6`.
- Phase-3 Domain Modeling: `Warehouse Domain 5` and `Inventory Domain 6`.

**Authoritative source:** Final Architecture.

**Proposed resolution — SAFE TO APPLY:** Label Inventory as **Domain 6**. Treat `Domain 5-inventory` as a heading-number error; Warehouse remains Domain 5.

### A-06 — Job Work finished-goods receipt name

**Source statements involved**

- Phase-4 Entity Modeling: `Job Work Finished Goods Receipt`.
- Database Design physical table: `job_work_fg_receipts`.
- Final Architecture uses both `Job Work FG Receipt` and `Job Work Finished Goods Receipt`.

**Authoritative source:** Final Architecture, clarified by Phase-4 Entity Modeling.

**Proposed resolution — SAFE TO APPLY:** Use **Job Work Finished Goods Receipt** as the canonical business/entity label. Retain `job_work_fg_receipts` as the physical table name and treat **Job Work FG Receipt** as an abbreviation only.

## B — Duplicate definitions

### B-01 — Duplicate `activity_logs` definitions

**Source statements involved**

- Database Design, Table 10 `activity_logs`: `module`, `description`, `user_agent`, `device_info`, `performed_at`.
- Database Design, Table 179 `activity_logs`: `module_name`, `reference_number`, `device_information`, `timestamp`, `remarks`.
- Phase-4 Entity Modeling, Activity Log attributes: `Module Name`, `Reference Number`, `Device Information`, `Timestamp`, `Remarks`.

**Authoritative source:** Phase-4 Entity Modeling.

**Proposed resolution — SAFE TO APPLY:** Maintain one Activity Log definition aligned to the Phase-4 attributes. Treat Database Design Table 179 as the detailed definition that corresponds to Phase-4 and mark Table 10 as superseded duplicate source text. Do not combine extra fields from both definitions unless separately approved.

### B-02 — Duplicate cross-domain physical entities

**Source statements involved**

- Database Design, Warehouse catalogue: `material_issues`, `stock_adjustments`, `dispatches`, `shipments`, `job_work_material_dispatches`, `job_work_fg_receipts`.
- Database Design repeats the same physical names in the Inventory, Production, Sales, and Job Work catalogues, while providing one detailed table definition for each name.
- Final Architecture domain boundaries include: `Warehouse owns physical warehouse operations`, `Inventory owns authoritative stock state`, `Production owns manufacturing execution`, `Job Work owns third-party manufacturing processes`, and `Sales` owns its sales processes.

**Authoritative source:** Final Architecture for domain ownership; Phase-3 Domain Modeling for domain placement.

**Proposed resolution — REQUIRES BUSINESS DECISION:** Keep one physical entity for each approved business record, but do not assign ownership based only on a repeated catalogue entry. The project owner must approve the owning domain and the cross-domain service/event interface for each of the six records before the catalogues can be reconciled.

### B-03 — Duplicate Packing catalogue definition

**Source statements involved**

- Final Architecture lists `Packing` under Production and under Sales.
- Phase-3 Domain Modeling lists `Packing` under Production and under Sales.
- Database Design maps both catalogue entries to `packings`.
- Database Design detailed definitions contain `packings` and `sales_packings`.

**Authoritative source:** Final Architecture and Phase-3 Domain Modeling establish two domain-specific concepts; Database Design supplies their detailed physical names.

**Proposed resolution — SAFE TO APPLY:** Retain both domain entities, with `packings` owned by Production and `sales_packings` owned by Sales. Remove only the duplicate Sales-to-`packings` catalogue mapping when source documents are revised.

## C — Missing detailed definitions

### C-01 — Raw-material and packaging masters

**Source statements involved**

- Final Architecture, Masters: `Raw Material`, `Packaging Material`, `Packaging Type`.
- Database Design contains 34 references to `raw_materials`, 34 references to `packaging_materials_master`, and one reference to `packaging_types`.
- Database Design contains no detailed definitions for `raw_materials`, `packaging_materials_master`, or `packaging_types`.
- Database Design uses `packaging_materials` for a recipe line, not for the Packaging Material master.

**Authoritative source:** Final Architecture establishes the masters; the lower sources do not provide an approved detailed definition.

**Proposed resolution — REQUIRES BUSINESS DECISION:** Preserve the three master concepts and do not substitute the recipe-line `packaging_materials` entity for the Packaging Material master. The project owner must approve each master's attributes, identifier, ownership, lifecycle, and relationships before a detailed definition is added.

### C-02 — Missing common-master definitions

**Source statements involved**

- Final Architecture, Common Masters: `Country`, `State`, `City`, `Currency`, `HSN Code`, `Courier`, `Payment Method`, `Tax`, `GST Configuration`.
- Database Design catalogue includes the same common-master concepts.
- Database Design contains no detailed definitions for `countries`, `states`, `cities`, `currencies`, `hsn_codes`, `couriers`, `payment_methods`, `taxes`, or `gst_configurations`.

**Authoritative source:** Final Architecture.

**Proposed resolution — REQUIRES BUSINESS DECISION:** Keep these as approved master concepts, but do not infer their fields, geographic hierarchy, tax behavior, uniqueness scopes, or lifecycle. The project owner must approve those missing business definitions before detailed entities are written.

### C-03 — Missing User Audit definition

**Source statements involved**

- Final Architecture: `User Audit (Added)`.
- Phase-4 Entity Modeling: `Entity – User Audit (Added)` with `User`, `Target User`, `Old Value`, `New Value`, `Changed By`, and `Changed At`.
- Database Design contains no `user_audits` detailed table definition.

**Authoritative source:** Final Architecture establishes the entity; Phase-4 Entity Modeling supplies its attributes.

**Proposed resolution — SAFE TO APPLY:** Add a future source-level detailed User Audit definition limited to the Phase-4 attributes and place it under the centralized Audit domain. Do not add unapproved fields or a second audit subsystem.

### C-04 — Missing Cost Sheet definition

**Source statements involved**

- Final Architecture: `Cost Sheet`.
- Phase-3 Domain Modeling: `Cost Sheet`.
- Phase-4 Entity Modeling: `Cost Sheet`.
- Database Design catalogue: `Cost Sheet → cost_sheets`.
- Database Design contains no detailed `cost_sheets` definition.

**Authoritative source:** Final Architecture, followed by Phase-3 and Phase-4.

**Proposed resolution — SAFE TO APPLY:** Preserve Cost Sheet as a distinct approved entity and add a future detailed source definition using only its already approved Phase-4 attributes and relationships. Do not merge it into an unapproved costing structure.

### C-05 — Missing R&D Sample Issue, Sample Return, and Formula Comparison definitions

**Source statements involved**

- Phase-3 Domain Modeling lists `Sample Issue`, `Sample Return`, and `Formula Comparison`.
- Phase-4 Entity Modeling defines `Sample Issue`, `Sample Return`, and `Formula Comparison` at entity level.
- Database Design catalogue lists `sample_issues`, `sample_returns`, and `formula_comparisons`.
- Database Design contains no detailed definitions for those three tables.

**Authoritative source:** Phase-3 Domain Modeling, with Phase-4 Entity Modeling authoritative for available entity details.

**Proposed resolution — REQUIRES BUSINESS DECISION:** Formula Comparison may be detailed later strictly from the Phase-4 definition. Do not invent the missing operational attributes, state transitions, validations, or inventory effects for Sample Issue and Sample Return. Because the catalogue item groups all three missing definitions, it remains blocked until the project owner approves the Sample Issue/Return business behavior.

### C-06 — Missing Batch Dispensing definition

**Source statements involved**

- Final Architecture: `Batch Dispensing (Added)`.
- Phase-4 Entity Modeling identifies `Order`, `Batch`, `Material`, `Planned Quantity`, `Dispensed Quantity`, `UOM`, `Dispensed By`, and `Dispensed At`.
- Database Design contains no detailed `batch_dispensings` definition.

**Authoritative source:** Final Architecture establishes the concept; Phase-4 supplies known attributes.

**Proposed resolution — REQUIRES BUSINESS DECISION:** Do not infer whether `Order` and `Batch` refer to Production, Job Work, or another approved type, or what dispensing does to inventory. The project owner must approve the owning domain, exact relationships, workflow, and stock effect before a detailed definition is added.

### C-07 — Missing Inventory entity definitions

**Source statements involved**

- Phase-3 Domain Modeling lists `Expiry` and `Cycle Count`.
- Phase-3 Domain Modeling v1.2 lists `Material Status Management` and `Quarantine Stock`.
- Phase-4 Entity Modeling lists `Quarantine Stock`.
- Database Design contains no detailed `expiries`, `cycle_counts`, `material_statuses`, or `quarantine_stock` definitions; related values are embedded in other records.

**Authoritative source:** Phase-3 Domain Modeling, followed by Phase-4 where applicable.

**Proposed resolution — REQUIRES BUSINESS DECISION:** The project owner must decide which concepts are independent entities and which are controlled states or views of other entities, and must approve their lifecycle and inventory effects. Embedded fields must not be treated as a silent replacement for an approved entity.

### C-08 — Missing Workflow Engine persistence model

**Source statements involved**

- Final Architecture: `Workflow Configuration`.
- Phase-3 Domain Modeling: `Workflow Configuration`.
- Final Technologies: `Workflow Engine`.
- Database Design contains no detailed workflow-definition, state, transition, or execution tables.

**Authoritative source:** Final Architecture for the business capability; Final Technologies for the technology capability.

**Proposed resolution — REQUIRES BUSINESS DECISION:** Do not invent workflow states, transitions, configuration scope, versioning, or ownership. The project owner must approve the workflow configuration model and its relationship to domain state machines and the separate Approval Engine.

### C-09 — Missing notification delivery/history model

**Source statements involved**

- Final Architecture defines a `Notifications` domain.
- Final Technologies lists `Email`, `SMS`, `WhatsApp`, `Push Notification`, and `In-App Notification`.
- Database Design defines only `notification_settings`, with email, SMS, and in-app settings; it contains no notification delivery or history definition and no WhatsApp or push configuration.

**Authoritative source:** Final Architecture for the domain; Final Technologies for approved channels.

**Proposed resolution — REQUIRES BUSINESS DECISION:** Preserve the five approved channels, but do not invent recipients, templates, delivery attempts, retry semantics, status history, retention, or channel configuration. Those business and operational rules require project-owner approval before detailed definitions are written.

### C-10 — Missing Transactional Outbox definition

**Source statements involved**

- Final Technologies: `Transactional Outbox`.
- Database Design contains no outbox table definition.

**Authoritative source:** Final Technologies.

**Proposed resolution — SAFE TO APPLY:** Add a future technical source definition for a transactional outbox consistent with the approved event architecture. It must remain technical infrastructure and must not introduce or redefine business events, business payloads, workflows, or retention rules without their own approval.

### C-11 — Missing password-reset and account-lock persistence

**Source statements involved**

- Final Technologies lists `Password Reset` and `Account Lock`.
- Database Design defines users and sessions but no password-reset token/request definition and no failed-attempt, lock-reason, or lock-expiry persistence definition.

**Authoritative source:** Final Technologies establishes the capabilities; no higher business source supplies the operational rules.

**Proposed resolution — REQUIRES BUSINESS DECISION:** Do not invent reset-token lifetime, attempt thresholds, lock duration, administrative unlock rules, notification behavior, or audit requirements. The project owner must approve the security policy before the persistence model is detailed.

### C-12 — Missing Document Version-to-Attachment link

**Source statements involved**

- Database Design relationship rule: `document_versions → document_attachments`.
- Database Design rule: `A Document Version may have one or more physical Attachments.`
- Database Design `document_attachments` definition contains no `document_version_id`.
- Phase-3 Domain Modeling states `Document → Attachments → Versions`.
- Phase-4 Entity Modeling shows direct `Document → Attachments` and `Document → Document Versions` relationships.

**Authoritative source:** Phase-3 Domain Modeling has priority over Phase-4 and Database Design, but its wording conflicts with the lower relationship diagrams and does not settle the intended foreign-key direction with enough precision.

**Proposed resolution — REQUIRES BUSINESS DECISION:** The project owner must choose the approved attachment/version cardinality and ownership model. Do not add `document_version_id`, reverse the relationship, or remove a relationship until that decision is recorded.

### C-13 — Missing central-document link for R&D documents

**Source statements involved**

- Database Design, `research_documents`: actual files are stored in the central Document Management system.
- Database Design describes a conceptual relationship from Research Document to the central document structure.
- Database Design `research_documents` contains no foreign key to `documents`, `document_attachments`, or `document_versions`.
- Final Architecture establishes centralized Document Management.

**Authoritative source:** Final Architecture.

**Proposed resolution — SAFE TO APPLY:** Treat an R&D document as domain metadata that must reference the central Document Management entity. Do not store a second independent physical file or version chain in R&D. The precise link must follow the final decision in C-12/D-19.

### C-14 — Missing Quality Standard, Quality Status, and Batch Type definitions

**Source statements involved**

- Final Architecture lists `Quality Standard`, `Quality Status`, and `Batch Type` as masters.
- Database Design contains no detailed definitions for these masters.

**Authoritative source:** Final Architecture.

**Proposed resolution — REQUIRES BUSINESS DECISION:** Preserve the three approved master concepts, but do not invent their attributes, codes, permitted values, ownership, lifecycle, or usage rules. The project owner must approve those definitions first.

## D — Genuine conflicts

### D-01 — AWS/cloud technologies versus explicit project exclusion

**Source statements involved**

- Final Technologies lists `AWS SQS`, `Amazon S3`, `KMS`, `Secrets Manager`, `AWS`, `Route 53`, `CloudFront`, `WAF`, `EKS`, `RDS`, `ElastiCache`, `MSK`, `ECR`, `IAM`, `VPC`, `CloudWatch`, and `Multi-AZ`.
- Explicit project decision: `AWS/cloud is intentionally excluded from the current implementation.`
- Final Architecture requires the application to remain cloud-ready while current development is local/self-hosted.

**Authoritative source:** The explicit project decision overrides the AWS/cloud entries in Final Technologies for the current implementation.

**Proposed resolution — SAFE TO APPLY:** Mark all AWS/cloud services as deferred and out of scope for the current implementation. Use only approved portable/local equivalents where already specified—PostgreSQL, Redis, Kafka, MinIO, Docker, Docker Compose, Kubernetes readiness, Helm, and Terraform—without introducing a cloud-provider dependency into core logic.

### D-02 — Hard-coded approval sequence and threshold

**Source statements involved**

- Final Technologies: `Purchase → Manager → Director → Accounts → Completed`.
- Final Technologies: `IF Amount > ₹5,00,000 → Director Approval Required`.
- Final Architecture states approval may be `one-level`, `two-level`, or `no approval`, and that approval steps must be configurable where requirements allow.
- Phase-3 Domain Modeling states approval levels are configurable.

**Authoritative source:** Final Architecture, followed by Phase-3 Domain Modeling. The Final Technologies examples cannot establish business rules.

**Proposed resolution — SAFE TO APPLY:** Treat the sequence and ₹5,00,000 threshold as non-authoritative examples only. Preserve configurable approval levels and do not encode either example as a current business rule unless separately approved by the project owner.

### D-03 — Approval lifecycle/status vocabulary

**Source statements involved**

- Final Architecture: `Creator → Submitted → Level 1 → Level 2 → Approved → Released`.
- Final Technologies: `Draft → Submitted → Approved → Rejected → Cancelled`.
- Database Design, `approval_requests.status`: `Pending / Approved / Rejected / Returned / Cancelled`.
- Database Design narrative refers to final `Approved/Released` status.

**Authoritative source:** Final Architecture.

**Proposed resolution — SAFE TO APPLY:** Use the Final Architecture happy-path lifecycle, including the distinct **Released** state. Represent Rejected, Returned, and Cancelled as controlled alternate outcomes/transitions rather than deleting them or placing them in the happy-path sequence. Approval levels remain configurable; the source vocabulary should distinguish request status, step status, and business-document release status.

### D-04 — R&D hierarchy and production conversion

**Source statements involved**

- Final Architecture: `Research → Base Formulation → Trial Recipe → Trial → Trial Approval → Optional Production Recipe Conversion`.
- Phase-3 and Phase-4 model distinct `Base Formulation`, `Trial Recipe`, `Trial`, and `Trial Approval` concepts and controlled conversion of an approved trial/trial recipe.
- Database Design omits `base_formulations` and `trial_recipes`, uses `research_formulations`, `research_trials`, and `research_approvals`, and defines conversion using `research_formulation_id` and `research_approval_id`.

**Authoritative source:** Final Architecture, followed by Phase-3 Domain Modeling and Phase-4 Entity Modeling.

**Proposed resolution — SAFE TO APPLY:** Preserve the distinct authoritative hierarchy and the optional controlled conversion after approval. Mark the conflicting Database Design R&D hierarchy and conversion references for later redrafting; do not collapse Base Formulation into Trial Recipe or bypass Trial/Trial Approval.

### D-05 — R&D boundary with Production Recipe Version

**Source statements involved**

- Final Architecture and Phase-3/Phase-4 keep R&D separate from Production and permit Production Recipe creation only through optional controlled conversion after approval.
- Database Design `research_trials.recipe_version_id` references a Production Recipe Version.
- Database Design `research_samples.recipe_version_id` references a Production Recipe Version.
- Database Design states: `Research Projects may produce multiple Recipe Versions before one formulation is approved for Production.`

**Authoritative source:** Final Architecture.

**Proposed resolution — SAFE TO APPLY:** R&D trials and samples must remain attached to R&D-owned formulations/trial recipes until an approved conversion occurs. Treat the direct pre-approval Production Recipe Version references and the quoted Database Design rule as conflicting source text to be removed or redrafted in the source documents; do not create Production records silently from R&D.

### D-06 — Database-only R&D entities

**Source statements involved**

- Final Architecture and Phase-3/Phase-4 define the approved R&D entity set around Research, Base Formulation, Trial Recipe, Trial, Sample, Sample Testing, Trial Approval, R&D Documents, Sample Issue, Sample Return, and Formula Comparison.
- Database Design additionally defines stability studies/timepoints, evaluations, parameter evaluations, budgets/items, variations, decisions, ingredient substitutions, packaging trials, sensory/market evaluations, competitor analyses, product requirements, milestones, tasks, team members, and risks.

**Authoritative source:** Final Architecture, followed by Phase-3 and Phase-4. The additional Database Design entities are not authorized by those higher sources.

**Proposed resolution — REQUIRES BUSINESS DECISION:** Keep all database-only R&D entities out of the approved implementation scope unless the project owner explicitly approves each capability and its business behavior. The project owner must decide whether each entity is a valid requirement, supporting detail of an existing entity, or unapproved expansion.

### D-07 — Costing model structure

**Source statements involved**

- Final Architecture, Phase-3, Phase-4, and the Database Design catalogue distinguish `RM Cost`, `PM Cost`, and `Cost Sheet`.
- Database Design detailed tables combine raw-material and packaging-material cost into `material_costs` and omit `cost_sheets`.
- Database Design additionally defines costing methods, components, allocations, and recalculations not present in the higher sources.

**Authoritative source:** Final Architecture, followed by Phase-3 and Phase-4.

**Proposed resolution — REQUIRES BUSINESS DECISION:** Do not accept the combined/detailed Database Design model or discard it automatically. The project owner must decide whether RM Cost and PM Cost are separate entities or typed records, confirm the Cost Sheet composition, and approve or reject each database-only costing concept.

### D-08 — Uniqueness scope conflicts

**Source statements involved**

- Phase-4 states Organization Name is `Unique`; Database Design does not enforce uniqueness and marks scope for later determination.
- Phase-4 states Brand Code, Department Code, Username, Email, Role Code/Name, Category Code/Name, Product Code, Flavour Code, Recipe Code, Vendor Code/Name, Warehouse Code/Name, Customer Code/Name, and UOM Code/Name are `Unique`.
- Database Design scopes many of these to organization or product, omits some name constraints, makes Product Name unique by Brand in Phase-4 but not in Database Design, and represents Customer without a `customer_name` column.

**Authoritative source:** Phase-4 Entity Modeling establishes that uniqueness is required, but it does not consistently specify whether uniqueness is global, organization-scoped, brand-scoped, product-scoped, or another tenant scope.

**Proposed resolution — REQUIRES BUSINESS DECISION:** The project owner must approve the uniqueness scope for every listed identifier/name. Do not infer global uniqueness from the word `Unique`, and do not silently replace it with organization-scoped uniqueness.

### D-09 — Customer identity and Sales Channel cardinality

**Source statements involved**

- Phase-4 Customer attributes include `Customer Name` and `Sales Channel`.
- Phase-4 rule: `Every Customer belongs to one Sales Channel.`
- Database Design models `first_name` and `last_name` instead of `customer_name`.
- Database Design makes `preferred_sales_channel_id` nullable and states: `Customer may have a preferred Sales Channel.`

**Authoritative source:** Phase-4 Entity Modeling, because the higher sources do not settle these detailed fields/cardinalities.

**Proposed resolution — REQUIRES BUSINESS DECISION:** The conflict cannot safely be reduced to a field rename. The project owner must decide whether a customer is an individual, organization, or both; define the authoritative display/legal name; and confirm whether Sales Channel membership is mandatory or merely an optional preference.

### D-10 — Vendor Category optionality

**Source statements involved**

- Database Design catalogue rule: `One Vendor belongs to a Vendor Category.`
- Phase-4 Vendor includes `Vendor Category`.
- Database Design `vendors.vendor_category_id` is nullable, and its detailed rule only states that Vendor Category is used to classify vendors.

**Authoritative source:** Phase-4 Entity Modeling, supported by the Database Design catalogue rule.

**Proposed resolution — SAFE TO APPLY:** Treat Vendor Category as mandatory for every Vendor. Reconcile the nullable detailed definition to that rule when source/schema changes are separately authorized.

### D-11 — Mandatory Batch on inventory records

**Source statements involved**

- Phase-3 rule: `Every stock entry belongs to a Batch.`
- Phase-4 rule: `Every Inventory Transaction belongs to a Batch.`
- Database Design makes `stock_movements.batch_id`, `stock_ledger.batch_id`, and `stock_reservations.batch_id` nullable.
- Database Design states for reservation: `Batch may be specified…`.

**Authoritative source:** Phase-3 Domain Modeling, followed by Phase-4 Entity Modeling.

**Proposed resolution — REQUIRES BUSINESS DECISION:** The higher-source rule appears mandatory, but the project owner must confirm whether non-batch-tracked materials, pre-allocation reservations, opening balances, or other exceptions exist. Do not make every batch reference mandatory or preserve all nullability until those business cases are decided.

### D-12 — Purchase Requisition source cardinality

**Source statements involved**

- Phase-4: `One Requirement Report generates one Purchase Requisition`.
- Phase-4: `Purchase Requisition is created automatically from Requirement Report.`
- Database Design `purchase_requisitions.requirement_report_id` is nullable.
- Database Design catalogue says a Purchase Requisition `can be generated` from a Requirement Report.

**Authoritative source:** Phase-4 Entity Modeling.

**Proposed resolution — REQUIRES BUSINESS DECISION:** The project owner must confirm whether all Purchase Requisitions are automatically generated one-to-one from Requirement Reports or whether manual/other-source requisitions are valid. Do not infer an exception from nullable database design alone.

### D-13 — GRN requirement for Purchase Order

**Source statements involved**

- Phase-3 rule: `Every Goods Receipt (GRN) is created against a Purchase Order.`
- Database Design catalogue qualifies that relationship with `where applicable`.
- Database Design `goods_receipts.purchase_order_id` is non-nullable and its detailed rule states every GRN belongs to one Purchase Order.

**Authoritative source:** Phase-3 Domain Modeling.

**Proposed resolution — SAFE TO APPLY:** Require every GRN to reference one Purchase Order. Remove the catalogue qualifier `where applicable` when the source document is revised.

### D-14 — Optional return/refund/payment source references

**Source statements involved**

- Phase-4 Purchase Return includes `Purchase Order` and applies to received material; Database Design `purchase_returns.purchase_order_id` is nullable.
- Phase-3/Phase-4 Sales Return is against delivered sales/orders; Database Design `sales_returns.sales_order_id` is nullable.
- Phase-4 allows Refund only after Sales Return; Database Design `refunds.sales_return_id` is nullable.
- Phase-4 relationship is `Customer → Sales Order → Invoice → Payment`; Database Design makes both `payments.sales_order_id` and `payments.invoice_id` nullable and defines no rule requiring at least one.

**Authoritative source:** Phase-3 and Phase-4 for the respective business relationships.

**Proposed resolution — REQUIRES BUSINESS DECISION:** Purchase Return must retain its Purchase Order source, Sales Return its Sales Order source, and Refund its Sales Return source unless a separately approved exception exists. For Payment, the project owner must decide whether advance/on-account/unapplied payments are allowed and whether a payment must reference an Invoice, a Sales Order, or at least one of them. Because the payment case is unsettled, the combined item requires a business decision.

### D-15 — Audit event/history user optionality

**Source statements involved**

- Final Architecture: `No audit event is defined without a referenced user, entity and action.`
- Phase-4 Audit Event includes `User`.
- Database Design makes `audit_events.user_id` and `audit_history.user_id` nullable.

**Authoritative source:** Final Architecture.

**Proposed resolution — SAFE TO APPLY:** Require a referenced user for every audit event/history record. Do not introduce anonymous/system-actor exceptions unless the architecture is explicitly amended to define how those actors are represented.

### D-16 — Permission existence without Role assignment

**Source statements involved**

- Phase-4 rule: `Permission cannot exist without a valid Role assignment.`
- Database Design defines Permission independently and makes Role-to-Permission association optional through `role_permissions`.

**Authoritative source:** Phase-4 Entity Modeling.

**Proposed resolution — SAFE TO APPLY:** Preserve the Phase-4 rule: an active Permission must participate in at least one valid Role assignment. Reconcile the Database Design lifecycle/constraint description accordingly; do not reinterpret frontend visibility as authorization.

### D-17 — Job Work Batch parent

**Source statements involved**

- Final Architecture flow: `Planning → Job Work Order → Job Work Batch`.
- Phase-4: Job Work Batch belongs to Job Work Order.
- Database Design `job_work_batches.production_order_id` is also non-nullable.

**Authoritative source:** Final Architecture, followed by Phase-4 Entity Modeling.

**Proposed resolution — SAFE TO APPLY:** Make Job Work Order the required parent of Job Work Batch. Do not require a Production Order unless a future approved requirement explicitly introduces that cross-domain relationship.

### D-18 — Job Work batches duplicated in Production batches

**Source statements involved**

- Phase-4 gives Job Work its own batch entity and separate process path.
- Database Design `production_batches.production_mode` permits `In-House/Job Work`.
- Database Design also defines separate `job_work_batches`.

**Authoritative source:** Phase-4 Entity Modeling, supported by the Final Architecture domain boundary between Production and Job Work.

**Proposed resolution — SAFE TO APPLY:** Use Production Batch for in-house production and Job Work Batch for third-party job-work execution. Treat `Job Work` as an invalid duplicate mode of `production_batches` unless a future approved requirement introduces a shared parent abstraction.

### D-19 — Document, Attachment, and Version relationship

**Source statements involved**

- Phase-3 Domain Modeling: `Document → Attachments → Versions`.
- Phase-4 Entity Modeling shows direct `Document → Attachments` and `Document → Document Versions` relationships.
- Database Design contains both direct relationships and the rule `A Document Version may have one or more physical Attachments.`

**Authoritative source:** Phase-3 Domain Modeling has formal priority, but the three models express materially different cardinality/ownership structures and Phase-3's arrow alone is insufficient to define the physical relationship.

**Proposed resolution — REQUIRES BUSINESS DECISION:** The project owner must approve whether versions belong to attachments, attachments belong to versions, or both are independently owned by a document with a separate association. Do not choose a foreign-key direction or cardinality by implementation convenience.

### D-20 — Central Document Management versus `research_documents`

**Source statements involved**

- Final Architecture and Phase-3/Phase-4 establish centralized `Document`, `Attachment`, and `Version` management.
- Database Design rule: domain modules must not create separate physical file structures.
- Database Design `research_documents` nevertheless contains `file_name`, `document_version`, uploader/date, and lifecycle fields without a central document foreign key.

**Authoritative source:** Final Architecture.

**Proposed resolution — SAFE TO APPLY:** Keep physical file, attachment, and version truth exclusively in central Document Management. Restrict Research Document to R&D-specific metadata plus a required central document reference, subject to the relationship decision in D-19. Remove duplicated physical-file/version meaning from the R&D definition when sources are revised.

## Items requiring an explicit business decision from the project owner

- A-03 — R&D table-name variants
- B-02 — Duplicate cross-domain physical entities
- C-01 — Raw-material and packaging masters
- C-02 — Common masters
- C-05 — R&D Sample Issue, Sample Return, and Formula Comparison definitions
- C-06 — Batch Dispensing
- C-07 — Inventory entities
- C-08 — Workflow Engine persistence model
- C-09 — Notification delivery/history model
- C-11 — Password-reset and account-lock persistence
- C-12 — Document Version-to-Attachment link
- C-14 — Quality Standard, Quality Status, and Batch Type
- D-06 — Database-only R&D entities
- D-07 — Costing model structure
- D-08 — Uniqueness scopes
- D-09 — Customer identity and Sales Channel cardinality
- D-11 — Mandatory Batch on inventory records
- D-12 — Purchase Requisition source cardinality
- D-14 — Return/refund/payment source references
- D-19 — Document, Attachment, and Version relationship
