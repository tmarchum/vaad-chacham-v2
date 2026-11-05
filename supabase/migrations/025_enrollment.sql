-- One-time enrollment codes, so a credential holder can hand the token
-- straight to this backend over TLS instead of routing it through a chat, a
-- person's clipboard, or an assistant.
--
-- The token for this WhatsApp number already exists — it lives on the machine
-- that runs אות's automation. Nobody needs to read it, retype it, or paste it
-- anywhere it would be written down. The holder POSTs it once with a code that
-- is short-lived and single-use.
--
-- Only the SHA-256 of the code is stored: reading this table does not let you
-- use a pending code. A leaked code can only WRITE a token to this project —
-- it can never read one back, and the worst case is a bad token breaking
-- sending until it is replaced.

create table if not exists public.messaging_enrollment (
  id uuid primary key default gen_random_uuid(),
  provider text not null,
  code_hash text not null,
  expires_at timestamptz not null,
  used_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists messaging_enrollment_open
  on public.messaging_enrollment (code_hash) where used_at is null;

alter table public.messaging_enrollment enable row level security;
-- No policies at all: only the Edge Function (service role) ever touches this.
