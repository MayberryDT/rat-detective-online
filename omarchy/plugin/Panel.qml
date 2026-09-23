pragma ComponentBehavior: Bound

import QtQuick
import QtQuick.Controls as QQC
import Quickshell
import Quickshell.Io
import qs.Commons
import qs.Ui
import "StatusModel.js" as StatusModel
import "ServiceBridge.js" as ServiceBridge
import "components"

Panel {
  id: root
  moduleName: "co.animasai.rat-detective"
  ipcTarget: moduleName
  manageIpc: false

  property var anchorItem: null
  property var hostWidget: null
  property var service: null
  property bool preferencesExpanded: false
  property int roomIndex: 0

  readonly property var desk: service
  readonly property var barIdentity: hostWidget || root
  readonly property var room: desk ? desk.selectedRoom : null
  readonly property bool roomFresh: desk ? desk.selectedRoomFresh : false
  readonly property var assignment: room ? room.assignment : null
  readonly property var rooms: desk && desk.status ? desk.status.rooms : []
  readonly property string appearanceMode: settingString("appearance", "Omarchy")
  readonly property string connectionMessage: {
    if (!desk) return ""
    if (desk.connectionState === "unavailable") {
      var err = String(desk.errorText || "").trim()
      return err !== "" ? err : "The Dispatch desk is unavailable."
    }
    return ""
  }
  readonly property string assignmentObjective: {
    if (!room) return ""
    var line = StatusModel.objectiveLine(room, desk ? desk.nowMs : Date.now(), roomFresh)
    if (assignment && assignment.id === "closing-time") return line.replace(/\s+remaining$/, "")
    if (assignment && assignment.id === "chain-of-custody") return line.replace(/^Deliver to /, "")
    return line
  }

  DispatchAppearance { id: appearance; mode: root.appearanceMode }
  readonly property var appearanceTokens: appearance

  function resolveService() {
    if (!service) service = ServiceBridge.current()
    return service
  }
  function open() { if (desk) desk.setPanelOpen(true); root.controller.show(); Qt.callLater(function() { keyCatcher.forceActiveFocus() }) }
  function close() { if (desk) desk.setPanelOpen(false); root.controller.hide() }
  function toggle() { root.opened ? close() : open() }
  function switchPanel(direction) {
    if (root.bar && typeof root.bar.switchPanelFrom === "function") return root.bar.switchPanelFrom(root.barIdentity, direction)
    return false
  }
  function selectRoomAt(index) {
    if (!desk || rooms.length === 0) return
    roomIndex = Math.max(0, Math.min(rooms.length - 1, index))
    desk.selectRoom(rooms[roomIndex].id)
  }
  function moveRoom(delta) { selectRoomAt(roomIndex + delta) }
  function persistSetting(name, value) {
    if (hostWidget && typeof hostWidget.persistSetting === "function") hostWidget.persistSetting(name, value)
  }
  function setAppearance(value) {
    var next = String(value || "")
    if (next !== "Omarchy" && next !== "Rat Detective") return "invalid appearance"
    persistSetting("appearance", next)
    return next
  }
  function settingBool(name, fallback) {
    var value = settings && settings[name] !== undefined ? settings[name] : fallback
    return value === true || value === "true" || value === 1
  }
  function settingInt(name, fallback) {
    var value = settings && settings[name] !== undefined ? parseInt(settings[name], 10) : fallback
    return isFinite(value) ? value : fallback
  }
  function settingString(name, fallback) {
    var value = settings && settings[name] !== undefined ? String(settings[name]) : fallback
    return value === "Rat Detective" ? value : "Omarchy"
  }
  function scroll(dy) {
    var maxY = Math.max(0, contentFlick.contentHeight - contentFlick.height)
    contentFlick.contentY = Math.max(0, Math.min(maxY, contentFlick.contentY + dy * Style.space(42)))
  }
  function scrollPage(direction) {
    var maxY = Math.max(0, contentFlick.contentHeight - contentFlick.height)
    var next = contentFlick.contentY + Number(direction || 0) * Math.max(Style.space(120), contentFlick.height * 0.78)
    contentFlick.contentY = Math.max(0, Math.min(maxY, next))
    return Math.round(contentFlick.contentY) + "/" + Math.round(maxY)
  }
  function viewPreferences(show) {
    preferencesExpanded = !!show
    Qt.callLater(function() {
      if (!show) contentFlick.contentY = 0
      else {
        var maxY = Math.max(0, contentFlick.contentHeight - contentFlick.height)
        contentFlick.contentY = Math.max(0, Math.min(maxY, preferencesButton.y))
      }
    })
    return "ok"
  }
  onRoomsChanged: {
    if (!room || rooms.length === 0) roomIndex = 0
    else for (var i = 0; i < rooms.length; i++) if (rooms[i].id === room.id) roomIndex = i
  }
  onOpenedChanged: if (!opened && desk) desk.setPanelOpen(false)

  IpcHandler {
    target: root.ipcTarget
    function open(): void { root.open() }
    function close(): void { root.close() }
    function show(): void { root.open() }
    function hide(): void { root.close() }
    function toggle(): void { root.toggle() }
    function refresh(): string { var service = root.resolveService(); if (service) service.refresh(); return service ? "ok" : "unavailable" }
    function launch(): void { var service = root.resolveService(); if (service) service.returnToGame() }
    function fixture(name: string): string { var service = root.resolveService(); return service ? service.setFixture(name) : "unavailable" }
    function appearance(name: string): string { return root.setAppearance(name) }
    function viewPreferences(show: bool): string { return root.viewPreferences(show) }
    function scrollPage(direction: int): string { return root.scrollPage(direction) }
    function snapshot(): string {
      if (!root.resolveService()) return JSON.stringify({serviceReady:false})
      return JSON.stringify({
        serviceReady: true, opened: root.opened, preferencesExpanded: root.preferencesExpanded,
        state: root.desk.connectionState, room: root.room ? root.room.id : null,
        counts: root.desk.totals, fixture: root.desk.effectiveFixture,
        appearance: root.appearanceMode,
        palette: { background:String(root.appearanceTokens.background), surface:String(root.appearanceTokens.surface), text:String(root.appearanceTokens.text), accent:String(root.appearanceTokens.accent), border:String(root.appearanceTokens.border) },
        fonts: { body:root.appearanceTokens.bodyFont, display:root.appearanceTokens.displayFont },
        barPosition: root.bar && root.bar.position !== undefined ? String(root.bar.position) : "",
        barRect: root.anchorItem ? { x: root.anchorItem.mapToGlobal(0, 0).x, y: root.anchorItem.mapToGlobal(0, 0).y, width: root.anchorItem.width, height: root.anchorItem.height } : null,
        renderRect: { x: panel.cardOrigin.x, y: panel.cardOrigin.y, width: panel.contentWidth, height: panel.contentHeight }
      })
    }
  }

  Timer { interval: 250; repeat: true; running: !root.service; triggeredOnStart: true; onTriggered: root.resolveService() }

  KeyboardPanel {
    id: panel
    anchorItem: root.anchorItem
    owner: root.hostWidget || root
    bar: root.bar
    open: root.opened
    focusTarget: keyCatcher
    contentWidth: panel.fittedContentWidth(Style.space(406))
    contentHeight: panel.fittedContentHeight(Math.min(contentFrame.implicitHeight, Style.space(780)), Style.space(780))

    PanelKeyCatcher {
      id: keyCatcher
      anchors.fill: parent
      blocked: false
      onCloseRequested: root.close()
      onTabRequested: function(direction) { root.switchPanel(direction) }
      onMoveRequested: function(dx, dy) { if (dx !== 0 && root.rooms.length > 1) root.moveRoom(dx); else if (dy !== 0) root.scroll(dy) }
      onActivateRequested: if (root.desk) root.desk.returnToGame()
      onTextKey: function(text) {
        if (!root.desk) return
        var key = String(text).toLowerCase()
        if (key === "r") root.desk.refresh()
        else if (key === "p") root.desk.returnToGame()
      }

      Rectangle {
        id: contentFrame
        readonly property int contentInset: Style.space(10)
        anchors.fill: parent
        implicitHeight: content.implicitHeight + contentInset * 2
        radius: Math.max(0, Style.cornerRadius - Style.space(2))
        color: appearance.background
        border.width: 1
        border.color: appearance.border

        Flickable {
          id: contentFlick
          anchors.fill: parent
          anchors.margins: contentFrame.contentInset
          clip: true
          boundsBehavior: Flickable.StopAtBounds
          contentWidth: width
          contentHeight: content.implicitHeight
          flickableDirection: Flickable.VerticalFlick
          interactive: contentHeight > height
          QQC.ScrollBar.vertical: QQC.ScrollBar { policy: QQC.ScrollBar.AsNeeded }

          Column {
            id: content
            width: parent.width
            spacing: Style.space(6)

            Row {
              width: parent.width
              spacing: Style.space(8)
              Image { width: Style.space(36); height: width; source: Qt.resolvedUrl("assets/badge.webp"); fillMode: Image.PreserveAspectFit; mipmap: true; smooth: true }
              Text {
                width: parent.width - parent.children[0].width - spinnerSlot.width - parent.spacing * 2
                anchors.verticalCenter: parent.verticalCenter
                textFormat: Text.PlainText
                text: "RAT DETECTIVE"
                color: appearance.text
                font.family: appearance.displayFont
                font.pixelSize: Style.space(20)
                font.bold: true
                font.letterSpacing: 0.7
                elide: Text.ElideRight
              }
              Item {
                id: spinnerSlot
                width: Style.space(18)
                height: width
                anchors.verticalCenter: parent.verticalCenter
                Text {
                  anchors.centerIn: parent
                  text: "\uf110"
                  color: appearance.muted
                  font.family: appearance.bodyFont
                  font.pixelSize: Style.space(16)
                  opacity: root.desk && (root.desk.highlightsBusy || root.desk.desktopBusy) ? 1 : 0
                  RotationAnimation on rotation {
                    running: root.desk && (root.desk.highlightsBusy || root.desk.desktopBusy)
                    from: 0
                    to: 360
                    duration: 800
                    loops: Animation.Infinite
                  }
                }
              }
            }

            Column {
              visible: root.assignment !== null
              width: parent.width
              spacing: Style.space(2)
              Text {
                width: parent.width
                textFormat: Text.PlainText
                text: root.assignment ? root.assignment.title : ""
                color: appearance.text
                font.family: appearance.displayFont
                font.pixelSize: Style.space(22)
                font.bold: true
                font.letterSpacing: 0.4
                elide: Text.ElideRight
              }
              Text {
                visible: root.assignmentObjective !== ""
                width: parent.width
                textFormat: Text.PlainText
                text: root.assignmentObjective
                color: root.assignment && root.assignment.zoneWarning ? appearance.urgent : appearance.muted
                font.family: appearance.bodyFont
                font.pixelSize: Style.font.body
                wrapMode: Text.WordWrap
                maximumLineCount: 2
                elide: Text.ElideRight
              }
            }

            Text {
              visible: root.desk && root.desk.effectiveFixture !== ""
              width: parent.width
              textFormat: Text.PlainText
              text: "STATIC PREVIEW  ·  " + (root.desk ? root.desk.effectiveFixture.toUpperCase() : "")
              color: appearance.urgent
              font.family: appearance.bodyFont
              font.pixelSize: Style.font.caption
              font.bold: true
              font.letterSpacing: 1
              wrapMode: Text.WordWrap
            }

            Text {
              visible: root.desk && root.desk.limited
              width: parent.width
              textFormat: Text.PlainText
              text: "Limited server report."
              color: appearance.muted
              font.family: appearance.bodyFont
              font.pixelSize: Style.font.caption
              wrapMode: Text.WordWrap
            }

            Row {
              visible: root.rooms.length > 1
              width: parent.width
              spacing: Style.space(6)
              Button { id: backRoom; text: "‹"; focusable: true; enabled: root.roomIndex > 0; foreground: appearance.text; fontFamily: appearance.bodyFont; onClicked: root.moveRoom(-1) }
              Button {
                width: parent.width - backRoom.width - forwardRoom.width - parent.spacing * 2
                text: root.room ? root.room.label.toUpperCase() + "  ·  " + dispatchRoster.playersLabel(root.room.players) : ""
                selected: true
                focusable: true
                foreground: appearance.text
                accent: appearance.accent
                fontFamily: appearance.bodyFont
                onClicked: root.moveRoom(1)
              }
              Button { id: forwardRoom; text: "›"; focusable: true; enabled: root.roomIndex < root.rooms.length - 1; foreground: appearance.text; fontFamily: appearance.bodyFont; onClicked: root.moveRoom(1) }
            }

            Text {
              visible: root.connectionMessage !== ""
              width: parent.width
              textFormat: Text.PlainText
              text: root.connectionMessage
              color: appearance.urgent
              font.family: appearance.bodyFont
              font.pixelSize: Style.font.body
              wrapMode: Text.WordWrap
            }

            DispatchRoster {
              id: dispatchRoster
              width: parent.width
              scores: root.room && root.room.scores ? root.room.scores : []
              assignmentId: root.assignment ? root.assignment.id : ""
              caseHolderName: root.assignment ? root.assignment.caseHolderName : ""
              connectionState: root.desk ? root.desk.connectionState : "loading"
              suppressWaiting: root.connectionMessage !== ""
              requestRunning: root.desk ? root.desk.requestRunning : false
              lastRequestFailed: root.desk ? root.desk.lastRequestFailed : false
              hasReport: !!(root.desk && root.desk.status)
              hasPublicRoom: root.rooms.length > 0
              roomFresh: root.roomFresh
              localObservedAt: root.room ? root.room.localObservedAt : (root.desk ? root.desk.receivedAt : 0)
              nowMs: root.desk ? root.desk.nowMs : Date.now()
              foreground: appearance.text
              muted: appearance.muted
              accent: appearance.accent
              borderColor: appearance.border
              fontFamily: appearance.bodyFont
            }

            Button {
              width: parent.width
              text: root.desk && root.desk.launchPending ? "OPENING CITY…" : (root.desk && root.desk.windowOpen ? "RETURN TO CITY  →" : "ENTER CITY  →")
              iconText: appearance.branded ? "" : "\uf11b"
              focusable: true
              bordered: true
              selected: !appearance.branded
              foreground: appearance.branded ? appearance.background : appearance.text
              background: appearance.branded ? appearance.accent : "transparent"
              accent: appearance.accent
              fontFamily: appearance.branded ? appearance.displayFont : appearance.bodyFont
              fontSize: appearance.branded ? Style.space(19) : Style.font.body
              enabled: root.desk && !root.desk.desktopBusy && !root.desk.launchPending
              onClicked: root.desk.returnToGame()
            }

            Button {
              width: parent.width
              text: "Clips"
              focusable: true
              bordered: true
              foreground: appearance.text
              accent: appearance.accent
              fontFamily: appearance.bodyFont
              enabled: !!root.desk
              onClicked: root.desk.openHighlightsLibrary()
            }

            Button {
              id: preferencesButton
              width: parent.width
              text: root.preferencesExpanded ? "Hide settings" : "Settings"
              iconText: root.preferencesExpanded ? "\uf106" : "\uf107"
              focusable: true
              foreground: appearance.muted
              fontFamily: appearance.bodyFont
              onClicked: root.viewPreferences(!root.preferencesExpanded)
            }

            Row {
              visible: root.preferencesExpanded
              width: parent.width
              spacing: Style.space(7)
              Button { width: (parent.width - parent.spacing) / 2; text: "Omarchy"; focusable: true; selected: root.appearanceMode === "Omarchy"; bordered: true; foreground: appearance.text; accent: appearance.accent; fontFamily: appearance.bodyFont; onClicked: root.setAppearance("Omarchy") }
              Button { width: (parent.width - parent.spacing) / 2; text: "Rat Detective"; focusable: true; selected: root.appearanceMode === "Rat Detective"; bordered: true; foreground: appearance.text; accent: appearance.accent; fontFamily: appearance.bodyFont; onClicked: root.setAppearance("Rat Detective") }
            }

            Column {
              visible: root.preferencesExpanded
              width: parent.width
              spacing: Style.space(8)

              Toggle { width: parent.width; label: "Automatic highlights"; checked: root.desk && root.desk.highlights && root.desk.highlights.enabled; foreground: appearance.text; accent: appearance.accent; fontFamily: appearance.bodyFont; onClicked: if (root.desk) root.desk.setHighlightsEnabled(!(root.desk.highlights && root.desk.highlights.enabled)) }
              Toggle { width: parent.width; label: "Notify when people are playing"; checked: root.settingBool("alertsEnabled", false); foreground: appearance.text; accent: appearance.accent; fontFamily: appearance.bodyFont; onClicked: root.persistSetting("alertsEnabled", !checked) }
              DispatchStepper {
                width: parent.width
                label: "At least"
                suffix: Math.max(1, Math.min(10, root.settingInt("alertHumanThreshold", 2))) === 1 ? " person" : " people"
                value: Math.max(1, Math.min(10, root.settingInt("alertHumanThreshold", 2)))
                minimum: 1
                maximum: 10
                enabled: root.settingBool("alertsEnabled", false)
                foreground: appearance.text
                fontFamily: appearance.bodyFont
                onChanged: root.persistSetting("alertHumanThreshold", value)
              }
            }
          }
        }
      }
    }
  }
}
