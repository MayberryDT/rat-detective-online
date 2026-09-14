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
    var id = boundedString(row.playerId || row.id, "row-" + i, 64)
    if (seen[id]) id += "-" + i
    seen[id] = true
    var points = row.objectiveScore
    out.push({
      id: id,
      name: name,
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

function roomFresh(room, now) {
  if (!room) return false
  return room.localFreshUntil > 0 ? now <= room.localFreshUntil : now - room.localObservedAt <= 75000
}

function connectionState(status, receivedAt, now, staleAfterMs, failed) {
  if (!status) return failed ? "unavailable" : "loading"
  var rooms = status.rooms || []
  var newestObservation = 0
  var anyFresh = rooms.length === 0
  for (var i = 0; i < rooms.length; i++) {
    newestObservation = Math.max(newestObservation, rooms[i].localObservedAt || 0)
    if (roomFresh(rooms[i], now)) anyFresh = true
  }
  var age = Math.max(0, now - (newestObservation || receivedAt || 0))
  if (failed || !anyFresh || age > staleAfterMs) return "stale"
  return totals(status).players > 0 ? "live" : "empty"
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

function alertEvents(previous, current, settings, now, context) {
  if (!previous || !current || !settings || settings.alertsEnabled !== true) return []
  if (context && (context.gameFocused || context.dnd || context.fresh === false)) return []
  if (isQuietHour(now, settings.quietStartHour, settings.quietEndHour)) return []
  var threshold = boundedInteger(settings.alertHumanThreshold, 2, 1, 16)
  var before = {}
  var after = {}
  var i
  for (i = 0; i < previous.rooms.length; i++) before[previous.rooms[i].id] = previous.rooms[i]
  for (i = 0; i < current.rooms.length; i++) after[current.rooms[i].id] = current.rooms[i]
  var events = []
  for (var id in after) {
    var next = after[id]
    var prior = before[id]
    if (!prior) continue
    if (prior.humans < threshold && next.humans >= threshold) events.push({
      key: "gathering:" + id + ":" + next.roundId + ":" + threshold,
      title: "Rats are gathering",
      body: next.humans + " human investigators in " + next.label
    })
    if (settings.alertAssignmentChanges === true && prior.roundId && next.roundId && prior.roundId !== next.roundId) events.push({
      key: "assignment:" + id + ":" + next.roundId,
      title: next.assignment.title,
      body: "A new Dispatch Assignment started in " + next.label
    })
  }
  return events
}

function filterAlertReceipts(events, receipts, now, cooldownMs) {
  var kept = {}
  var source = receipts && typeof receipts === "object" ? receipts : {}
  for (var key in source) if (finite(source[key], 0) > now - 86400000) kept[key] = source[key]
  var accepted = []
  var cooldown = Math.max(0, finite(cooldownMs, 0))
  var latest = 0
  for (var receiptKey in kept) latest = Math.max(latest, finite(kept[receiptKey], 0))
  for (var i = 0; i < events.length; i++) {
    var event = events[i]
    if (kept[event.key] || (latest > 0 && now - latest < cooldown)) continue
    kept[event.key] = now
    latest = now
    accepted.push(event)
  }
  return { events: accepted, receipts: kept }
}

if (typeof module !== "undefined") {
  module.exports = {
    ASSIGNMENTS: ASSIGNMENTS,
    publicRoomLabel: publicRoomLabel,
    normalizeV1: normalizeV1,
    normalizeLegacy: normalizeLegacy,
    mergePages: mergePages,
    roomById: roomById,
    totals: totals,
    connectionState: connectionState,
    roomFresh: roomFresh,
    formatClock: formatClock,
    displayRemaining: displayRemaining,
    objectiveLine: objectiveLine,
    isQuietHour: isQuietHour,
    alertEvents: alertEvents,
    filterAlertReceipts: filterAlertReceipts
  }
}
