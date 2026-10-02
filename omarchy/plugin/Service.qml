import QtQuick
import Quickshell.Io

// Rat Detective alert: one notification when people start playing in a public room.
// Polls the public companion report; re-arms only after every public room is empty again.
Item {
  id: root

  property var shell: null
  property var manifest: null
  property int humans: 0
  property bool armed: true

  readonly property string statusUrl: "https://ratdetective.online/api/companion/v1/status?limit=16"
  // Skipped while the game is the focused window (you are the one playing); clicking opens or focuses the game.
  readonly property string notifyScript: "hyprctl activewindow 2>/dev/null | grep -qi -e 'ratdetective.online' -e 'rat detective' && exit 0\n"
    + "exec omarchy notification send --app-name 'Rat Detective' 'Rat Detective' \"$1\" --exec omarchy-launch-or-focus-webapp ratdetective.online https://ratdetective.online/"

  function read(text) {
    var report = JSON.parse(text)
    var count = 0
    var rooms = Array.isArray(report.rooms) ? report.rooms : []
    for (var i = 0; i < rooms.length; i++)
      if (rooms[i].expiresAt > report.observedAt) count += Math.max(0, rooms[i].humans | 0)
    humans = count
    if (count === 0) { armed = true; return }
    if (!armed) return
    armed = false
    notify.command = ["sh", "-c", notifyScript, "sh", count === 1 ? "Someone is playing." : count + " people are playing."]
    notify.running = true
  }

  Timer {
    interval: 30000
    running: true
    repeat: true
    triggeredOnStart: true
    onTriggered: if (!fetch.running) fetch.running = true
  }

  Process {
    id: fetch
    command: ["curl", "-sf", "--max-time", "10", "--max-filesize", "262144", root.statusUrl]
    stdout: StdioCollector { id: fetchOut; waitForEnd: true }
    onExited: function(code) {
      if (code !== 0) return
      try { root.read(String(fetchOut.text || "")) } catch (error) { /* Unreadable report: try again next poll. */ }
    }
  }

  Process { id: notify }

  IpcHandler {
    target: "co.animasai.rat-detective"
    function status(): string { return JSON.stringify({ humans: root.humans, armed: root.armed }) }
  }
}
