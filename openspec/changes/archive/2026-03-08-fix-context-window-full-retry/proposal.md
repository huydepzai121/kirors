## Why

When the upstream Kiro API returns `CONTENT_LENGTH_EXCEEDS_THRESHOLD` (400), the proxy immediately returns a 400 error to the client: "Context window is full. Reduce conversation history, system prompt, or tools." The client (e.g., Claude Code, Augment) has no way to recover — the conversation is dead. This is a common issue in long conversations where history accumulates beyond the 200k context window. The fix should allow the proxy to automatically trim conversation history and retry, giving the client a chance to continue without manual intervention.

## What Changes

- Add automatic conversation history trimming and retry logic when `CONTENT_LENGTH_EXCEEDS_THRESHOLD` is detected
- In `handlers.rs`: catch the context-window-full error, trim the oldest messages from the payload, re-convert, and retry the API call (up to a configurable number of trim-retry cycles)
- Preserve system messages and the most recent messages; only trim from the middle/oldest conversation turns
- Log each trim-retry attempt with the number of messages removed
- If all retry attempts still fail (history cannot be reduced enough), return the existing 400 error

## Capabilities

### New Capabilities
- `context-window-retry`: Automatic conversation history trimming and retry when the upstream API rejects a request due to context window overflow

### Modified Capabilities

## Impact

- `src/anthropic/handlers.rs` — `post_messages`, `post_messages_cc`, `handle_stream_request`, `handle_stream_request_buffered`, `handle_non_stream_request`, `map_provider_error`
- `src/kiro/provider.rs` — `call_api_with_retry` needs to distinguish `CONTENT_LENGTH_EXCEEDS_THRESHOLD` from other 400 errors so the handler can detect and retry
- `src/anthropic/converter.rs` — may need a helper to rebuild a request with fewer history messages

