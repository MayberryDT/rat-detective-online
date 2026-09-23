import QtQuick
import QtTest
import "../../HighlightsModel.js" as HighlightsModel

TestCase {
  id: testCase
  name: "HighlightsModelQml"

  function test_state_labels_are_textual() {
    compare(HighlightsModel.stateLabel("off"), "Off")
    compare(HighlightsModel.stateLabel("setup-needed"), "Setup needed")
    compare(HighlightsModel.stateLabel("capturing"), "Capturing")
    compare(HighlightsModel.durationLabel(5000), "0:05")
    var line = HighlightsModel.panelLine({state: "buffering", clipCount: 3})
    verify(line.indexOf("3 clips") >= 0)
    verify(line.indexOf("Buffering") >= 0)
  }
}
