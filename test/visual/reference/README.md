# Release geometry references

OriginalRatModel.ts and OriginalCaseGrip.ts are copied from accepted release
8cd0ec2. Only import paths and a provenance comment differ. Keep these immutable
as comparison sources. OriginalArmsOutfit.ts composes the old arm with the current
outfit and owns disposal of discarded meshes/materials. These files are imported
by the separate visual workshop, never by production entry points.
