-- Worth It presence and direct-message read receipts.
-- Apply after worth-it-profiles.sql, profile-avatars.sql, profile-description.sql,
-- worth-it-chat.sql and worth-it-chat-invitation-links.sql have been applied.
begin;

alter table public.worth_it_profiles add column if not exists last_seen_at timestamptz;
create or replace view public.worth_it_public_profiles as
select worth_it_id, username, coalesce(display_name, username, 'Worth It member') as display_name,
       avatar_url, created_at, banner_url, description, last_seen_at
from public.worth_it_profiles;
grant select on public.worth_it_public_profiles to anon, authenticated;

create or replace function public.touch_worth_it_presence()
returns timestamptz language plpgsql security definer set search_path = public as $$
declare actor_id uuid := auth.uid(); touched_at timestamptz;
begin
    if actor_id is null then raise exception 'Authentication required'; end if;
    update public.worth_it_profiles set last_seen_at = statement_timestamp()
     where user_id = actor_id and (last_seen_at is null or last_seen_at < statement_timestamp() - interval '30 seconds')
     returning last_seen_at into touched_at;
    if touched_at is null then select last_seen_at into touched_at from public.worth_it_profiles where user_id = actor_id; end if;
    return touched_at;
end;
$$;
revoke all on function public.touch_worth_it_presence() from public, anon;
grant execute on function public.touch_worth_it_presence() to authenticated;

create or replace function public.get_worth_it_chat_messages(p_conversation_id uuid default null, p_limit integer default 100)
returns jsonb language plpgsql security definer set search_path = public as $$
declare actor_id uuid := auth.uid(); target_id uuid := coalesce(p_conversation_id,'00000000-0000-4000-8000-000000000001'::uuid); target_type text; result jsonb;
begin
    if actor_id is null then raise exception 'Authentication required'; end if;
    select conversation_type into target_type from public.worth_it_chat_conversations where id=target_id;
    if target_type is null then return jsonb_build_object('success',false,'code','CHAT_NOT_FOUND'); end if;
    if target_type<>'global' and not exists(select 1 from public.worth_it_chat_members where conversation_id=target_id and user_id=actor_id) then return jsonb_build_object('success',false,'code','NOT_A_CHAT_MEMBER'); end if;
    select coalesce(jsonb_agg(row_data order by message_id),'[]'::jsonb) into result
    from (
        select m.id as message_id,jsonb_build_object(
            'id',m.id,'body',m.body,'media_url',m.media_url,'media_type',m.media_type,'filtered_reason',m.filtered_reason,
            'created_at',m.created_at,'sender_user_id',m.sender_user_id,'worth_it_id',p.worth_it_id,'username',p.username,
            'display_name',coalesce(p.display_name,p.username,'Worth It member'),'avatar_url',p.avatar_url,
            'is_seen',case when target_type='direct' and m.sender_user_id=actor_id then exists(
                select 1 from public.worth_it_chat_members recipient
                where recipient.conversation_id=target_id and recipient.user_id<>actor_id and recipient.last_read_at>=m.created_at
            ) else false end
        ) as row_data
        from public.worth_it_chat_messages m join public.worth_it_profiles p on p.user_id=m.sender_user_id
        where m.conversation_id=target_id order by m.id desc limit greatest(1,least(coalesce(p_limit,100),100))
    ) q;
    insert into public.worth_it_chat_members(conversation_id,user_id,last_read_at) values(target_id,actor_id,now())
    on conflict(conversation_id,user_id) do update set last_read_at=excluded.last_read_at;
    return result;
end;
$$;

commit;
