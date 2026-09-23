import QtQuick
import qs.Commons
import qs.Ui

Row {
  id: root
  property string label: ""
  property string suffix: ""
  property int value: 0
  property int minimum: 0
  property int maximum: 100
  property int step: 1
  property bool enabled: true
  property color foreground: Color.foreground
  property string fontFamily: Style.font.family
  signal changed(int value)
  width: parent ? parent.width : implicitWidth
  spacing: Style.space(7)

  Text {
    width: parent.width - down.width - up.width - valueLabel.width - parent.spacing * 3
    anchors.verticalCenter: parent.verticalCenter
    textFormat: Text.PlainText
    text: root.label
    opacity: root.enabled ? 1 : 0.55
    color: root.foreground
    font.family: root.fontFamily
    font.pixelSize: Style.font.body
    elide: Text.ElideRight
  }
  Button {
    id: down
    text: "−"
    focusable: true
    foreground: root.foreground
    fontFamily: root.fontFamily
    enabled: root.enabled && root.value > root.minimum
    onClicked: root.changed(Math.max(root.minimum, root.value - root.step))
  }
  Text {
    id: valueLabel
    anchors.verticalCenter: parent.verticalCenter
    textFormat: Text.PlainText
    text: root.value + root.suffix
    opacity: root.enabled ? 1 : 0.55
    color: root.foreground
    font.family: root.fontFamily
    font.pixelSize: Style.font.body
    font.bold: true
  }
  Button {
    id: up
    text: "+"
    focusable: true
    foreground: root.foreground
    fontFamily: root.fontFamily
    enabled: root.enabled && root.value < root.maximum
    onClicked: root.changed(Math.min(root.maximum, root.value + root.step))
  }
}
