# Worker authority and room lifecycle

[Code map](../../docs/code-map.md) · [Live service](../../docs/live-service.md) · [Server authority](../../docs/server-authority.md)

[index.ts](index.ts) routes HTTP, WebSocket admission and city/admin APIs. [GameRoom.ts](GameRoom.ts) is the Durable Object that owns seats, reconnect, the authoritative tick, mode lifecycle and persisted state. [Matchmaker.ts](Matchmaker.ts) handles overflow; public joins go straight to the canonical room.

| Concern | Follow |
| --- | --- |
| Join/reconnect/hibernation | GameRoom → [gameState.ts](gameState.ts), [ConnectionDelivery.ts](ConnectionDelivery.ts), shared reconnect/protocol |
| Bots | [ServerBotController.ts](ServerBotController.ts) → shared bot motor/body; [Jev guide](bots/README.md) |
| Snapshot delivery | [ChaosDelivery.ts](ChaosDelivery.ts), [serializeServerMessage.ts](serializeServerMessage.ts), shared wire modules |
| Facts and storage | [city/CityRecorder.ts](city/CityRecorder.ts) → [city/CityStore.ts](city/CityStore.ts), archive and APIs |
| Results/highlights | [RoundAwards.ts](RoundAwards.ts), [HighlightDetector.ts](HighlightDetector.ts) |
| Admin/security | [adminApi.ts](adminApi.ts), [auth.ts](auth.ts), [validation.ts](validation.ts) |

An empty room never starts from status/title/admin access. `humanSlots()` is the lifecycle boundary, including admitted seats and reconnect grace. Preserve its no-tick/no-bots/no-alarm/no-continuing-writes contract. Keep private credentials out of public state and logs. Packed aggregate rollback requires the live-service drain procedure; do not improvise a namespace reset.

[Scripts guide](../../scripts/README.md): idle-room and connection-recovery checks exercise local authority as bounded fixtures. Hosted entry/reconnect checks use matching client/server; browser input automation requires a request.
