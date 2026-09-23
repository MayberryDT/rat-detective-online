var STATES = {
  "off": {label: "Off", detail: "Automatic highlights are off."},
  "setup-needed": {label: "Setup needed", detail: "Choose the Rat Detective window before capture can start."},
  "ready": {label: "Ready", detail: "Waiting for an eligible game session."},
  "starting": {label: "Starting", detail: "Establishing the capture source."},
  "buffering": {label: "Buffering", detail: "Building replay history."},
  "capturing": {label: "Capturing", detail: "Saving interesting moments automatically."},
  "interrupted": {label: "Interrupted", detail: "Capture stopped. Resume after confirming the game window."},
  "storage-full": {label: "Storage full", detail: "Delete unprotected clips or export them first."},
  "error": {label: "Unavailable", detail: "Capture is not supported on this machine until hardware encoding is ready."}
}

function stateLabel(state) {
  return (STATES[state] || STATES.off).label
}

function stateDetail(snapshot) {
  if (snapshot && snapshot.reason) return String(snapshot.reason)
  return (STATES[snapshot && snapshot.state] || STATES.off).detail
}

function panelLine(snapshot) {
  if (!snapshot) return "Highlights"
  var count = Number(snapshot.clipCount || 0)
  var saved = count === 1 ? "1 clip" : count + " clips"
  var state = snapshot.state
  if (state === "capturing" || state === "buffering" || state === "starting") return saved + " · " + stateLabel(state)
  if (state === "interrupted" || state === "storage-full" || state === "error") return saved + " · " + stateLabel(state)
  return saved
}

function durationLabel(ms) {
  var total = Math.max(0, Math.round(Number(ms || 0) / 1000))
  var minutes = Math.floor(total / 60)
  var seconds = total % 60
  return minutes + ":" + String(seconds).padStart(2, "0")
}

function clipMatches(clip, query, kind, favoritesOnly) {
  if (!clip || clip.status === "trash") return false
  if (favoritesOnly && !clip.favorite) return false
  if (kind && clip.kind !== kind) return false
  if (!query) return true
  var hay = String(clip.title || "") + " " + String(clip.kind || "") + " " + String(clip.title_key || "")
  return hay.toLowerCase().indexOf(String(query).toLowerCase()) !== -1
}

function pageClips(clips, query, kind, favoritesOnly, offset, limit) {
  var filtered = []
  var list = clips || []
  for (var i = 0; i < list.length; i++) if (clipMatches(list[i], query, kind, favoritesOnly)) filtered.push(list[i])
  var start = Math.max(0, offset || 0)
  var size = Math.max(1, Math.min(limit || 40, 100))
  return {total: filtered.length, clips: filtered.slice(start, start + size)}
}

function sessionOptions(sessions, lastSessionId) {
  var out = [{id: "", label: "All sessions"}]
  var list = sessions || []
  for (var i = 0; i < list.length; i++) {
    var id = String(list[i].id || "")
    if (!id) continue
    var date = new Date(Number(list[i].started_at) * 1000)
    var pad = function(n) { return n < 10 ? "0" + n : String(n) }
    var stamp = isFinite(date.getTime()) ? date.getFullYear() + "-" + pad(date.getMonth() + 1) + "-" + pad(date.getDate()) + " " + pad(date.getHours()) + ":" + pad(date.getMinutes()) : "Date unavailable"
    var titles = {"chain-of-custody": "Paper Chase", "closing-time": "Closing Time", "excessive-force": "Excessive Force", "jurisdiction": "Jurisdiction"}
    var modes = (list[i].game_modes || []).filter(function(mode) { return !!titles[mode] }).map(function(mode) { return titles[mode] })
    out.push({id: id, label: stamp + " · " + (modes.length ? modes.join(" / ") : "Mode unavailable")})
  }
  return out
}

function jobLabel(job) {
  if (!job) return ""
  var status = String(job.status || "")
  if (status === "queued" || status === "running") {
    return "Export " + Math.round(Number(job.progress || 0) * 100) + "%"
  }
  if (status === "done") return "Exported"
  if (status === "error") return String(job.error || "Export failed")
  if (status === "cancelled") return "Export cancelled"
  return ""
}


// Keep actions attached to a clip identity when the catalog refreshes or filters.
function selectionId(clips, previousId) {
  var list = clips || []
  for (var i = 0; i < list.length; i++) if (String(list[i].id) === previousId) return previousId
  return list.length ? String(list[0].id) : ""
}

function clipById(clips, id) {
  for (var i = 0; i < (clips || []).length; i++) if (String(clips[i].id) === id) return clips[i]
  return null
}

function trimBounds(clip) {
  var duration = Math.max(0, Number(clip && clip.duration_ms || 0))
  if (!duration) return {start: 0, end: 1}
  var start = Math.max(0, Math.min(duration - 200, Number(clip.trim_in_ms || 0)))
  var end = clip.trim_out_ms == null ? duration : Number(clip.trim_out_ms)
  return {start: start / duration, end: Math.max(start + 200, Math.min(duration, end)) / duration}
}

function playbackRange(clip) {
  var duration = Math.max(0, Number(clip && clip.duration_ms || 0))
  var bounds = trimBounds(clip)
  var start = Math.round(bounds.start * duration)
  var end = Math.round(bounds.end * duration)
  return {start: start, end: end, duration: Math.max(0, end - start)}
}

function kindLabel(kind) {
  var labels = {"spectacular-launch": "Spectacular launch", "round-win": "Round win", "visible-pileup": "Pile-up", "double-kill": "Double kill", "triple-kill": "Triple kill", "manual": "Saved moment"}
  return labels[kind] || String(kind || "Saved moment").replace(/-/g, " ")
}

function dateLabel(seconds) {
  var date = new Date(Number(seconds || 0) * 1000)
  if (!seconds || !isFinite(date.getTime())) return ""
  var months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]
  return months[date.getMonth()] + " " + date.getDate() + " · " + (date.getHours() % 12 || 12) + ":" + String(date.getMinutes()).padStart(2, "0") + (date.getHours() < 12 ? " am" : " pm")
}

if (typeof module === "object" && module.exports) {
  module.exports = {
    selectionId: selectionId,
    clipById: clipById,
    trimBounds: trimBounds,
    playbackRange: playbackRange,
    kindLabel: kindLabel,
    dateLabel: dateLabel,
    STATES: STATES,
    stateLabel: stateLabel,
    stateDetail: stateDetail,
    panelLine: panelLine,
    durationLabel: durationLabel,
    clipMatches: clipMatches,
    pageClips: pageClips,
    sessionOptions: sessionOptions,
    jobLabel: jobLabel
  }
}
