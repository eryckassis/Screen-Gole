SELECT table_name
FROM information_schema.tables
WHERE table_schema = 'public'
  AND table_name IN (
    'app_users',
    'room_memberships',
    'room_invites',
    'desktop_auth_codes',
    'desktop_sessions'
  )
ORDER BY table_name;

SELECT
  (SELECT count(*) FROM stream_profiles) AS preserved_stream_profiles,
  (SELECT count(*) FROM room_channels) AS preserved_room_channels,
  (SELECT count(*) FROM room_peers) AS transient_peers,
  (SELECT count(*) FROM room_signals) AS transient_signals;

SELECT
  count(*) FILTER (WHERE membership.role = 'owner') AS owner_memberships,
  count(*) FILTER (WHERE channel.owner_user_id = membership.user_id) AS channel_owner_matches
FROM room_memberships AS membership
JOIN room_channels AS channel ON channel.room_id = membership.room_id
WHERE membership.room_id = 'main';
