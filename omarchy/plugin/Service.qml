import QtQuick
import Quickshell
import Quickshell.Io
import "StatusModel.js" as StatusModel
import "ServiceBridge.js" as ServiceBridge

Item {
  id: root

  property var shell: null
  property var manifest: null
  property var settings: ({})
  property var status: null
  property string connectionState: "loading"
  property bool limited: false
  property bool requestRunning: statusProcess.running
  property bool panelOpen: false
  property bool lastRequestFailed: false
  property double receivedAt: 0
  property double nowMs: Date.now()
  property string selectedRoomId: ""
  property string errorText: ""
  property string actionText: ""
  property string actionError: ""
  property bool desktopBusy: desktopAction.running
  property bool windowOpen: false
  property bool gameFocused: false
  property bool locked: true
  property bool desktopReady: false
  property bool launchPending: false
  property bool dnd: false
  property bool recording: false
  property bool launcherInstalled: false
  property bool launcherCanonical: false
  property bool launcherDurable: false
  property string capturesDirectory: ""
  property bool shortcutInstalled: false
  property string shortcutChord: ""
  property var desktopPreferences: ({ workspace: null, fullscreen: false, desktopAudio: false })
  property int failureCount: 0
  property string requestKind: "v1"
  property string nextCursor: ""
  property int pageCount: 0
  property var pendingStatus: null
  property var alertReceipts: ({})
  property bool alertBaselineReady: false
  property var previousFreshStatus: null
  property var pendingNotices: []
  property var fixtureOverride: null
  property bool fixtureSwitching: false

  readonly property string appUrl: "https://ratdetective.online/"
  readonly property string endpointOverride: Quickshell.env("RAT_DETECTIVE_COMPANION_URL") || ""
  readonly property string statusUrl: endpointOverride || appUrl + "api/companion/v1/status"
  readonly property string legacyUrl: appUrl + "status"
  readonly property string fixtureName: Quickshell.env("RAT_DETECTIVE_COMPANION_FIXTURE") || ""
  readonly property string effectiveFixture: fixtureOverride !== null ? String(fixtureOverride) : fixtureName
  readonly property string helperPath: localPath(Qt.resolvedUrl("scripts/rat-detective-desktop.py"))
  readonly property string iconPath: localPath(Qt.resolvedUrl("icon.png"))
  readonly property string fixturePath: localPath(Qt.resolvedUrl("fixtures/dispatch.json"))
  readonly property string stateDir: (Quickshell.env("XDG_STATE_HOME") || ((Quickshell.env("HOME") || "") + "/.local/state")) + "/rat-detective"
  readonly property string receiptsPath: stateDir + "/dispatch-alerts.json"
  readonly property int openRefreshMs: intSetting("openRefreshSec", 2, 2, 60) * 1000
  readonly property int closedRefreshMs: intSetting("closedRefreshSec", 30, 10, 600) * 1000
  readonly property int staleAfterMs: intSetting("staleAfterSec", 90, 30, 600) * 1000
  readonly property int alertCooldownMs: intSetting("alertCooldownMin", 15, 1, 1440) * 60000
  readonly property var totals: StatusModel.totals(status)
  readonly property var selectedRoom: StatusModel.roomById(status, selectedRoomId)
  readonly property bool selectedRoomFresh: StatusModel.roomFresh(selectedRoom, nowMs)

  function localPath(url) {
    var value = String(url || "")
    if (value.indexOf("file://") === 0) value = value.substring(7)
    try { return decodeURIComponent(value) } catch (error) { return value }
  }

  function setting(name, fallback) {
    var value = settings ? settings[name] : undefined
    return value === undefined || value === null ? fallback : value
  }

  function intSetting(name, fallback, minimum, maximum) {
    var number = parseInt(String(setting(name, fallback)), 10)
    if (!isFinite(number)) number = fallback
    return Math.max(minimum, Math.min(maximum, number))
  }

  function boolSetting(name, fallback) {
    var value = setting(name, fallback)
    return value === true || value === "true" || value === 1
  }

  function applySettings(value) {
    var previousOpen = openRefreshMs
    var previousClosed = closedRefreshMs
    settings = value || ({})
    // Appearance and desktop preferences must not reset the network timer.
    if (previousOpen !== openRefreshMs || previousClosed !== closedRefreshMs) schedulePoll(100)
  }

  function setPanelOpen(value) {
    panelOpen = !!value
    if (panelOpen) {
      refresh()
      refreshDesktop()
    } else schedulePoll(closedRefreshMs)
  }

  function setFixture(name) {
    var value = String(name || "")
    var allowed = ["", "paper", "jurisdiction", "excessive", "closing", "empty", "stale", "unavailable", "loading"]
    if (allowed.indexOf(value) === -1) return "unknown fixture"
    fixtureSwitching = true
    fixtureOverride = value
    pollTimer.stop()
    statusProcess.running = false
    fixtureProcess.running = false
    desktopStatus.running = false
    desktopAction.running = false
    notifyProcess.running = false
    pendingNotices = []
    actionText = ""
    actionError = ""
    status = null
    lastRequestFailed = false
    failureCount = 0
    connectionState = "loading"
    Qt.callLater(function() {
      root.fixtureSwitching = false
      root.refresh()
      root.refreshDesktop()
    })
    return "ok"
  }

  function selectRoom(id) {
    selectedRoomId = String(id || "")
  }

  function requestUrl() {
    if (requestKind === "legacy") return legacyUrl
    var separator = statusUrl.indexOf("?") === -1 ? "?" : "&"
    var url = statusUrl + separator + "limit=16"
    if (nextCursor) url += "&cursor=" + encodeURIComponent(nextCursor)
    return url
  }

  function refresh() {
    if ((locked && !effectiveFixture) || statusProcess.running || fixtureProcess.running) return
    pollTimer.stop()
    if (effectiveFixture) {
      if (effectiveFixture === "unavailable") {
        finishFailure("Static unavailable fixture")
        return
      }
      if (effectiveFixture === "loading") {
        connectionState = "loading"
        return
      }
      fixtureProcess.running = true
      return
    }
    requestKind = "v1"
    nextCursor = ""
    pageCount = 0
    pendingStatus = null
    statusProcess.running = true
  }

  function schedulePoll(delay) {
    if (locked || effectiveFixture === "loading") return
    var base = delay === undefined ? (panelOpen ? openRefreshMs : closedRefreshMs) : delay
    if (failureCount > 0) base = Math.max(base, Math.min(300000, 5000 * Math.pow(2, Math.min(6, failureCount - 1))))
    var jitter = effectiveFixture ? 0 : Math.floor(base * (Math.random() * 0.16 - 0.08))
    pollTimer.interval = Math.max(250, base + jitter)
    pollTimer.restart()
  }

  function finishSuccess(nextStatus) {
    var previousState = connectionState
    var oldFresh = previousFreshStatus
    status = nextStatus
    limited = nextStatus.limited === true
    receivedAt = Date.now()
    nowMs = receivedAt
    lastRequestFailed = false
    failureCount = 0
    errorText = ""
    if (!selectedRoomId || !StatusModel.roomById(status, selectedRoomId))
      selectedRoomId = status.rooms.length ? status.rooms[0].id : ""
    updateConnectionState()
    var recovered = previousState === "stale" || previousState === "unavailable" || previousState === "loading"
    if (!alertBaselineReady || recovered || connectionState === "stale") {
      previousFreshStatus = status
      alertBaselineReady = connectionState === "live" || connectionState === "empty"
    } else if (connectionState === "live" || connectionState === "empty") {
      evaluateAlerts(oldFresh, status)
      previousFreshStatus = status
    }
    schedulePoll()
  }

  function finishFailure(message) {
    lastRequestFailed = true
    failureCount++
    errorText = String(message || "The city desk did not answer.")
    nowMs = Date.now()
    updateConnectionState()
    alertBaselineReady = false
    schedulePoll()
  }

  function updateConnectionState() {
    connectionState = StatusModel.connectionState(status, receivedAt, nowMs, staleAfterMs, lastRequestFailed)
  }

  function parseFixture(raw) {
    var bundle = JSON.parse(String(raw || "{}"))
    var fixture = bundle.fixtures ? bundle.fixtures[effectiveFixture] : null
    if (!fixture) throw new Error("Unknown fixture " + effectiveFixture)
    var copy = JSON.parse(JSON.stringify(fixture))
    var stamp = Date.now()
    copy.observedAt = stamp
    for (var i = 0; i < copy.rooms.length; i++) {
      copy.rooms[i].observedAt = effectiveFixture === "stale" ? stamp - 180000 : stamp
      copy.rooms[i].expiresAt = effectiveFixture === "stale" ? stamp - 105000 : stamp + 75000
    }
    return StatusModel.normalizeV1(copy, stamp)
  }

  function evaluateAlerts(previous, current) {
    if (effectiveFixture) return
    var options = {
      alertsEnabled: boolSetting("alertsEnabled", false),
      alertHumanThreshold: intSetting("alertHumanThreshold", 2, 1, 16),
      alertAssignmentChanges: boolSetting("alertAssignmentChanges", false),
      quietStartHour: intSetting("quietStartHour", 22, 0, 23),
      quietEndHour: intSetting("quietEndHour", 8, 0, 23)
    }
    var events = StatusModel.alertEvents(previous, current, options, nowMs, {
      fresh: connectionState === "live" || connectionState === "empty",
      gameFocused: !desktopReady || gameFocused,
      dnd: dnd
    })
    var filtered = StatusModel.filterAlertReceipts(events, alertReceipts, nowMs, alertCooldownMs)
    alertReceipts = filtered.receipts
    if (filtered.events.length) {
      receiptsFile.setText(JSON.stringify({ version: 1, receipts: alertReceipts }, null, 2) + "\n")
      pendingNotices = pendingNotices.concat(filtered.events)
      runNextNotice()
    }
  }

  function runNextNotice() {
    if (notifyProcess.running || pendingNotices.length === 0) return
    var notice = pendingNotices[0]
    notifyProcess.command = [helperPath, "notify", notice.title, notice.body]
    notifyProcess.running = true
  }

  function refreshDesktop() {
    if (effectiveFixture) return
    if (!desktopStatus.running) desktopStatus.running = true
  }

  function applyDesktopStatus(data) {
    desktopReady = true
    windowOpen = data.windowOpen === true
    gameFocused = data.focused === true
    var lockState = String(data.lockState || (data.locked === true ? "locked" : "unknown"))
    locked = lockState !== "unlocked"
    dnd = data.dnd === "on"
    recording = data.recording === true
    capturesDirectory = String(data.capturesDirectory || "")
    var launcher = data.launcher || {}
    launcherInstalled = launcher.installed === true
    launcherCanonical = launcher.canonical === true
    launcherDurable = launcher.durable === true
    var shortcut = data.shortcut || {}
    shortcutInstalled = shortcut.installed === true
    shortcutChord = String(shortcut.chord || "")
    desktopPreferences = data.preferences || ({ workspace: null, fullscreen: false, desktopAudio: false })
    launchPending = !!data.launchPending
  }

  function desktopCommand(args, progressText) {
    if (effectiveFixture) { actionError = "Desktop actions are disabled in static preview."; return }
    if (desktopAction.running) return
    actionError = ""
    actionText = progressText || "Working…"
    desktopAction.command = [helperPath].concat(args)
    desktopAction.running = true
  }

  function returnToGame() { desktopCommand(["return"], windowOpen ? "Returning to the city…" : "Opening the city…") }
  function joinRoom(room) { if (room) desktopCommand(["join", room.id], "Opening " + room.label + "…") }
  function installLauncher() { desktopCommand(["install-launcher", "--icon", iconPath], "Repairing the launcher…") }
  function copyLink(room) { desktopCommand(room ? ["copy-link", "--room", room.id] : ["copy-link"], "Copying invitation…") }
  function toggleRecording() { desktopCommand([recording ? "record-stop" : "record-start"], recording ? "Saving recording…" : "Starting recording…") }
  function openCaptures() { desktopCommand(["open-captures"], "Opening captures…") }
  function saveDesktopPreferences(workspace, fullscreen, desktopAudio) {
    desktopCommand(["preferences", "--workspace", workspace > 0 ? String(workspace) : "current", "--fullscreen", fullscreen ? "true" : "false", "--desktop-audio", desktopAudio ? "true" : "false"], "Saving desktop preferences…")
  }
  function installShortcut(chord) { desktopCommand(["shortcut-install", chord], "Adding shortcut…") }
  function removeShortcut() { desktopCommand(["shortcut-remove"], "Removing shortcut…") }

  Process {
    id: statusProcess
    command: ["curl", "--silent", "--show-error", "--max-time", "5", "--write-out", "\n__RAT_HTTP__%{http_code}:%{content_type}", root.requestUrl()]
    stdout: StdioCollector { id: statusOut; waitForEnd: true }
    stderr: StdioCollector { id: statusErr; waitForEnd: true }
    onExited: function(code) {
      if (root.fixtureSwitching) return
      if (code !== 0) { root.finishFailure(statusErr.text || "The city desk did not answer."); return }
      try {
        var raw = String(statusOut.text || "")
        var marker = raw.lastIndexOf("\n__RAT_HTTP__")
        var metadata = marker >= 0 ? raw.substring(marker + 13) : "000:"
        var body = marker >= 0 ? raw.substring(0, marker) : raw
        var colon = metadata.indexOf(":")
        var httpStatus = parseInt(colon >= 0 ? metadata.substring(0, colon) : metadata, 10) || 0
        var contentType = colon >= 0 ? metadata.substring(colon + 1).toLowerCase() : ""
        if (root.requestKind === "v1" && (httpStatus === 404 || httpStatus === 501
            || (httpStatus === 200 && (contentType.indexOf("text/html") >= 0 || /^\s*</.test(body))))) {
          root.requestKind = "legacy"
          root.nextCursor = ""
          statusProcess.running = true
          return
        }
        if (httpStatus < 200 || httpStatus >= 300) throw new Error("Dispatch HTTP " + httpStatus)
        var parsed = JSON.parse(body || "{}")
        if (root.requestKind === "legacy") {
          root.finishSuccess(StatusModel.normalizeLegacy(parsed, Date.now()))
          return
        }
        var page = StatusModel.normalizeV1(parsed, Date.now())
        root.pendingStatus = StatusModel.mergePages(root.pendingStatus, page)
        root.pageCount++
        if (page.nextCursor && root.pageCount < 4) {
          root.nextCursor = page.nextCursor
          statusProcess.running = true
          return
        }
        if (page.nextCursor) root.pendingStatus.limited = true
        root.finishSuccess(root.pendingStatus)
      } catch (error) { root.finishFailure(String(error || "The city desk sent an unreadable report.")) }
    }
  }

  Process {
    id: fixtureProcess
    command: ["cat", root.fixturePath]
    stdout: StdioCollector { id: fixtureOut; waitForEnd: true }
    onExited: function(code) {
      if (root.fixtureSwitching) return
      try {
        if (code !== 0) throw new Error("fixture read failed")
        root.finishSuccess(root.parseFixture(fixtureOut.text))
      } catch (error) { root.finishFailure(String(error)) }
    }
  }

  Process {
    id: desktopStatus
    command: [root.helperPath, "status"]
    stdout: StdioCollector { id: desktopStatusOut; waitForEnd: true }
    onExited: function(code) {
      if (root.fixtureSwitching) return
      if (code !== 0) return
      try {
        var wasLocked = root.locked
        root.applyDesktopStatus(JSON.parse(String(desktopStatusOut.text || "{}")))
        if (wasLocked && !root.locked) root.refresh()
      } catch (error) {}
    }
  }

  Process {
    id: desktopAction
    stdout: StdioCollector { id: desktopActionOut; waitForEnd: true }
    stderr: StdioCollector { id: desktopActionErr; waitForEnd: true }
    onExited: function(code) {
      if (root.fixtureSwitching) return
      var result = null
      try { result = JSON.parse(String(desktopActionOut.text || "{}")) } catch (error) {}
      if (code === 0 && result && result.ok !== false) {
        var action = String(result.action || "")
        root.actionText = action === "focused" ? "Returned to the city."
          : action === "launched" || action === "join-launched" ? "City window opened."
          : action === "pending" ? "Opening the city…"
          : action === "busy" ? "A desktop action is already running."
          : action === "started" ? "Recording started."
          : action === "stopped" ? "Recording saved."
          : result.link ? "Invitation copied."
          : result.preferences ? "Desktop preferences saved."
          : "Done."
      } else {
        root.actionText = ""
        root.actionError = result && result.error ? String(result.error) : String(desktopActionErr.text || "Desktop action failed.")
      }
      root.refreshDesktop()
    }
  }

  Process {
    id: notifyProcess
    onExited: function(code) {
      root.pendingNotices = root.pendingNotices.slice(1)
      root.runNextNotice()
    }
  }

  Process {
    id: stateDirectory
    running: true
    command: ["mkdir", "-p", root.stateDir]
    onExited: function(code) { if (code === 0) receiptsFile.reload() }
  }

  FileView {
    id: receiptsFile
    path: root.receiptsPath
    printErrors: false
    onLoaded: {
      try {
        var parsed = JSON.parse(String(text() || "{}"))
        root.alertReceipts = parsed && parsed.receipts ? parsed.receipts : ({})
      } catch (error) { root.alertReceipts = ({}) }
    }
    onLoadFailed: root.alertReceipts = ({})
  }

  Timer { id: pollTimer; repeat: false; onTriggered: root.refresh() }
  Timer {
    interval: 1000
    running: true
    repeat: true
    onTriggered: {
      root.nowMs = Date.now()
      if (root.effectiveFixture === "loading") root.connectionState = "loading"
      else root.updateConnectionState()
    }
  }
  Timer { interval: root.panelOpen ? 5000 : 30000; running: true; repeat: true; onTriggered: root.refreshDesktop() }

  Component.onCompleted: {
    ServiceBridge.publish(root)
    root.refreshDesktop()
    root.refresh()
  }
  Component.onDestruction: ServiceBridge.clear(root)
}
