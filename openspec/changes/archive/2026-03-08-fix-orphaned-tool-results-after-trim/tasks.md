## 1. Core Implementation

- [x] 1.1 Add `remove_orphaned_history_tool_results` function in `src/anthropic/converter.rs` — collects all `tool_use_id`s from history assistant messages, then removes `tool_result`s from history user messages whose `tool_use_id` is not in the collected set. Log warning for each removal.
- [x] 1.2 Call `remove_orphaned_history_tool_results(&mut history)` in `convert_request()` after step 9 (`remove_orphaned_tool_uses`) and before step 10 (placeholder tool generation) ← (verify: orphaned tool_results in history are removed, valid ones retained, request reaches Kiro API without 400 error)

## 2. Testing

- [x] 2.1 Add unit test: trimming removes assistant with tool_use → next user's matching tool_result is cleaned
- [x] 2.2 Add unit test: valid tool_use/tool_result pairs in history are preserved
- [x] 2.3 Add unit test: mixed valid + orphaned tool_results — only orphaned ones removed ← (verify: all spec scenarios covered, tests pass with `cargo test`)
