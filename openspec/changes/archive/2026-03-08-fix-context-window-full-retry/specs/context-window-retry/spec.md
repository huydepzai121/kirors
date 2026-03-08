## ADDED Requirements

### Requirement: Automatic history trimming on context window overflow
When the upstream Kiro API rejects a request with `CONTENT_LENGTH_EXCEEDS_THRESHOLD` (indicating the context window is full), the proxy SHALL automatically trim the oldest conversation turns from the message history and retry the request.

#### Scenario: Successful retry after trimming
- **WHEN** the upstream API returns 400 with body containing `CONTENT_LENGTH_EXCEEDS_THRESHOLD`
- **THEN** the proxy SHALL remove the 2 oldest non-system messages (one user+assistant pair) from `payload.messages`
- **AND** re-convert the request via `convert_request` and retry the API call
- **AND** log a warning with the trim attempt number and remaining message count

#### Scenario: Retry succeeds on second trim
- **WHEN** the first retry still returns `CONTENT_LENGTH_EXCEEDS_THRESHOLD`
- **THEN** the proxy SHALL trim another pair of oldest messages and retry again
- **AND** continue up to `MAX_CONTEXT_TRIM_RETRIES` (3) total trim-retry cycles

#### Scenario: All retries exhausted
- **WHEN** all trim-retry attempts still result in `CONTENT_LENGTH_EXCEEDS_THRESHOLD`
- **THEN** the proxy SHALL return the original 400 error response: "Context window is full. Reduce conversation history, system prompt, or tools."

#### Scenario: Too few messages to trim
- **WHEN** the message history does not contain at least 2 removable non-system messages before the last message (i.e., cannot remove a full user+assistant pair)
- **THEN** the proxy SHALL NOT attempt trimming and SHALL return the 400 error immediately

### Requirement: System messages preserved during trimming
The proxy SHALL always preserve system messages and the current user message (last message) when trimming conversation history.

#### Scenario: System message at start of history
- **WHEN** trimming is triggered and the first message is a system-level message
- **THEN** the proxy SHALL skip the system message and trim starting from the next oldest user+assistant pair

#### Scenario: Current user message preserved
- **WHEN** trimming is triggered
- **THEN** the proxy SHALL never remove the last message in the messages array (the current user input)

### Requirement: Works for all request paths
The context-window retry logic SHALL work identically for stream, non-stream, `/v1/messages`, and `/cc/v1/messages` endpoints.

#### Scenario: Stream request retry
- **WHEN** a stream request to `/v1/messages` triggers `CONTENT_LENGTH_EXCEEDS_THRESHOLD`
- **THEN** the proxy SHALL trim and retry before any SSE data is sent to the client

#### Scenario: Non-stream request retry
- **WHEN** a non-stream request triggers `CONTENT_LENGTH_EXCEEDS_THRESHOLD`
- **THEN** the proxy SHALL trim and retry, returning the successful response as normal

#### Scenario: CC endpoint retry
- **WHEN** a request to `/cc/v1/messages` triggers `CONTENT_LENGTH_EXCEEDS_THRESHOLD`
- **THEN** the proxy SHALL trim and retry using the same logic as `/v1/messages`

