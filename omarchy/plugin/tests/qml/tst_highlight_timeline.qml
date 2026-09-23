import QtQuick
import QtTest
import "../../components"
TestCase {
  name: "HighlightTimeline"
  when: windowShown
  visible: true
  width: 600; height: 120
  HighlightTimeline {
    id: timeline
    width: 500; height: 48
    duration: 15000; trimStart: 1000; trimEnd: 13000; trimming: true
    onBoundaryMoved: (start, ms) => { if (start) trimStart = ms; else trimEnd = ms; position = ms }
    onSeekRequested: ms => position = ms
  }
  function init() { timeline.trimStart = 1000; timeline.trimEnd = 13000; timeline.position = 0 }
  function test_drag_previews_and_preserves_minimum_selection() {
    var handle = findChild(timeline, "trimStartHandle")
    mousePress(handle, 12, 19)
    mouseMove(handle, 90, 19, 30)
    mouseRelease(handle, 12, 19)
    verify(timeline.trimStart > 1000)
    compare(timeline.position, timeline.trimStart)
    timeline.moveBoundary(true, 15000)
    compare(timeline.trimStart, 12800)
    timeline.moveBoundary(false, 0)
    compare(timeline.trimEnd, 13000)
  }
  function test_seek_does_not_move_trim_boundaries() {
    mouseClick(timeline, 250, 24)
    compare(timeline.position, 7500)
    compare(timeline.trimStart, 1000)
    compare(timeline.trimEnd, 13000)
  }
  function test_keyboard_boundaries_preview() {
    var handle = findChild(timeline, "trimEndHandle")
    handle.forceActiveFocus()
    keyClick(Qt.Key_Left)
    compare(timeline.trimEnd, 12900)
    compare(timeline.position, 12900)
  }
}
