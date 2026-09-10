# Sirver Database Structure & PocketBase Collections

## Collections Overview

1. **`users`**:
   - Fields: `id`, `username`, `email`, `display_name`, `avatar`, `status`, `role`, `bio`, `theme_color`, `accent_font`, `avatar_decoration`, `banner`

2. **`servers`** (Spaces):
   - Fields: `id`, `name`, `description`, `icon`, `banner`, `owner`, `members`, `is_private`

3. **`channels`**:
   - Fields: `id`, `server`, `name`, `topic`, `type` (`text`, `voice`, `announcement`), `position`

4. **`messages`**:
   - Fields: `id`, `channel`, `user`, `content`, `attachments`, `reply_to`, `reactions`, `pinned`, `created`

5. **`direct_messages`**:
   - Fields: `id`, `sender`, `recipient`, `content`, `attachments`, `created`
