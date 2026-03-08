## 1. Helper: Context Window Error Detection

- [x] 1.1 Add `is_context_window_full` helper function in `handlers.rs` that checks if an `anyhow::Error` string contains `CONTENT_LENGTH_EXCEEDS_THRESHOLD`
- [x] 1.2 Add `trim_oldest_messages` helper function in `handlers.rs` that removes the 2 oldest non-system messages from a `Vec<Message>`, preserving the last message (current user input)

## 2. Core Retry Logic

- [x] 2.1 Add `const MAX_CONTEXT_TRIM_RETRIES: usize = 3` in `handlers.rs`
- [x] 2.2 Implement `try_call_with_context_trim` async function in `handlers.rs` that takes `provider`, `payload` (mutable), `profile_arn`, and `is_stream` — converts request, calls API, and on context-window-full error trims messages and retries up to MAX_CONTEXT_TRIM_RETRIES times
- [x] 2.3 The function SHALL return `Result<(reqwest::Response, String, i32), Response>` where the Ok contains (response, request_body, input_tokens) and Err contains the HTTP error response ← (verify: function signature matches usage in both post_messages and post_messages_cc, error detection works for CONTENT_LENGTH_EXCEEDS_THRESHOLD)

## 3. Integrate into Request Handlers

- [x] 3.1 Refactor `post_messages` to use `try_call_with_context_trim` instead of inline convert+call, passing the response to stream/non-stream handlers
- [x] 3.2 Refactor `post_messages_cc` to use `try_call_with_context_trim` similarly
- [x] 3.3 Ensure `handle_stream_request` and `handle_stream_request_buffered` accept a pre-obtained `reqwest::Response` instead of calling provider internally
- [x] 3.4 Ensure `handle_non_stream_request` accepts a pre-obtained `reqwest::Response` instead of calling provider internally ← (verify: all 4 endpoints /v1/messages stream, /v1/messages non-stream, /cc/v1/messages stream, /cc/v1/messages non-stream work correctly with trimmed history, no SSE data sent before retry completes)

## 4. Logging and Observability

- [x] 4.1 Add tracing::warn log on each trim-retry attempt with attempt number, messages removed count, and remaining message count
- [x] 4.2 Add tracing::info log when trim-retry succeeds, indicating how many messages were trimmed total ← (verify: logs appear correctly in both stream and non-stream paths, message counts are accurate)

