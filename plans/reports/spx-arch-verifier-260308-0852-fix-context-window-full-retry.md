## Architecture Verification Report: fix-context-window-full-retry

### Summary
| Dimension | Status |
|-----------|--------|
| Design Patterns | Issues |
| Project Conventions | Deviations |
| Dependency Direction | OK |
| Library Opportunities | 0 found |

---

### Issues

#### 1. CRITICAL (Must fix)

**[SPEC VIOLATION] `trim_oldest_messages` does not skip system-role messages — spec requires it**

File: `/Users/huy/Dev/www/kirors2/src/anthropic/handlers.rs:42-61`

The spec (`spec.md`) states:

> "WHEN trimming is triggered and the first message is a system-level message, THEN the proxy SHALL skip the system message and trim starting from the next oldest user+assistant pair."

The current implementation unconditionally drains from index 0:

```rust
fn trim_oldest_messages(messages: &mut Vec<Message>) -> usize {
    if messages.len() < 3 {
        return 0;
    }
    let max_removable = messages.len() - 1; // preserve last message
    let to_remove = 2.min(max_removable);
    if to_remove == 0 {
        return 0;
    }
    messages.drain(0..to_remove);  // blindly removes from index 0
    to_remove
}
```

The comment in the function body acknowledges this: "System messages have role 'system' but in Anthropic API, system is separate." — and then proceeds to ignore the possibility entirely. In the Anthropic API, `system` is a top-level field on `MessagesRequest`, not a message in the `messages` array. However, some clients (e.g., OpenAI-compat shims, certain MCP tools) do inject `{"role": "system", ...}` entries into the `messages` array. If such a message is at index 0, the current code removes it on the first trim cycle, violating the spec requirement and silently corrupting the conversation context.

Why it matters: removing a system message silently changes the model's behavior contract for the entire conversation. The client has no visibility into this. The spec explicitly forbids it.

Fix: scan from index 0 and skip any message where `role == "system"` before starting the drain window.

---

**[OBSERVABILITY BUG] `total_messages_trimmed` log is wrong when trimming stops early**

File: `/Users/huy/Dev/www/kirors2/src/anthropic/handlers.rs:138-142`

```rust
if attempt > 0 {
    tracing::info!(
        total_retries = attempt,
        total_messages_trimmed = attempt * 2,  // assumes every attempt removed exactly 2
        ...
    );
}
```

`trim_oldest_messages` can return fewer than 2 (it returns `to_remove = 2.min(max_removable)`). If on any attempt only 1 message was removed (e.g., 2 messages total before the last), the log reports `attempt * 2` which overstates the actual trim count. This is an observability defect — the log is the only signal operators have to understand what happened during a trim-retry cycle.

Fix: accumulate the actual removed count in a local `total_trimmed` variable across the loop and use that in the success log instead of `attempt * 2`.

---

#### 2. WARNING (Should fix)

**[CONVENTION DEVIATION] New code uses English comments and log messages; project convention is Chinese**

File: `/Users/huy/Dev/www/kirors2/src/anthropic/handlers.rs` (new functions at lines 30-169)

The existing codebase uses Chinese for module-level comments, inline comments, and log messages throughout `handlers.rs`, `provider.rs`, and other files. The new code added in this change breaks that convention:

- `is_context_window_full` — English doc comment
- `trim_oldest_messages` — English doc comment
- `try_call_with_context_trim` — English doc comment and English log messages (`"Context window full, trimming oldest messages and retrying"`, `"Context window trim-retry succeeded"`, `"Context window full but too few messages to trim, giving up"`)

The `map_provider_error` function (existing, modified) retains Chinese comments and Chinese log messages. The inconsistency makes the file harder to read uniformly.

---

**[SRP] `try_call_with_context_trim` handles five distinct concerns in one function**

File: `/Users/huy/Dev/www/kirors2/src/anthropic/handlers.rs:70-169`

The function body does:
1. `convert_request` — Anthropic → Kiro format conversion
2. `serde_json::to_string` — serialization
3. `token::count_all_tokens` — token estimation
4. `provider.call_api_stream` / `provider.call_api` — API dispatch
5. Retry loop with trim logic — retry orchestration

This is five responsibilities in 100 lines. The design doc (D1) explicitly chose to put retry at the handler level, so the coupling is intentional. However, extracting the "convert + serialize + count" step into a named helper (e.g., `prepare_kiro_request`) would make the retry loop readable and independently testable. As-is, any change to conversion, serialization, or token counting requires modifying the retry function.

---

### Library Replacement Opportunities

None. The implementation uses only standard Rust patterns (`Vec::drain`, string matching, loop/continue). No custom crypto, date handling, validation, or other library-replaceable logic was introduced.

---

### Final Assessment

2 critical architecture issue(s). Fix before archiving.
