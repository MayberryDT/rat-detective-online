import QtQuick
import qs.Commons

// One semantic palette for the Dispatch panel. Omarchy remains the default and
// binds directly to the live shell roles, so changing the user's theme updates
// an open panel without a plugin or shell restart.
Item {
  id: root

  property string mode: "Omarchy"

  readonly property bool branded: mode === "Rat Detective"

  readonly property color background: branded ? "#100919" : Color.popups.background
  readonly property color surface: branded ? "#1a1022" : Color.popups.background
  readonly property color surfaceRaised: branded ? "#24172e" : Style.normalFillFor(Color.popups.text, Color.accent, Color.urgent)
  readonly property color text: branded ? "#ded0dc" : Color.popups.text
  readonly property color muted: branded ? "#b4a0be" : readableMuted(Color.muted, text, background)
  readonly property color accent: branded ? "#d4bd78" : Color.accent
  readonly property color border: branded ? "#52395e" : Color.popups.border
  readonly property color urgent: branded ? "#e16f68" : Color.urgent
  readonly property color success: branded ? "#8fb89c" : Color.accent

  readonly property string bodyFont: branded && outfitFont.status === FontLoader.Ready && outfitFont.name.length > 0
    ? outfitFont.name
    : Style.font.family
  readonly property string displayFont: branded && bangersFont.status === FontLoader.Ready && bangersFont.name.length > 0
    ? bangersFont.name
    : Style.font.family

  // Preserve the native muted role when readable. Some dark themes use their
  // terminal black for it; choose a quiet text blend when it fails body contrast.
  function luminance(c) {
    function channel(v) { return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4) }
    return .2126 * channel(c.r) + .7152 * channel(c.g) + .0722 * channel(c.b)
  }
  function contrast(a, b) {
    var x = luminance(a), y = luminance(b)
    return (Math.max(x, y) + .05) / (Math.min(x, y) + .05)
  }
  function readableMuted(candidate, foreground, backdrop) {
    if (contrast(candidate, backdrop) >= 4.5) return candidate
    for (var amount = .65; amount <= 1; amount += .05) {
      var mixed = Qt.rgba(foreground.r * amount + backdrop.r * (1 - amount), foreground.g * amount + backdrop.g * (1 - amount), foreground.b * amount + backdrop.b * (1 - amount), 1)
      if (contrast(mixed, backdrop) >= 4.5) return mixed
    }
    return foreground
  }

  FontLoader {
    id: bangersFont
    source: "../assets/fonts/Bangers-Regular.ttf"
  }

  FontLoader { source: "../assets/fonts/Outfit-Bold.ttf" }

  FontLoader {
    id: outfitFont
    source: "../assets/fonts/Outfit-Regular.ttf"
  }
}
