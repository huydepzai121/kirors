## Architecture Verification Report: fix-context-window-full-retry

### Summary
| Dimension | Status |
|-----------|--------|
| Design Patterns | Issues |
| Project Conventions | Deviations |
| Dependency Direction | OK |
| Library Opportunities | 0 found |

---

### Previously Fixed Issues — Confirmed Resolved

Both issues from Round 1 (`verify-fixes.md`) are confirmed present in the current code. No regressions.

- `trim_oldest_messages` skips leading system-role messages via `position(|m| m.role != "system")` at `handlers.rs:49-52`.
- `total_messages_trimmed` log uses accumulated `total_trimmed` counter at `handlers.rs:143`.

---

### Issues

#### 1. CRITICAL (Must fix)

None.

---

#### 2. WARNING (Should fix)

**W1 — [SPEC BOUNDARY] `trim_oldest_messages` minimum-message guard `< 3` allows partial-pair trims**

File: `/Users/huy/Dev/www/kirors2/src/anthropic/handlers.rs:44`

```rust
if messages.len() < 3 {
    return 0;
}
```

With `messages.len() == 3` and a leading system message — e.g., `[system, user, user_current]` — `start_idx = 1`, `max_removable = 3 - 1 - 1 = 1`, `to_remove = min(2, 1) = 1`. Only 1 message is removed, not a full user+assistant pair. The spec requires removing "one user+assistant pair" per trim cycle. A single-message trim is unlikely to resolve a context overflow and wastes a retry slot (each is a full API round-trip; `MAX_CONTEXT_TRIM_RETRIES = 3`).

The guard should be `< 4` to guarantee at least one full pair (system + user + assistant + current_user = 4 minimum) can be removed before the last message is reached.

---

**W2 — [CONVENTION DEVIATION] New functions use English comments and log messages; project convention is Chinese**

File: `/Users/huy/Dev/www/kirors2/src/anthropic/handlers.rs:30-174`

The existing codebase uses Chinese for all doc comments, inline comments, and `tracing::` log messages throughout `handlers.rs`, `provider.rs`, and other files. The new functions break this convention:

- `is_context_window_full` — English doc comment (lines 33-35)
- `trim_oldest_messages` — English doc comment (lines 38-41)
- `try_call_with_context_trim` — English doc comment (lines 66-72) and English log messages at lines 145, 154, 163

The `map_provider_error` function (existing, modified in this change) retains Chinese. The inconsistency makes the file harder to read uniformly and breaks log aggregation patterns that filter on Chinese keywords.

---

**W3 — [SRP] `try_call_with_context_trim` handles five distinct concerns in one function**

File: `/Users/huy/Dev/www/kirors2/src/anthropic/handlers.rs:73-174`

The function body does:
1. `convert_request` — Anthropic → Kiro format conversion
2. `serde_json::to_string` — serialization
3. `token::count_all_tokens` — token estimation
4. `provider.call_api_stream` / `provider.call_api` — API dispatch
5. Retry loop with trim logic — retry orchestration

Five responsibilities in ~100 lines. The design doc (D1) explicitly chose handler-level retry, so the coupling is intentional, but extracting the "convert + serialize + count" step into a named helper (e.g., `prepare_kiro_request`) would make the retry loop readable and independently testable. As-is, any change to conversion, serialization, or token counting requires modifying the retry function.

---

#### 3. SUGGESTION (Nice to fix)

**S1 — [OBSERVABILITY] Per-attempt trim log omits running `total_trimmed` counter**

File: `/Users/huy/Dev/www/kirors2/src/anthropic/handlers.rs:158-164`

The per-attempt `tracing::warn!` shows `messages_removed` for the current attempt but not the running total. An operator reading logs for a 3-retry sequence must mentally sum three separate values. Adding `total_trimmed_so_far = total_trimmed` (after `total_trimmed += removed`) would make each log entry self-contained.

**S2 — `_request_body` is discarded at both call sites**

File: `/Users/huy/Dev/www/kirors2/src/anthropic/handlers.rs:371, 796`

`try_call_with_context_trim` returns `(response, request_body, input_tokens)` but `request_body` is immediately discarded at both call sites (`_request_body`). If it is not needed, drop it from the return tuple to avoid carrying unused data through the API surface.

---

### Library Replacement Opportunities

None. The implementation uses only standard Rust patterns (`Vec::drain`, `Vec::position`, string matching, loop/continue). No custom crypto, date handling, validation, or other library-replaceable logic was introduced.

---

### Final Assessment

3 warning(s) found. Fix before archiving — warnings are not optional.

W1 (partial-pair trim guard) is the highest priority: it is a correctness issue that wastes retry cycles and violates the spec's "user+assistant pair" contract. W2 (language convention) and W3 (SRP) are lower urgency but should be addressed for consistency and maintainability.
