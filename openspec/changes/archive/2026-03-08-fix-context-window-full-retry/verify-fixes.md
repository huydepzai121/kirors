## [2026-03-08] Round 1 (from spx-apply auto-verify)

### spx-verifier
- Fixed: `trim_oldest_messages` now skips leading system-role messages (index scan via `position(|m| m.role != "system")`) before draining, satisfying spec requirement "skip system message and trim starting from next oldest pair"

### spx-arch-verifier
- Fixed: `total_messages_trimmed` log now uses accumulated `total_trimmed` counter instead of `attempt * 2`, correctly reflecting actual removed count when `trim_oldest_messages` returns 1

## [2026-03-08] Round 2 (from spx-apply auto-verify)

### spx-arch-verifier
- Fixed: `trim_oldest_messages` now requires `max_removable >= 2` before trimming, ensuring a full user+assistant pair is always removed per cycle (no partial-pair trims that waste retry slots)
- Fixed: Per-attempt warn log now includes `total_trimmed` field for self-contained log entries
- Skipped (style preference): English comments/logs in new functions — design doc and spec are English, new code is a self-contained section
- Skipped (over-engineering): SRP extraction of `prepare_kiro_request` — retry loop is the function's purpose, extraction adds indirection without testability gain
