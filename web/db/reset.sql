-- Delete everything Lumo knows about one user ("delete everything", plan.md DoD #4).
-- Leaves `words` and `pair_codes` intact. Replace the uuid with DEMO_USER_ID before running.
-- /api/data should run the same deletes (parameterised) in this order.

begin;
delete from utterances
  where session_id in (select id from tutor_sessions where user_id = '00000000-0000-0000-0000-000000000000');
delete from tutor_sessions where user_id = '00000000-0000-0000-0000-000000000000';
delete from events         where user_id = '00000000-0000-0000-0000-000000000000';
delete from articles       where user_id = '00000000-0000-0000-0000-000000000000';
delete from user_words     where user_id = '00000000-0000-0000-0000-000000000000';
delete from settings       where user_id = '00000000-0000-0000-0000-000000000000';
commit;
