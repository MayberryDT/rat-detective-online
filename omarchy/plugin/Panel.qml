pragma ComponentBehavior: Bound

import QtQuick
import Quickshell
import Quickshell.Io
import qs.Commons
import qs.Ui

Panel {
  id: root
  moduleName: "co.animasai.rat-detective"
  ipcTarget: "co.animasai.rat-detective"
  manageIpc: false

  property var anchorItem: null
  property var hostWidget: null
  property bool installed: false
  property bool busy: false
  property int playerCount: 0
  property string roomLabel: "Public"
  property string phase: "playing"
  property double startedAt: 0
  property double resetAt: 0
  property string winnerName: ""
  property var scores: []
  property double nowMs: Date.now()
  property string statusText: ""
  property string errorText: ""

  readonly property var barIdentity: hostWidget || root
  readonly property color foreground: bar ? bar.foreground : Color.foreground
  readonly property string fontFamily: bar ? bar.fontFamily : Style.font.family
  readonly property color mutedColor: Qt.darker(foreground, 1.6)
  readonly property string appName: "Rat Detective"
  readonly property string appUrl: "https://rat-detective.animasai.co"
  readonly property string statusUrl: appUrl + "/status"
  readonly property int scoreRowPitch: Style.font.body + Style.space(10)
  readonly property int scoreListMaxHeight: scoreRowPitch * 6
  readonly property string roomLine: {
    var now = root.nowMs
    if (root.phase === "won") {
      var who = root.winnerName !== "" ? root.winnerName + " won" : "Round over"
      if (root.resetAt > now)
        return root.roomLabel + " · " + who + " · next in " + formatClock(root.resetAt - now)
      return root.roomLabel + " · " + who
    }
    if (root.playerCount === 0)
      return root.roomLabel + " · empty"
    if (root.startedAt > 0)
      return root.roomLabel + " · " + formatClock(now - root.startedAt)
    return root.roomLabel
  }
  readonly property string applicationsDir: (Quickshell.env("HOME") || "") + "/.local/share/applications"
  readonly property string installScript: localPath(Qt.resolvedUrl("scripts/install-webapp.sh"))

  function localPath(url) {
    var value = String(url || "")
    if (value.indexOf("file://") === 0) value = value.substring(7)
    try { return decodeURIComponent(value) } catch (error) { return value }
  }

  function formatClock(ms) {
    var total = Math.max(0, Math.floor(ms / 1000))
    var h = Math.floor(total / 3600)
    var m = Math.floor((total % 3600) / 60)
    var s = total % 60
    var ss = (s < 10 ? "0" : "") + s
    if (h > 0)
      return h + ":" + (m < 10 ? "0" : "") + m + ":" + ss
    return m + ":" + ss
  }

  function applyStatus(data) {
    var n = Number(data.players)
    if (isFinite(n) && n >= 0)
      root.playerCount = Math.min(24, Math.floor(n))

    var room = String(data.room || "public")
    root.roomLabel = room === "public" ? "Public" : room
    root.phase = data.phase === "won" ? "won" : "playing"

    var started = Number(data.startedAt)
    root.startedAt = isFinite(started) && started > 0 ? started : 0
    var reset = Number(data.resetAt)
    root.resetAt = isFinite(reset) && reset > 0 ? reset : 0
    root.winnerName = typeof data.winnerName === "string" ? data.winnerName : ""

    var next = []
    var rows = data.scores
    if (Array.isArray(rows)) {
      for (var i = 0; i < rows.length && i < 24; i++) {
        var row = rows[i]
        if (!row || typeof row.name !== "string" || row.name === "")
          continue
        next.push({
          name: row.name,
          kills: Math.max(0, Math.floor(Number(row.kills) || 0)),
          deaths: Math.max(0, Math.floor(Number(row.deaths) || 0))
        })
      }
    }
    root.scores = next
    root.nowMs = Date.now()
  }

  function open() {
    root.nowMs = Date.now()
    root.probe()
    root.refreshStatus()
    root.controller.show()
  }
  function close() { root.controller.hide() }
  function toggle() { root.opened ? close() : open() }

  function switchPanel(direction) {
    if (root.bar && typeof root.bar.switchPanelFrom === "function")
      return root.bar.switchPanelFrom(root.barIdentity, direction)
    return false
  }

  function probe() {
    if (!installedProbe.running) installedProbe.running = true
  }

  function refreshStatus() {
    if (!statusProcess.running) statusProcess.running = true
  }

  function launch() {
    root.errorText = ""
    Quickshell.execDetached(["omarchy-launch-webapp", root.appUrl])
    root.close()
  }

  function installGame() {
    if (root.busy || installProcess.running) return
    root.busy = true
    root.errorText = ""
    root.statusText = ""
    installProcess.running = true
  }

  function scrollScores(dy) {
    if (!scoreList.visible || dy === 0) return
    var maxY = Math.max(0, scoreList.contentHeight - scoreList.height)
    scoreList.contentY = Math.max(0, Math.min(maxY, scoreList.contentY + dy * root.scoreRowPitch))
  }

  IpcHandler {
    target: root.ipcTarget
    function open(): void { root.open() }
    function close(): void { root.close() }
    function show(): void { root.open() }
    function hide(): void { root.close() }
    function toggle(): void { root.toggle() }
    function launch(): void { if (root.installed) root.launch() }
  }

  Process {
    id: installedProbe
    running: true
    command: ["bash", "-c", "[[ -f \"$HOME/.local/share/applications/Rat Detective.desktop\" ]] && echo yes || echo no"]
    stdout: SplitParser {
      onRead: function(line) {
        root.installed = String(line).trim() === "yes"
        if (!root.busy) root.statusText = ""
      }
    }
  }

  FileView {
    path: root.applicationsDir
    watchChanges: true
    printErrors: false
    onFileChanged: root.probe()
  }

  Process {
    id: statusProcess
    command: ["curl", "-fsS", "--max-time", "5", root.statusUrl]
    stdout: StdioCollector {
      waitForEnd: true
      onStreamFinished: {
        try {
          root.applyStatus(JSON.parse(String(text || "{}")))
        } catch (error) {
          console.warn("co.animasai.rat-detective status failed")
        }
      }
    }
  }

  Timer {
    interval: root.opened ? 2000 : 30000
    running: true
    repeat: true
    onTriggered: root.refreshStatus()
  }

  Timer {
    interval: 1000
    running: root.opened
    repeat: true
    onTriggered: root.nowMs = Date.now()
  }

  Component.onCompleted: root.refreshStatus()

  Process {
    id: installProcess
    command: ["bash", root.installScript]
    stdout: StdioCollector {
      id: installOut
      waitForEnd: true
    }
    stderr: StdioCollector {
      id: installErr
      waitForEnd: true
    }
    onExited: function(code) {
      root.busy = false
      root.probe()
      if (code === 0) {
        Qt.callLater(function() { root.launch() })
      } else {
        console.warn("co.animasai.rat-detective add failed:", installErr.text || installOut.text)
        root.errorText = "Couldn't add it to the menu."
      }
    }
  }

  KeyboardPanel {
    id: panel
    anchorItem: root.anchorItem
    owner: root.hostWidget || root
    bar: root.bar
    open: root.opened
    focusTarget: keyCatcher
    contentWidth: panel.fittedContentWidth(Style.space(300))
    contentHeight: panel.fittedContentHeight(content.implicitHeight)

    PanelKeyCatcher {
      id: keyCatcher
      anchors.fill: parent
      onCloseRequested: root.close()
      onTabRequested: function(direction) { root.switchPanel(direction) }
      onMoveRequested: function(dx, dy) { root.scrollScores(dy) }

      Column {
        id: content
        width: parent.width
        spacing: Style.space(10)

        Text {
          width: parent.width
          text: root.appName
          color: root.foreground
          font.family: root.fontFamily
          font.pixelSize: Style.font.subtitle
          font.bold: true
          wrapMode: Text.WordWrap
        }

        Text {
          width: parent.width
          text: root.roomLine
          color: root.mutedColor
          font.family: root.fontFamily
          font.pixelSize: Style.font.body
          wrapMode: Text.WordWrap
        }

        Text {
          width: parent.width
          visible: root.scores.length === 0
          text: "Nobody in the city."
          color: root.mutedColor
          font.family: root.fontFamily
          font.pixelSize: Style.font.body
          wrapMode: Text.WordWrap
        }

        ListView {
          id: scoreList
          width: parent.width
          visible: root.scores.length > 0
          height: Math.min(
            Math.max(contentHeight, root.scores.length * root.scoreRowPitch),
            root.scoreListMaxHeight
          )
          clip: true
          boundsBehavior: Flickable.StopAtBounds
          flickableDirection: Flickable.VerticalFlick
          interactive: contentHeight > height
          contentWidth: width
          spacing: 0
          model: root.scores
          delegate: Row {
            required property var modelData
            width: scoreList.width
            height: root.scoreRowPitch
            spacing: Style.space(8)

            Text {
              anchors.verticalCenter: parent.verticalCenter
              width: parent.width - scoreLabel.implicitWidth - parent.spacing
              text: modelData.name
              color: root.foreground
              font.family: root.fontFamily
              font.pixelSize: Style.font.body
              elide: Text.ElideRight
            }

            Text {
              id: scoreLabel
              anchors.verticalCenter: parent.verticalCenter
              text: modelData.kills + "K / " + modelData.deaths + "D"
              color: root.mutedColor
              font.family: root.fontFamily
              font.pixelSize: Style.font.body
            }
          }
        }

        PanelSeparator {}

        Button {
          width: parent.width
          text: root.busy ? "Adding…" : (root.installed ? "Play" : "Add to menu")
          enabled: !root.busy
          bordered: true
          foreground: root.foreground
          fontFamily: root.fontFamily
          onClicked: root.installed ? root.launch() : root.installGame()
        }

        Text {
          width: parent.width
          visible: root.statusText !== ""
          text: root.statusText
          color: root.mutedColor
          font.family: root.fontFamily
          font.pixelSize: Style.font.body
          wrapMode: Text.WordWrap
        }

        Text {
          width: parent.width
          visible: root.errorText !== ""
          text: root.errorText
          color: root.foreground
          font.family: root.fontFamily
          font.pixelSize: Style.font.body
          wrapMode: Text.WordWrap
        }
      }
    }
  }
}
