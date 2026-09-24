-- Worth It admin/owner access
-- Keep owner access tied to the owner's email, not a Supabase user UUID.
-- This allows the owner to delete/recreate the account without losing Admin Panel access.
-- Run this once in Supabase SQL Editor.

drop policy if exists "Only admin can view feedback" on public.feedback;

create policy "Only admin can view feedback"
    on public.feedback
    for select
    to authenticated
    using (
        lower(coalesce(auth.jwt() ->> 'email', '')) =
        'pedjasebez3545@gmail.com'
    );
