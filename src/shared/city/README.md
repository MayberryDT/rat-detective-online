# City definitions, facts and measures

[City map](../../../docs/city-map.md) is the design document: frames, stable IDs, recorded facts, measures and layout loop. North is −z. Read it before editing layout or interpreting coordinates.

- [kit/kit.ts](kit/kit.ts) defines the reusable architectural parts; [kit/city.ts](kit/city.ts) assembles them; `kit/parts/` authors places. Parts import leaf modules, never layout, chaos or city-plan aggregators.
- [frame.ts](frame.ts), [places.ts](places.ts) and [model.ts](model.ts) define spatial vocabulary. [facts.ts](facts.ts), [ledger.ts](ledger.ts) and [measures.ts](measures.ts) define recorded evidence and its interpretation.
- Production layout also uses [grayboxLayout.ts](../grayboxLayout.ts), [cityPlan.ts](../cityPlan.ts), [sharedLayout.ts](../sharedLayout.ts) and [worldSpec.ts](../worldSpec.ts). Graybox is historical naming for shipped code.
- Server collection/storage: [CityRecorder](../../worker/city/CityRecorder.ts), [CityStore](../../worker/city/CityStore.ts), [CityArchive](../../worker/city/CityArchive.ts). Browser analysis: [map/main.ts](../../map/main.ts).

Bump [layoutVersion](../layoutVersion.ts) for any layout change and preserve stored-world compatibility. Render and collision must share the same layout truth; fixed boxes use [StaticCityBroadphase](../StaticCityBroadphase.ts). Preserve permanent aggregates and existing IDs. Gameplay changes emit their facts. Compare builds/eras, excluding agents and admin-touched rounds where appropriate.
