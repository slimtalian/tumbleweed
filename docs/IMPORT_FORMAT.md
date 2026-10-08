# Import format

Markdown is the simplest starting point. Each selected file becomes a record
with its complete original text and a source locator containing its relative path.
The first level-one heading supplies its title, falling back to the filename.
Inline hashtags, and basic one-line `tags: [...]` and `aliases: [...]` frontmatter,
are recognized. Other frontmatter stays in the original text.

Graph import accepts a JSON object with `schema_version: "1.0"` and three arrays:

- `records`: objects with unique string `id`, string `title`, and
  `sensitivity: "general"`. Optional fields include `kind`, `summary`, `topics`,
  `coverage`, `source_ids`, `claims`, `dates`, and `messages`.
- `sources`: objects with unique string `id`, string `title`, and
  `sensitivity: "general"`. Optional fields include `locator`, `verified_url`
  and `coverage`.
- `edges`: objects with unique string `id`, `from` and `to` record IDs,
  string `relation`, optional string `rationale`, and a `basis` of `explicit`
  or `inferred` (the default). Optional `source_ids` must resolve.

Topics and source IDs are arrays of strings. Claims are objects with string
`text`, string `status`, and optional `source_ids`. Messages require string
`role` and `text`, and can have a string `timestamp`.

Source references and relationship endpoints must exist in the same graph.
Unknown original fields are retained. Mark content as general only after
reviewing what you intend to import; this flag is not an automated classifier.

Use the same namespace when updating the same input collection. Conflicting
records require review. Omitted records are retained. Local display notes are
preserved during accepted updates. An import can be undone when it would not
erase newer edits or break later connections.

Graph imports are limited to 24 MB per request and 10,000 items in each array.
The browser limits selected Markdown/ZIP input to 16 MB; individual notes are
limited to two million characters. ZIPs are inspected in memory, not extracted
to disk. Ambiguous and missing note links remain listed in import metadata.
