---
change: add-peek
---

# Spec Delta

## ADDED Requirements

### Requirement: Non-mutating peek
The cache SHALL offer peek, which returns the stored value for a key without updating recency, and returns nothing for a missing key.

#### Scenario: Peek returns the value without refreshing recency
- **WHEN** the least recently used entry is peeked and then a new key is put at capacity
- **THEN** the peeked entry is the one evicted, not some other entry

#### Scenario: Peek of a missing key returns nothing
- **WHEN** peek is called with a key that is not stored
- **THEN** no value is returned and no error is raised
