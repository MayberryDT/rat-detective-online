import QtQuick
import qs.Commons
import "../StatusModel.js" as StatusModel

Column {
  id: root
  objectName: "dispatchRoster"

  property var scores: []
  property string assignmentId: ""
  property string caseHolderName: ""
  property string connectionState: "loading"
  property bool suppressWaiting: false
  property bool requestRunning: false
  property bool lastRequestFailed: false
  property bool hasReport: false
  property bool hasPublicRoom: false
  property bool roomFresh: true
  property double localObservedAt: 0
  property double nowMs: 0
  property color foreground: Color.foreground
  property color muted: Color.muted
  property color accent: Color.accent
  property color borderColor: Color.popups.border
  property string fontFamily: Style.font.family

  readonly property int rosterBound: 10
  readonly property bool showObjective: {
    var id = String(assignmentId || "")
    return id === "chain-of-custody" || id === "jurisdiction" || id === "excessive-force"
  }
  readonly property var visibleRows: boundScores(scores)
  readonly property string rosterMessage: {
    if (visibleRows.length > 0) return ""
    if (suppressWaiting || connectionState === "unavailable") return ""
    return "Waiting for game data"
  }

  width: parent ? parent.width : implicitWidth
  spacing: tokenSpace(4)

  function tokenSpace(n) {
    return typeof Style.space === "function" ? Style.space(n) : n
  }
  function tokenFont(role, fallback) {
    var size = Style.font ? Style.font[role] : 0
    return size > 0 ? size : fallback
  }
  function boundScores(value) {
    var list = []
    if (!value) return list
    var length = value.length !== undefined ? value.length : 0
    for (var i = 0; i < length && list.length < root.rosterBound; i++) {
      var row = value[i]
      if (!row || typeof row !== "object") continue
      var name = String(row.name || "").trim()
      if (!name) continue
      list.push(row)
    }
    return list
  }
  function playersLabel(count) {
    var n = Math.floor(Number(count))
    if (!isFinite(n) || n < 0) n = 0
    return n === 1 ? "1 RAT" : n + " RATS"
  }
  function combatText(entry) {
    if (!entry) return "—"
    var hasKills = entry.kills !== undefined && entry.kills !== null && isFinite(Number(entry.kills))
    var hasDeaths = entry.deaths !== undefined && entry.deaths !== null && isFinite(Number(entry.deaths))
    if (!hasKills && !hasDeaths) return "—"
    return (hasKills ? String(Number(entry.kills)) : "—") + " / " + (hasDeaths ? String(Number(entry.deaths)) : "—")
  }
  function objectiveText(entry) {
    if (!root.showObjective || !entry) return ""
    if (entry.points === undefined || entry.points === null) return "—"
    var points = Number(entry.points)
    var target = Number(entry.target)
    if (!isFinite(points)) return "—"
    if (isFinite(target) && target > 0) return points + "/" + target
    return String(points)
  }
  function nameMatchCount(name) {
    var known = String(name || "").trim()
    if (!known) return 0
    var rows = root.visibleRows
    var count = 0
    for (var i = 0; i < rows.length; i++)
      if (String(rows[i].name || "") === known) count++
    return count
  }
  function isHolder(entry) {
    if (!entry) return false
    if (entry.holder === true) return true
    var known = String(root.caseHolderName || "").trim()
    if (!known || String(entry.name || "") !== known) return false
    return nameMatchCount(known) === 1
  }
  function holderText(entry) {
    return isHolder(entry) ? "CASE" : ""
  }
  function kindText(entry) {
    if (!entry) return ""
    var kind = entry.kind
    if (kind !== "bot" && kind !== "human")
      kind = StatusModel.participantKind(entry.id || entry.playerId)
    if (kind === "bot") return "bot"
    if (kind === "human") return "human"
    return ""
  }

  readonly property int holderWidth: tokenSpace(36)

  Row {
    objectName: "rosterHeader"
    width: parent.width
    spacing: tokenSpace(6)
    visible: root.visibleRows.length > 0
    Text {
      width: parent.width - root.holderWidth - combatHeader.width - (root.showObjective ? objectiveHeader.width : 0) - parent.spacing * (root.showObjective ? 3 : 2)
      textFormat: Text.PlainText
      text: "NAME"
      color: root.muted
      font.family: root.fontFamily
      font.pixelSize: tokenFont("caption", 11)
      font.bold: true
      font.letterSpacing: 0.7
    }
    Item {
      width: root.holderWidth
      height: 1
    }
    Text {
      id: objectiveHeader
      visible: root.showObjective
      width: visible ? tokenSpace(42) : 0
      textFormat: Text.PlainText
      text: "OBJ"
      color: root.muted
      font.family: root.fontFamily
      font.pixelSize: tokenFont("caption", 11)
      font.bold: true
      horizontalAlignment: Text.AlignRight
    }
    Text {
      id: combatHeader
      width: tokenSpace(48)
      textFormat: Text.PlainText
      text: "K/D"
      color: root.muted
      font.family: root.fontFamily
      font.pixelSize: tokenFont("caption", 11)
      font.bold: true
      horizontalAlignment: Text.AlignRight
    }
  }

  Repeater {
    id: rosterRepeater
    model: root.visibleRows
    Row {
      id: rosterRow
      required property var modelData
      required property int index
      objectName: "rosterRow"
      width: root.width
      spacing: tokenSpace(6)

      readonly property string displayedName: String(modelData && modelData.name ? modelData.name : "")
      readonly property string displayedKind: root.kindText(modelData)
      readonly property string displayedObjective: root.objectiveText(modelData)
      readonly property string displayedCombat: root.combatText(modelData)
      readonly property string displayedHolder: root.holderText(modelData)
      readonly property int leftWidth: Math.max(tokenSpace(80), width - combatCell.width - root.holderWidth - (root.showObjective ? objectiveCell.width : 0) - spacing * (root.showObjective ? 3 : 2))

      Item {
        id: nameGroup
        width: rosterRow.leftWidth
        height: Math.max(nameCell.implicitHeight, kindMark.visible ? kindMark.implicitHeight : 0)

        TextMetrics {
          id: nameMetrics
          font: nameCell.font
          text: nameCell.text
        }

        Row {
          id: nameRow
          width: parent.width
          height: parent.height
          spacing: tokenSpace(6)

          Text {
            id: nameCell
            objectName: "rosterName"
            width: {
              var tag = kindMark.visible ? Math.ceil(kindMark.implicitWidth) + nameRow.spacing : 0
              var budget = Math.max(1, nameRow.width - tag)
              var needed = Math.ceil(Math.max(nameMetrics.advanceWidth, nameMetrics.width)) + 2
              return Math.min(needed, budget)
            }
            textFormat: Text.PlainText
            text: rosterRow.displayedName
            color: root.foreground
            font.family: root.fontFamily
            font.pixelSize: tokenFont("body", 13)
            font.bold: rosterRow.displayedHolder !== ""
            wrapMode: Text.Wrap
            elide: Text.ElideNone
          }
          Text {
            id: kindMark
            objectName: "rosterKind"
            visible: rosterRow.displayedKind !== ""
            textFormat: Text.PlainText
            text: rosterRow.displayedKind
            color: root.muted
            font.family: root.fontFamily
            font.pixelSize: tokenFont("caption", 11)
            font.weight: Font.Normal
          }
        }
      }
      Text {
        id: holderMark
        objectName: "rosterHolder"
        width: root.holderWidth
        textFormat: Text.PlainText
        text: rosterRow.displayedHolder
        color: root.accent
        font.family: root.fontFamily
        font.pixelSize: tokenFont("caption", 11)
        font.bold: true
        horizontalAlignment: Text.AlignRight
      }
      Text {
        id: objectiveCell
        visible: root.showObjective
        width: visible ? tokenSpace(42) : 0
        textFormat: Text.PlainText
        text: rosterRow.displayedObjective
        color: root.foreground
        font.family: root.fontFamily
        font.pixelSize: tokenFont("caption", 11)
        horizontalAlignment: Text.AlignRight
      }
      Text {
        id: combatCell
        width: tokenSpace(48)
        textFormat: Text.PlainText
        text: rosterRow.displayedCombat
        color: root.muted
        font.family: root.fontFamily
        font.pixelSize: tokenFont("caption", 11)
        horizontalAlignment: Text.AlignRight
      }
    }
  }

  Text {
    objectName: "rosterMessage"
    width: parent.width
    textFormat: Text.PlainText
    text: root.rosterMessage
    color: root.muted
    font.family: root.fontFamily
    font.pixelSize: tokenFont("body", 13)
    wrapMode: Text.Wrap
    visible: text !== ""
  }
}
