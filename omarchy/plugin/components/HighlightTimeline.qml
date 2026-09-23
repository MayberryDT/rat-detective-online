import QtQuick
import QtQuick.Controls.Basic as Controls

// One time axis for playback and both nondestructive trim boundaries.
Item {
  id: root
  implicitHeight: 48
  property real duration: 1
  property real position: 0
  property real trimStart: 0
  property real trimEnd: duration
  property bool trimming: false
  property color accent: "#ffffff"
  property color foreground: "#ffffff"
  property color trackColor: "#555555"
  signal seekRequested(real milliseconds)
  signal boundaryMoved(bool start, real milliseconds)
  readonly property real span: Math.max(1, duration)
  readonly property real minimumSpan: Math.min(200, span)

  function fraction(ms) { return Math.max(0, Math.min(1, ms / span)) }
  function moveBoundary(start, ms) {
    var bound = start ? Math.max(0, Math.min(trimEnd - minimumSpan, ms))
                      : Math.min(span, Math.max(trimStart + minimumSpan, ms))
    boundaryMoved(start, bound)
  }

  Rectangle {
    id: track
    x: 12; width: Math.max(1, root.width - 24)
    anchors.verticalCenter: parent.verticalCenter
    height: 8; radius: 4; color: Qt.rgba(root.trackColor.r, root.trackColor.g, root.trackColor.b, 0.28)
    Rectangle {
      x: root.trimming ? root.fraction(root.trimStart) * parent.width : 0
      width: (root.trimming ? root.fraction(root.trimEnd) - root.fraction(root.trimStart) : root.fraction(root.position)) * parent.width
      height: parent.height; radius: 4; color: root.accent
    }
    Rectangle {
      x: root.fraction(root.position) * parent.width - 1
      y: -6; width: 2; height: 20; color: root.foreground
    }
  }
  MouseArea {
    anchors.fill: parent
    cursorShape: Qt.PointingHandCursor
    function seek(x) { root.seekRequested(root.fraction((x - track.x) / track.width * root.span) * root.span) }
    onPressed: mouse => { seek(mouse.x); playbackFocus.forceActiveFocus() }
    onPositionChanged: mouse => { if (pressed) seek(mouse.x) }
  }
  Controls.Control {
    id: playbackFocus
    activeFocusOnTab: true
    anchors.fill: parent
    Accessible.role: Accessible.Slider
    Accessible.name: "Playback position"
    background: Rectangle { color: "transparent"; border.color: root.foreground; border.width: playbackFocus.activeFocus ? 1 : 0; radius: 4 }
    Keys.onLeftPressed: root.seekRequested(Math.max(0, root.position - 100))
    Keys.onRightPressed: root.seekRequested(Math.min(root.span, root.position + 100))
    Keys.onPressed: event => {
      if (event.key === Qt.Key_Home) { root.seekRequested(0); event.accepted = true }
      if (event.key === Qt.Key_End) { root.seekRequested(root.span); event.accepted = true }
    }
  }
  component TrimHandle: Controls.Control {
    id: handle
    required property bool start
    readonly property real milliseconds: start ? root.trimStart : root.trimEnd
    visible: root.trimming
    x: track.x + root.fraction(milliseconds) * track.width - width / 2
    anchors.verticalCenter: parent.verticalCenter
    width: 24; height: 38
    activeFocusOnTab: true
    Accessible.role: Accessible.Slider
    Accessible.name: (start ? "Trim start " : "Trim end ") + (milliseconds / 1000).toFixed(2) + " seconds"
    background: Rectangle {
      radius: 4; color: root.accent
      border.width: handle.activeFocus ? 2 : 0; border.color: root.foreground
      Text { anchors.centerIn: parent; text: handle.start ? "[" : "]"; color: "#080a0e"; font.pixelSize: 18; font.bold: true }
    }
    Keys.onLeftPressed: root.moveBoundary(start, milliseconds - 100)
    Keys.onRightPressed: root.moveBoundary(start, milliseconds + 100)
    Keys.onPressed: event => {
      if (event.key === Qt.Key_Home) { root.moveBoundary(start, 0); event.accepted = true }
      if (event.key === Qt.Key_End) { root.moveBoundary(start, root.span); event.accepted = true }
    }
    MouseArea {
      anchors.fill: parent
      preventStealing: true
      cursorShape: Qt.SizeHorCursor
      property real pressOffset: 0
      onPressed: mouse => {
        pressOffset = mouse.x - width / 2
        handle.forceActiveFocus()
        root.moveBoundary(handle.start, handle.milliseconds)
      }
      onPositionChanged: mouse => {
        if (pressed) root.moveBoundary(handle.start, (mapToItem(track, mouse.x - pressOffset, 0).x / track.width) * root.span)
      }
    }
  }
  TrimHandle { objectName: "trimStartHandle"; start: true }
  TrimHandle { objectName: "trimEndHandle"; start: false }
}
