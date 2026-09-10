# Full 24-rat lobby preview — September 10, 2026

Superseded by the [16-rat desktop preview](sixteen-rat-tuning-2026-09-10.md). The phone relays were stopped and the private Worker/client advanced to protocol 7; this receipt retains the earlier 24-rat measurements.

At the user's request, deployed the current network fixes to the authenticated private capacity Worker and started desktop/Wi-Fi/Tailscale relays. Production remains unchanged. This supersedes the earlier protocol-5 mobile preview on ports 5190–5192.

- [Desktop](http://127.0.0.1:5190/?room=graybox-benchmark-ai-full-lobby-v19&diagnostics=quiet&lighting=pools)
- [Phone over Tailscale](http://100.79.24.11:5192/?room=graybox-benchmark-ai-full-lobby-v19&lighting=pools)
- [Phone on the same Wi-Fi](http://10.129.181.26:5191/?room=graybox-benchmark-ai-full-lobby-v19&lighting=pools)

All three join the same fixed private room, `graybox-benchmark-ai-full-lobby-v19`. It starts with **24 server-owned bots**, yields one bot slot for each joining human, and refills vacancies after the existing ten-second grace. Total cap stays **24**, sockets **32**, snapshot window **8**. Bots remain active with no human connected until expiry. This is an explicit private fixture option; application/public population policies are unchanged.

Worker `rat-detective-capacity-test`, version **`ca922117-7fc4-4a97-a603-5a54f44e3787`**, protocol **6**, expires **September 10 at 2:57 PM Pacific / 21:57 UTC**. Frozen client `index-7qTByXE_.js`, SHA-256 `209ee5af7b5726baf671832c708e3a0b91be86c51dfeba957fbc2773011b5ff6`. Deployment/source receipt: `output/hosted-capacity-deployment-2026-09-10T17-57-33-344Z/deployment.json`.

## Verified on the hosted room

| Stage | Bots | Humans | Total |
| --- | ---: | ---: | ---: |
| Before any join | 24 | 0 | 24 |
| First joined client | 23 | 1 | 24 |
| Second joined client | 22 | 2 | 24 |
| Second client leaves, after refill | 23 | 1 | 24 |
| Both clients leave, after refill | 24 | 0 | 24 |

The first client received exactly one existing-bot leave event when the second joined. Both test clients disconnected; the final readiness check found **24 bots and zero humans**. Received **400 valid snapshots**, zero invalid packets/errors, peak 170 projectiles during this short passive check. This verifies admission/replacement/refill and protocol readiness, not human gameplay feel or a sustained 24-bot performance guarantee.

Desktop, Wi-Fi and Tailscale routes all served JavaScript matching the frozen client exactly. Production build passed; **25 script tests passed**, including fixture isolation, opt-in full-cap validation and expiry. No application source change or browser/input automation was needed for this preview. Prior application validation and network measurements remain in [the network-fixes receipt](network-fixes-2026-09-10.md).

Reproduce this private setup with:

```sh
npm run build
node scripts/prepare-hosted-capacity.mjs --deploy --minutes=240 --window=8 --bots=24 --cap=24 --full-lobby
```

`--full-lobby` requires a hosted fixture with bot count equal to cap. It changes only the copied Worker: full bot backfill, zero-human simulation, round reset roster size and an authenticated `/lobby-status` check. The existing join/removal logic performs the replacement. Default fixed-roster benchmarks and normal matchmaking source retain their policies. Hosted expiry bounds the otherwise continuously active private bots.

Readiness results and the bounded protocol probe are in `output/full-lobby-preview-2026-09-10/`. Relay units are `rat-detective-full-lobby-preview.service`, `rat-detective-full-lobby-wifi.service` and `rat-detective-full-lobby-tailnet.service`; all stop at receipt expiry. The prior mobile/Tab relay units were stopped when these matching protocol-6 relays replaced them.
