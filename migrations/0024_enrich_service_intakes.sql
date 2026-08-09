PRAGMA foreign_keys = ON;

-- Central copy/settings used by the generated Application for Services PDF and
-- sensitive service modules. Owners can edit these later in HQ Settings.
INSERT INTO app_settings (key, value) VALUES
  ('service_application_disclaimer', 'Pinnacle Management Ventures is not a law firm and does not provide legal advice. Certain services may involve or require coordination with appropriately licensed third-party professionals. Availability and scope are subject to review, applicable law, and a final written service agreement.'),
  ('eviction_scope_disclaimer', 'Eviction-related support is subject to legal and scope review. Florida law may limit non-lawyer representation. Contested hearings, legal advice, or other attorney-required work may require coordination with a licensed attorney.'),
  ('service_application_contact_line', 'Pinnacle Management Ventures | pinnaclemanagementventures.com')
ON CONFLICT(key) DO NOTHING;

UPDATE services SET intake_intro = 'Tell us about the business, the challenge, and what a successful engagement looks like.', estimated_minutes = 5 WHERE key = 'consulting';
UPDATE services SET intake_intro = 'Tell us what you are looking to fund and a little about the business behind it.', estimated_minutes = 5 WHERE key = 'funding';
UPDATE services SET intake_intro = 'Tell us about your payment environment so we can understand the right transition or processing path.', estimated_minutes = 5 WHERE key = 'merchant_services';
UPDATE services SET intake_intro = 'Looking for a property manager? Pick the level of support that fits — we will tailor from there.', estimated_minutes = 6 WHERE key = 'property_management';
UPDATE services SET intake_intro = 'We will come to you. A few details so we are prepared.', estimated_minutes = 3 WHERE key = 'mobile_notary';
UPDATE services SET intake_intro = 'Tell us about the property and what you need inspected.', estimated_minutes = 3 WHERE key = 'property_inspections';
UPDATE services SET intake_intro = 'What needs to get there, and how fast?', estimated_minutes = 3 WHERE key = 'document_courier';
UPDATE services SET intake_intro = 'Tell us what you need off your plate.', estimated_minutes = 3 WHERE key = 'admin_support';

-- Normalize the three existing rich applications instead of replacing them.
UPDATE onboarding_questions SET input_type = 'single_select' WHERE service_key IN ('consulting','funding','merchant_services') AND input_type = 'select';
UPDATE onboarding_questions SET input_type = 'currency' WHERE service_key = 'funding' AND question_key = 'amount_requested';
UPDATE onboarding_questions SET
  condition_question_key = 'has_current_processor', condition_operator = '==', condition_value = 'Yes, with a processor'
WHERE service_key = 'merchant_services' AND question_key IN ('current_processor_name','reason_for_switching');

-- Consulting additions requested by the spec.
INSERT INTO onboarding_questions
  (id, service_key, question_key, label, help_text, input_type, options, required, sort_order, step_label, step_order, condition_question_key, condition_operator, condition_value, allow_multiple)
VALUES
  ('cons13','consulting','primary_objective','What is the primary objective for this engagement?',NULL,'single_select','["Operations","Growth / strategy","Organizational structure","Turnaround / stabilization","Technology or vendor transition","Other"]',1,5,'Your goals',2,NULL,NULL,NULL,0),
  ('cons14','consulting','target_start_date','When would you like to get started?',NULL,'date',NULL,0,50,'Your goals',2,NULL,NULL,NULL,0)
ON CONFLICT(service_key, question_key) DO NOTHING;

-- Funding branching + required disclosures/consent.
INSERT INTO onboarding_questions
  (id, service_key, question_key, label, help_text, input_type, options, required, sort_order, step_label, step_order, condition_question_key, condition_operator, condition_value, allow_multiple)
VALUES
  ('fund14','funding','funding_type','What type of capital are you primarily exploring?',NULL,'single_select','["Working capital","Equipment financing","Line of credit","Term loan","Real estate financing","Not sure / compare options"]',1,5,'Funding need',2,NULL,NULL,NULL,0),
  ('fund15','funding','lender_contact_consent','May Pinnacle share your information with third-party funding providers when needed to evaluate options?','Checking this does not guarantee approval or funding.','toggle',NULL,1,10,'Disclosures & consent',4,NULL,NULL,NULL,0),
  ('fund16','funding','no_guarantee_ack','I understand that Pinnacle does not guarantee approval, rates, terms, or funding.','Final eligibility and terms are determined by the applicable funding provider.','toggle',NULL,1,20,'Disclosures & consent',4,NULL,NULL,NULL,0)
ON CONFLICT(service_key, question_key) DO NOTHING;

-- Merchant Services: richer transition context while preserving the existing 13 questions.
INSERT INTO onboarding_questions
  (id, service_key, question_key, label, help_text, input_type, options, required, sort_order, step_label, step_order, condition_question_key, condition_operator, condition_value, allow_multiple)
VALUES
  ('merc14','merchant_services','transition_scope','What are you considering changing?','Choose everything that applies.','multi_select','["Payment processor","POS system","Gateway / virtual terminal","Recurring billing or memberships","E-commerce checkout","Hardware / terminals","Not sure yet"]',1,10,'Transition goals',4,NULL,NULL,NULL,0),
  ('merc15','merchant_services','data_to_move','What data may need to move to the new system?','Only include data your business owns or is authorized to access.','multi_select','["Customer profiles","Inventory / products","Memberships / recurring billing records","Gift cards / stored value","Employee records","Reporting history","Other","Not sure"]',0,20,'Transition goals',4,NULL,NULL,NULL,0),
  ('merc16','merchant_services','target_go_live','Target go-live date',NULL,'date',NULL,0,30,'Transition goals',4,NULL,NULL,NULL,0),
  ('merc17','merchant_services','implementation_support','What kind of help would be most valuable?','Choose everything that applies.','multi_select','["Vendor comparison","Data migration coordination","Implementation project management","Hardware rollout","Testing / reconciliation","Training coordination","Go-live support","Ongoing advisory"]',1,40,'Transition goals',4,NULL,NULL,NULL,0)
ON CONFLICT(service_key, question_key) DO NOTHING;

-- Replace the five shallow service forms with the enriched Part 3 definitions.
DELETE FROM onboarding_questions WHERE service_key IN ('admin_support','document_courier','mobile_notary','property_inspections','property_management');

-- Administrative Support
INSERT INTO onboarding_questions
(id,service_key,question_key,label,help_text,input_type,options,required,sort_order,step_label,step_order,condition_question_key,condition_operator,condition_value,allow_multiple) VALUES
('adm1','admin_support','support_tasks','What do you need help with?','Choose everything you would like off your plate.','multi_select','["Filing / organization","Scheduling & calendar","Correspondence / email","Data entry","Document prep","Phone / reception","Bookkeeping-adjacent tasks","Other"]',1,10,'What you need',1,NULL,NULL,NULL,0),
('adm2','admin_support','support_tasks_other','Tell us what else you need help with.',NULL,'text',NULL,1,20,'What you need',1,'support_tasks','contains','Other',0),
('adm3','admin_support','task_frequency','How often do you need support?',NULL,'single_select','["One-time project","Recurring (ongoing)","Not sure yet"]',1,10,'Timing & coverage',2,NULL,NULL,NULL,0),
('adm4','admin_support','estimated_hours_per_week','About how many hours per week?',NULL,'number',NULL,1,20,'Timing & coverage',2,'task_frequency','==','Recurring (ongoing)',0),
('adm5','admin_support','coverage_times','Which days or times would you want coverage?',NULL,'text',NULL,0,30,'Timing & coverage',2,'task_frequency','==','Recurring (ongoing)',0),
('adm6','admin_support','preferred_contact','How should we contact you?',NULL,'single_select','["Email","Phone / call","Text","Client portal"]',1,10,'Contact & start',3,NULL,NULL,NULL,0),
('adm7','admin_support','contact_detail','Best email or phone number','We will prefill this when possible.','text',NULL,1,20,'Contact & start',3,NULL,NULL,NULL,0),
('adm8','admin_support','best_times','Best times to reach you',NULL,'text',NULL,0,30,'Contact & start',3,NULL,NULL,NULL,0),
('adm9','admin_support','target_start_date','Target start date',NULL,'date',NULL,0,40,'Contact & start',3,NULL,NULL,NULL,0),
('adm10','admin_support','additional_notes','Anything else we should know?',NULL,'textarea',NULL,0,50,'Contact & start',3,NULL,NULL,NULL,0);

-- Document Courier
INSERT INTO onboarding_questions
(id,service_key,question_key,label,help_text,input_type,options,required,sort_order,step_label,step_order,condition_question_key,condition_operator,condition_value,allow_multiple) VALUES
('cour1','document_courier','document_type','What type of document are we moving?',NULL,'single_select','["Legal documents","Financial / loan docs","Real-estate / closing docs","Medical","Government / filings","Other"]',1,10,'Document',1,NULL,NULL,NULL,0),
('cour2','document_courier','document_type_other','What type of document?',NULL,'text',NULL,1,20,'Document',1,'document_type','==','Other',0),
('cour3','document_courier','time_sensitivity','How quickly does it need to arrive?',NULL,'single_select','["Same-day (rush)","Next-day","Standard (2–3 days)","Scheduled for a specific date"]',1,10,'Timing',2,NULL,NULL,NULL,0),
('cour4','document_courier','scheduled_window','Choose the requested date and time window.',NULL,'datetime_window',NULL,1,20,'Timing',2,'time_sensitivity','==','Scheduled for a specific date',0),
('cour5','document_courier','pickup_address','Pickup address',NULL,'address',NULL,1,10,'Pickup & delivery',3,NULL,NULL,NULL,0),
('cour6','document_courier','delivery_address','Delivery address',NULL,'address',NULL,1,20,'Pickup & delivery',3,NULL,NULL,NULL,0),
('cour7','document_courier','pickup_contact','Pickup contact — name and phone',NULL,'text',NULL,1,30,'Pickup & delivery',3,NULL,NULL,NULL,0),
('cour8','document_courier','recipient_contact','Recipient contact — name and phone',NULL,'text',NULL,1,40,'Pickup & delivery',3,NULL,NULL,NULL,0),
('cour9','document_courier','proof_required','Signature / proof of delivery required?',NULL,'toggle',NULL,0,10,'Handling',4,NULL,NULL,NULL,0),
('cour10','document_courier','handling_notes','Special handling notes','For example: confidential, ID required, fragile packaging.','textarea',NULL,0,20,'Handling',4,NULL,NULL,NULL,0);

-- Mobile Notary
INSERT INTO onboarding_questions
(id,service_key,question_key,label,help_text,input_type,options,required,sort_order,step_label,step_order,condition_question_key,condition_operator,condition_value,allow_multiple) VALUES
('not1','mobile_notary','notarization_type','What needs to be notarized?',NULL,'multi_select','["Acknowledgment","Jurat / affidavit","Loan signing","Power of attorney","Real-estate docs","Other"]',1,10,'Documents',1,NULL,NULL,NULL,0),
('not2','mobile_notary','notarization_other','Tell us the document type.',NULL,'text',NULL,1,20,'Documents',1,'notarization_type','contains','Other',0),
('not3','mobile_notary','signer_count','How many signers?',NULL,'number',NULL,1,30,'Documents',1,NULL,NULL,NULL,0),
('not4','mobile_notary','ron_needed','How would you like the notarization completed?',NULL,'single_select','["In-person (mobile)","Remote online (RON)","Not sure"]',1,10,'Appointment',2,NULL,NULL,NULL,0),
('not5','mobile_notary','ron_emails','Signer email address(es) for the RON platform',NULL,'text',NULL,1,20,'Appointment',2,'ron_needed','==','Remote online (RON)',0),
('not6','mobile_notary','preferred_window','Preferred date and time window',NULL,'datetime_window',NULL,1,30,'Appointment',2,NULL,NULL,NULL,0),
('not7','mobile_notary','alternate_window','Alternate date and time window',NULL,'datetime_window',NULL,0,40,'Appointment',2,NULL,NULL,NULL,0),
('not8','mobile_notary','meeting_address','Meeting address',NULL,'address',NULL,1,10,'Location & readiness',3,'ron_needed','==','In-person (mobile)',0),
('not9','mobile_notary','access_notes','Parking / access notes',NULL,'text',NULL,0,20,'Location & readiness',3,'ron_needed','==','In-person (mobile)',0),
('not10','mobile_notary','valid_photo_id','Will all signers have valid photo ID?',NULL,'toggle',NULL,1,30,'Location & readiness',3,NULL,NULL,NULL,0),
('not11','mobile_notary','approx_pages','Approximate number of documents / pages',NULL,'number',NULL,0,40,'Location & readiness',3,NULL,NULL,NULL,0),
('not12','mobile_notary','additional_notes','Anything else we should know?','Witness needs, apostille questions, language needs, or other preparation notes.','textarea',NULL,0,50,'Location & readiness',3,NULL,NULL,NULL,0);

-- Property Inspections
INSERT INTO onboarding_questions
(id,service_key,question_key,label,help_text,input_type,options,required,sort_order,step_label,step_order,condition_question_key,condition_operator,condition_value,allow_multiple) VALUES
('insp1','property_inspections','property_type','What type of property is it?',NULL,'single_select','["Single-family","Condo / townhome","Multi-family","Commercial","Vacant land / lot","Other"]',1,10,'Property',1,NULL,NULL,NULL,0),
('insp2','property_inspections','property_type_other','Describe the property type.',NULL,'text',NULL,1,20,'Property',1,'property_type','==','Other',0),
('insp3','property_inspections','property_address','Property address',NULL,'address',NULL,1,30,'Property',1,NULL,NULL,NULL,0),
('insp4','property_inspections','reports_requested','What report(s) are you looking for?',NULL,'multi_select','["General condition","Move-in / move-out","Insurance / 4-point","Wind mitigation","Roof","Pre-listing","Draw / progress inspection","Occupancy / verification","Other"]',1,10,'Inspection needs',2,NULL,NULL,NULL,0),
('insp5','property_inspections','reports_other','What other report do you need?',NULL,'text',NULL,1,20,'Inspection needs',2,'reports_requested','contains','Other',0),
('insp6','property_inspections','access_instructions','Access instructions / on-site contact','Who should we coordinate with? Include tenant, lockbox, gate, or access details as appropriate.','textarea',NULL,1,30,'Inspection needs',2,NULL,NULL,NULL,0),
('insp7','property_inspections','occupancy_status','Occupancy status',NULL,'single_select','["Occupied","Vacant","Under construction"]',0,10,'Scheduling',3,NULL,NULL,NULL,0),
('insp8','property_inspections','preferred_window','Preferred date and time window',NULL,'datetime_window',NULL,0,20,'Scheduling',3,NULL,NULL,NULL,0),
('insp9','property_inspections','special_requests','Special requests','Specific areas of concern, photo needs, or report deadline.','textarea',NULL,0,30,'Scheduling',3,NULL,NULL,NULL,0);

-- Property Management, including tier chooser and eviction module.
INSERT INTO onboarding_questions
(id,service_key,question_key,label,help_text,input_type,options,required,sort_order,step_label,step_order,condition_question_key,condition_operator,condition_value,allow_multiple) VALUES
('pm1','property_management','property_addresses','Property address(es)','Add each property you want us to consider.','address',NULL,1,10,'Property & owner basics',1,NULL,NULL,NULL,1),
('pm2','property_management','property_type','Property type',NULL,'single_select','["Single-family","Condo / townhome","Multi-family (2–4)","Multi-family (5+)","Commercial"]',1,20,'Property & owner basics',1,NULL,NULL,NULL,0),
('pm3','property_management','unit_count','Number of units',NULL,'number',NULL,1,30,'Property & owner basics',1,NULL,NULL,NULL,0),
('pm4','property_management','current_status','Current status',NULL,'single_select','["Occupied (tenant in place)","Vacant / ready to rent","Being purchased","Currently self-managed","Managed by another company"]',1,40,'Property & owner basics',1,NULL,NULL,NULL,0),
('pm5','property_management','owner_authority','Are you the owner or authorized agent?',NULL,'single_select','["Owner","Authorized agent / POA","Other"]',1,50,'Property & owner basics',1,NULL,NULL,NULL,0),
('pm6','property_management','management_tier','Choose the level of support that feels closest to what you need.','Pricing is intentionally shown as TBD until PMV finalizes fee schedules.','single_select','[{"value":"tier_1","label":"Tier 1 — Tenant Placement (Lease-Only)","description":"Marketing & listing, showings, tenant screening/background/credit, lease preparation, and move-in coordination. Best for owners who self-manage after placement.","meta":"Fee: TBD / editable"},{"value":"tier_2","label":"Tier 2 — Full Management","description":"Everything in Tenant Placement plus rent collection, maintenance coordination, routine inspections, owner reporting, tenant communication, and renewals. Best for hands-off owners.","meta":"Fee: TBD / editable"},{"value":"tier_3","label":"Tier 3 — Premium / Portfolio","description":"Full management plus dedicated manager, enhanced reporting, priority maintenance, annual planning, and eviction-protection coordination. Best for multiple units or portfolios.","meta":"Fee: TBD / editable"},{"value":"not_sure","label":"Not sure — help me choose","description":"Send your answers to a Pinnacle representative so we can recommend a fit.","meta":"No commitment"}]',1,10,'Choose a service tier',2,NULL,NULL,NULL,0),
('pm7','property_management','monthly_rent','Current monthly rent (or target)',NULL,'currency',NULL,0,10,'Tenancy & goals',3,NULL,NULL,NULL,0),
('pm8','property_management','lease_status','Is there a lease in place?',NULL,'single_select','["Yes","No","Month-to-month"]',1,20,'Tenancy & goals',3,NULL,NULL,NULL,0),
('pm9','property_management','lease_upload','Upload the current lease','You can upload more than one file if needed.','file',NULL,1,30,'Tenancy & goals',3,'lease_status','==','Yes',1),
('pm10','property_management','tenant_count','Number of current tenants',NULL,'number',NULL,0,40,'Tenancy & goals',3,NULL,NULL,NULL,0),
('pm11','property_management','primary_goals','What are your primary goals?',NULL,'multi_select','["Fill a vacancy","Reduce day-to-day work","Improve rent collection","Handle maintenance","Resolve a problem tenant","Prepare / handle an eviction","Better reporting","Other"]',1,50,'Tenancy & goals',3,NULL,NULL,NULL,0),
('pm12','property_management','primary_goals_other','Tell us the other goal.',NULL,'text',NULL,1,60,'Tenancy & goals',3,'primary_goals','contains','Other',0),
('pm13','property_management','target_start_date','Target start date',NULL,'date',NULL,0,70,'Tenancy & goals',3,NULL,NULL,NULL,0),
('pm14','property_management','eviction_help_now','Do you need eviction help now?','This module helps us understand the situation and determine what PMV can handle directly versus where attorney coordination may be required.','single_select','["Yes, actively","Anticipating soon","No / just exploring"]',1,10,'Eviction Documentation & Court Representation',4,NULL,NULL,NULL,0),
('pm15','property_management','eviction_stage','What stage is the eviction in?',NULL,'single_select','["Haven’t started","Notice needs to be served (e.g. 3-day)","Notice served / waiting","Ready to file","Case already filed"]',1,20,'Eviction Documentation & Court Representation',4,'eviction_help_now','!=','No / just exploring',0),
('pm16','property_management','eviction_reason','Reason for the eviction','Choose everything that applies.','multi_select','["Non-payment of rent","Lease violation","Holdover / no lease","End of term","Other"]',1,30,'Eviction Documentation & Court Representation',4,'eviction_help_now','!=','No / just exploring',0),
('pm17','property_management','eviction_reason_other','Other eviction reason',NULL,'text',NULL,1,40,'Eviction Documentation & Court Representation',4,'eviction_reason','contains','Other',0),
('pm18','property_management','eviction_scope_requested','What help are you looking for?','Selections describe requested support only; final scope is subject to legal/compliance review and may require attorney coordination.','multi_select','["Prepare / serve notice","Prepare & file the eviction complaint","Appear in court as agent of the owner","Coordinate with an attorney","Post-judgment / writ of possession & turnover"]',1,50,'Eviction Documentation & Court Representation',4,'eviction_help_now','!=','No / just exploring',0),
('pm19','property_management','eviction_filing_details','Property + tenant details for the filing','Names, unit, amounts owed, and other useful facts.','textarea',NULL,0,60,'Eviction Documentation & Court Representation',4,'eviction_help_now','!=','No / just exploring',0),
('pm20','property_management','eviction_documents','Upload relevant documents','Lease, ledger, prior notices, or other supporting records.','file',NULL,0,70,'Eviction Documentation & Court Representation',4,'eviction_help_now','!=','No / just exploring',1),
('pm21','property_management','preferred_contact','Preferred contact method',NULL,'single_select','["Email","Phone / call","Text","Client portal"]',1,10,'Contact',5,NULL,NULL,NULL,0),
('pm22','property_management','contact_detail','Best email or phone number','We will prefill this when possible.','text',NULL,1,20,'Contact',5,NULL,NULL,NULL,0),
('pm23','property_management','additional_notes','Anything else we should know?',NULL,'textarea',NULL,0,30,'Contact',5,NULL,NULL,NULL,0);
