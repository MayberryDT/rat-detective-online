import QtQuick
import qs.Commons

Rectangle {
  id: root
  property string stateName: "loading"
  property color foreground: Color.foreground
  property color muted: Color.muted
  property color accent: Color.accent
  property color urgent: Color.urgent
  property string fontFamily: Style.font.family
  readonly property string label: stateName === "live" ? "LIVE"
    : stateName === "empty" ? "QUIET"
    : stateName === "stale" ? "STALE"
    : stateName === "unavailable" ? "OFFLINE" : "CONNECTING"
  readonly property color badgeColor: stateName === "live" ? accent
    : stateName === "stale" || stateName === "unavailable" ? urgent : muted
  implicitWidth: badge.implicitWidth + Style.space(12)
  implicitHeight: badge.implicitHeight + Style.space(5)
  radius: Style.cornerRadius
  color: Qt.rgba(badgeColor.r, badgeColor.g, badgeColor.b, 0.13)
  border.color: Qt.rgba(badgeColor.r, badgeColor.g, badgeColor.b, 0.60)
  border.width: 1
  Text {
    id: badge
    anchors.centerIn: parent
    textFormat: Text.PlainText
    text: root.label
    color: root.badgeColor
    font.family: root.fontFamily
    font.pixelSize: Style.font.caption
    font.bold: true
    font.letterSpacing: 1
  }
}
