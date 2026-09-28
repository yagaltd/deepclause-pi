---
change: add-lru-core
---

# Spec Delta

## ADDED Requirements

### Requirement: Bounded capacity with LRU eviction
The cache SHALL store at most its constructed capacity of entries and SHALL evict the least recently used entry when a new key is inserted at capacity.

#### Scenario: Insert at capacity evicts the least recently used
- **WHEN** the cache holds entries at capacity and a new key is put
- **THEN** the least recently used entry is evicted and a subsequent get of it returns nothing

#### Scenario: Capacity floor rejects zero and negative
- **WHEN** the cache is constructed with a capacity below one
- **THEN** construction fails with a clear error

### Requirement: Lookup and store
The cache SHALL store values by string key and return the stored value on get, distinguishing a missing key from a stored value by returning nothing for the missing one.

#### Scenario: Get returns the stored value
- **WHEN** a value was put under a key and get is called with that key
- **THEN** the stored value is returned

#### Scenario: Get of a missing key returns nothing
- **WHEN** get is called with a key that was never put or was evicted
- **THEN** no value is returned

### Requirement: Recency updates on read
An entry SHALL become the most recently used when it is read, so eviction order tracks use rather than insertion.

#### Scenario: A read entry survives the next eviction
- **WHEN** an entry is read and then enough new keys are put to force an eviction
- **THEN** the read entry is not the one evicted
