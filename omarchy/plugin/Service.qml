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
  property string shortcutError: ""
  property string lastDesktopAction: ""
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
  property var highlights: ({state: "off", clipCount: 0, enabled: false, reason: "Automatic highlights are off."})
  property bool highlightsBusy: false
  property var highlightClips: []
  property var highlightSessions: []
  property var highlightReel: ({items: []})
  property string highlightSessionId: ""
  property bool highlightsWindowOpen: false
  property var highlightsWindow: null
  property string lastHighlightDelete: ""
  property int failureCount: 0
  property string requestKind: "v1"
  property string nextCursor: ""
  property int pageCount: 0
  property var pendingStatus: null
  property bool refreshPending: false
  property var alertReceipts: ({})
  property bool receiptsReady: false
  property bool pendingEnableArm: false
  property bool settingsHydrated: false
  property bool alertBaselineReady: false
  property var previousFreshStatus: null
  property var pendingNotices: []
  property var inFlightNotice: null
  property var fixtureOverride: null
  property bool fixtureSwitching: false

  readonly property string appUrl: "https://ratdetective.online/"
  readonly property string endpointOverride: Quickshell.env("RAT_DETECTIVE_COMPANION_URL") || ""
  readonly property string statusUrl: endpointOverride || appUrl + "api/companion/v1/status"
  readonly property string legacyUrl: appUrl + "status"
  readonly property string fixtureName: Quickshell.env("RAT_DETECTIVE_COMPANION_FIXTURE") || ""
  readonly property string effectiveFixture: fixtureOverride !== null ? String(fixtureOverride) : fixtureName
  readonly property string helperPath: localPath(Qt.resolvedUrl("scripts/rat-detective-desktop.py"))
  readonly property string statusFetchPath: localPath(Qt.resolvedUrl("scripts/bounded-dispatch-fetch.py"))
  readonly property string iconPath: localPath(Qt.resolvedUrl("icon.png"))
  readonly property string fixturePath: localPath(Qt.resolvedUrl("fixtures/dispatch.json"))
  readonly property string stateDir: (Quickshell.env("XDG_STATE_HOME") || ((Quickshell.env("HOME") || "") + "/.local/state")) + "/rat-detective"
  readonly property string receiptsPath: stateDir + "/dispatch-alerts.json"
  readonly property int openRefreshMs: intSetting("openRefreshSec", 2, 2, 60) * 1000
  readonly property int closedRefreshMs: intSetting("closedRefreshSec", 30, 10, 600) * 1000
  readonly property int staleAfterMs: intSetting("staleAfterSec", 90, 30, 600) * 1000
  readonly property var totals: StatusModel.displayTotals(status, nowMs, connectionState)
  readonly property var selectedRoom: StatusModel.roomById(status, selectedRoomId)
  readonly property bool selectedRoomFresh: StatusModel.roomFresh(selectedRoom, nowMs)
  readonly property bool deliveryPending: pendingNotices.length > 0
  readonly property var alertStatusInfo: {
    var _tick = [nowMs, connectionState, dnd, gameFocused, desktopReady, locked, effectiveFixture, alertReceipts, settings, pendingNotices]
    return StatusModel.alertWatchStatus(alertOptions(), nowMs, alertContext())
  }
  readonly property string alertStatusText: alertStatusInfo.text
  readonly property string alertStatusDetail: alertStatusInfo.detail

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
    var wasEnabled = boolSetting("alertsEnabled", false)
    var previousThreshold = intSetting("alertHumanThreshold", StatusModel.GATHERING_HUMAN_THRESHOLD, 1, 10)
    var hadSettings = settingsHydrated
    settings = value || ({})
    settingsHydrated = true
    var nowEnabled = boolSetting("alertsEnabled", false)
    var nowThreshold = intSetting("alertHumanThreshold", StatusModel.GATHERING_HUMAN_THRESHOLD, 1, 10)
    if ((!wasEnabled && nowEnabled) || (hadSettings && previousThreshold !== nowThreshold)) {
      if (!receiptsReady) pendingEnableArm = true
      else armAlertConfiguration()
    }
    // Appearance and desktop preferences must not reset the network timer.
    if (previousOpen !== openRefreshMs || previousClosed !== closedRefreshMs) schedulePoll(100)
  }

  function armAlertConfiguration() {
    alertReceipts = StatusModel.stripGatheringReceipts(alertReceipts)
    pendingNotices = StatusModel.dropQueuedGathering(pendingNotices, alertReceipts, inFlightNotice)
    persistReceipts()
    if (status) evaluateAlerts(previousFreshStatus, status)
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
    abortNoticeEffects()
    refreshPending = false
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
    return StatusModel.companionStatusUrl(statusUrl, nextCursor, 16)
  }

  function refresh() {
    var action = StatusModel.refreshAction({
      locked: locked,
      fixture: effectiveFixture,
      requestRunning: statusProcess.running || fixtureProcess.running
    })
    if (action === "skip") return
    if (action === "defer") {
      refreshPending = true
      return
    }
    refreshPending = false
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
    var base = StatusModel.pollDelayMs(panelOpen, openRefreshMs, closedRefreshMs, failureCount, delay)
    var jitter = effectiveFixture ? 0 : Math.floor(base * (Math.random() * 0.16 - 0.08))
    pollTimer.interval = Math.max(250, base + jitter)
    pollTimer.restart()
  }

  function completeRefreshCycle() {
    var action = StatusModel.finishRefreshAction(refreshPending)
    refreshPending = false
    if (action === "start") refresh()
    else schedulePoll()
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
    var mode = StatusModel.alertEvaluateMode(alertBaselineReady, previousState, connectionState)
    if (mode === "evaluate") evaluateAlerts(oldFresh, status)
    if (connectionState === "live" || connectionState === "empty") {
      previousFreshStatus = status
      alertBaselineReady = true
    }
    completeRefreshCycle()
  }

  function finishFailure(message) {
    lastRequestFailed = true
    failureCount++
    errorText = String(message || "The city desk did not answer.")
    nowMs = Date.now()
    updateConnectionState()
    alertBaselineReady = false
    completeRefreshCycle()
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

  function alertOptions() {
    return {
      alertsEnabled: boolSetting("alertsEnabled", false),
      alertHumanThreshold: intSetting("alertHumanThreshold", StatusModel.GATHERING_HUMAN_THRESHOLD, 1, 10)
    }
  }

  function alertContext() {
    return {
      fresh: connectionState === "live" || connectionState === "empty",
      gameFocused: gameFocused,
      dnd: dnd,
      locked: locked && !effectiveFixture,
      fixture: !!effectiveFixture,
      baselineReady: alertBaselineReady,
      desktopReady: desktopReady,
      connectionState: connectionState,
      deliveryPending: pendingNotices.length > 0
    }
  }

  function persistReceipts() {
    if (!receiptsReady) return
    receiptsFile.setText(JSON.stringify({ version: 1, receipts: alertReceipts }, null, 2) + "\n")
  }

  function finishReceiptsInit(nextReceipts) {
    if (receiptsReady) return
    alertReceipts = StatusModel.releaseReservedReceipts(nextReceipts && typeof nextReceipts === "object" ? nextReceipts : ({}))
    receiptsReady = true
    if (pendingEnableArm) {
      pendingEnableArm = false
      alertReceipts = StatusModel.stripGatheringReceipts(alertReceipts)
      pendingNotices = StatusModel.dropQueuedGathering(pendingNotices, alertReceipts, inFlightNotice)
      persistReceipts()
    }
    if (status && (connectionState === "live" || connectionState === "empty"))
      evaluateAlerts(previousFreshStatus, status)
  }

  function applyNoticeQueue(advanced) {
    pendingNotices = advanced.queue
    alertReceipts = advanced.receipts
    persistReceipts()
  }

  function evaluateAlerts(previous, current) {
    if (effectiveFixture || !receiptsReady) return
    var options = alertOptions()
    var previousReceipts = alertReceipts
    alertReceipts = StatusModel.rearmGatheringReceipts(alertReceipts, current && current.rooms, nowMs, options.alertHumanThreshold)
    pendingNotices = StatusModel.dropQueuedGathering(pendingNotices, alertReceipts, inFlightNotice)
    var events = StatusModel.alertEvents(previous, current, options, nowMs, alertContext())
    var queued = {}
    for (var i = 0; i < pendingNotices.length; i++) if (pendingNotices[i] && pendingNotices[i].key) queued[pendingNotices[i].key] = true
    var filtered = StatusModel.filterAlertReceipts(events, alertReceipts, nowMs, 0, queued, current && current.rooms, 8, options.alertHumanThreshold)
    alertReceipts = filtered.receipts
    if (filtered.events.length || JSON.stringify(previousReceipts) !== JSON.stringify(alertReceipts)) persistReceipts()
    if (filtered.events.length) {
      pendingNotices = StatusModel.boundedNoticeQueue(pendingNotices.concat(filtered.events), 8)
      runNextNotice()
    }
  }

  function abortNoticeEffects() {
    noticeRetryTimer.stop()
    inFlightNotice = null
    var cleared = StatusModel.clearNoticeEffects(pendingNotices, alertReceipts)
    pendingNotices = cleared.queue
    alertReceipts = cleared.receipts
    persistReceipts()
  }

  function runNextNotice() {
    if (notifyProcess.running || pendingNotices.length === 0) return
    if (effectiveFixture || fixtureSwitching) {
      abortNoticeEffects()
      return
    }
    var now = Date.now()
    nowMs = now
    var notice = pendingNotices[0]
    var attempt = notice && { key: notice.key, episode: notice.episode, attempts: notice.attempts || 0 }
    if (!StatusModel.noticeDeliverable(alertOptions(), now, alertContext())) {
      applyNoticeQueue(StatusModel.settleNoticeAttempt(pendingNotices, alertReceipts, "suppressed", now, attempt))
      Qt.callLater(runNextNotice)
      return
    }
    if (!StatusModel.gatheringNoticeEligible(notice, status, now, alertOptions())) {
      applyNoticeQueue(StatusModel.settleNoticeAttempt(pendingNotices, alertReceipts, "suppressed", now, attempt))
      Qt.callLater(runNextNotice)
      return
    }
    inFlightNotice = attempt
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
    if (effectiveFixture) return
    if (desktopAction.running) return
    lastDesktopAction = String(args && args[0] || "")
    actionText = ""
    actionError = ""
    desktopAction.command = [helperPath].concat(args)
    desktopAction.running = true
  }

  function returnToGame() { desktopCommand(["return"], windowOpen ? "Returning to the city…" : "Opening the city…") }
  function playMatchingPreview() { desktopCommand(["play-preview"], "Opening the matching highlights preview…") }
  function joinRoom(room) { if (room) desktopCommand(["join", room.id], "Opening " + room.label + "…") }
  function installLauncher() { desktopCommand(["install-launcher", "--icon", iconPath], "Repairing the launcher…") }
  function copyLink(room) { desktopCommand(room ? ["copy-link", "--room", room.id] : ["copy-link"], "Copying invitation…") }
  function toggleRecording() { desktopCommand([recording ? "record-stop" : "record-start"], recording ? "Saving recording…" : "Starting recording…") }
  function openCaptures() { desktopCommand(["open-captures"], "Opening captures…") }
  function saveDesktopPreferences(workspace, fullscreen, desktopAudio) {
    desktopCommand(["preferences", "--workspace", workspace > 0 ? String(workspace) : "current", "--fullscreen", fullscreen ? "true" : "false", "--desktop-audio", desktopAudio ? "true" : "false"], "Saving desktop preferences…")
  }
  function installShortcut(chord) { desktopCommand(["shortcut-install", chord], "") }
  function removeShortcut() { desktopCommand(["shortcut-remove"], "") }
  function refreshHighlights() { if (!highlightsStatus.running) highlightsStatus.running = true }
  function setHighlightsEnabled(on) {
    var next = !!on
    highlights = Object.assign({}, highlights, {enabled: next, state: next ? (highlights.state === "off" ? "ready" : highlights.state) : "off"})
    highlightsBusy = true
    if (highlightsToggle.running) return
    highlightsToggle.command = [helperPath, next ? "highlights-enable" : "highlights-disable"]
    highlightsToggle.running = true
  }
  function resumeHighlights() { desktopCommand(["highlights-resume"], "Resuming highlights…") }
  function confirmHighlightSetup() { desktopCommand(["highlights-setup"], "Confirming the game window…") }
  function saveHighlight() { desktopCommand(["highlights-save"], "Saving the recent moment…") }
  function openHighlightsLibrary() {
    refreshHighlights()
    highlightsList.running = true
    if (!highlightsSessions.running) highlightsSessions.running = true
    if (!highlightsReel.running) highlightsReel.running = true
    highlightsWindowOpen = true
    if (highlightsWindow) { highlightsWindow.show(); highlightsWindow.raise(); return }
    var component = Qt.createComponent("components/HighlightsWindow.qml")
    if (component.status !== Component.Ready) { actionError = component.errorString(); return }
    highlightsWindow = component.createObject(root, {desk: root})
    if (highlightsWindow) highlightsWindow.show()
  }
  function setHighlightSession(sessionId) {
    highlightSessionId = String(sessionId || "")
    if (!highlightsList.running) highlightsList.running = true
    if (!highlightsReel.running) highlightsReel.running = true
  }
  function highlightFavorite(id, on) { desktopCommand(["highlights-favorite", id, on ? "true" : "false"], ""); Qt.callLater(function() { highlightsList.running = true }) }
  function highlightDelete(id) { lastHighlightDelete = id; desktopCommand(["highlights-delete", id], ""); Qt.callLater(function() { highlightsList.running = true }) }
  function highlightUndo() { if (lastHighlightDelete) desktopCommand(["highlights-undo", lastHighlightDelete], ""); Qt.callLater(function() { highlightsList.running = true }) }
  function highlightReveal(id) { desktopCommand(["highlights-reveal", id], "") }
  function highlightRename(id, title) { desktopCommand(["highlights-rename", id, title], "") }
  function highlightTrim(id, start, end) {
    if (desktopAction.running || effectiveFixture) return false
    var clip = null
    for (var i = 0; i < highlightClips.length; i++) if (highlightClips[i].id === id) clip = highlightClips[i]
    var duration = clip && clip.duration_ms ? Number(clip.duration_ms) : 0
    desktopCommand(["highlights-trim", id, String(Math.round(Number(start) * duration)), String(Math.round(Number(end) * duration))], "")
    pendingTrimId = id
    return true
  }
  property string pendingTrimId: ""
  signal highlightTrimFinished(string id, bool ok, string message)
  signal highlightExportFinished(bool ok, string message)
  function highlightExportClip(id, folder, filename) {
    if (desktopAction.running || effectiveFixture) return false
    desktopCommand(["highlights-export-clip", id, "--folder", folder, "--filename", filename], "Exporting clip…")
    return true
  }
  function highlightExportReel(sessionId, folder, filename) {
    if (desktopAction.running || effectiveFixture) return false
    desktopCommand(["highlights-export-reel", sessionId, "--folder", folder, "--filename", filename], "Exporting reel…")
    return true
  }
  function highlightExportSettings(options) {
    if (desktopAction.running || effectiveFixture) return false
    desktopCommand(["highlights-export-settings", JSON.stringify(options)], "Saving export settings…")
    return true
  }
  function highlightRegenerateReel(sessionId) {
    desktopCommand(["highlights-regenerate-reel"], "")
    if (sessionId) highlightSessionId = String(sessionId)
    Qt.callLater(function() { if (!highlightsReel.running) highlightsReel.running = true })
  }
  function highlightCancelJob(jobId) { if (jobId) desktopCommand(["highlights-cancel-job", jobId], "Cancelling export…") }

  Process {
    id: statusProcess
    command: ["python3", root.statusFetchPath, root.requestUrl()]
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
    id: highlightsStatus
    command: [root.helperPath, "highlights-status"]
    stdout: StdioCollector { id: highlightsStatusOut; waitForEnd: true }
    onExited: function(code) {
      if (code !== 0) return
      try {
        var parsed = JSON.parse(String(highlightsStatusOut.text || "{}"))
        if (parsed && parsed.ok !== false) {
          if (root.highlightsBusy) parsed.enabled = root.highlights.enabled
          root.highlights = parsed
        }
      } catch (error) {}
    }
  }

  Process {
    id: highlightsToggle
    stdout: StdioCollector { waitForEnd: true }
    onExited: function() {
      root.highlightsBusy = false
      root.refreshHighlights()
    }
  }

  Process {
    id: highlightsList
    command: root.highlightSessionId ? [root.helperPath, "highlights-list", root.highlightSessionId] : [root.helperPath, "highlights-list"]
    stdout: StdioCollector { id: highlightsListOut; waitForEnd: true }
    onExited: function(code) {
      if (code !== 0) return
      try {
        var parsed = JSON.parse(String(highlightsListOut.text || "{}"))
        root.highlightClips = parsed && parsed.clips ? parsed.clips : []
      } catch (error) {}
    }
  }

  Process {
    id: highlightsSessions
    command: [root.helperPath, "highlights-sessions"]
    stdout: StdioCollector { id: highlightsSessionsOut; waitForEnd: true }
    onExited: function(code) {
      if (code !== 0) return
      try {
        var parsed = JSON.parse(String(highlightsSessionsOut.text || "{}"))
        root.highlightSessions = parsed && parsed.sessions ? parsed.sessions : []
      } catch (error) {}
    }
  }

  Process {
    id: highlightsReel
    command: root.highlightSessionId ? [root.helperPath, "highlights-get-reel", root.highlightSessionId] : [root.helperPath, "highlights-get-reel"]
    stdout: StdioCollector { id: highlightsReelOut; waitForEnd: true }
    onExited: function(code) {
      if (code !== 0) return
      try {
        var parsed = JSON.parse(String(highlightsReelOut.text || "{}"))
        root.highlightReel = parsed && parsed.reel ? parsed.reel : ({items: []})
      } catch (error) {}
    }
  }

  Process {
    id: highlightsLeaseProcess
    command: [root.helperPath, "highlights-lease"]
    stdout: StdioCollector { waitForEnd: true }
  }

  Timer {
    id: highlightsLease
    interval: 5000
    running: true
    repeat: true
    onTriggered: {
      root.refreshHighlights()
      if (root.highlightsWindowOpen && !highlightsSessions.running) highlightsSessions.running = true
      if (root.highlightsWindowOpen && !highlightsReel.running) highlightsReel.running = true
      if (root.highlights && root.highlights.enabled && !highlightsLeaseProcess.running)
        highlightsLeaseProcess.running = true
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
      var shortcutAction = root.lastDesktopAction.indexOf("shortcut") === 0
      var errorText = result && result.error ? String(result.error) : String(desktopActionErr.text || "Desktop action failed.")
      if (root.lastDesktopAction === "highlights-trim" && root.pendingTrimId) {
        var trimOk = code === 0 && result && result.ok !== false && !!result.clip
        if (trimOk) root.highlightClips = root.highlightClips.map(function(clip) {
          return clip.id === root.pendingTrimId ? Object.assign({}, clip, result.clip) : clip
        })
        root.highlightTrimFinished(root.pendingTrimId, !!trimOk, trimOk ? "" : errorText)
        root.pendingTrimId = ""
      }
      if (root.lastDesktopAction.indexOf("highlights-export-") === 0) {
        var exportOk = code === 0 && result && result.ok !== false
        if (exportOk && result.exportSettings) root.highlights = result
        root.highlightExportFinished(!!exportOk, exportOk ? "" : errorText)
      }
      root.actionText = ""
      if (code === 0 && result && result.ok !== false) {
        if (shortcutAction) root.shortcutError = ""
      } else if (shortcutAction) {
        root.shortcutError = errorText
      }
      root.refreshDesktop()
      if (root.highlightsWindowOpen && !highlightsList.running) highlightsList.running = true
    }
  }

  Process {
    id: notifyProcess
    stdout: StdioCollector { id: notifyOut; waitForEnd: true }
    onExited: function(code) {
      if (root.fixtureSwitching || root.effectiveFixture) {
        root.inFlightNotice = null
        root.abortNoticeEffects()
        return
      }
      var attempt = root.inFlightNotice
      root.inFlightNotice = null
      var classified = StatusModel.classifyNotifyResult(code, notifyOut.text)
      var result = classified
      if (classified === "failed") {
        for (var i = 0; i < root.pendingNotices.length; i++) {
          if (!StatusModel.noticeMatchesAttempt(root.pendingNotices[i], attempt)) continue
          root.pendingNotices[i].attempts = (root.pendingNotices[i].attempts || 0) + 1
          result = root.pendingNotices[i].attempts >= 3 ? "suppressed" : "failed"
          break
        }
      }
      var now = Date.now()
      root.nowMs = now
      var advanced = StatusModel.settleNoticeAttempt(root.pendingNotices, root.alertReceipts, result, now, attempt)
      root.applyNoticeQueue(advanced)
      if (result === "failed" && advanced.settled) noticeRetryTimer.restart()
      else root.runNextNotice()
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
        root.finishReceiptsInit(parsed && parsed.receipts ? parsed.receipts : ({}))
      } catch (error) { root.finishReceiptsInit({}) }
    }
    onLoadFailed: root.finishReceiptsInit({})
  }

  Timer { id: pollTimer; repeat: false; onTriggered: root.refresh() }
  Timer {
    id: noticeRetryTimer
    interval: 4000
    repeat: false
    onTriggered: {
      if (root.fixtureSwitching || root.effectiveFixture) return
      root.runNextNotice()
    }
  }
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
