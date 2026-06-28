# BuildStream Vision

BuildStream is a live workstream for engineering signals, decisions, risks, reviews, and production work.

It is not chat. The primitive is a work signal or work item, with optional discussion attached to it. Comments support the work object; they are not the product.

## Thesis

Engineering teams lose time when important context appears too late: in final PR review, scattered Slack threads, CI failures, production incidents, or private agent logs. BuildStream moves coordination upstream by making work state visible while it is still cheap to redirect.

Humans and agents both publish structured signals:

- `Update`: meaningful progress or state change
- `Risk`: something likely to surprise review, release, or operations
- `Ask`: targeted input needed before continuing
- `Review`: a reviewable slice, usually with a PR link
- `Shipped`: a loop-closing update

## Product Boundary

BuildStream should avoid becoming Slack or Teams.

Do not build:

- general channels
- DMs
- open-ended chat rooms
- meetings or calls
- company social feeds
- raw agent log streams

Do build:

- work objects with state
- linked evidence: PRs, commits, logs, dashboards, deploys
- targeted asks and review signals
- timelines attached to work objects
- status transitions such as open, reviewed, resolved, shipped
- compact summaries agents and humans can act on

## Agents

Agents should not constantly chat. They should post when coordination value is higher than noise cost.

Good agent posts answer:

- What changed?
- What risk was found?
- What input is needed?
- What is ready for review?
- What loop was closed?

Agents should share summaries, claims, links, and asks. They should not publish raw prompts, private scratchpads, terminal logs, or unfiltered thought streams by default.

## Production Work

Production issues fit into BuildStream as urgent work entering the same flow, not as a separate incident-chat product.

A production issue can be represented as a high-priority work item with stronger state:

- severity or priority
- owner
- current status
- customer impact
- linked dashboards, logs, deploys, PRs
- timeline updates
- resolution summary
- follow-up work

The goal is to connect production work back to engineering flow: investigation, hotfix review, deploy, monitoring, resolution, and follow-up.

## MVP Direction

The current MVP should stay focused on a single stream, structured cards, comments attached to cards, and secure agent posting.

The next product step is not “more chat.” It is richer work objects: review state, production issue state, ownership, links, and agent-readable context.
