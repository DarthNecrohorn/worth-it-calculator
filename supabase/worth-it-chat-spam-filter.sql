-- Worth It Global Chat anti-spam and self-promotion filter.
-- Run this migration in the Supabase SQL Editor after the existing worth-it-chat.sql setup.
-- Applies duplicate/self-promotion blocking to Global Chat only; private and group chats are unchanged.

create or replace function public.send_worth_it_chat_message(
    p_body text default '',
    p_conversation_id uuid default null,
    p_media_url text default null,
    p_media_type text default null
)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
    actor_id uuid := auth.uid();
    target_id uuid := coalesce(p_conversation_id, '00000000-0000-4000-8000-000000000001'::uuid);
    target_type text;
    clean_body text := coalesce(p_body,'');
    normalized_body text;
    masked_body text;
    filter_reason text := null;
    term_row record;
    message_id bigint;
    recent_sent timestamptz;
    media_kind text := nullif(p_media_type,'');
begin
    if actor_id is null then raise exception 'Authentication required'; end if;
    if char_length(clean_body)>500 then return jsonb_build_object('success',false,'code','MESSAGE_TOO_LONG','limit',500); end if;
    if char_length(btrim(clean_body))=0 and p_media_url is null then
        return jsonb_build_object('success',false,'code','EMPTY_MESSAGE');
    end if;
    if media_kind is not null and media_kind not in ('image','gif') then
        return jsonb_build_object('success',false,'code','INVALID_MEDIA_TYPE');
    end if;
    if p_media_url is not null and (
        p_media_url !~ '^https://[^[:space:]]+$'
        or p_media_url !~ '^https://[^/]+/storage/v1/object/public/worth-it-chat-media/'
    ) then return jsonb_build_object('success',false,'code','INVALID_MEDIA_URL'); end if;

    select conversation_type into target_type
    from public.worth_it_chat_conversations where id=target_id;
    if target_type is null then return jsonb_build_object('success',false,'code','CHAT_NOT_FOUND'); end if;
    if target_type <> 'global' and not exists (
        select 1 from public.worth_it_chat_members where conversation_id=target_id and user_id=actor_id
    ) then return jsonb_build_object('success',false,'code','NOT_A_CHAT_MEMBER'); end if;

    if target_type='direct' and not exists (
        select 1 from public.worth_it_chat_members a
        join public.worth_it_chat_members b on b.conversation_id=a.conversation_id and b.user_id<>a.user_id
        join public.worth_it_friends f on
            (f.user_low_id=a.user_id and f.user_high_id=b.user_id) or
            (f.user_low_id=b.user_id and f.user_high_id=a.user_id)
        where a.conversation_id=target_id and a.user_id=actor_id
    ) then return jsonb_build_object('success',false,'code','FRIENDS_ONLY'); end if;

    perform pg_advisory_xact_lock(hashtextextended('worth-it-chat:'||actor_id::text,0));
    select max(created_at) into recent_sent from public.worth_it_chat_messages
    where sender_user_id=actor_id;
    if recent_sent is not null and recent_sent > now()-interval '2 seconds' then
        return jsonb_build_object('success',false,'code','CHAT_COOLDOWN',
            'retry_after_ms',greatest(1,ceil(extract(epoch from (recent_sent+interval '2 seconds'-now()))*1000)));
    end if;

    -- Global Chat duplicate detection: case, whitespace and punctuation variations are normalized.
    -- Only compare recent text messages from this sender; media-only messages are unaffected.
    if target_type='global' and char_length(btrim(clean_body))>0 then
        normalized_body := lower(btrim(regexp_replace(btrim(clean_body), '[[:space:][:punct:]]+', ' ', 'g')));
        if char_length(normalized_body)>0 and exists (
            select 1 from public.worth_it_chat_messages m
            where m.conversation_id=target_id
              and m.sender_user_id=actor_id
              and m.created_at > now()-interval '10 minutes'
              and char_length(btrim(m.body))>0
              and lower(btrim(regexp_replace(btrim(m.body), '[[:space:][:punct:]]+', ' ', 'g')))=normalized_body
        ) then
            return jsonb_build_object('success',false,'code','SPAM_DUPLICATE');
        end if;

        -- Block clear unsolicited self-promotion. Ordinary links and product/site mentions
        -- remain allowed unless the message uses explicit promotional calls to action.
        if clean_body ~* '(^|[^[:alnum:]_])(follow me|subscribe to my|check out my (website|site|channel|page|profile|store|shop)|visit my (website|site|page|store|shop)|buy my (product|products|course|courses)|use my (referral|promo|discount) code|join my (discord|telegram|server)|support my (channel|page|business)|dm me for (services|orders|commissions)|follow my (instagram|tiktok|youtube|twitter|x account))([^[:alnum:]_]|$)' then
            return jsonb_build_object('success',false,'code','SPAM_PROMOTION');
        end if;
    end if;

    masked_body:=clean_body;
    if masked_body ~ '(ε⥰|\\(‿ˠ‿\\)|Ɑ͞|لں͞|⎛₎╰\\(☫\\)╯₍⎞)' then
        masked_body:=regexp_replace(masked_body,'(ε⥰|\\(‿ˠ‿\\)|Ɑ͞|لں͞|⎛₎╰\\(☫\\)╯₍⎞)','***','gi');
        filter_reason:= 'Glitch-style or potentially harmful symbols were filtered.';
    end if;
    if masked_body ~ '[卐卍☫]' then
        masked_body:=regexp_replace(masked_body,'[卐卍☫]','*','g');
        filter_reason:= 'Hate symbols or potentially harmful imagery were filtered.';
    end if;
    if masked_body ~ U&'[\0300-\036F\0483-\0489\0591-\05BD\0610-\061A\064B-\065F\1AB0-\1AFF\1DC0-\1DFF\20D0-\20FF\FE20-\FE2F]' then
        masked_body:=regexp_replace(masked_body,U&'[\0300-\036F\0483-\0489\0591-\061A\064B-\065F\1AB0-\1AFF\1DC0-\1DFF\20D0-\20FF\FE20-\FE2F]','*','g');
        filter_reason:=coalesce(filter_reason||' ', '') || 'Glitch/combining Unicode characters were filtered.';
    end if;
    for term_row in select term,reason from public.worth_it_chat_filter_terms where enabled order by char_length(term) desc loop
        if masked_body ~* ('(^|[^[:alnum:]_])'||term_row.term||'([^[:alnum:]_]|$)') then
            masked_body:=regexp_replace(masked_body,
                '(^|[^[:alnum:]_])('||term_row.term||')([^[:alnum:]_]|$)',
                E'\\1'||repeat('*',greatest(3,char_length(term_row.term)))||E'\\3','gi');
            filter_reason:=coalesce(filter_reason||' ', '')||term_row.reason||' was filtered.';
        end if;
    end loop;

    insert into public.worth_it_chat_messages(conversation_id,sender_user_id,body,media_url,media_type,filtered_reason)
    values(target_id,actor_id,masked_body,nullif(p_media_url,''),media_kind,filter_reason)
    returning id into message_id;
    return jsonb_build_object('success',true,'message_id',message_id,'filtered',filter_reason is not null,
        'filtered_reason',filter_reason,'body',masked_body);
end; $$;

revoke all on function public.send_worth_it_chat_message(text,uuid,text,text) from public,anon;
grant execute on function public.send_worth_it_chat_message(text,uuid,text,text) to authenticated;
