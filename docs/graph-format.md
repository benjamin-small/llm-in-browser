# Station graph format

Import a UTF-8 JSON file with **Import graph JSON**. Imports are processed inside the local worker by `station-core`, the same Rust importer used for the starter graph and training retrieval. A successful import starts a new conversation; a rejected import leaves the previous graph usable. The selected graph is saved in browser local storage when space permits. There are no server uploads.

```json
{
  "schemaVersion": 1,
  "datasetVersion": "my-station-1",
  "name": "My station",
  "entities": [
    {"id":"device-1","label":"Oxygen Sensor","kind":"equipment","aliases":["O2 sensor"],"properties":{"fictional":"true"}},
    {"id":"room-1","label":"North Lab","kind":"room","aliases":[],"properties":{}}
  ],
  "facts": [
    {"id":"fact-1","subject":"device-1","predicate":"located_in","object":"room-1","value":null},
    {"id":"fact-2","subject":"device-1","predicate":"status","object":null,"value":"Operational"}
  ]
}
```

Entity/fact IDs must be unique within their category, stable across exports, and contain only letters, numbers, `-`, `_`, `.`, or `:` (at most 100 ASCII characters). Every fact subject and object must reference an entity. Each fact has exactly one object entity or string value. Unknown fields and unsupported schema versions are rejected.

Labels, predicates, aliases and property values are short, nonempty strings (at most 500 UTF-8 bytes in the Rust importer). `properties` contains metadata; put answerable information in explicit facts. Properties are not silently turned into model evidence. The [JSON schema](../public/data/graph.schema.json) documents the shape; Rust additionally checks references, duplicate IDs, whitespace-only text and reserved model delimiters.

Limits: 5 MB per file, 10,000 entities, 50,000 facts, 30 aliases/properties per entity. This POC is measured on 100 entities and 500 facts, not at those maximum limits. Retrieval matches names/aliases at word boundaries, ranks predicates and lexical terms, and traverses at most two outgoing relationship hops, reaching at most 24 entities. At most eight ranked facts reach the prompt, with further trimming if necessary. Pronouns can reuse entities from the previous turn. The model may still choose the wrong fact; evidence means “supplied to the model,” not “verified citation.”

## Events

Paste an event into the composer, or use the sidebar presets:

```json
{"type":"device_alert","entityId":"device-01","payload":{"severity":"warning","message":"Temperature above range"}}
```

```json
{"type":"visitor_arrived","entityId":"room-01","payload":{"visitor":"Alex Rivera","host":"Mira Vale"}}
```

```json
{"type":"stock_low","entityId":"supply-01","payload":{"remaining":2}}
```

`device_alert` requires an equipment entity; `visitor_arrived` requires a room; `stock_low` requires a supply. Payload fields must match the examples exactly. `remaining` is a nonnegative integer; other values are short strings. Events add temporary context and produce text. They do not send notifications, order supplies, operate equipment, or persist graph changes.

Try a missing fact: “What is the Oxygen Sensor's insurance policy number?” Try an ambiguous name: “Where is Morgan?” Try an unsupported event: `{"type":"reboot_system","entityId":"device-01","payload":{}}`. Unknown event types are identified in the context supplied to the model; the model's wording is evaluated separately.
