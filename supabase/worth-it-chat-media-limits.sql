-- Worth It chat media upload limits.
-- Apply after deploying the /api/chat-media endpoint and the updated chat-ui.js.
-- Keep this bucket public so previously sent media URLs remain accessible.
-- Storage accepts up to the planned Premium ceiling; the server enforces Free limits.
update storage.buckets
set public = true,
    file_size_limit = 52428800,
    allowed_mime_types = array['image/jpeg','image/png','image/webp','image/gif']
where id = 'worth-it-chat-media';

-- New uploads must go through /api/chat-media so clients cannot bypass the
-- Free-tier 15 MB image / 20 MB GIF limits by uploading directly to Storage.
drop policy if exists "Worth It chat media upload own" on storage.objects;
create policy "Worth It chat media upload own" on storage.objects
for insert to authenticated with check (false);

-- Existing public-read and owner-delete policies are intentionally unchanged.
