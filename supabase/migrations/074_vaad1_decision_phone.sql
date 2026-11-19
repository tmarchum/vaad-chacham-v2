alter table public.billing_settings add column if not exists vaad1_decision_phone text;
update public.billing_settings set vaad1_decision_phone = '0505180180' where id = 'default';
update public.message_templates set meta_status = 'APPROVED', updated_at = now() where key in ('handyman_job_offer','vendor_job_closed','vendor_job_offer');
update public.message_templates set category = 'MARKETING' where key = 'vendor_job_offer';
select key, meta_status, category from message_templates where key in ('handyman_job_offer','vendor_job_closed','vendor_job_offer');
