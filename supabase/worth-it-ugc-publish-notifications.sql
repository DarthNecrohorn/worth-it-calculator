-- Worth It: notify current followers when a member publishes a public UGC calculator.
-- Run after worth-it-social.sql, worth-it-notifications.sql and the UGC visibility/categories/drafts migration.
-- Apply to the PR Preview/staging database only until PR #194 is approved.

begin;

alter table public.worth_it_social_notifications
    drop constraint if exists worth_it_social_notifications_notification_type_check;
alter table public.worth_it_social_notifications
    add constraint worth_it_social_notifications_notification_type_check
    check (notification_type in ('unfriended','follow','ugc_published'));

alter table public.worth_it_social_notifications
    add column if not exists related_ugc_calculator_id uuid
    references private.worth_it_user_calculators(id) on delete cascade;

create unique index if not exists worth_it_social_notifications_ugc_unique_idx
    on public.worth_it_social_notifications(recipient_user_id,related_ugc_calculator_id)
    where notification_type='ugc_published'
      and related_ugc_calculator_id is not null;

create or replace function private.worth_it_ugc_publish_notifications_trigger()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, private, auth
as $$
declare
    was_public boolean := false;
    is_public boolean;
begin
    is_public := new.status='published' and new.visibility='public';
    if tg_op='UPDATE' then
        was_public := old.status='published' and old.visibility='public';
    end if;

    if is_public then
        -- Updating an already-public calculator's content is not a new publication.
        if was_public then
            return new;
        end if;
        insert into public.worth_it_social_notifications(
            recipient_user_id,actor_user_id,notification_type,related_ugc_calculator_id
        )
        select f.follower_user_id,new.owner_user_id,'ugc_published',new.id
          from public.worth_it_follows f
         where f.followed_user_id=new.owner_user_id
           and f.follower_user_id<>new.owner_user_id
        on conflict (recipient_user_id,related_ugc_calculator_id)
            where notification_type='ugc_published'
              and related_ugc_calculator_id is not null
        do nothing;
    elsif was_public then
        -- Switching to Private or Draft removes the associated notification.
        delete from public.worth_it_social_notifications
         where notification_type='ugc_published'
           and related_ugc_calculator_id=new.id;
    end if;
    return new;
end;
$$;

revoke all on function private.worth_it_ugc_publish_notifications_trigger() from public,anon,authenticated;

drop trigger if exists worth_it_ugc_publish_notifications
    on private.worth_it_user_calculators;
create trigger worth_it_ugc_publish_notifications
after insert or update of status,visibility
on private.worth_it_user_calculators
for each row
execute function private.worth_it_ugc_publish_notifications_trigger();

create or replace function private.worth_it_ugc_clear_notifications_after_unfollow()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
begin
    delete from public.worth_it_social_notifications
     where recipient_user_id=old.follower_user_id
       and actor_user_id=old.followed_user_id
       and notification_type='ugc_published';
    return old;
end;
$$;

revoke all on function private.worth_it_ugc_clear_notifications_after_unfollow() from public,anon,authenticated;

drop trigger if exists worth_it_ugc_clear_notifications_after_unfollow
    on public.worth_it_follows;
create trigger worth_it_ugc_clear_notifications_after_unfollow
after delete on public.worth_it_follows
for each row
execute function private.worth_it_ugc_clear_notifications_after_unfollow();

-- Server-side filtering requires a current follow that existed when the calculator was published.
create or replace function public.get_worth_it_social_notifications()
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, private, auth
as $$
declare
    actor_id uuid := auth.uid();
    result jsonb;
begin
    if actor_id is null then
        raise exception 'Authentication required';
    end if;

    delete from public.worth_it_social_notifications
     where recipient_user_id=actor_id
       and created_at<=statement_timestamp()-interval '24 hours';

    delete from public.worth_it_notification_dismissals
     where user_id=actor_id
       and dismissed_at<=statement_timestamp()-interval '24 hours';

    select coalesce(jsonb_agg(jsonb_build_object(
        'id',n.id,
        'type',n.notification_type,
        'reason',n.reason,
        'created_at',n.created_at,
        'read_at',n.read_at,
        'worth_it_id',p.worth_it_id,
        'username',p.username,
        'display_name',coalesce(p.display_name,p.username,'Worth It member'),
        'avatar_url',p.avatar_url,
        'ugc_calculator_id',c.id,
        'calculator_title',c.title,
        'calculator_number',c.calculator_number
    ) order by n.created_at desc),'[]'::jsonb)
      into result
      from public.worth_it_social_notifications n
      left join public.worth_it_profiles p on p.user_id=n.actor_user_id
      left join private.worth_it_user_calculators c
        on c.id=n.related_ugc_calculator_id
       and c.owner_user_id=n.actor_user_id
       and c.status='published'
       and c.visibility='public'
     where n.recipient_user_id=actor_id
       and n.created_at>statement_timestamp()-interval '24 hours'
       and (
            n.notification_type<>'ugc_published'
            or (
                c.id is not null
                and exists(
                    select 1 from public.worth_it_follows f
                     where f.follower_user_id=actor_id
                       and f.followed_user_id=n.actor_user_id
                       and f.created_at<=n.created_at
                )
            )
       );
    return result;
end;
$$;

revoke all on function public.get_worth_it_social_notifications() from public,anon;
grant execute on function public.get_worth_it_social_notifications() to authenticated;

commit;
