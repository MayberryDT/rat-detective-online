pragma Singleton
import QtQuick

QtObject {
  property QtObject font: QtObject {
    property string family: "Dispatch Test Mono"
  }

  function normalFillFor(foreground, accent, urgent) {
    return Qt.rgba(foreground.r, foreground.g, foreground.b, 0.08)
  }
}
