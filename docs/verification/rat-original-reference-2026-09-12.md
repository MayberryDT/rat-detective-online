# Original model reference comparison — September 12, 2026

Tyler still preferred the original after the sleeve iterations. A clarification was requested about original arms versus the entire original rat; no answer had arrived during implementation. The workshop now defaults to **New outfit · original arms**, with **Original rat** and **Latest sleeves** available in the MODEL selector. This is a reversible reference comparison, not approval of a final candidate or a production model replacement.

## Reference and behavior

- `test/visual/reference/OriginalRatModel.ts` and `OriginalCaseGrip.ts` copy accepted release **8cd0ec2**. Apart from a provenance comment and relocated imports, both files match that release exactly; verified by normalized source comparison. They are visual-fixture imports, not production assets.
- Original rat: release geometry with the currently selected hat/coat/fur colors. Original trim is fixed; highlight swatches are disabled. The displayed 256 reflects the comparison's 8×8×4 current color pool, not a reduction of the new outfit's 1,024 assignments or an inventory of the original game's palettes.
- New outfit · original arms: current tailoring and palette, with the exact original pistol/arm assembly and original case arm. Original arm materials retain their coat/skin roles. The UI explains that cuffs no longer share the new outfit highlight in this reference mode. The original small paw shapes are included faithfully.
- Latest sleeves: the preceding study05 straight sleeve model for comparison.
- Existing case/empty/no-sleeve, walk/fire, local/opponent, armor and city-view controls remain. Empty-pose positioning for original arms is a comparison fixture, not a pose present in the released game.
- A per-instance optional model factory in RatEntity/RatController lets the fixture reuse real materials, animation, outline, camera and disposal. Default gameplay construction still uses the current source model; reference imports remain confined to the visual build.

[Workshop comparison](http://127.0.0.1:5196/model-preview.html?model=original-arms&hand=case&view=three-quarter). URL `model=original|original-arms|latest` preserves the choice. Existing comparison links without `model` start with original arms on the new outfit.

## Validation and scope

**945 tests** passed: 137 Worker, 781 client and 27 scripts. Typecheck and app/visual builds passed (existing chunk advisory); `git diff --check` clean. Added real-reference tests for original/hybrid in local and opponent rendering, carry alignment throughout movement/turns, borrowed silver materials, mode changes and cleanup. Browser inspected original and hybrid under the same camera/light. Evidence: `output/original-model-reference-2026-09-12/`.

No production or private Worker deployment, commit, or automated gameplay input testing was performed for this reference pass. The existing r5 frozen private gameplay preview remains study05; it does not show the new original-arm/reference choices. Final model selection and translating a selected reference into the shared gameplay model remain open. Prior context: GBrain `brain:sessions/2026/09/rat-detective-floating-sleeves-2026-09-12`.

## Workshop availability follow-up

After the temporary Vite process stopped, port5196 was restored with the transient
user service `rat-detective-outfit-studio.service` (Restart=on-failure). It runs
Vite with the visual config on loopback5196, independently of the agent terminal.
Verified service active and workshop HTTP200. This transient service is not
installed for boot persistence. Inspect its status before starting another
server; stop it with `systemctl --user stop rat-detective-outfit-studio.service`.

## Subsequent direction

Tyler then explicitly selected the new gun sleeve, shortened and rotating at
its shoulder, with the original equipped case arm. This resolves the ambiguity
above. `model=latest` is now the default; both original references remain.
See the [subsequent receipt](rat-shoulder-sleeve-2026-09-12.md).
