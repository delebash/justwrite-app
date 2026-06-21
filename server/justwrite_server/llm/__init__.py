"""JustWrite's host side of the shared `llm_runner.llm` stack.

The adapters, registry, tiers, usage ledger, dispatch, schema, and the
provider-CRUD router all live in the shared `just-llm-runner` package (mounted
identically by JustVoice). The only app-specific pieces are here:

- `provider_store` — persistence of the provider list over JustWrite's
  `LlmProvider` table (the host side of the shared router factory).
- (later, 3d) `config` — JustWrite's feature catalog → role mapping +
  settings→`LLMConfig` builder for server-side dispatch.
"""
