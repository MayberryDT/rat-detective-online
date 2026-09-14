pragma Singleton
import QtQuick

QtObject {
  property color foreground: "#e8e8e8"
  property color background: "#101010"
  property color accent: "#5ea1ff"
  property color urgent: "#d84f4f"
  property color muted: "#929292"

  property QtObject popups: QtObject {
    property color background: "#151515"
    property color text: "#eeeeee"
    property color border: "#626262"
  }
}
