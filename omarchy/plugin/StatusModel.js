var ASSIGNMENTS = {
  "chain-of-custody": { title: "PAPER CHASE", target: 3, unit: "deliveries" },
  jurisdiction: { title: "JURISDICTION", target: 60, unit: "zone points" },
  "excessive-force": { title: "EXCESSIVE FORCE", target: 10, unit: "case kills" },
  "closing-time": { title: "CLOSING TIME", target: 120000, unit: "processing" }
}

function finite(value, fallback) {
  var n = Number(value)
  return isFinite(n) ? n : fallback
}

function boundedInteger(value, fallback, minimum, maximum) {
  var n = Math.floor(finite(value, fallback))
  return Math.max(minimum, Math.min(maximum, n))
}

function boundedString(value, fallback, maximum) {
  var text = typeof value === "string" ? value.trim() : ""
  if (!text) text = fallback || ""
  return text.slice(0, maximum || 96)
}

var GATHERING_HUMAN_THRESHOLD = 2
var BOT_ID_RE = /^rd-ai-\d{2}$/
var HUMAN_ID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

function participantKind(id) {
  var value = boundedString(id, "", 64)
  if (BOT_ID_RE.test(value)) return "bot"
  if (HUMAN_ID_RE.test(value)) return "human"
  return ""
}

function gatheringReceiptKey(roomId) {
  return "gathering:" + boundedString(roomId, "", 160)
}

function isCurrentGatheringKey(key) {
  if (typeof key !== "string" || key.indexOf("gathering:") !== 0) return false
  var rest = key.slice(10)
  return rest.length > 0 && rest.indexOf(":") === -1
}

function gatheringThreshold(settings) {
  var options = settings && typeof settings === "object" ? settings : {}
  return boundedInteger(options.alertHumanThreshold, GATHERING_HUMAN_THRESHOLD, 1, 10)
}

function gatheringNoticeCopy(humans) {
  var count = boundedInteger(humans, 1, 1, 16)
  if (count === 1) return "1 person is playing Rat Detective."
  return count + " people are playing Rat Detective."
}

function timestamp(value) {
  var n = finite(value, 0)
  return n > 0 ? n : 0
}

function assignmentId(value) {
  var id = boundedString(value, "", 40)
  return ASSIGNMENTS[id] ? id : ""
}

function publicRoomLabel(id, index) {
  if (id === "public-live-v2" || id === "public") return "Public city"
  var match = /^public-live-v2-([0-9a-f]{8})-[0-9a-f-]{27}$/i.exec(id)
  return match ? "City " + match[1] : "Public room " + (index + 1)
}

function normalizeRows(rows, assignment, preserveOrder) {
  if (!Array.isArray(rows)) return []
  var out = []
  var seen = {}
  for (var i = 0; i < rows.length && out.length < 16; i++) {
    var row = rows[i]
    if (!row || typeof row !== "object") continue
    var name = boundedString(row.name, "", 32)
    if (!name) continue
    var rawId = boundedString(row.playerId || row.id, "", 64)
    var id = rawId || ("row-" + i)
    if (seen[id]) id += "-" + i
    seen[id] = true
    var points = row.objectiveScore
    out.push({
      id: id,
      name: name,
      kind: participantKind(rawId),
      points: boundedInteger(points, 0, 0, 1000000),
      target: ASSIGNMENTS[assignment] ? ASSIGNMENTS[assignment].target : 0,
      kills: boundedInteger(row.kills, 0, 0, 1000000),
      deaths: boundedInteger(row.deaths, 0, 0, 1000000),
      local: row.local === true,
      holder: row.holder === true || row.hasCase === true
    })
  }
  if (!preserveOrder) out.sort(function(a, b) {
    return b.points - a.points || b.kills - a.kills || a.deaths - b.deaths || a.name.localeCompare(b.name)
  })
  return out
}

function normalizeAssignment(raw, fallbackPhase) {
  var source = raw && typeof raw === "object" ? raw : {}
  var id = assignmentId(source.id || source.assignmentId)
  var info = ASSIGNMENTS[id] || { title: "DISPATCH ASSIGNMENT", target: 0, unit: "progress" }
  var phase = boundedString(source.phase, fallbackPhase || "active", 16).toLowerCase()
  if (["briefing", "active", "suspended", "closed"].indexOf(phase) === -1) phase = "active"
  var resultSource = source.result && typeof source.result === "object" ? source.result : null
  var winnerName = resultSource
    ? boundedString(resultSource.winnerName, "", 32)
    : boundedString(source.winnerName, "", 32)
  var zoneSource = source.zone && typeof source.zone === "object" ? source.zone : {}
  var nextZoneSource = source.nextZone && typeof source.nextZone === "object" ? source.nextZone : {}
  var destinationSource = source.destination && typeof source.destination === "object" ? source.destination : {}
  var remaining = source.remainingMs
  var clockRunning = source.clockRunning === true
  var objectiveRows = source.objectiveRows || []
  return {
    id: id,
    title: boundedString(source.title, info.title, 48),
    phase: phase,
    rule: boundedString(source.rule, "", 140),
    objectiveRows: normalizeRows(objectiveRows, id),
    caseHolderName: boundedString(source.caseHolderName, "", 32),
    destination: boundedString(destinationSource.label, "", 64),
    zone: boundedString(zoneSource.label, "", 64),
    nextZone: boundedString(nextZoneSource.label, "", 64),
    zoneWarning: !!source.nextZone,
    relocationRemainingMs: Math.max(0, finite(source.zoneRemainingMs, 0)),
    remainingMs: Math.max(0, finite(remaining, 0)),
    clockRunning: clockRunning,
    winnerName: winnerName,
    result: resultSource ? {
      winnerName: winnerName,
      method: boundedString(resultSource.method, "", 24),
      at: timestamp(resultSource.at)
    } : null,
    target: info.target,
    unit: info.unit
  }
}

function normalizeRoom(raw, envelopeObservedAt, index, receivedAt) {
  var source = raw && typeof raw === "object" ? raw : {}
  var id = boundedString(source.room, "public-live-v2", 160)
  var label = publicRoomLabel(id, index)
  var observedAt = timestamp(source.observedAt || envelopeObservedAt)
  var freshUntil = timestamp(source.expiresAt)
  var players = source.players
  var humans = source.humans
  var capacity = 16
  var assignment = normalizeAssignment(source.assignment || source, source.phase)
  var rows = source.scores || []
  if (assignment.objectiveRows.length === 0 && assignment.id !== "closing-time") assignment.objectiveRows = normalizeRows(rows, assignment.id)
  assignment.caseHolderName = boundedString(source.holderName, "", 32)
  if (source.result && typeof source.result === "object") {
    assignment.winnerName = boundedString(source.result.winnerName, "", 32)
    assignment.result = {
      winnerName: assignment.winnerName,
      method: boundedString(source.result.method, "", 24),
      at: timestamp(source.result.at)
    }
  }
  var target = source.assignment && source.assignment.objectiveTarget
  for (var rowIndex = 0; rowIndex < assignment.objectiveRows.length; rowIndex++)
    assignment.objectiveRows[rowIndex].target = target === null ? 0 : boundedInteger(target, assignment.target, 0, 1000000)
  return {
    id: id,
    label: label,
    generation: boundedInteger(source.generation, 1, 1, 2147483647),
    revision: boundedInteger(source.revision, index || 0, 0, 2147483647),
    roundId: boundedString(source.roundId || (source.assignment && source.assignment.roundId), "", 64),
    observedAt: observedAt,
    freshUntil: freshUntil,
    localObservedAt: receivedAt - Math.max(0, envelopeObservedAt - observedAt),
    localFreshUntil: receivedAt + Math.max(0, freshUntil - envelopeObservedAt),
    players: boundedInteger(players, Array.isArray(rows) ? rows.length : 0, 0, 16),
    humans: boundedInteger(humans, 0, 0, 16),
    capacity: boundedInteger(capacity, 16, 1, 16),
    assignment: assignment,
    scores: normalizeRows(rows, assignment.id, true),
    joinable: source.joinable !== false,
    active: source.active !== false
  }
}

function normalizeV1(data, now) {
  if (!data || typeof data !== "object") throw new Error("status is not an object")
  var version = Number(data.schemaVersion !== undefined ? data.schemaVersion : data.version)
  if (version !== 1) throw new Error("unsupported companion schema")
  var observedAt = timestamp(data.observedAt || data.generatedAt) || now
  var rawRooms = Array.isArray(data.rooms) ? data.rooms : (data.room ? [data.room] : [])
  var rooms = []
  var seen = {}
  for (var i = 0; i < rawRooms.length && rooms.length < 64; i++) {
    var room = normalizeRoom(rawRooms[i], observedAt, i, now)
    if (!room.active || seen[room.id]) continue
    seen[room.id] = true
    rooms.push(room)
  }
  rooms.sort(function(a, b) { return b.humans - a.humans || b.players - a.players || a.label.localeCompare(b.label) })
  return {
    schemaVersion: 1,
    observedAt: observedAt,
    rooms: rooms,
    nextCursor: boundedString(data.nextCursor || (data.pagination && data.pagination.nextCursor), "", 256),
    limited: false
  }
}

function normalizeLegacy(data, now) {
  if (!data || typeof data !== "object") throw new Error("legacy status is not an object")
  var rows = Array.isArray(data.scores) ? data.scores : []
  var room = normalizeRoom({
    room: data.room || "public",
    roomLabel: "Public city",
    observedAt: now,
    expiresAt: now + 75000,
    players: data.players,
    phase: data.phase,
    startedAt: data.startedAt,
    winnerName: data.winnerName,
    scores: rows,
    assignment: { title: "Classic status", phase: data.phase === "won" ? "closed" : "active", winnerName: data.winnerName }
  }, now, 0, now)
  return { schemaVersion: 0, observedAt: now, rooms: [room], nextCursor: "", limited: true }
}

function mergePages(base, page) {
  if (!base) return page
  var byId = {}
  var rooms = []
  var combined = (base.rooms || []).concat(page.rooms || [])
  for (var i = 0; i < combined.length; i++) {
    var room = combined[i]
    var previous = byId[room.id]
    if (!previous) {
      byId[room.id] = room
      rooms.push(room)
    } else if (room.generation > previous.generation || (room.generation === previous.generation && room.revision >= previous.revision)) {
      byId[room.id] = room
      rooms[rooms.indexOf(previous)] = room
    }
  }
  rooms.sort(function(a, b) { return b.humans - a.humans || b.players - a.players || a.label.localeCompare(b.label) })
  return {
    schemaVersion: page.schemaVersion,
    observedAt: Math.max(base.observedAt || 0, page.observedAt || 0),
    rooms: rooms.slice(0, 64),
    nextCursor: page.nextCursor,
    limited: base.limited || page.limited
  }
}

function roomById(status, id) {
  var rooms = status && Array.isArray(status.rooms) ? status.rooms : []
  for (var i = 0; i < rooms.length; i++) if (rooms[i].id === id) return rooms[i]
  return !id && rooms.length ? rooms[0] : null
}

function totals(status) {
  var rooms = status && Array.isArray(status.rooms) ? status.rooms : []
  var players = 0
  var humans = 0
  for (var i = 0; i < rooms.length; i++) {
    players += boundedInteger(rooms[i].players, 0, 0, 16)
    humans += boundedInteger(rooms[i].humans, 0, 0, 16)
  }
  return { rooms: rooms.length, players: players, humans: humans }
}

function freshTotals(status, now) {
  var rooms = status && Array.isArray(status.rooms) ? status.rooms : []
  var players = 0
  var humans = 0
  var count = 0
  for (var i = 0; i < rooms.length; i++) {
    if (!roomFresh(rooms[i], now)) continue
    count++
    players += boundedInteger(rooms[i].players, 0, 0, 16)
    humans += boundedInteger(rooms[i].humans, 0, 0, 16)
  }
  return { rooms: count, players: players, humans: humans }
}

function displayTotals(status, now, state) {
  var all = totals(status)
  if (state !== "live" && state !== "empty") return all
  var fresh = freshTotals(status, now)
  return { rooms: all.rooms, players: fresh.players, humans: fresh.humans }
}

function companionStatusUrl(baseUrl, cursor, limit) {
  var base = String(baseUrl || "")
  var page = boundedInteger(limit, 16, 1, 32)
  var separator = base.indexOf("?") === -1 ? "?" : "&"
  var url = base + separator + "limit=" + page
  var token = boundedString(cursor, "", 256)
  if (token) url += "&cursor=" + encodeURIComponent(token)
  return url
}

function refreshAction(state) {
  var options = state && typeof state === "object" ? state : {}
  var fixture = String(options.fixture || "")
  if (options.locked && !fixture) return "skip"
  if (options.requestRunning) return "defer"
  return "start"
}

function finishRefreshAction(pending) {
  return pending ? "start" : "schedule"
}

function pollDelayMs(panelOpen, openMs, closedMs, failureCount, explicitDelay) {
  var base = explicitDelay === undefined || explicitDelay === null
    ? (panelOpen ? finite(openMs, 2000) : finite(closedMs, 30000))
    : finite(explicitDelay, 0)
  var failures = boundedInteger(failureCount, 0, 0, 8)
  if (failures > 0) base = Math.max(base, Math.min(300000, 5000 * Math.pow(2, Math.min(6, failures - 1))))
  return Math.max(250, base)
}

function roomFresh(room, now) {
  if (!room) return false
  return room.localFreshUntil > 0 ? now <= room.localFreshUntil : now - room.localObservedAt <= 75000
}

function connectionState(status, receivedAt, now, staleAfterMs, failed) {
  if (!status) return failed ? "unavailable" : "loading"
  var rooms = status.rooms || []
  var newestObservation = 0
  var anyFresh = rooms.length === 0
  var freshPlayers = 0
  for (var i = 0; i < rooms.length; i++) {
    newestObservation = Math.max(newestObservation, rooms[i].localObservedAt || 0)
    if (roomFresh(rooms[i], now)) {
      anyFresh = true
      freshPlayers += boundedInteger(rooms[i].players, 0, 0, 16)
    }
  }
  var age = Math.max(0, now - (newestObservation || receivedAt || 0))
  if (failed || !anyFresh || age > staleAfterMs) return "stale"
  return freshPlayers > 0 ? "live" : "empty"
}

function formatClock(milliseconds) {
  var seconds = Math.max(0, Math.floor(finite(milliseconds, 0) / 1000))
  var hours = Math.floor(seconds / 3600)
  var minutes = Math.floor((seconds % 3600) / 60)
  var remainder = seconds % 60
  var ss = (remainder < 10 ? "0" : "") + remainder
  return hours > 0 ? hours + ":" + (minutes < 10 ? "0" : "") + minutes + ":" + ss : minutes + ":" + ss
}

function displayRemaining(baseMs, observedAt, now, running, fresh) {
  if (!running || !fresh) return Math.max(0, finite(baseMs, 0))
  return Math.max(0, finite(baseMs, 0) - Math.max(0, now - timestamp(observedAt)))
}

function objectiveLine(room, now, fresh) {
  if (!room) return "No active dispatch"
  var a = room.assignment
  if (a.winnerName) return a.winnerName + " closed the case"
  if (a.phase === "briefing") return "Briefing in progress"
  if (a.phase === "suspended") return "Assignment suspended"
  if (a.id === "chain-of-custody") return a.destination ? "Deliver to " + a.destination : "Paperwork in circulation"
  if (a.id === "jurisdiction") {
    if (a.zoneWarning && a.nextZone) return "Relocating to " + a.nextZone + " in " + formatClock(displayRemaining(a.relocationRemainingMs, room.localObservedAt, now, true, fresh))
    return a.zone ? "Hold the case in " + a.zone : "Zone pending"
  }
  if (a.id === "excessive-force") return a.caseHolderName ? a.caseHolderName + " has the case" : "Get the case to score"
  if (a.id === "closing-time") return formatClock(displayRemaining(a.remainingMs, room.localObservedAt, now, a.clockRunning, fresh)) + " remaining"
  return a.phase === "closed" ? "Round over" : "Limited assignment detail"
}

function isQuietHour(now, startHour, endHour) {
  var start = boundedInteger(startHour, 22, 0, 23)
  var end = boundedInteger(endHour, 8, 0, 23)
  if (start === end) return false
  var hour = new Date(now).getHours()
  return start < end ? hour >= start && hour < end : hour >= start || hour < end
}

function receiptEntry(value) {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    var at = finite(value.at, finite(value.sentAt, finite(value.reservedAt, 0)))
    var reserved = value.state === "reserved" || value.reserved === true
    if (at <= 0) return null
    var entry = { at: at, state: reserved ? "reserved" : "sent" }
    var episode = finite(value.episode, 0)
    if (episode > 0) entry.episode = episode
    return entry
  }
  var stamp = finite(value, 0)
  return stamp > 0 ? { at: stamp, state: "sent" } : null
}

function receiptState(receipts, key) {
  var entry = receipts && receiptEntry(receipts[key])
  return entry ? entry.state : ""
}

function receiptTime(receipts, key) {
  var entry = receipts && receiptEntry(receipts[key])
  return entry ? entry.at : 0
}

function populatedGatheringKeys(rooms, threshold) {
  if (!Array.isArray(rooms)) return null
  var need = boundedInteger(threshold, GATHERING_HUMAN_THRESHOLD, 1, 10)
  var keys = {}
  for (var i = 0; i < rooms.length; i++) {
    var room = rooms[i]
    if (!room || boundedInteger(room.humans, 0, 0, 16) < need) continue
    keys[gatheringReceiptKey(room.id)] = true
  }
  return keys
}

function normalizeReceipts(receipts, now, rooms, threshold) {
  var source = receipts && typeof receipts === "object" ? receipts : {}
  var populated = populatedGatheringKeys(rooms, threshold)
  var protectedEntries = {}
  var others = []
  for (var key in source) {
    if (!isCurrentGatheringKey(key)) continue
    var entry = receiptEntry(source[key])
    if (!entry) continue
    var latch = entry.state === "sent" && (populated === null || populated[key])
    if (latch) protectedEntries[key] = entry
    else if (entry.at > now - 86400000) others.push({ key: key, entry: entry })
  }
  others.sort(function(a, b) { return b.entry.at - a.entry.at })
  var kept = {}
  for (var protectedKey in protectedEntries) kept[protectedKey] = protectedEntries[protectedKey]
  var cap = 64
  for (var i = 0; i < others.length && Object.keys(kept).length < cap; i++)
    kept[others[i].key] = others[i].entry
  return kept
}

function stripGatheringReceipts(receipts) {
  var next = {}
  var source = receipts && typeof receipts === "object" ? receipts : {}
  for (var key in source) {
    if (!isCurrentGatheringKey(key)) next[key] = source[key]
  }
  return next
}

function rearmGatheringReceipts(receipts, rooms, now, threshold) {
  var need = boundedInteger(threshold, GATHERING_HUMAN_THRESHOLD, 1, 10)
  var kept = normalizeReceipts(receipts, finite(now, 0) || 1, rooms, need)
  var list = Array.isArray(rooms) ? rooms : []
  for (var i = 0; i < list.length; i++) {
    var room = list[i]
    if (!room || !roomFresh(room, now)) continue
    if (boundedInteger(room.humans, 0, 0, 16) >= need) continue
    var key = gatheringReceiptKey(room.id)
    if (kept[key]) delete kept[key]
  }
  return kept
}

function noticeMatchesAttempt(notice, attempt) {
  if (!notice || !attempt || notice.key !== attempt.key) return false
  var episode = finite(notice.episode, 0)
  var want = finite(attempt.episode, 0)
  if (want > 0 && episode > 0) return episode === want
  return want === 0 || episode === 0 || episode === want
}

function dropQueuedGathering(queue, receipts, inflight) {
  var pending = Array.isArray(queue) ? queue : []
  var kept = receipts && typeof receipts === "object" ? receipts : {}
  var next = []
  for (var i = 0; i < pending.length; i++) {
    var notice = pending[i]
    if (!notice || !notice.key) continue
    if (inflight && noticeMatchesAttempt(notice, inflight)) {
      next.push(notice)
      continue
    }
    if (isCurrentGatheringKey(notice.key) && !kept[notice.key]) continue
    next.push(notice)
  }
  return boundedNoticeQueue(next, 8)
}

function roomIdFromGatheringKey(key) {
  return isCurrentGatheringKey(key) ? key.slice(10) : ""
}

function gatheringNoticeEligible(notice, status, now, settings) {
  if (!notice || !isCurrentGatheringKey(notice.key)) return false
  var room = roomById(status, roomIdFromGatheringKey(notice.key))
  if (!room || !roomFresh(room, now)) return false
  return boundedInteger(room.humans, 0, 0, 16) >= gatheringThreshold(settings)
}

function latestReceiptAt(receipts, sentOnly) {
  var latest = 0
  var source = receipts && typeof receipts === "object" ? receipts : {}
  for (var key in source) {
    var entry = receiptEntry(source[key])
    if (!entry || (sentOnly && entry.state !== "sent")) continue
    latest = Math.max(latest, entry.at)
  }
  return latest
}

function alertEvaluateMode(baselineReady, previousState, nextState) {
  if (nextState === "live" || nextState === "empty") return "evaluate"
  return "hold"
}

function alertBlockReason(settings, now, context) {
  var options = settings && typeof settings === "object" ? settings : {}
  var state = context && typeof context === "object" ? context : {}
  if (state.fixture) return "fixture"
  if (options.alertsEnabled !== true) return "disabled"
  if (state.locked) return "locked"
  if (state.connectionState === "loading" || state.connectionState === "unavailable" || state.desktopReady === false)
    return "not-ready"
  if (state.fresh === false || state.connectionState === "stale") return "stale"
  if (state.dnd) return "dnd"
  if (state.gameFocused) return "game-focus"
  if (state.deliveryPending) return "delivery-pending"
  return ""
}

function alertStatusCopy(reason) {
  if (reason === "fixture") return { text: "Alerts paused: preview only", detail: "Static preview suppresses desktop alerts." }
  if (reason === "disabled") return { text: "Alerts: off", detail: "Notifications stay off until you enable them." }
  if (reason === "locked") return { text: "Alerts paused: waiting for unlock", detail: "City reports pause while the session is locked." }
  if (reason === "not-ready") return { text: "Alerts paused: not ready", detail: "Alerts wait for a live city report before they can fire." }
  if (reason === "stale") return { text: "Alerts paused: stale report", detail: "Stale reports do not fire notices." }
  if (reason === "dnd") return { text: "Alerts paused: Do not disturb", detail: "System Do Not Disturb is on, so notices stay silent." }
  if (reason === "game-focus") return { text: "Alerts paused: in game", detail: "Companion alerts stay silent while the game is focused." }
  if (reason === "delivery-pending") return { text: "Alerts paused: waiting to deliver", detail: "A notice is waiting to send. It has not been delivered yet." }
  return {
    text: "Alerts: watching the city",
    detail: "A notice fires once when at least 2 people are in the same fresh public room."
  }
}

function alertWatchStatus(settings, now, context) {
  var copy = alertStatusCopy(alertBlockReason(settings, now, context))
  if (copy.text === "Alerts: watching the city") {
    var need = gatheringThreshold(settings)
    copy.detail = need === 1
      ? "A notice fires once when at least 1 person is in the same fresh public room."
      : "A notice fires once when at least " + need + " people are in the same fresh public room."
  }
  return copy
}

function evaluationBlocked(settings, now, context) {
  var reason = alertBlockReason(settings, now, context)
  return reason === "disabled" || reason === "fixture" || reason === "locked" || reason === "not-ready"
    || reason === "stale" || reason === "dnd" || reason === "game-focus"
}

function noticeDeliverable(settings, now, context) {
  var reason = alertBlockReason(settings, now, context)
  return reason === "" || reason === "delivery-pending"
}

function alertEvents(previous, current, settings, now, context) {
  if (!current || evaluationBlocked(settings, now, context)) return []
  var rooms = current.rooms || []
  var events = []
  for (var i = 0; i < rooms.length; i++) {
    var room = rooms[i]
    if (!roomFresh(room, now)) continue
    if (boundedInteger(room.humans, 0, 0, 16) < gatheringThreshold(settings)) continue
    var copy = gatheringNoticeCopy(room.humans)
    events.push({
      key: gatheringReceiptKey(room.id),
      episode: now,
      title: copy,
      body: ""
    })
  }
  return events
}

function filterAlertReceipts(events, receipts, now, cooldownMs, queuedKeys, rooms, queueLimit, threshold) {
  var kept = normalizeReceipts(receipts, now, rooms, threshold)
  var queued = queuedKeys && typeof queuedKeys === "object" ? queuedKeys : {}
  var queuedCount = 0
  for (var queuedKey in queued) if (queued[queuedKey]) queuedCount++
  var remaining = Math.max(0, boundedInteger(queueLimit, 8, 1, 16) - queuedCount)
  var accepted = []
  for (var i = 0; i < events.length && accepted.length < remaining; i++) {
    var event = events[i]
    if (!event || !isCurrentGatheringKey(event.key)) continue
    if (queued[event.key] || kept[event.key]) continue
    var episode = finite(event.episode, now)
    if (episode > 0) event.episode = episode
    kept[event.key] = { at: now, state: "reserved", episode: episode }
    accepted.push(event)
  }
  return { events: accepted, receipts: kept }
}

function releaseAlertReceipt(receipts, key) {
  var next = {}
  var source = receipts && typeof receipts === "object" ? receipts : {}
  for (var existing in source) if (existing !== key) next[existing] = source[existing]
  return next
}

function releaseReservedReceipts(receipts) {
  var next = {}
  var source = receipts && typeof receipts === "object" ? receipts : {}
  for (var key in source) {
    var entry = receiptEntry(source[key])
    if (entry && entry.state === "sent") next[key] = entry
  }
  return next
}

function boundedNoticeQueue(queue, maximum) {
  var pending = Array.isArray(queue) ? queue.slice() : []
  var cap = boundedInteger(maximum, 8, 1, 16)
  return pending.length > cap ? pending.slice(0, cap) : pending
}

function classifyNotifyResult(code, stdout) {
  var parsed = null
  try { parsed = JSON.parse(String(stdout || "").replace(/^\s+|\s+$/g, "")) } catch (error) { parsed = null }
  if (parsed && typeof parsed === "object") {
    var action = boundedString(parsed.action, "", 40)
    if (parsed.ok === true && action === "sent") return "sent"
    if (parsed.ok === true && (action === "suppressed-dnd" || action === "suppressed-focused" || action.indexOf("suppressed-") === 0))
      return "suppressed"
    if (parsed.ok === false || action === "failed") return "failed"
  }
  return "failed"
}

function receiptMatchesAttempt(receipts, attempt) {
  if (!attempt || !attempt.key) return false
  var entry = receipts && receiptEntry(receipts[attempt.key])
  if (!entry) return false
  var episode = finite(entry.episode, 0)
  var want = finite(attempt.episode, 0)
  if (want > 0 && episode > 0) return episode === want
  return true
}

function settleNoticeAttempt(queue, receipts, result, now, attempt) {
  var pending = Array.isArray(queue) ? queue.slice() : []
  var stamp = finite(now, 0) || 1
  var nextReceipts = normalizeReceipts(receipts, stamp)
  if (!attempt || !attempt.key) return { queue: boundedNoticeQueue(pending, 8), receipts: nextReceipts, settled: false }
  var index = -1
  for (var i = 0; i < pending.length; i++) {
    if (noticeMatchesAttempt(pending[i], attempt)) {
      index = i
      break
    }
  }
  if (index < 0) return { queue: boundedNoticeQueue(pending, 8), receipts: nextReceipts, settled: false }
  var notice = pending[index]
  var matched = receiptMatchesAttempt(nextReceipts, attempt)
  if (result === "sent") {
    if (matched) nextReceipts[notice.key] = { at: stamp, state: "sent", episode: finite(attempt.episode, finite(notice.episode, stamp)) }
    pending.splice(index, 1)
    return { queue: boundedNoticeQueue(pending, 8), receipts: nextReceipts, settled: true }
  }
  if (result === "failed") {
    if (!receiptEntry(nextReceipts[notice.key])) {
      pending.splice(index, 1)
      return { queue: boundedNoticeQueue(pending, 8), receipts: nextReceipts, settled: true }
    }
    if (!matched) return { queue: boundedNoticeQueue(pending, 8), receipts: nextReceipts, settled: false }
    if (receiptEntry(nextReceipts[notice.key]).state !== "reserved")
      nextReceipts[notice.key] = { at: stamp, state: "reserved", episode: finite(attempt.episode, finite(notice.episode, stamp)) }
    return { queue: boundedNoticeQueue(pending, 8), receipts: nextReceipts, settled: true }
  }
  if (matched) nextReceipts = releaseAlertReceipt(nextReceipts, notice.key)
  pending.splice(index, 1)
  return { queue: boundedNoticeQueue(pending, 8), receipts: nextReceipts, settled: true }
}

function advanceNoticeQueue(queue, receipts, result, now) {
  var pending = Array.isArray(queue) ? queue : []
  var head = pending.length ? pending[0] : null
  return settleNoticeAttempt(pending, receipts, result, now, head && { key: head.key, episode: head.episode })
}

function clearNoticeEffects(queue, receipts) {
  return { queue: [], receipts: releaseReservedReceipts(receipts) }
}

if (typeof module !== "undefined") {
  module.exports = {
    ASSIGNMENTS: ASSIGNMENTS,
    GATHERING_HUMAN_THRESHOLD: GATHERING_HUMAN_THRESHOLD,
    participantKind: participantKind,
    gatheringReceiptKey: gatheringReceiptKey,
    isCurrentGatheringKey: isCurrentGatheringKey,
    gatheringNoticeCopy: gatheringNoticeCopy,
    gatheringThreshold: gatheringThreshold,
    publicRoomLabel: publicRoomLabel,
    normalizeV1: normalizeV1,
    normalizeLegacy: normalizeLegacy,
    mergePages: mergePages,
    roomById: roomById,
    totals: totals,
    freshTotals: freshTotals,
    displayTotals: displayTotals,
    companionStatusUrl: companionStatusUrl,
    refreshAction: refreshAction,
    finishRefreshAction: finishRefreshAction,
    pollDelayMs: pollDelayMs,
    connectionState: connectionState,
    roomFresh: roomFresh,
    formatClock: formatClock,
    displayRemaining: displayRemaining,
    objectiveLine: objectiveLine,
    isQuietHour: isQuietHour,
    stripGatheringReceipts: stripGatheringReceipts,
    rearmGatheringReceipts: rearmGatheringReceipts,
    dropQueuedGathering: dropQueuedGathering,
    gatheringNoticeEligible: gatheringNoticeEligible,
    noticeMatchesAttempt: noticeMatchesAttempt,
    settleNoticeAttempt: settleNoticeAttempt,
    normalizeReceipts: normalizeReceipts,
    alertEvaluateMode: alertEvaluateMode,
    alertWatchStatus: alertWatchStatus,
    noticeDeliverable: noticeDeliverable,
    alertEvents: alertEvents,
    filterAlertReceipts: filterAlertReceipts,
    receiptState: receiptState,
    receiptTime: receiptTime,
    releaseAlertReceipt: releaseAlertReceipt,
    releaseReservedReceipts: releaseReservedReceipts,
    boundedNoticeQueue: boundedNoticeQueue,
    classifyNotifyResult: classifyNotifyResult,
    advanceNoticeQueue: advanceNoticeQueue,
    clearNoticeEffects: clearNoticeEffects
  }
}
