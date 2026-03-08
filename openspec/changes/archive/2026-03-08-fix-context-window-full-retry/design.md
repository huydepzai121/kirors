## Context

The proxy converts Anthropic-format requests to Kiro API format. When conversation history grows beyond the 200k context window, the upstream Kiro API returns a 400 with `CONTENT_LENGTH_EXCEEDS_THRESHOLD`. Currently, `call_api_with_retry` in `provider.rs` treats all 400s as non-retryable and immediately bails. The error propagates to `map_provider_error` in `handlers.rs`, which returns a 400 to the client. The client has no recovery path.

The conversation history is built in `converter.rs::convert_request` from `payload.messages`. The oldest messages are at the start of the array; the last message is the current user input.

## Goals / Non-Goals

**Goals:**
- Automatically trim conversation history and retry when context window is full
- Preserve system messages, tool definitions, and the most recent user message
- Trim from the oldest conversation turns (user+assistant pairs)
- Work for both stream and non-stream paths, and both `/v1/messages` and `/cc/v1/messages`
- Log each trim-retry attempt for observability

**Non-Goals:**
- Smart/semantic trimming (e.g., summarizing old messages) — just drop oldest turns
- Client-side retry hints or new error codes
- Changing the Anthropic API contract

## Decisions

### D1: Retry at handler level, not provider level

The provider (`call_api_with_retry`) doesn't have access to the original `MessagesRequest` payload — it only sees the serialized JSON string. Trimming requires modifying `payload.messages` and re-running `convert_request`.

Retry will happen in `post_messages` and `post_messages_cc` before dispatching to stream/non-stream handlers. A helper function `try_with_context_trim` will:
1. Convert request → call API
2. If `CONTENT_LENGTH_EXCEEDS_THRESHOLD` error → trim oldest message pair from `payload.messages`, re-convert, retry
3. Repeat up to `MAX_CONTEXT_TRIM_RETRIES` (3) times
4. If still failing → return the original 400 error

**Alternative considered**: Retry inside `call_api_with_retry` by re-serializing. Rejected because the provider doesn't own the conversion logic and shouldn't know about Anthropic message format.

### D2: Trim strategy — remove oldest user+assistant pairs

Each trim cycle removes the 2 oldest non-system messages (one user + one assistant turn). System messages (index 0 if present) are always preserved. The last message (current user input) is always preserved.

If after trimming there are fewer than 2 messages (system + current), stop retrying.

### D3: Distinguish CONTENT_LENGTH_EXCEEDS_THRESHOLD from other 400s in provider

Currently `call_api_with_retry` does `anyhow::bail!` for all 400s. We need the handler to know whether the 400 was specifically a context-window issue.

Approach: Define a custom error type `ContextWindowFullError` or use a specific error message pattern. The handler checks `err.to_string().contains("CONTENT_LENGTH_EXCEEDS_THRESHOLD")` — this already works with the current `anyhow::bail!` since the body is included in the error message. No provider changes needed.

### D4: Trim applies to the Anthropic-level messages, not Kiro history

We trim `payload.messages` (the Anthropic request) and re-run the full `convert_request` pipeline. This ensures all downstream logic (tool pairing validation, history building, etc.) stays consistent.

## Risks / Trade-offs

- [Trimming may break tool_use/tool_result pairing] → `convert_request` already handles orphaned tool_use/tool_result via `validate_tool_pairing` and `remove_orphaned_tool_uses`. Trimming oldest messages and re-converting will naturally clean up broken pairs.
- [Multiple retries add latency] → Each retry is a full API round-trip. Max 3 retries = worst case ~3x latency. Acceptable because the alternative is a dead conversation.
- [Aggressive trimming may lose important context] → We trim minimally (one pair per retry). The model will have less context but can still respond. Better than a hard failure.
- [Race with streaming] → For stream requests, the error comes back before any data is streamed, so retry is safe — no partial response has been sent to the client yet.

