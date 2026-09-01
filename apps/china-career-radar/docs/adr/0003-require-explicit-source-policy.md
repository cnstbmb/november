# Require explicit source policy before retrieval

Every URL ingestion or scheduled collection must resolve to a dated source policy that explicitly allows the requested acquisition mode. Unknown and discovery-only sources become Pending Manual Leads without an HTTP request; robots.txt is recorded as technical evidence but never treated as legal permission. This trades collector breadth for a defensible, auditable boundary and prevents future adapters from silently expanding retrieval scope.
