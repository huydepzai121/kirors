## Context

The proxy converts Anthropic API requests to Kiro API format via `convert_request()` in `src/anthropic/converter.rs`. The Kiro API enforces strict pairing: every `tool_result` in a user message MUST reference a `tool_use_id` from a preceding assistant message.

A recent fix added `trim_oldest_messages()` in `src/anthropic/handlers.rs` to auto-trim conversation history when the context window overflows. It removes 2 messages (a user+assistant pair) from the oldest non-system position.

Current `validate_tool_pairing()` only cleans orphaned tool_results in the **current** (last) message. History user messages are not validated, so after trimming removes an assistant with tool_uses, the next user message's tool_results become orphaned → Kiro returns 400.

## Goals / Non-Goals

**Goals:**
- Ensure all tool_results in history user messages have matching tool_uses in history assistant messages
- Fix silently — no user-visible behavior change, just proper request sanitization

**Non-Goals:**
- Changing the trimming strategy itself
- Handling other potential malformed request causes (those are separate bugs if they exist)

## Decisions

**Extend `validate_tool_pairing` to also clean history user messages.**

After `build_history()` constructs the Kiro history, add a pass that:
1. Collects all `tool_use_id`s from history assistant messages
2. For each history user message, retains only tool_results whose `tool_use_id` exists in the collected set

This reuses the existing pattern (similar to `remove_orphaned_tool_uses` but for the inverse direction). Placed in `convert_request()` right after step 9 (`remove_orphaned_tool_uses`).

Alternative considered: validating in `trim_oldest_messages` itself — rejected because the trimming operates on Anthropic-format messages, not Kiro-format. The converter is the right place since it already handles all pairing logic.

## Risks / Trade-offs

- [Removing tool_results silently may lose context] → Acceptable: the corresponding tool_use is already gone, so the result is meaningless without it. Logging a warning preserves debuggability.
- [Empty user message after cleanup] → Low risk: `merge_user_messages` always includes text content alongside tool_results. Even if tool_results are removed, the text remains.
