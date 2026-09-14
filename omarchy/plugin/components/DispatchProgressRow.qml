import QtQuick
import qs.Commons

Column {
  id: root
  required property var entry
  property int rank: 0
  property color foreground: Color.foreground
  property color muted: Color.muted
  property color accent: Color.accent
  property color borderColor: Color.popups.border
  property string fontFamily: Style.font.family
  property bool showObjective: true
  property bool paperMode: false
  width: parent ? parent.width : implicitWidth
  spacing: Style.space(4)

  Row {
    width: parent.width
    spacing: Style.space(8)
    Text {
      width: root.rank > 0 ? Style.space(17) : 0
      visible: root.rank > 0
      textFormat: Text.PlainText
      text: root.rank
      color: root.accent
      font.family: root.fontFamily
      font.pixelSize: Style.font.caption
      font.bold: true
    }
    Text {
      textFormat: Text.PlainText
      width: parent.width - (root.rank > 0 ? parent.children[0].width : 0) - score.implicitWidth - parent.spacing * (root.rank > 0 ? 2 : 1)
      text: root.entry.name
      color: root.foreground
      font.family: root.fontFamily
      font.pixelSize: Style.font.body
      font.bold: root.entry.holder === true
      elide: Text.ElideRight
    }
    Row {
      id: score
      spacing: Style.space(6)
      Repeater {
        model: root.showObjective && root.paperMode ? 3 : 0
        Rectangle {
          required property int index
          width: Style.space(13); height: Style.space(16)
          radius: Style.space(1)
          color: index < root.entry.points ? root.accent : "transparent"
          border.width: 1
          border.color: index < root.entry.points ? root.accent : root.borderColor
          rotation: index === 0 ? -3 : index === 2 ? 3 : 0
          Rectangle {
            anchors.horizontalCenter: parent.horizontalCenter
            y: Style.space(4); width: parent.width * 0.52; height: 1
            color: index < root.entry.points ? Qt.rgba(0.15, 0.10, 0.16, 0.55) : root.borderColor
          }
        }
      }
      Text {
        anchors.verticalCenter: parent.verticalCenter
        textFormat: Text.PlainText
        text: root.showObjective && root.entry.target > 0 ? root.entry.points + " / " + root.entry.target : root.entry.kills + "K  " + root.entry.deaths + "D"
        color: root.showObjective ? root.foreground : root.muted
        font.family: root.fontFamily
        font.pixelSize: Style.font.body
        font.bold: root.showObjective
      }
    }
  }

  Rectangle {
    visible: root.showObjective && !root.paperMode && root.entry.target > 0
    width: parent.width
    height: Style.space(4)
    radius: height / 2
    color: root.borderColor
    Rectangle {
      width: parent.width * Math.max(0, Math.min(1, root.entry.points / Math.max(1, root.entry.target)))
      height: parent.height
      radius: height / 2
      color: root.accent
    }
  }
}
