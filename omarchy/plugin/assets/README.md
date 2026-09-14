# Rat Detective plugin assets

- `badge.webp` is an unmodified copy of the current Rat Detective game badge
  (`public/logo-title.webp`). `icon.png` at the plugin root is the same current
  badge artwork exported from `public/logo.png` for launchers that require PNG.
  Both are original Rat Detective project artwork and are distributed under the
  plugin's MIT license.
- `rat-detective-symbolic.svg` implements Tyler's selected option A: an angular
  right-facing rat profile with a tilted fedora, large ear and coat collar. It is
  a clean SVG interpretation of the selected generated concept, without its
  option label or background. The shell tints it with the native bar color.
  It is distributed under the plugin's MIT license.
- `fonts/Bangers-Regular.ttf` is the unmodified Bangers font from the game's
  copy of the [Google Fonts Bangers distribution](https://github.com/google/fonts/tree/main/ofl/bangers).
  It is licensed under SIL Open Font License 1.1; see `fonts/Bangers-OFL.txt`.
- `fonts/Outfit-Regular.ttf` and `fonts/Outfit-Bold.ttf` are unmodified static
  fonts from [the official Outfit repository](https://github.com/Outfitio/Outfit-Fonts).
  They are licensed under SIL Open Font License 1.1; see `fonts/Outfit-OFL.txt`.

The font files are bundled so the Rat Detective appearance never downloads a
font at runtime. Omarchy appearance continues to use the shell's current font.
