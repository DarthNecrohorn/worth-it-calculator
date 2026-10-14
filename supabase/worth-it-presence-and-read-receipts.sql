-- Worth It presence and direct-message read receipts.
-- Apply after worth-it-profiles.sql, profile-avatars.sql, profile-description.sql,
-- worth-it-social.sql, worth-it-notifications.sql, worth-it-chat.sql,
-- worth-it-chat-notifications-and-member-limit.sql and worth-it-chat-invitation-links.sql.
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
            'display_name',coalesce(p.display_name,p.username,'Worth It member'),'avatar_url',p.avatar_url,'last_seen_at',p.last_seen_at,
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


-- Restore a group owner for older groups whose creator account was removed.
update public.worth_it_chat_conversations c
   set created_by = (
       select m.user_id from public.worth_it_chat_members m where m.conversation_id=c.id order by m.joined_at asc,m.user_id asc limit 1
   )
 where c.conversation_type='group' and c.created_by is null
   and exists(select 1 from public.worth_it_chat_members m where m.conversation_id=c.id);

create or replace function public.search_worth_it_public_profiles(p_query text, p_limit integer default 20)
returns jsonb language plpgsql stable security definer set search_path=public as $$
declare clean_query text:=lower(btrim(regexp_replace(coalesce(p_query,''),'^@',''))); result jsonb;
begin
    if clean_query='' or char_length(clean_query)>50 then return '[]'::jsonb; end if;
    if clean_query !~ '^[0-9]+$' and char_length(clean_query)<2 then return '[]'::jsonb; end if;
    select coalesce(jsonb_agg(to_jsonb(matches)),'[]'::jsonb) into result from (
        select p.worth_it_id,p.username,p.display_name,p.avatar_url,p.created_at,p.last_seen_at
        from public.worth_it_public_profiles p
        where (clean_query ~ '^[0-9]+$' and p.worth_it_id::text=clean_query)
           or (clean_query !~ '^[0-9]+$' and position(clean_query in lower(coalesce(p.username,'')))>0)
        order by case when lower(coalesce(p.username,''))=clean_query then 0 when position(clean_query in lower(coalesce(p.username,'')))=1 then 1 else 2 end,
                 lower(coalesce(p.username,p.display_name,''))
        limit greatest(1,least(coalesce(p_limit,20),20))
    ) as matches;
    return result;
end;
$$;
revoke all on function public.search_worth_it_public_profiles(text,integer) from public;
grant execute on function public.search_worth_it_public_profiles(text,integer) to anon,authenticated;

create or replace function public.get_worth_it_profile_connections(target_worth_it_id bigint, connection_type text)
returns jsonb language plpgsql stable security definer set search_path=public as $$
declare target_user_id uuid; connections jsonb:='[]'::jsonb;
begin
    if connection_type is null or connection_type not in ('friends','followers','following') then return jsonb_build_object('success',false,'code','INVALID_CONNECTION_TYPE'); end if;
    select user_id into target_user_id from public.worth_it_profiles where worth_it_id=target_worth_it_id;
    if target_user_id is null then return jsonb_build_object('success',false,'code','PROFILE_NOT_FOUND'); end if;
    if connection_type='friends' then
        select coalesce(jsonb_agg(jsonb_build_object('worth_it_id',p.worth_it_id,'username',p.username,'display_name',coalesce(p.display_name,p.username,'Worth It member'),'avatar_url',p.avatar_url,'last_seen_at',p.last_seen_at) order by lower(coalesce(p.display_name,p.username,''))),'[]'::jsonb)
        into connections from public.worth_it_friends f join public.worth_it_profiles p on p.user_id=case when f.user_low_id=target_user_id then f.user_high_id else f.user_low_id end
        where f.user_low_id=target_user_id or f.user_high_id=target_user_id;
    elsif connection_type='following' then
        select coalesce(jsonb_agg(jsonb_build_object('worth_it_id',p.worth_it_id,'username',p.username,'display_name',coalesce(p.display_name,p.username,'Worth It member'),'avatar_url',p.avatar_url,'last_seen_at',p.last_seen_at) order by lower(coalesce(p.display_name,p.username,''))),'[]'::jsonb)
        into connections from public.worth_it_follows f join public.worth_it_profiles p on p.user_id=f.followed_user_id where f.follower_user_id=target_user_id;
    else
        select coalesce(jsonb_agg(jsonb_build_object('worth_it_id',p.worth_it_id,'username',p.username,'display_name',coalesce(p.display_name,p.username,'Worth It member'),'avatar_url',p.avatar_url,'last_seen_at',p.last_seen_at) order by lower(coalesce(p.display_name,p.username,''))),'[]'::jsonb)
        into connections from public.worth_it_follows f join public.worth_it_profiles p on p.user_id=f.follower_user_id where f.followed_user_id=target_user_id;
    end if;
    return jsonb_build_object('success',true,'connections',connections);
end;
$$;

create or replace function public.get_worth_it_chat_friends()
returns jsonb language plpgsql stable security definer set search_path=public as $$
declare actor_id uuid:=auth.uid(); result jsonb;
begin
    if actor_id is null then raise exception 'Authentication required'; end if;
    select coalesce(jsonb_agg(jsonb_build_object('worth_it_id',p.worth_it_id,'username',p.username,'display_name',coalesce(p.display_name,p.username,'Worth It member'),'avatar_url',p.avatar_url,'last_seen_at',p.last_seen_at) order by lower(coalesce(p.display_name,p.username,''))),'[]'::jsonb)
    into result from public.worth_it_friends f join public.worth_it_profiles p on p.user_id=case when f.user_low_id=actor_id then f.user_high_id else f.user_low_id end
    where f.user_low_id=actor_id or f.user_high_id=actor_id;
    return result;
end;
$$;
revoke all on function public.get_worth_it_chat_friends() from public,anon;
grant execute on function public.get_worth_it_chat_friends() to authenticated;

create or replace function public.leave_worth_it_group_chat(p_conversation_id uuid)
returns jsonb language plpgsql security definer set search_path=public as $$
declare actor_id uuid:=auth.uid(); group_creator uuid; next_owner uuid; member_count integer;
begin
    if actor_id is null then raise exception 'Authentication required'; end if;
    select c.created_by into group_creator from public.worth_it_chat_conversations c where c.id=p_conversation_id and c.conversation_type='group' for update;
    if not found then return jsonb_build_object('success',false,'code','GROUP_NOT_FOUND'); end if;
    if not exists(select 1 from public.worth_it_chat_members where conversation_id=p_conversation_id and user_id=actor_id) then return jsonb_build_object('success',false,'code','NOT_A_GROUP_MEMBER'); end if;
    select count(*)::integer into member_count from public.worth_it_chat_members where conversation_id=p_conversation_id;
    if member_count<=1 then
        delete from public.worth_it_chat_conversations where id=p_conversation_id;
        return jsonb_build_object('success',true,'group_deleted',true,'owner_transferred',false);
    end if;
    if group_creator=actor_id then
        select user_id into next_owner from public.worth_it_chat_members where conversation_id=p_conversation_id and user_id<>actor_id order by joined_at asc,user_id asc limit 1;
        if next_owner is null then
            delete from public.worth_it_chat_conversations where id=p_conversation_id;
            return jsonb_build_object('success',true,'group_deleted',true,'owner_transferred',false);
        end if;
        update public.worth_it_chat_conversations set created_by=next_owner where id=p_conversation_id;
    end if;
    delete from public.worth_it_chat_members where conversation_id=p_conversation_id and user_id=actor_id;
    return jsonb_build_object('success',true,'group_deleted',false,'owner_transferred',group_creator=actor_id);
end;
$$;
revoke all on function public.leave_worth_it_group_chat(uuid) from public,anon;
grant execute on function public.leave_worth_it_group_chat(uuid) to authenticated;

create or replace function public.delete_worth_it_group_chat(p_conversation_id uuid)
returns jsonb language plpgsql security definer set search_path=public as $$
declare actor_id uuid:=auth.uid(); group_creator uuid;
begin
    if actor_id is null then raise exception 'Authentication required'; end if;
    select c.created_by into group_creator from public.worth_it_chat_conversations c where c.id=p_conversation_id and c.conversation_type='group' for update;
    if not found then return jsonb_build_object('success',false,'code','GROUP_NOT_FOUND'); end if;
    if group_creator is distinct from actor_id then return jsonb_build_object('success',false,'code','NOT_GROUP_CREATOR'); end if;
    if not exists(select 1 from public.worth_it_chat_members where conversation_id=p_conversation_id and user_id=actor_id) then return jsonb_build_object('success',false,'code','NOT_A_GROUP_MEMBER'); end if;
    delete from public.worth_it_chat_conversations where id=p_conversation_id;
    return jsonb_build_object('success',true,'deleted',true);
end;
$$;
revoke all on function public.delete_worth_it_group_chat(uuid) from public,anon;
grant execute on function public.delete_worth_it_group_chat(uuid) to authenticated;

create or replace function public.get_worth_it_chat_conversations()
returns jsonb language plpgsql stable security definer set search_path=public as $$
declare actor_id uuid:=auth.uid(); result jsonb;
begin
    if actor_id is null then raise exception 'Authentication required'; end if;
    select coalesce(jsonb_agg(jsonb_build_object(
        'id',c.id,'type',c.conversation_type,'title',c.title,'created_at',c.created_at,
        'invite_token',case when c.conversation_type='group' then c.invite_token else null end,
        'is_creator',coalesce(c.created_by=actor_id,false),
        'member_count',(select count(*)::integer from public.worth_it_chat_members cmc where cmc.conversation_id=c.id),
        'members',case when c.conversation_type='global' then '[]'::jsonb else (
            select coalesce(jsonb_agg(jsonb_build_object('worth_it_id',p.worth_it_id,'username',p.username,'display_name',coalesce(p.display_name,p.username,'Worth It member'),'avatar_url',p.avatar_url,'last_seen_at',p.last_seen_at) order by lower(coalesce(p.display_name,p.username,''))),'[]'::jsonb)
            from public.worth_it_chat_members cm join public.worth_it_profiles p on p.user_id=cm.user_id where cm.conversation_id=c.id and cm.user_id<>actor_id
        ) end,
        'last_message',(
            select jsonb_build_object('body',m.body,'created_at',m.created_at,'sender_user_id',m.sender_user_id,'media_type',m.media_type,
                'display_name',coalesce(p.display_name,p.username,'Worth It member'),'worth_it_id',p.worth_it_id,
                'is_seen',case when c.conversation_type='direct' and m.sender_user_id=actor_id then exists(
                    select 1 from public.worth_it_chat_members recipient where recipient.conversation_id=c.id and recipient.user_id<>actor_id and recipient.last_read_at>=m.created_at
                ) else false end)
            from public.worth_it_chat_messages m join public.worth_it_profiles p on p.user_id=m.sender_user_id where m.conversation_id=c.id order by m.id desc limit 1
        ),
        'unread_count',(
            select count(*) from public.worth_it_chat_messages m left join public.worth_it_chat_members mine on mine.conversation_id=c.id and mine.user_id=actor_id
            where m.conversation_id=c.id and m.sender_user_id<>actor_id and (
                (c.conversation_type<>'global' and (mine.last_read_at is null or m.created_at>mine.last_read_at))
                or (c.conversation_type='global' and mine.last_read_at is not null and m.created_at>mine.last_read_at)
            )
        )
    ) order by coalesce((select max(m2.created_at) from public.worth_it_chat_messages m2 where m2.conversation_id=c.id),c.created_at) desc),'[]'::jsonb)
    into result from public.worth_it_chat_conversations c left join public.worth_it_chat_members mine on mine.conversation_id=c.id and mine.user_id=actor_id
    where (c.conversation_type in ('direct','group') and mine.user_id=actor_id) or c.conversation_type='global';
    return result;
end;
$$;
revoke all on function public.get_worth_it_chat_conversations() from public,anon;
grant execute on function public.get_worth_it_chat_conversations() to authenticated;

commit;
