<!-- LOVABLE:BEGIN -->
> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.
<!-- LOVABLE:END -->

- Payment tables and functions (migration 20260929140000_planos_pedidos_pagamentos.sql) are deployed and present in src/integrations/supabase/types.ts; keep payment queries server-only and fully typed (no `any` casts).
- Preload sidebar routes on intent and keep successful queries fresh for 30 seconds; this reduces repeated waits during normal navigation while explicit invalidations preserve updated data.
