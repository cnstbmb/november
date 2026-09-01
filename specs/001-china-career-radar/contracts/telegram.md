# Telegram Contract

## Authorization

- Reject before command parsing unless `from.id` is mapped to at least one candidate profile.
- Reject unless `chat.id` is allowlisted as a destination/control chat.
- A callback embeds a signed/validated action, candidate ID, and job ID; the actor must be authorized for that candidate.

## Commands

- `/start`, `/help` — private usage and safety help.
- `/add <url>` — policy decision; unknown/discovery-only becomes Pending Manual Lead.
- `/addtext` — begins a per-user/per-chat state with expiry; the next bounded concrete vacancy is ingested. A text that is recognizably a search brief is rejected with an explanation that this command does not run discovery.
- `/latest` — latest `watch`, `review`, and `high_match` results visible to the actor.
- `/stats` — sanitized aggregate run/job/delivery counts.
- `/profile` — sanitized profile summary; no personal identifiers.
- `/sources` — human-readable status of manual, fixture, discovery-only, and live acquisition modes; it explicitly states whether automatic search is enabled.

## Card

A card contains candidate, updated/new marker, score/verdict, title, company, city, available salary, 2–4 reasons, major risks, visa/Work Permit status, human-readable source provenance, internal job ID, canonical link, publication date, and first-seen date.

Buttons:

```text
interest:<candidateId>:<jobId>
dismiss:<candidateId>:<jobId>
applied:<candidateId>:<jobId>
closed:<candidateId>:<jobId>
```

Callbacks are acknowledged promptly and update one current state. The card text and keyboard visibly reflect the selected feedback. `closed` changes the canonical Job globally and removes its controls.
