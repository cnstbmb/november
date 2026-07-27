---
name: teach
description: Teach the user a new skill or concept over multiple sessions, using the current directory as a stateful teaching workspace. Use when user says "teach me", "I want to learn", or wants interactive lessons.
---

The user has asked you to teach them something. This is a stateful request - they intend to learn the topic over multiple sessions.

## Teaching Workspace

Treat the current directory as a teaching workspace. The state of their learning is captured in this directory in several files:

- `MISSION.md`: A document capturing the _reason_ the user is interested in the topic.
- `./reference/*.html`: A directory of reference materials — cheat sheets, reference algorithms, syntax, glossaries.
- `RESOURCES.md`: A list of high-quality, high-trust resources.
- `./learning-records/*.md`: What the user has learned — non-obvious lessons and key insights.
- `./lessons/*.html`: Self-contained HTML lessons. Primary unit of teaching.
- `./assets/*`: Reusable components shared across lessons.
- `NOTES.md`: Scratchpad for user preferences.

## Philosophy

Three things needed for deep learning:

- **Knowledge**, captured from high-quality, high-trust resources
- **Skills**, acquired through highly-relevant interactive lessons
- **Wisdom**, from interacting with other learners and practitioners

Before `RESOURCES.md` is well-populated, focus on finding high-quality resources. Never trust your parametric knowledge.

### Fluency vs Storage Strength

- **Fluency strength**: in-the-moment retrieval
- **Storage strength**: long-term retention (the real goal)

Design lessons for storage strength through desirable difficulty: retrieval practice, spacing, interleaving.

## Lessons

Each lesson is one self-contained HTML file, saved to `./lessons/` with numbered titles. A lesson should be short, completable quickly, and give the user a single tangible win. Each lesson should:

- Be beautiful — clean typography and layout
- Link via HTML anchors to other lessons and reference documents
- Recommend a primary source for further reading
- Contain a reminder to ask followup questions

## Assets

Build from reusable components stored in `./assets/`. A shared stylesheet is the first component every workspace earns.

## The Mission

Every lesson should tie into the mission. If `MISSION.md` is not populated, question the user on why they want to learn this first.

## Zone Of Proximal Development

Figure out the right next thing to teach by reading learning-records and understanding the mission. The user should always feel challenged "just enough".

## Knowledge gathering

Use `RESOURCES.md` to track trusted resources. Lessons should be littered with citations.

## Skills practice

Use interactive lessons with quizzes and light in-browser tasks. Each should be based on a tight feedback loop.

## Wisdom

When the user asks a question requiring wisdom, attempt to answer but ultimately delegate to a community (forum, subreddit, real-world class).

## Reference Documents

Create reference documents alongside lessons — compressed essence of lessons, designed for quick reference.
