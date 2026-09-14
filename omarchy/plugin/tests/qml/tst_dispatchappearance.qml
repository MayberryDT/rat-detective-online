import QtQuick
import QtTest
import qs.Commons
import "../../components" as Dispatch

TestCase {
  id: testCase
  name: "DispatchAppearance"

  property var subject: null

  Component {
    id: appearanceComponent
    Dispatch.DispatchAppearance { }
  }

  function init() {
    Color.foreground = "#e8e8e8"
    Color.background = "#101010"
    Color.accent = "#5ea1ff"
    Color.urgent = "#d84f4f"
    Color.muted = "#929292"
    Color.popups.background = "#151515"
    Color.popups.text = "#eeeeee"
    Color.popups.border = "#626262"
    Style.font.family = "Dispatch Test Mono"
    subject = createTemporaryObject(appearanceComponent, testCase)
    verify(subject !== null)
  }

  function cleanup() {
    subject = null
  }

  function colorString(value) {
    return String(value).toLowerCase()
  }

  function relativeLuminance(value) {
    function channel(n) {
      return n <= 0.04045 ? n / 12.92 : Math.pow((n + 0.055) / 1.055, 2.4)
    }
    return 0.2126 * channel(value.r) + 0.7152 * channel(value.g) + 0.0722 * channel(value.b)
  }

  function contrastRatio(a, b) {
    var first = relativeLuminance(a)
    var second = relativeLuminance(b)
    var lighter = Math.max(first, second)
    var darker = Math.min(first, second)
    return (lighter + 0.05) / (darker + 0.05)
  }

  function test_defaultsToLiveOmarchyRoles() {
    compare(subject.mode, "Omarchy")
    compare(subject.branded, false)
    compare(colorString(subject.background), colorString(Color.popups.background))
    compare(colorString(subject.text), colorString(Color.popups.text))
    compare(colorString(subject.accent), colorString(Color.accent))
    compare(colorString(subject.border), colorString(Color.popups.border))
    compare(subject.bodyFont, Style.font.family)
    compare(subject.displayFont, Style.font.family)
  }

  function test_liveThemeMutationAndRepresentativeContrast() {
    Color.popups.background = "#0f1420"
    Color.popups.text = "#edf2f7"
    Color.popups.border = "#52759d"
    Color.accent = "#72a7df"
    compare(colorString(subject.background), "#0f1420")
    compare(colorString(subject.text), "#edf2f7")
    compare(colorString(subject.accent), "#72a7df")
    verify(contrastRatio(subject.text, subject.background) >= 4.5)

    Color.popups.background = "#f5f1e8"
    Color.popups.text = "#201d19"
    Color.popups.border = "#705f49"
    Color.accent = "#73521d"
    compare(colorString(subject.background), "#f5f1e8")
    compare(colorString(subject.text), "#201d19")
    compare(colorString(subject.accent), "#73521d")
    verify(contrastRatio(subject.text, subject.background) >= 4.5)
  }

  function test_brandedPaletteIsStableThenSwitchesBackToLatestTheme() {
    subject.mode = "Rat Detective"
    compare(subject.branded, true)
    compare(colorString(subject.background), "#100919")
    compare(colorString(subject.text), "#ded0dc")
    compare(colorString(subject.accent), "#d4bd78")
    verify(contrastRatio(subject.text, subject.background) >= 4.5)

    Color.popups.background = "#faf8f2"
    Color.popups.text = "#171512"
    Color.accent = "#654c1d"
    compare(colorString(subject.background), "#100919")
    compare(colorString(subject.text), "#ded0dc")

    subject.mode = "Omarchy"
    compare(subject.branded, false)
    compare(colorString(subject.background), "#faf8f2")
    compare(colorString(subject.text), "#171512")
    compare(colorString(subject.accent), "#654c1d")
  }

  function test_mutedTextRemainsReadableInDarkAndLightThemes() {
    Color.popups.background = "#1a1b26"
    Color.popups.text = "#a9b1d6"
    Color.muted = "#414868"
    verify(contrastRatio(subject.muted, subject.background) >= 4.5)
    Color.popups.background = "#f5f1e8"
    Color.popups.text = "#201d19"
    Color.muted = "#cccccc"
    verify(contrastRatio(subject.muted, subject.background) >= 4.5)
  }

  function test_unknownModeFallsBackToOmarchy() {
    subject.mode = "future-value"
    compare(subject.branded, false)
    compare(colorString(subject.background), colorString(Color.popups.background))
    compare(colorString(subject.text), colorString(Color.popups.text))
  }

  function test_brandedModeLoadsBundledFonts() {
    subject.mode = "Rat Detective"
    tryVerify(function() { return subject.displayFont !== Style.font.family }, 2000)
    tryVerify(function() { return subject.bodyFont !== Style.font.family }, 2000)
    verify(subject.displayFont.length > 0)
    verify(subject.bodyFont.length > 0)
  }
}
