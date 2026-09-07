import QtQuick
import qs.Commons
import qs.Ui

BarWidget {
  id: root
  moduleName: "co.animasai.rat-detective"

  readonly property bool installed: panelLoader.item ? panelLoader.item.installed === true : false
  readonly property bool busy: panelLoader.item ? panelLoader.item.busy === true : false
  readonly property int playerCount: panelLoader.item ? Number(panelLoader.item.playerCount) || 0 : 0
  readonly property bool opened: panelLoader.item ? panelLoader.item.opened === true : false
  readonly property bool popoutSwitchClosing: panelLoader.item ? panelLoader.item.popoutSwitchClosing === true : false
  readonly property string icon: "\uf21b"
  readonly property string label: root.vertical
    ? String(root.playerCount)
    : root.icon + " " + root.playerCount
  readonly property string tooltip: {
    if (!root.installed) return "Add Rat Detective to the menu"
    if (root.playerCount === 1) return "1 in the city"
    if (root.playerCount > 1) return root.playerCount + " in the city"
    return "Nobody in the city"
  }

  implicitWidth: button.implicitWidth
  implicitHeight: button.implicitHeight

  function open() {
    if (panelLoader.item) panelLoader.item.open()
  }
  function close() {
    if (panelLoader.item) panelLoader.item.close()
  }
  function toggle() {
    if (panelLoader.item) panelLoader.item.toggle()
  }
  function closeForPopoutSwitch() {
    if (panelLoader.item) panelLoader.item.closeForPopoutSwitch()
  }

  function injectPanel() {
    var target = panelLoader.item
    if (!target) return
    if ("bar" in target) target.bar = root.bar
    if ("settings" in target) target.settings = root.settings
    if ("anchorItem" in target) target.anchorItem = button
    if ("hostWidget" in target) target.hostWidget = root
  }

  onBarChanged: injectPanel()
  onSettingsChanged: injectPanel()

  Loader {
    id: panelLoader
    active: true
    source: Qt.resolvedUrl("Panel.qml")
    visible: false
    onStatusChanged: {
      if (status === Loader.Error)
        console.warn("co.animasai.rat-detective panel failed:", errorString())
    }
    onLoaded: {
      root.injectPanel()
      Qt.callLater(root.injectPanel)
    }
  }

  WidgetButton {
    id: button
    anchors.fill: parent
    bar: root.bar
    text: root.label
    dimmed: !root.installed
    fixedWidth: root.vertical ? -1 : Math.max(Style.bar.iconSlot, Math.ceil(labelWidth + Style.space(8)))
    tooltipText: root.tooltip
    onPressed: function(buttonCode) {
      if (buttonCode === Qt.LeftButton || buttonCode === Qt.RightButton)
        root.toggle()
    }
  }
}
