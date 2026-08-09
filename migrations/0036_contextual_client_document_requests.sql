PRAGMA foreign_keys = ON;

-- Request documents only when they materially help the service. We intentionally
-- avoid a blanket ID requirement for every client journey.
INSERT INTO onboarding_questions
(id,service_key,question_key,label,help_text,input_type,options,required,sort_order,step_label,step_order,condition_question_key,condition_operator,condition_value,allow_multiple)
VALUES
  ('fund_doc_id','funding','fund_photo_id','Government-issued photo ID','Upload a clear photo or PDF of the applicant ID. You can take a picture from your phone.','file',NULL,1,10,'Documents',5,NULL,NULL,NULL,0),
  ('fund_doc_fin','funding','fund_financial_docs','Helpful financial documents','Optional at this stage. Add recent bank statements, financial statements, or other documents that may help us understand funding readiness.','file',NULL,0,20,'Documents',5,NULL,NULL,NULL,1),
  ('merc_doc_stmt','merchant_services','current_processing_statement','Recent processing statement','If you currently process cards, upload a recent statement so we can understand the existing pricing and setup.','file',NULL,1,10,'Documents',5,'has_current_processor','==','Yes, with a processor',0),
  ('pm_doc_owner','property_management','property_documents','Property documents','Optional now. Add a lease, management agreement, ownership document, inspection, or other property file that would help us understand the situation.','file',NULL,0,10,'Documents',7,NULL,NULL,NULL,1),
  ('not_doc_preview','mobile_notary','document_preview','Document preview','Optional. Upload the document to be notarized if you want us to review page count and preparation needs before the appointment. Do not upload identification here; signers should present valid ID as instructed for the notarization.','file',NULL,0,10,'Documents',4,NULL,NULL,NULL,1)
ON CONFLICT(service_key, question_key) DO NOTHING;
