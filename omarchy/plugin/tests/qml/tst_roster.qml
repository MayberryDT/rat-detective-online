import QtQuick
import QtTest
import qs.Commons
import "../../components" as Dispatch

TestCase {
  id: testCase
  name: "DispatchRoster"
  when: windowShown
  visible: true
  width: 420
  height: 640

  property var subject: null

  Component {
    id: rosterComponent
    Dispatch.DispatchRoster {
      width: 400
      foreground: Color.popups.text
      muted: Color.muted
      accent: Color.accent
      borderColor: Color.popups.border
      fontFamily: Style.font.family
    }
  }

  function init() {
    subject = createTemporaryObject(rosterComponent, testCase)
    verify(subject !== null)
  }

  function cleanup() {
    subject = null
  }

  function namedRats(count) {
    var rows = []
    for (var i = 0; i < count; i++)
      rows.push({
        name: "Rat-" + (i + 1),
        points: i === 0 ? 2 : 0,
        target: 3,
        kills: i + 1,
        deaths: i,
        holder: i === 0
      })
    return rows
  }

  function childTexts(item) {
    var out = []
    if (!item) return out
    if (item.text !== undefined && item.textFormat !== undefined)
      out.push(String(item.text))
    var kids = item.children
    for (var i = 0; i < kids.length; i++)
      out = out.concat(childTexts(kids[i]))
    return out
  }

  function findChildrenByName(item, objectName) {
    var out = []
    if (!item) return out
    if (item.objectName === objectName) out.push(item)
    var kids = item.children
    for (var i = 0; i < kids.length; i++)
      out = out.concat(findChildrenByName(kids[i], objectName))
    return out
  }

  function joinedText() {
    return childTexts(subject).join(" | ")
  }

  function shownCopy() {
    return joinedText().toLowerCase()
  }

  function refuteBusyCopy(shown) {
    var text = shown === undefined ? shownCopy() : String(shown).toLowerCase()
    verify(text.indexOf("round roster") === -1)
    verify(text.indexOf("live stats") === -1)
    verify(text.indexOf("live") === -1)
    verify(text.indexOf("quiet") === -1)
    verify(text.indexOf("public rooms only") === -1)
    verify(text.indexOf("private playtest") === -1)
    verify(text.indexOf("no active public rooms") === -1)
  }

  function test_showsEveryNamedScoreUpToCurrentRosterBound() {
    subject.width = 406
    subject.assignmentId = "chain-of-custody"
    subject.caseHolderName = "Rat-1"
    subject.connectionState = "live"
    subject.hasReport = true
    subject.hasPublicRoom = true
    subject.roomFresh = true
    subject.localObservedAt = 1000
    subject.nowMs = 1200
    subject.scores = namedRats(10)
    compare(subject.visibleRows.length, 10)
    tryVerify(function() {
      return findChildrenByName(subject, "rosterRow").length === 10 && subject.implicitHeight > 0
    }, 1000)
    var shown = joinedText()
    for (var i = 1; i <= 10; i++)
      verify(shown.indexOf("Rat-" + i) !== -1, "missing visible name Rat-" + i)
    verify(shown.indexOf("NAME") !== -1)
    verify(shown.indexOf("OBJ") !== -1)
    verify(shown.indexOf("K/D") !== -1)
    verify(shown.indexOf("/16") === -1)
    verify(shown.toLowerCase().indexOf("waiting for game data") === -1)
    refuteBusyCopy(shown)
    verify(subject.implicitHeight <= 690)
    verify(subject.implicitHeight < 500)
  }

  function test_doesNotInventAnEleventhRowBeyondTheBound() {
    subject.assignmentId = "jurisdiction"
    subject.connectionState = "live"
    subject.hasReport = true
    subject.hasPublicRoom = true
    var rows = namedRats(12)
    rows[10].name = "Overflow-11"
    rows[11].name = "Overflow-12"
    subject.scores = rows
    compare(subject.visibleRows.length, 10)
    var shown = joinedText()
    verify(shown.indexOf("Overflow-11") === -1)
    verify(shown.indexOf("Overflow-12") === -1)
    verify(shown.indexOf("Rat-10") !== -1)
    refuteBusyCopy(shown)
  }

  function test_skipsBlankNamesInsteadOfInventingRats() {
    subject.connectionState = "live"
    subject.hasReport = true
    subject.hasPublicRoom = true
    subject.scores = [
      { name: "", kills: 4, deaths: 1 },
      { name: "Ada", kills: 2, deaths: 3 },
      { kills: 9, deaths: 9 },
      { name: "   ", points: 1, target: 3 }
    ]
    compare(subject.visibleRows.length, 1)
    compare(subject.visibleRows[0].name, "Ada")
    verify(joinedText().indexOf("Ada") !== -1)
    refuteBusyCopy()
  }

  function test_marksOnlyAKnownCaseHolder() {
    subject.assignmentId = "chain-of-custody"
    subject.caseHolderName = "Ada"
    subject.connectionState = "live"
    subject.hasReport = true
    subject.hasPublicRoom = true
    subject.scores = [
      { name: "Ada", points: 2, target: 3, kills: 4, deaths: 2, holder: false },
      { name: "Basil", points: 1, target: 3, kills: 1, deaths: 1, holder: false }
    ]
    compare(subject.holderText(subject.scores[0]), "CASE")
    compare(subject.holderText(subject.scores[1]), "")
    subject.caseHolderName = ""
    compare(subject.holderText(subject.scores[0]), "")
    subject.scores = [
      { name: "Basil", points: 1, target: 3, kills: 1, deaths: 1, holder: true }
    ]
    compare(subject.holderText(subject.scores[0]), "CASE")
    verify(joinedText().indexOf("CASE") !== -1)
  }

  function test_duplicateHolderNameDoesNotMarkEveryMatch() {
    subject.caseHolderName = "Ada"
    subject.hasReport = true
    subject.hasPublicRoom = true
    subject.connectionState = "live"
    subject.scores = [
      { name: "Ada", kills: 1, deaths: 0, holder: false },
      { name: "Ada", kills: 2, deaths: 1, holder: false }
    ]
    compare(subject.holderText(subject.scores[0]), "")
    compare(subject.holderText(subject.scores[1]), "")
    subject.scores = [
      { name: "Ada", kills: 1, deaths: 0, holder: true },
      { name: "Ada", kills: 2, deaths: 1, holder: false }
    ]
    compare(subject.holderText(subject.scores[0]), "CASE")
    compare(subject.holderText(subject.scores[1]), "")
  }

  function test_showsObjectiveOnlyWhenTheAssignmentMakesItMeaningful() {
    var paper = { name: "Ada", points: 2, target: 3, kills: 4, deaths: 2, holder: true }
    subject.assignmentId = "chain-of-custody"
    compare(subject.objectiveText(paper), "2/3")
    subject.assignmentId = "jurisdiction"
    paper.points = 42
    paper.target = 60
    compare(subject.objectiveText(paper), "42/60")
    subject.assignmentId = "closing-time"
    paper.points = 0
    paper.target = 120000
    compare(subject.showObjective, false)
    compare(subject.objectiveText(paper), "")
    subject.assignmentId = ""
    compare(subject.objectiveText(paper), "")
  }

  function test_omitsCombatWhenKillsAndDeathsAreAbsent() {
    compare(subject.combatText({ name: "Ada" }), "—")
    compare(subject.combatText({ name: "Ada", kills: 4, deaths: 2 }), "4 / 2")
    subject.assignmentId = "excessive-force"
    subject.connectionState = "live"
    subject.hasReport = true
    subject.hasPublicRoom = true
    subject.scores = [{ name: "Ada", points: 7, target: 10, kills: 9, deaths: 2 }]
    var shown = joinedText()
    verify(shown.indexOf("AI") === -1)
    verify(shown.indexOf("PLAYER") === -1)
    verify(shown.indexOf("BOT") === -1)
    verify(shown.indexOf("HUMAN") === -1)
    verify(shown.indexOf("YOU") === -1)
    verify(shown.indexOf("9 / 2") !== -1)
    refuteBusyCopy(shown)
  }

  function test_playersLabelNeverClaimsACapacityField() {
    compare(subject.playersLabel(1), "1 RAT")
    compare(subject.playersLabel(10), "10 RATS")
    compare(subject.playersLabel(8), "8 RATS")
    verify(subject.playersLabel(8).indexOf("/16") === -1)
    verify(subject.playersLabel(undefined).indexOf("/16") === -1)
  }

  function test_unavailableAndMissingReportsNeverClaimAnEmptyCity() {
    subject.connectionState = "unavailable"
    subject.hasReport = false
    subject.hasPublicRoom = false
    subject.scores = []
    compare(subject.rosterMessage, "")
    compare(subject.visibleRows.length, 0)
    var shown = shownCopy()
    verify(shown.indexOf("waiting for game data") === -1)
    refuteBusyCopy(shown)

    subject.connectionState = "loading"
    subject.requestRunning = true
    compare(subject.rosterMessage, "Waiting for game data")
    compare(subject.visibleRows.length, 0)
    verify(joinedText().indexOf("Waiting for game data") !== -1)
    refuteBusyCopy()
  }

  function test_connectionMessageIsOneCopyAndExistingRowsStayVisible() {
    subject.connectionState = "empty"
    subject.suppressWaiting = true
    subject.hasReport = false
    subject.scores = []
    compare(subject.visibleRows.length, 0)
    compare(subject.rosterMessage, "")
    verify(joinedText().indexOf("Waiting for game data") === -1)
    refuteBusyCopy()

    subject.connectionState = "unavailable"
    subject.suppressWaiting = true
    subject.scores = namedRats(3)
    compare(subject.visibleRows.length, 3)
    compare(subject.rosterMessage, "")
    var shown = joinedText()
    verify(shown.indexOf("Rat-1") !== -1)
    verify(shown.indexOf("Rat-3") !== -1)
    verify(shown.indexOf("Waiting for game data") === -1)
    refuteBusyCopy(shown)
  }

  function test_emptyFeedWaitsWithoutInventingNamesOrFakeLive() {
    subject.connectionState = "empty"
    subject.hasReport = true
    subject.hasPublicRoom = false
    subject.scores = []
    compare(subject.visibleRows.length, 0)
    compare(subject.rosterMessage, "Waiting for game data")
    var shown = joinedText()
    verify(shown.indexOf("Waiting for game data") !== -1)
    verify(shown.indexOf("Ada") === -1)
    verify(shown.indexOf("Rat-1") === -1)
    refuteBusyCopy(shown)
  }

  function test_namedRowsStayVisibleWithoutFreshnessClaims() {
    subject.hasReport = true
    subject.hasPublicRoom = true
    subject.connectionState = "live"
    subject.requestRunning = true
    subject.roomFresh = true
    subject.localObservedAt = 1000
    subject.nowMs = 1200
    subject.scores = namedRats(2)
    var shown = joinedText()
    verify(shown.indexOf("Rat-1") !== -1)
    verify(shown.indexOf("Rat-2") !== -1)
    verify(shown.toLowerCase().indexOf("just now") === -1)
    verify(shown.toLowerCase().indexOf("refresh") === -1)
    refuteBusyCopy(shown)

    subject.requestRunning = false
    subject.roomFresh = false
    subject.localObservedAt = 1000
    subject.nowMs = 13000
    shown = joinedText()
    verify(shown.indexOf("Rat-1") !== -1)
    verify(shown.toLowerCase().indexOf("paused") === -1)
    verify(shown.toLowerCase().indexOf("12 seconds ago") === -1)
    refuteBusyCopy(shown)
  }

  function test_emptyRoomWithRosterDataMissingWaitsWithoutCityClaims() {
    subject.connectionState = "live"
    subject.hasReport = true
    subject.hasPublicRoom = true
    subject.roomFresh = true
    subject.scores = []
    compare(subject.visibleRows.length, 0)
    compare(subject.rosterMessage, "Waiting for game data")
    verify(joinedText().indexOf("Waiting for game data") !== -1)
    refuteBusyCopy()
  }

  function test_longNamesWrapAtWordBoundariesInsteadOfEliding() {
    var longName = "Inspector Widdershins VelvetAda"
    subject.width = 220
    subject.assignmentId = "closing-time"
    subject.connectionState = "live"
    subject.hasReport = true
    subject.hasPublicRoom = true
    subject.scores = [
      { id: "rd-ai-00", name: longName, kills: 1, deaths: 0 },
      { name: "Ada", kills: 2, deaths: 1 }
    ]
    tryVerify(function() {
      var names = findChildrenByName(subject, "rosterName")
      return names.length === 2 && names[0].text === longName && names[0].lineCount > 1
    }, 1000)
    var names = findChildrenByName(subject, "rosterName")
    compare(names[0].text, longName)
    compare(names[0].wrapMode, Text.Wrap)
    compare(names[0].elide, Text.ElideNone)
    verify(names[0].implicitHeight > names[1].implicitHeight)
    var rows = findChildrenByName(subject, "rosterRow")
    verify(rows.length === 2)
    verify(rows[0].height >= names[0].implicitHeight)
    tryVerify(function() { return rows[1].y >= rows[0].y + rows[0].height }, 1000)
    var kinds = findChildrenByName(subject, "rosterKind")
    verify(kinds[0].visible)
    verify(kinds[0].x >= names[0].x + names[0].width)
    verify(kinds[0].x + kinds[0].width <= kinds[0].parent.width)
    verify(joinedText().indexOf(longName) !== -1)
    refuteBusyCopy()
  }

  function test_labelsRecognizedBotAndHumanIdsOnly() {
    subject.width = 406
    subject.assignmentId = "chain-of-custody"
    subject.connectionState = "live"
    subject.hasReport = true
    subject.hasPublicRoom = true
    subject.scores = [
      { id: "rd-ai-00", name: "Constable Alley", points: 1, target: 3, kills: 2, deaths: 1, holder: true },
      { id: "2c1a0b8e-4d3f-4a91-9c2e-7b6a5d4c3e21", name: "Ada", points: 2, target: 3, kills: 4, deaths: 2 },
      { id: "legacy-score", name: "Marlowe", points: 0, target: 3, kills: 1, deaths: 1 }
    ]
    compare(subject.kindText(subject.scores[0]), "bot")
    compare(subject.kindText(subject.scores[1]), "human")
    compare(subject.kindText(subject.scores[2]), "")
    tryVerify(function() {
      var kinds = findChildrenByName(subject, "rosterKind")
      var visible = 0
      for (var i = 0; i < kinds.length; i++) if (kinds[i].visible) visible++
      return visible === 2
    }, 1000)
    var shown = joinedText()
    verify(shown.indexOf("bot") !== -1)
    verify(shown.indexOf("human") !== -1)
    verify(shown.indexOf("BOT") === -1)
    verify(shown.indexOf("HUMAN") === -1)
    verify(shown.indexOf("AI") === -1)
    verify(shown.indexOf("CASE") !== -1)
    verify(shown.indexOf("2/3") !== -1)
    verify(shown.indexOf("4 / 2") !== -1)
    verify(subject.implicitHeight < 500)
  }
}
