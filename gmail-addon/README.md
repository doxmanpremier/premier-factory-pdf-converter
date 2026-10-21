# Project Desk Gmail add-on

Install Code.gs and appsscript.json in the user's Apps Script project. Test deployment uses latest saved code. No Gmail-wide read or send scope. External requests are allowlisted to the Project Desk origin.

Connect: open Gmail add-on, click Connect Project Desk, sign in and approve Connect Gmail in Project Desk, then Refresh connection in Gmail. UserProperties stores a random capability; only its SHA-256 hash is registered in pm_meta. Hash in the connection URL fragment is not a bearer credential. Session-protected registration/revocation requires matching Origin. Revoke all connections in the sidebar.

Select project, Choose items, check one to 50 items, optionally include up to ten attachments /10 MB total, then Log email. Logging validates full project/target scope before any upload. Emails and attachments batch atomically; deterministic IDs prevent duplicates on retry. Existing copies are retained rather than overwritten. Email body is plain text, maximum 200,000 characters.

Emails display oldest to newest beneath item documents/files. Removing one item copy leaves Gmail and other item copies intact. Original Gmail links use the default Gmail account; switch mailbox in Gmail if multiple accounts are signed in. No pricing or project deletion API is available to add-on credentials.

Stage controls: item labels include current stage. Choose an active stage and use Apply stage to selected items to change only checked items (one to fifty), without logging the email. Selection and attachment choice stay selected after applying. Token stage route cannot edit pricing or project category.
Item list previews prefer the last logged email (loggedAt; existing records fall back to sent date), otherwise latest manual note. Native details disclosure shows one truncated line and expands the complete email, metadata and attachments in-place.
