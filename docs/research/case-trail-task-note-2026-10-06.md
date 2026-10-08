# Case-clue research task note — 6 October 2026

> **Historical constraints superseded, 7 October 2026:** Tyler subsequently required multiple paper trails leading to the case at every spawn, with no visibility through buildings. The historical-travel-only rule, three-cluster limit and prohibition on generated routes below no longer govern P4. The [current implementation plan](../plans/noir-physical-clues.md) records the endorsed natural-paper direction and pending work; preserve this note as the October 6 research history.

Tyler chose the information rule: physical clues on the map, all with the hot case’s bright red outline. No arrows, direct-to-case cues, route marks or camera guidance. Previous A/C/D and exact-position guidance recommendations are superseded. Combat and player agency stay central; research/design only.

Current report: physical-case-clues-2026-10-06.md. Six alternatives, one chosen language at a time:

- **Dropped case files:** real carrier movement sheds cream folders/pages. Fresh versus rumpled paper and matching evidence stamps let players follow the paperwork. Strongest fit: the current briefcase already has papers and an EVIDENCE tag.
- **Wet paw prints:** real grounded steps leave wet then drying patches. Players follow the actual track, with breaks through flights and teleports. Good runner-up; replace existing heat prints, never add another layer. Anatomical toe direction can be omitted if Tyler considers it too pointer-like.
- **Cheese crumbs:** a few chunky heaps shed from the case; nearby spills help discover a stationary case. Fresh versus crushed pieces suggest continuation. Immediate rat joke, but could be mistaken for bullets/ammo/pickups.
- **Torn photographs:** pictures of recognizable city doors/signs form at most a two-hop physical landmark chain around a loose case. Optional map recognition; less useful for a moving case and more likely to become a slow clue hunt.
- **Cigar ends and ash:** the case sheds cigar/ash clusters at actual turns, doorways and pauses. Intact versus crushed ash marks recent activity. Strong noir flavor, weaker continuity and small-object readability.
- **Witness notes:** a couple of short physical notes name places where the case was actually seen. Players choose their route; no new witness NPCs or floating text. Charming optional gossip, but reading risks interrupting combat.

Recommendation: compare **files versus wet prints**, using the same real trace/freshness rules so the comparison tests the clue identity. Files first. Bright red stays steady; use physical occlusion and tight local caps (three clusters, at most two pieces per cluster; prints four pairs). No clue collection/use key/inspection lock, no rewards for visiting clues, and no nearest-case fallback. Older clues remain briefly across handoffs; drop leaves a spill; case relocation clears old evidence; player respawn does not reset shared evidence. Bots see/read the same nearby visible clues and cannot retain privileged global ping/current-carrier tracking. No hidden future clue list.

Important limit: this intentionally gives up always-visible guidance. Gaps may cause searching. Seed only a small local spill near a stationary/new loose case; never synthesize an arrow-free shortest-path trail in front of players. Test whether evidence brings people back into the fight without distracting them from rats/cheese balls.

Descriptions in the report are game-art-grounded static mock specifications, not rendered/implemented screenshots. Existing cream paper/EVIDENCE case art and current HeatPrints code inspected from exact production2822d1a/protocol33 archive on Halla. The fresh public-reference ledger remains in case-trail-directions-2026-10-06.md; it grounds general contrast/motion constraints, not efficacy of the new ideas. Preserve packed2476135 storage and accepted weapon/aim/trap ancestry. No gameplay implementation, build, deploy, production room or new service.

Own GPT-6.1-Sol Medium confirmed in continued-turn metadata and footer; no other workers/tabs/accounts/defaults changed. Reports/task note copied to Veelox canonical docs/research. Ready for owner choice of clue identity; no implementation started.
