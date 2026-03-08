## ADDED Requirements

### Requirement: Remove orphaned tool_results from history user messages
The converter SHALL remove any `tool_result` from a history user message whose `tool_use_id` does not match any `tool_use` in a preceding history assistant message. A warning log SHALL be emitted for each removed orphaned tool_result.

#### Scenario: Trimming removes assistant with tool_use, next user has matching tool_result
- **WHEN** `trim_oldest_messages` removes an assistant message containing `tool_use(id=abc)` and the next history user message contains `tool_result(id=abc)`
- **THEN** the converter removes `tool_result(id=abc)` from that history user message before sending to Kiro API

#### Scenario: History user message has tool_results with valid matching tool_uses
- **WHEN** a history user message contains `tool_result(id=xyz)` and a preceding history assistant message contains `tool_use(id=xyz)`
- **THEN** the converter retains `tool_result(id=xyz)` unchanged

#### Scenario: Multiple orphaned tool_results in one user message
- **WHEN** a history user message contains `tool_result(id=a)` and `tool_result(id=b)`, and neither `id=a` nor `id=b` exists in any history assistant message's tool_uses
- **THEN** both tool_results are removed from that user message

#### Scenario: Mixed valid and orphaned tool_results
- **WHEN** a history user message contains `tool_result(id=valid)` and `tool_result(id=orphan)`, where only `id=valid` has a matching tool_use in history
- **THEN** `tool_result(id=valid)` is retained and `tool_result(id=orphan)` is removed

### Requirement: Cleanup runs as part of convert_request pipeline
The orphaned history tool_result cleanup SHALL execute after `build_history` and `remove_orphaned_tool_uses`, ensuring both directions of pairing (tool_use→tool_result and tool_result→tool_use) are validated.

#### Scenario: Cleanup ordering in convert_request
- **WHEN** `convert_request` processes a request with trimmed messages
- **THEN** orphaned tool_uses are removed first (existing logic), then orphaned tool_results in history are removed (new logic), before constructing the final `ConversationState`
