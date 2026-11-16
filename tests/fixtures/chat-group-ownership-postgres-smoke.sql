-- Runtime smoke tests for group ownership succession, kick permissions and
-- the 10-group cap. Run only in the disposable CI database.
do $$
declare
  g1 uuid;
  g2 uuid;
  g_limit uuid;
  r jsonb;
  owner_id uuid;
  member_count integer;
begin
  if (select array_agg(user_id order by member_order)
        from public.worth_it_chat_members
       where conversation_id='10000000-0000-4000-8000-000000000001')
     <> array[
       '00000000-0000-4000-8000-000000000002'::uuid,
       '00000000-0000-4000-8000-000000000001'::uuid,
       '00000000-0000-4000-8000-000000000003'::uuid
     ] then raise exception 'Legacy membership ordering did not preserve Owner-first join order'; end if;

  -- Owner 1 creates a group with members 2 then 3; ownership must pass 1 -> 2 -> 3.
  perform set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000001',true);
  r := public.create_worth_it_group_chat('Succession',array[2,3]::bigint[]);
  if not coalesce((r->>'success')::boolean,false) then raise exception 'Group creation failed: %',r; end if;
  g1 := (r->>'conversation_id')::uuid;

  r := public.leave_worth_it_group_chat(g1);
  if not coalesce((r->>'owner_transferred')::boolean,false) then raise exception 'Owner 1 departure did not transfer ownership: %',r; end if;
  select created_by into owner_id from public.worth_it_chat_conversations where id=g1;
  if owner_id <> '00000000-0000-4000-8000-000000000002' then raise exception 'User 2 did not inherit Owner'; end if;
  if exists(select 1 from public.worth_it_chat_members where conversation_id=g1 and user_id='00000000-0000-4000-8000-000000000001') then
    raise exception 'Departed owner remains in membership list';
  end if;

  perform set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000002',true);
  r := public.leave_worth_it_group_chat(g1);
  if not coalesce((r->>'owner_transferred')::boolean,false) then raise exception 'Owner 2 departure did not transfer ownership: %',r; end if;
  select created_by into owner_id from public.worth_it_chat_conversations where id=g1;
  if owner_id <> '00000000-0000-4000-8000-000000000003' then raise exception 'User 3 did not inherit Owner'; end if;

  -- Current Owner 3 may kick; a non-owner may not.
  perform set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000003',true);
  r := public.kick_worth_it_group_member(g1,2);
  if not coalesce((r->>'success')::boolean,false) then raise exception 'Current Owner could not kick a member: %',r; end if;
  perform set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000001',true);
  r := public.kick_worth_it_group_member(g1,3);
  if coalesce((r->>'success')::boolean,false) or r->>'code' <> 'NOT_GROUP_OWNER' then
    raise exception 'Non-owner was able to kick or got wrong response: %',r;
  end if;

  -- Create a second group and verify creator/invitee join order is stable.
  perform set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000002',true);
  r := public.create_worth_it_group_chat('Kick authorization',array[4,5]::bigint[]);
  if not coalesce((r->>'success')::boolean,false) then raise exception 'Second group creation failed: %',r; end if;
  g2 := (r->>'conversation_id')::uuid;
  if (select user_id from public.worth_it_chat_members where conversation_id=g2 order by member_order limit 1)
      <> '00000000-0000-4000-8000-000000000002' then
    raise exception 'Creator was not first in join order';
  end if;

  -- Fill user 6 to ten groups, then prove invitation acceptance and group creation
  -- both reject an eleventh membership. Other members are unique, to avoid caps.
  insert into public.worth_it_chat_conversations(conversation_type,title,created_by,invite_token)
  select 'group','Cap group '||n,'00000000-0000-4000-8000-000000000009',
         md5('limit-'||n)||md5('limit-token-'||n)
    from generate_series(1,10) n;
  insert into public.worth_it_chat_members(conversation_id,user_id)
  select c.id,u.user_id
    from public.worth_it_chat_conversations c
    cross join (select '00000000-0000-4000-8000-000000000006'::uuid as user_id) u
   where c.title like 'Cap group %';
  select id into g_limit from public.worth_it_chat_conversations where title='Cap group 1';

  perform set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000006',true);
  r := public.accept_worth_it_group_invite((select invite_token from public.worth_it_chat_conversations where id=g_limit));
  if coalesce((r->>'success')::boolean,false) or r->>'code' <> 'GROUP_LIMIT_REACHED' then
    raise exception 'Eleventh invite membership was not blocked: %',r;
  end if;
  r := public.create_worth_it_group_chat('Eleventh group',array[7,8]::bigint[]);
  if coalesce((r->>'success')::boolean,false) or r->>'code' <> 'GROUP_LIMIT_REACHED' then
    raise exception 'Eleventh group creation was not blocked: %',r;
  end if;

  -- A user at the cap cannot be invited into someone else's new group.
  perform set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000009',true);
  r := public.create_worth_it_group_chat('Invite capped user',array[6,10]::bigint[]);
  if coalesce((r->>'success')::boolean,false) or r->>'code' <> 'GROUP_LIMIT_REACHED' then
    raise exception 'A capped invitee was allowed into a new group: %',r;
  end if;

  -- The departed user no longer appears as a member of the original group.
  select count(*) into member_count from public.worth_it_chat_members
   where conversation_id=g1 and user_id='00000000-0000-4000-8000-000000000001';
  if member_count <> 0 then raise exception 'Departed user still has group membership'; end if;
end $$;
