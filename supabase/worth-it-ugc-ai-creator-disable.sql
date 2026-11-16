-- Disable user-facing AI UGC creation and improvement RPCs.
-- Historical AI-made calculators and their provenance remain unchanged.
-- Manual calculator save/edit/publish RPCs and their 1/2/3 daily save quota remain enabled.
begin;

revoke all on function public.get_worth_it_ugc_ai_edit_quota() from public, anon, authenticated;
revoke all on function public.reserve_worth_it_ugc_ai_edit(uuid, uuid) from public, anon, authenticated;
revoke all on function public.reserve_worth_it_ugc_ai_calc(uuid, text, integer) from public, anon, authenticated;
revoke all on function public.reserve_worth_it_ugc_ai_operation(uuid, text, uuid, integer) from public, anon, authenticated;
revoke all on function public.settle_worth_it_ugc_ai_operation(uuid, text) from public, anon, authenticated;
revoke all on function public.refund_worth_it_ugc_ai_operation(uuid, text) from public, anon, authenticated;

revoke all on function public.get_worth_it_ugc_maker_generation_quota() from public, anon, authenticated;
revoke all on function public.reserve_worth_it_ugc_maker_generation() from public, anon, authenticated;
revoke all on function public.reserve_worth_it_ugc_maker_generation_v2(uuid) from public, anon, authenticated;
revoke all on function public.refund_worth_it_ugc_maker_generation_v2(uuid) from public, anon, authenticated;
revoke all on function public.settle_worth_it_ugc_maker_generation_v2(uuid) from public, anon, authenticated;

commit;
