// PocketBase migrations receive the low-level DB handle. Use explicit SQL so
// the indexes are applied consistently even when an installation has a
// slightly different collection definition or relation id.
migrate((db) => {
  const statements = [
    'CREATE INDEX IF NOT EXISTS idx_messages_channel_created_id ON messages (channel, created DESC, id DESC)',
    'CREATE INDEX IF NOT EXISTS idx_private_messages_chat_created_id ON private_messages (chat_server, created DESC, id DESC)',
    'CREATE INDEX IF NOT EXISTS idx_attachments_message ON attachments (message)',
    'CREATE INDEX IF NOT EXISTS idx_private_attachments_message ON private_attachments (message)',
    'CREATE INDEX IF NOT EXISTS idx_channels_server_position ON channels (server, position)',
    'CREATE INDEX IF NOT EXISTS idx_server_members_user_server ON server_members (user, server)',
    'CREATE INDEX IF NOT EXISTS idx_server_members_server_user ON server_members (server, user)',
    'CREATE INDEX IF NOT EXISTS idx_private_chat_members_user_server ON private_chat_members (user, chat_server)',
    'CREATE INDEX IF NOT EXISTS idx_calls_started_by_updated ON calls (started_by, updated DESC)',
    'CREATE INDEX IF NOT EXISTS idx_calls_channel_updated ON calls (channel, updated DESC)',
  ];

  statements.forEach((statement) => db.newQuery(statement).execute());
}, (db) => {
  [
    'idx_messages_channel_created_id',
    'idx_private_messages_chat_created_id',
    'idx_attachments_message',
    'idx_private_attachments_message',
    'idx_channels_server_position',
    'idx_server_members_user_server',
    'idx_server_members_server_user',
    'idx_private_chat_members_user_server',
    'idx_calls_started_by_updated',
    'idx_calls_channel_updated',
  ].forEach((name) => db.newQuery(`DROP INDEX IF EXISTS ${name}`).execute());
});
