# Mobile aim and incident-card containment — September 10, 2026

Tyler requested a higher default sensitivity and a fix for the top-right incident card being cut off on mobile, supplying a Brave phone screenshot showing Delayed Reaction.

Default mobile look sensitivity is now **1.5×**, up from 1×. A valid explicitly saved sensitivity still takes precedence; the .4–2× AIM slider range is unchanged. Slider initialization uses the resolved sensitivity rather than a separate hard-coded default. Desktop mouse sensitivity is unchanged.

Mobile incident cards retain their .7 scale and translucent paper. Their right inset increases from 12 to 24 pixels plus the existing safe-area inset. The header now participates in normal layout inside the card instead of floating above it. The title can shrink/wrap within its flex row. Mobile arrival uses a slight upward slide and .96→1 scale instead of the desktop's 1.35 overshoot and sharp rotation. The timer and bar remain visible. Other cards, roulette and desktop styles are unchanged.

## Checks

- Four static actual-camera captures: Delayed Reaction at 844×380, Improper Disposal at 568×320, Evidence Tampering at 844×390 and Dispatch Ready at 844×390. The visual fixture now accepts a validated incident ID. No gameplay inputs were automated.
- Sampled card-content bounds at 0/40/100/180/250/380 ms through the CSS arrival. New content stays inside the viewport with at least 30.9 px of right clearance and 13.8 px below the touch toolbar in these layouts. Applying the previous CSS in the same fixture showed the floating header reaching about .46 px into the toolbar's vertical bounds. These checks do not reproduce every possible phone/cutout configuration or establish the exact clipping seen on the user's device.
- The real mobile settings element reports a default value of 1.5 in all four fixtures. Stored-preference logic is preserved. Screenshots were visually reviewed; no real-phone sensitivity playtest was performed.
- **719 tests** pass (107 Worker, 588 client, 24 script), client workers bounded to four. Typecheck and both builds pass. Existing chunk-size warning remains.

## Preview

Client `index-ByYT60v3.js` / `index-BKhudMKH.css`, frozen under `output/mobile-aim-card-2026-09-10/client`. Metadata, source hashes, test/build logs, animation bounds and PNGs are under that output directory. All three existing private relays serve the updated client. Worker `1c91db50-d6d7-44aa-856a-364beca8aa6c`, protocol 5, remains unchanged and expires **September 10 at 12:25 PM Pacific**. No Worker/production deployment or push.

Tailscale served matching HTML/JS/CSS and all 13 WAVs. A six-second passive session received eight rats and 155 valid snapshots with zero invalid packets. Desktop/Wi-Fi HTML/JS/CSS also match; their networking was not retested in this follow-up. These are automated asset/protocol checks, not human multiplayer validation.

[Updated Tailscale preview](http://100.79.24.11:5192/?room=graybox-benchmark-match-mobile-v18&lighting=pools&revision=mobile-aim-v21). Reload to apply the new assets.
