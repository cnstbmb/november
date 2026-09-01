# Use a modular monolith for the MVP

China Career Radar will be one NestJS application with explicit module boundaries for ingestion, normalization, deduplication, filtering, analysis, notification, and feedback. This keeps the first vertical workflow deployable and observable as one unit while preserving interfaces around source adapters, analyzers, notifiers, and worker location; these boundaries do not imply separate services or containers.
