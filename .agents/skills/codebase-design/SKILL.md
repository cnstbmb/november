---
name: codebase-design
description: Shared vocabulary for designing deep modules. Use when the user wants to design or improve a module's interface, find deepening opportunities, decide where a seam goes, make code more testable or AI-navigable.
---

# Codebase Design

Design **deep modules**: a lot of behaviour behind a small interface, placed at a clean seam, testable through that interface.

## Glossary

- **Module** — anything with an interface and an implementation (function, class, package)
- **Interface** — everything a caller must know to use the module correctly
- **Implementation** — what's inside a module
- **Depth** — leverage at the interface: amount of behaviour per unit of interface
- **Seam** — a place where you can alter behaviour without editing in that place
- **Adapter** — concrete thing satisfying an interface at a seam
- **Leverage** — what callers get from depth
- **Locality** — what maintainers get: change in one place

## Deep vs shallow

**Deep** = small interface + lots of implementation behind it.
**Shallow** = large interface + little implementation (pass-through). Avoid.

## Principles

- Depth is a property of the interface, not the implementation
- **The deletion test**: if you delete the module, does complexity vanish or spread?
- The interface is the test surface
- One adapter = hypothetical seam. Two adapters = real one.

## Designing for testability

1. Accept dependencies, don't create them
2. Return results, don't produce side effects
3. Small surface area = fewer tests needed
