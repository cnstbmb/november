# China Career Radar

China Career Radar is a private family career-opportunity context for finding lawful employment paths in China. Its language separates source facts, candidate-specific assessment, and user decisions so that uncertain legal or relocation claims are never presented as facts.

## Opportunities

**Job Lead**:
A source-specific observation that may describe an employment opportunity but has not yet been normalized or accepted as a distinct vacancy.
_Avoid_: Scrape, listing payload

**Job**:
The canonical vacancy assembled from one or more job leads and tracked across content changes.
_Avoid_: Raw job, posting payload

**Job Version**:
An immutable content state of a job that requires fresh candidate-specific assessment when materially changed.
_Avoid_: Edit, snapshot

**Possible Duplicate**:
A job whose text resembles another job but lacks a deterministic identity match. It remains distinct until reviewed rather than being merged automatically.
_Avoid_: Duplicate, merged job

**Raw Snapshot**:
The bounded source content retained as evidence for one unique job version. Re-observing unchanged content does not create another raw snapshot.
_Avoid_: Log payload, job

**Pending Manual Lead**:
A URL retained for human review because its source policy does not explicitly permit the service to retrieve it.
_Avoid_: Failed import, blocked job

**Candidate Track**:
An employment direction under which a job is classified, such as software engineering, Russian-language education, administrative support, or the legally sensitive English-teaching watchlist. A job has one primary track and may belong to additional tracks.
_Avoid_: Persona, category

**Watchlist**:
A candidate track whose jobs are retained for review but require additional caution and are not treated as ordinary matches.
_Avoid_: Match list

**Administrative Support**:
A `lanok` candidate track covering secretary, personal or executive assistant, office management, school administration, international department coordination, and project or operations coordination. It excludes unrelated sales, finance, HR leadership, and specialist management roles unless the vacancy independently matches the profile.
_Avoid_: Generic manager, any office job

## People and assessment

**Candidate Profile**:
A versioned description of one family member's qualifications, constraints, and search preferences. The canonical profile identifiers are `cnstbmb` and `lanok`.
_Avoid_: User, account, resume

**Candidate Profile Version**:
An immutable state of a candidate profile used to make a job analysis reproducible. A semantic profile change creates a new version rather than rewriting prior analysis context.
_Avoid_: Profile edit, current user

**Job Analysis**:
A validated, candidate-specific assessment of one job version that separates evidence, inferences, fit, and risks.
_Avoid_: Legal decision, recommendation

**Analysis Verdict**:
The score-aligned assessment tier: `reject` below 40, `watch` from 40 to 59, `review` from 60 to 79, and `high_match` from 80. Unknown Work Permit support caps the effective verdict at `review`, while explicit refusal to support lawful employment causes rejection; a model response that violates these rules is invalid.
_Avoid_: Free-form verdict, hard-filter result

**Legal Risk**:
An uncertainty or conflict affecting lawful employment or Work Permit eligibility that requires verification and is never itself a legal conclusion.
_Avoid_: Illegal job, legal verdict

**Work Permit Evidence**:
An explicit statement in the job content about sponsorship or lawful employment support. General interest in foreign candidates is not Work Permit evidence.
_Avoid_: Visa assumption, foreigners welcome

**Family Opportunity Bundle**:
A future city-centered view combining a strong opportunity for one candidate with prospects for the other candidate and family relocation factors.
_Avoid_: Joint application, family job

**Salary Floor**:
A candidate-specific preferred minimum monthly gross salary: 30,000 CNY for `cnstbmb` and 20,000 CNY for `lanok`. It is a soft assessment boundary because housing, schooling, relocation, and extra salary months may compensate for lower cash pay.
_Avoid_: Hard salary requirement, family income

**Relocation Window**:
The family's preferred but non-binding period for moving, currently June through August 2027. A strong opportunity may justify a different date.
_Avoid_: Deadline, availability date

## Sources and operation

**Source**:
An origin from which job leads may be discovered or supplied, governed by an explicit source policy.
_Avoid_: Website, scraper

**Source Policy**:
A dated declaration of allowed acquisition modes, operational limits, and unresolved permission questions for a source. A robots.txt rule alone is not permission to aggregate content.
_Avoid_: Scraping config, robots permission

**Worker Location**:
The declared execution location of a source run: `local`, `dc`, or `home`. The DC remains sufficient for all MVP behavior.
_Avoid_: Proxy, bypass location

**Primary Market**:
Mainland China, whose employment opportunities form the normal relocation feed. Hong Kong and Macau use separate employment regimes and remain watchlist regions; Taiwan is outside the MVP market.
_Avoid_: Greater China

## User decisions

**Feedback**:
The current candidate-specific disposition of a job: interested, dismissed, or applied. Repeated input changes the existing disposition rather than creating another current state.
_Avoid_: Rating, event log

**Application**:
The candidate-specific record of pursuing a job. At most one current application exists for a candidate and job, and repeated submission feedback updates that record.
_Avoid_: Feedback, job analysis

**Application Status**:
The current stage of an application: `submitted`, `interview`, `offer`, `rejected`, `withdrawn`, or `closed`.
_Avoid_: Feedback state, analysis verdict

**Closed Job**:
A job known to be unavailable for both candidates. Closing is global and does not mean that one candidate merely dismissed it.
_Avoid_: Hidden job, dismissed job
