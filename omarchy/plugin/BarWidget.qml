import QtQuick
import QtQuick.Effects
import qs.Commons
import qs.Ui
import "ServiceBridge.js" as ServiceBridge

// The rat in the bar: lights up with the number of people playing. Click opens or focuses the game.
BarWidget {
  id: root
  moduleName: "co.animasai.rat-detective"

  property var alertService: null
  readonly property int humans: alertService ? alertService.humans : 0
  readonly property real iconSize: Math.min(Style.bar.iconCanvas, (root.bar && root.bar.barSize > 0 ? root.bar.barSize : Style.bar.sizeHorizontal) - 6)

  implicitWidth: button.implicitWidth
  implicitHeight: button.implicitHeight

  Timer {
    interval: 250
    repeat: true
    running: !root.alertService
    triggeredOnStart: true
    onTriggered: root.alertService = ServiceBridge.current()
  }

  WidgetButton {
    id: button
    anchors.fill: parent
    bar: root.bar
    text: " "
    labelVisible: false
    active: root.humans > 0
    foreground: root.bar && root.bar.barForeground !== undefined ? root.bar.barForeground : Color.bar.text
    activeColor: root.bar && root.bar.urgent !== undefined ? root.bar.urgent : Color.urgent
    fontFamily: root.bar && root.bar.fontFamily ? root.bar.fontFamily : Style.font.family
    fixedWidth: root.vertical ? -1 : Math.ceil(content.width + Style.space(3) * 2)
    fixedHeight: root.vertical ? Math.ceil(content.height + Style.space(3) * 2) : -1
    tooltipText: root.humans === 0 ? "Rat Detective · nobody playing"
      : "Rat Detective · " + (root.humans === 1 ? "1 person" : root.humans + " people") + " playing"
    onPressed: function(code) { if (root.alertService) root.alertService.openGame() }

    readonly property color tint: active && useActiveColor ? activeColor : foreground

    Item {
      id: content
      anchors.centerIn: parent
      width: root.vertical ? root.iconSize : symbol.width + (count.visible ? count.implicitWidth + Style.space(3) : 0)
      height: root.vertical ? symbol.height + (count.visible ? count.implicitHeight + Style.space(3) : 0) : root.iconSize

      Image {
        id: symbol
        width: root.iconSize
        height: width
        source: Qt.resolvedUrl("assets/rat-detective-symbolic.svg")
        sourceSize.width: Math.ceil(width * Screen.devicePixelRatio)
        sourceSize.height: Math.ceil(height * Screen.devicePixelRatio)
        fillMode: Image.PreserveAspectFit
        smooth: true
        mipmap: true
        visible: false
        layer.enabled: true
      }

      MultiEffect {
        anchors.fill: symbol
        source: symbol
        autoPaddingEnabled: false
        colorization: 1.0
        colorizationColor: button.tint
        opacity: root.humans > 0 ? 1 : 0.55
      }

      Text {
        id: count
        visible: root.humans > 0
        x: root.vertical ? (parent.width - width) / 2 : symbol.width + Style.space(3)
        y: root.vertical ? symbol.height + Style.space(3) : (parent.height - height) / 2
        text: String(root.humans)
        color: button.tint
        font.family: button.fontFamily
        font.pixelSize: root.vertical ? Style.font.caption : Style.font.body
        font.bold: true
        renderType: Text.NativeRendering
      }
    }
  }
}
