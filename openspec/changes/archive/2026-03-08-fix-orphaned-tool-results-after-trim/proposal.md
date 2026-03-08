## Why

After the context window overflow fix (`trim_oldest_messages`), trimming removes a user+assistant pair from history. If the removed assistant message contained `tool_use` blocks, the *next* user message in history still carries `tool_result` blocks referencing those now-missing `tool_use_ids`. The Kiro API requires every `tool_result` to have a matching `tool_use` in history — orphaned tool_results cause `400 Bad Request {"message":"Improperly formed request."}`.

Current `validate_tool_pairing` only cleans orphaned tool_results in the **current** (last) message, not in **history** user messages.

## What Changes

- Add orphaned tool_result cleanup for history user messages in `convert_request` (after `build_history`, before sending to Kiro API)
- Extend `validate_tool_pairing` or add a new pass that scans history user messages and removes tool_results whose `tool_use_id` has no matching `tool_use` in any history assistant message

## Capabilities

### New Capabilities
- `history-tool-result-cleanup`: Clean orphaned tool_results from history user messages during request conversion, ensuring Kiro API receives properly paired tool_use/tool_result in all messages (not just the current one)

### Modified Capabilities

## Impact

- `src/anthropic/converter.rs`: Add history tool_result validation/cleanup logic
- No API changes, no new dependencies — purely internal request sanitization
