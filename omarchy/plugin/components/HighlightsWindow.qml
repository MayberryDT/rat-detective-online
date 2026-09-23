pragma ComponentBehavior: Bound

import QtQuick
import QtQuick.Layouts
import QtQuick.Controls.Basic as Controls
import QtMultimedia
import QtQuick.Dialogs as Dialogs
import Quickshell
import Quickshell.Io
import qs.Commons
import qs.Ui
import "../HighlightsModel.js" as HighlightsModel

Window {
  id: root
  title: "Rat Detective Highlights"
  width: 1160
  height: 780
  minimumWidth: 620
  minimumHeight: 540
  visible: true
  color: appearance.background

  property var desk: null
  property var appearanceTokens: appearance
  property string query: ""
  property string view: "all"
  property string selectedId: ""
  property string dialog: ""
  property string dialogClipId: ""
  property string statusText: ""
  property string playbackError: ""
  property bool trimming: false
  property bool savingTrim: false
  property real previewMs: -1
  property var editFrames: null
  property string previewError: ""
  property string normalMedia: ""
  property string normalMediaKey: ""
  property string normalMediaError: ""
  readonly property string recordingUrl: selected ? String(selected.path || "") : ""
  readonly property var savedRange: HighlightsModel.playbackRange(selected)
  readonly property bool needsCut: savedRange.start > 0 || (selected && savedRange.end < selected.duration_ms)
  readonly property string cutKey: recordingUrl + ":" + savedRange.start + ":" + savedRange.end
  readonly property bool cutReady: !needsCut || (normalMediaKey === cutKey && !!normalMedia)
  readonly property real sourceOffset: !trimming && needsCut && cutReady ? savedRange.start : 0
  readonly property real playbackStart: trimming ? trimIn * clipDuration : savedRange.start
  readonly property real playbackEnd: trimming ? trimOut * clipDuration : savedRange.end
  readonly property real timelineStart: trimming ? 0 : savedRange.start
  readonly property real timelineDuration: trimming ? clipDuration : savedRange.duration
  readonly property real displayedPosition: Math.max(0, Math.min(timelineDuration, (previewMs >= 0 ? previewMs : player.position + sourceOffset) - timelineStart))
  readonly property int controlHeight: 38
  readonly property real clipDuration: Math.max(1, selected ? selected.duration_ms : 0)
  property real trimIn: 0
  property real trimOut: 1
  property var exportDraft: ({})
  property string exportError: ""
  property bool exportSubmitting: false
  readonly property string resolvedExportFolder: folderField.text
  property bool muted: false
  readonly property bool narrow: width < 820
  readonly property var snapshot: desk ? desk.highlights : ({state: "off"})
  readonly property var clips: HighlightsModel.pageClips(view === "reels" ? reelItems.map(function(item) { return HighlightsModel.clipById(desk ? desk.highlightClips : [], String(item.clip_id || item.clipId || "")) }).filter(function(clip) { return !!clip }) : desk ? desk.highlightClips : [], query, "", view === "favorites", 0, 100).clips
  readonly property var selected: HighlightsModel.clipById(clips, selectedId)
  readonly property var sessions: HighlightsModel.sessionOptions(desk ? desk.highlightSessions : [], snapshot.lastSessionId).map(function(s) { return {value: s.id, label: s.label} })
  readonly property string sessionFilter: desk ? String(desk.highlightSessionId || "") : ""
  readonly property var reelItems: desk && desk.highlightReel ? desk.highlightReel.items || [] : []
  readonly property bool exporting: !!snapshot.job && (snapshot.job.status === "queued" || snapshot.job.status === "running")
  readonly property string cacheRoot: (Quickshell.env("XDG_CACHE_HOME") || Quickshell.env("HOME") + "/.cache") + "/rat-detective/highlights/thumbnails/"

  DispatchAppearance {
    id: appearance
    mode: root.desk && root.desk.settings ? String(root.desk.settings.appearance || "Omarchy") : "Omarchy"
  }

  component Label: Text {
    color: appearance.text
    font.family: appearance.bodyFont
    font.pixelSize: 13
    textFormat: Text.PlainText
    elide: Text.ElideRight
  }
  component Action: Button {
    focusable: true
    foreground: appearance.text
    accent: appearance.accent
    fontFamily: appearance.bodyFont
    fontSize: 13
    opacity: enabled ? 1 : 0.4
    Accessible.role: Accessible.Button
    Accessible.name: text || tooltipText
  }
  component Rule: Rectangle {
    color: appearance.border
    Layout.fillWidth: true
    implicitHeight: 1
  }
  component Field: TextField {
    foreground: appearance.text
    accent: appearance.accent
    font.family: appearance.bodyFont
    font.pixelSize: 13
    implicitHeight: root.controlHeight
  }

  function thumbnail(clip) {
    return clip && /^[a-zA-Z0-9-]+$/.test(String(clip.id)) ? "file://" + root.cacheRoot + clip.id + ".jpg" : ""
  }
  function playSelected() {
    if (!trimming && !cutReady) return
    if (!selected || !selected.path || selected.status === "missing" || selected.status === "corrupt") {
      playbackError = "This recording is unavailable. Show its folder or choose another clip."
      return
    }
    playbackError = ""
    if (player.playbackState === MediaPlayer.PlayingState) player.pause()
    else {
      fallbackSeek.stop()
      var position = previewMs >= 0 ? previewMs : player.position + sourceOffset
      if (position < playbackStart || position >= playbackEnd - 30) position = playbackStart
      player.setPosition(Math.round(position - sourceOffset))
      previewMs = -1
      player.play()
    }
  }
  function openEditor(kind) {
    if (!selected && kind !== "export-reel" && kind !== "settings") return
    dialogClipId = selectedId
    dialog = kind
    renameField.text = selected ? String(selected.title || "") : ""
    exportError = ""
    exportSubmitting = false
    exportDraft = Object.assign({}, snapshot.exportSettings || {})
    folderField.text = String(exportDraft.folder || "")
    var naming = selected ? selected.export : null
    if (kind === "export-reel") {
      var sourceSessions = desk ? desk.highlightSessions : []
      naming = null
      for (var i = 0; i < sourceSessions.length; i++) if (sourceSessions[i].id === sessionFilter) naming = sourceSessions[i].export
    }
    var stamp = selected && selected.created_at ? new Date(selected.created_at * 1000) : new Date()
    exportField.text = naming && naming.filename ? naming.filename : "Rat Detective" + (kind === "export-reel" ? " Reel" : "") + " - " + Qt.formatDateTime(stamp, "yyyy-MM-dd_hh-mm-ss") + ".mp4"
    if (kind.indexOf("export") === 0 && exportDraft.dated) {
      var datePath = naming && naming.datePath ? naming.datePath : Qt.formatDateTime(stamp, "yyyy/MM/dd")
      folderField.text = folderField.text.replace(/\/+$/, "") + "/" + datePath
    }
    editor.open()
  }
  function previewPosition(milliseconds) {
    player.pause()
    previewMs = Math.round(Math.max(trimming ? 0 : playbackStart, Math.min((trimming ? clipDuration : playbackEnd) - 1, milliseconds)))
    // Cached frames bypass the inter-frame decoder entirely while dragging.
    // Fallback requests collapse to the latest pointer position, never a queue.
    if (!editFrames && !fallbackSeek.running) fallbackSeek.start()
  }
  function beginTrim() {
    var bounds = HighlightsModel.trimBounds(selected)
    trimIn = bounds.start
    trimOut = bounds.end
    trimming = true
    previewPosition(trimIn * clipDuration)
  }
  function cancelTrim() { trimming = false; previewPosition(savedRange.start) }
  function saveTrim() {
    if (!desk || !selected || savingTrim) return
    savingTrim = true
    if (desk.highlightTrim(selectedId, trimIn, trimOut) === false) {
      savingTrim = false
      showStatus("Another action is finishing. Try Save trim again.")
    }
  }
  function prepareFrames() {
    if (!visible || !recordingUrl || frameBuilder.running) return
    frameBuilder.requestedUrl = recordingUrl
    frameBuilder.command = ["python3", decodeURIComponent(Qt.resolvedUrl("../scripts/highlights-preview.py").toString().replace(/^file:\/\//, "")), recordingUrl]
    frameBuilder.running = true
  }
  function prepareCut() {
    if (!visible || !recordingUrl || !needsCut || cutReady || cutBuilder.running) return
    cutBuilder.requestedKey = cutKey
    cutBuilder.command = ["python3", decodeURIComponent(Qt.resolvedUrl("../scripts/highlights-preview.py").toString().replace(/^file:\/\//, "")), recordingUrl, String(savedRange.start), String(savedRange.end)]
    cutBuilder.running = true
  }
  function showStatus(text) { statusText = text; statusTimer.restart() }

  onClipsChanged: selectedId = HighlightsModel.selectionId(clips, selectedId)
  onSelectedIdChanged: {
    trimming = false
    savingTrim = false
    previewMs = -1
    fallbackSeek.stop()
    player.stop()
    playbackError = ""
    if (editor.opened && dialog !== "settings" && dialog !== "export-reel") editor.close()
  }
  onClosing: {
    player.stop()
    frameBuilder.running = false
    cutBuilder.running = false
    if (desk) desk.highlightsWindowOpen = false
  }
  Component.onCompleted: selectedId = HighlightsModel.selectionId(clips, selectedId)
  onRecordingUrlChanged: { editFrames = null; previewError = ""; Qt.callLater(prepareFrames) }
  onVisibleChanged: if (visible) { Qt.callLater(prepareFrames); Qt.callLater(prepareCut) }
  onCutKeyChanged: { normalMediaError = ""; Qt.callLater(prepareCut) }
  Connections {
    target: root.desk
    function onHighlightTrimFinished(id, ok, message) {
      if (!root.savingTrim || id !== root.selectedId) return
      root.savingTrim = false
      if (ok) {
        root.trimming = false
        root.previewPosition(root.savedRange.start)
        root.showStatus("Trim saved.")
      } else root.showStatus(message || "Trim could not be saved. Try again.")
    }
  }
  Process {
    id: cutBuilder
    property string requestedKey: ""
    stdout: StdioCollector { id: cutOut; waitForEnd: true }
    onExited: function(code) {
      if (requestedKey !== root.cutKey) { Qt.callLater(root.prepareCut); return }
      try {
        var result = JSON.parse(cutOut.text)
        if (code === 0 && result.playback) {
          root.normalMedia = result.playback
          root.normalMediaKey = requestedKey
        } else root.normalMediaError = "Could not prepare this cut. Reopen the clip to retry."
      } catch (error) { root.normalMediaError = "Could not prepare this cut. Reopen the clip to retry." }
    }
  }
  Process {
    id: frameBuilder
    property string requestedUrl: ""
    stdout: StdioCollector { id: framesOut; waitForEnd: true }
    onExited: function(code) {
      if (requestedUrl !== root.recordingUrl) { Qt.callLater(root.prepareFrames); return }
      try {
        var frames = JSON.parse(framesOut.text)
        if (code === 0 && frames.count > 0) {
          root.editFrames = frames
          if (player.playbackState === MediaPlayer.StoppedState) root.previewMs = root.savedRange.start
        } else root.previewError = "Fast preview unavailable. Video seeking is still available."
      } catch (error) { root.previewError = "Fast preview unavailable. Video seeking is still available." }
    }
  }
  Timer { id: fallbackSeek; interval: 40; onTriggered: if (root.previewMs >= 0) player.setPosition(Math.max(0, root.previewMs - root.sourceOffset)) }
  Timer {
    id: playbackBoundary
    onTriggered: root.previewPosition(Math.max(root.playbackStart, root.playbackEnd - 1))
  }
  Timer { id: statusTimer; interval: 6000; onTriggered: root.statusText = "" }

  MediaPlayer {
    id: player
    objectName: "highlightPlayer"
    source: !root.trimming && root.needsCut ? (root.cutReady ? root.normalMedia : "") : root.recordingUrl
    videoOutput: videoOut
    audioOutput: AudioOutput { volume: 0.8; muted: root.muted }
    onPositionChanged: {
      if (playbackState === MediaPlayer.PlayingState) {
        playbackBoundary.interval = Math.max(1, root.playbackEnd - player.position - root.sourceOffset)
        playbackBoundary.restart()
      }
    }
    onPlaybackStateChanged: {
      if (playbackState !== MediaPlayer.PlayingState) playbackBoundary.stop()
      else { playbackBoundary.interval = Math.max(1, root.playbackEnd - player.position - root.sourceOffset); playbackBoundary.restart() }
    }
    onMediaStatusChanged: {
      if (mediaStatus === MediaPlayer.LoadedMedia) root.previewPosition(root.playbackStart)
      if (mediaStatus === MediaPlayer.EndOfMedia) root.previewPosition(root.playbackEnd - 1)
    }
    onErrorOccurred: root.playbackError = "This recording could not be played. Show its folder or choose another clip."
  }

  ColumnLayout {
    anchors.fill: parent
    spacing: 0
    RowLayout {
      Layout.fillWidth: true
      Layout.margins: 24
      spacing: 16
      Label { text: "󰕧"; color: appearance.accent; font.pixelSize: 28 }
      ColumnLayout {
        spacing: 3
        Label { text: "Highlights"; font.pixelSize: 23; font.bold: true }
        Label { text: "RAT DETECTIVE"; color: appearance.muted; font.pixelSize: 10; font.letterSpacing: 1 }
      }
      Item { Layout.fillWidth: true }
      Label {
        Layout.maximumWidth: root.narrow ? 140 : 260
        text: root.snapshot.audio && root.snapshot.audio.state === "waiting" ? "Waiting for game audio" : root.snapshot.audio && root.snapshot.audio.state === "error" ? "Audio needs attention" : HighlightsModel.stateLabel(root.snapshot.state)
        color: root.snapshot.state === "error" || root.snapshot.state === "storage-full" ? appearance.urgent : appearance.muted
        Accessible.name: "Capture: " + text
      }
      Action { text: "Settings"; iconText: "󰒓"; onClicked: root.openEditor("settings") }
    }
    Rule {}
    GridLayout {
      Layout.fillWidth: true
      Layout.leftMargin: 20; Layout.rightMargin: 20
      Layout.topMargin: 12; Layout.bottomMargin: 12
      columns: root.narrow ? 1 : 2
      rowSpacing: 10
      RowLayout {
        spacing: 3
        Action { text: "All clips"; selected: root.view === "all"; onClicked: root.view = "all" }
        Action { text: "Favorites"; selected: root.view === "favorites"; onClicked: root.view = "favorites" }
        Action { text: "Session reels"; selected: root.view === "reels"; onClicked: root.view = "reels" }
      }
      RowLayout {
        Layout.fillWidth: true
        spacing: 10
        Item { visible: !root.narrow; Layout.fillWidth: true }
        Field {
          Layout.fillWidth: true
          Layout.preferredWidth: 180
          Layout.maximumWidth: root.narrow ? 10000 : 230
          placeholderText: "Search clips"
          Accessible.name: "Search clips"
          onTextChanged: root.query = text
        }
        Dropdown {
          id: sessionPicker
          rowHeight: root.controlHeight
          Layout.preferredHeight: root.controlHeight
          Layout.preferredWidth: root.narrow ? 205 : 190
          showLabel: false
          label: "Session"
          value: root.sessionFilter
          options: root.sessions
          foreground: appearance.text
          background: appearance.background
          popupBorder: appearance.border
          accent: appearance.accent
          fontFamily: appearance.bodyFont
          onChanged: value => { if (root.desk) root.desk.setHighlightSession(value) }
        }
      }
    }
    Rule {}

    // Independent scrolling keeps long libraries out of the player's controls.
    GridLayout {
      id: workspace
      Layout.fillWidth: true
      Layout.fillHeight: true
      columns: 2
      columnSpacing: 0
      Rectangle {
        Layout.fillHeight: true
        Layout.preferredWidth: root.narrow ? 200 : Math.max(280, root.width * 0.29)
        color: Qt.tint(appearance.background, Qt.rgba(0, 0, 0, 0.12))
        ColumnLayout {
          anchors.fill: parent
          anchors.margins: 12
          spacing: 10
          RowLayout {
            Layout.fillWidth: true
            Label { text: root.view === "reels" ? "SESSION MOMENTS" : root.view === "favorites" ? "FAVORITES" : "LIBRARY"; color: appearance.muted; font.pixelSize: 10; Layout.fillWidth: true }
            Label { text: root.clips.length + " clips"; color: appearance.muted; font.pixelSize: 11 }
          }
          ListView {
            id: clipList
            Layout.fillWidth: true
            Layout.fillHeight: true
            clip: true
            spacing: 5
            model: root.clips
            boundsBehavior: Flickable.StopAtBounds
            Controls.ScrollBar.vertical: Controls.ScrollBar { policy: Controls.ScrollBar.AsNeeded }
            delegate: Rectangle {
              id: clipRow
              required property var modelData
              required property int index
              readonly property var clipData: modelData
              readonly property bool chosen: !!clipData && String(clipData.id) === root.selectedId
              width: clipList.width
              height: root.narrow ? 114 : 82
              radius: 4
              color: chosen ? Qt.tint(appearance.background, Qt.rgba(appearance.accent.r, appearance.accent.g, appearance.accent.b, 0.12)) : rowMouse.containsMouse ? appearance.surfaceRaised : "transparent"
              border.color: activeFocus || chosen ? appearance.accent : "transparent"
              activeFocusOnTab: true
              Accessible.role: Accessible.ListItem
              Accessible.name: clipData ? String(clipData.title || "Untitled") : "Unavailable reel moment"
              Accessible.selected: chosen
              Keys.onReturnPressed: if (clipData) root.selectedId = String(clipData.id)
              Keys.onSpacePressed: if (clipData) root.selectedId = String(clipData.id)
              GridLayout {
                anchors.fill: parent
                anchors.margins: 9
                columns: root.narrow ? 1 : 2
                columnSpacing: 10
                rowSpacing: 5
                Rectangle {
                  Layout.preferredWidth: root.narrow ? 86 : 96
                  Layout.preferredHeight: 54
                  radius: 3
                  color: appearance.surfaceRaised
                  Image { id: thumb; anchors.fill: parent; source: root.thumbnail(clipRow.clipData); asynchronous: true; sourceSize.width: 192; fillMode: Image.PreserveAspectCrop }
                  Label { anchors.centerIn: parent; visible: thumb.status !== Image.Ready; text: "󰕧"; color: appearance.muted; font.pixelSize: 22 }
                  Rectangle {
                    anchors.right: parent.right; anchors.bottom: parent.bottom
                    width: durationLabel.implicitWidth + 8; height: 18
                    color: "#cc000000"; radius: 2
                    Label { id: durationLabel; anchors.centerIn: parent; text: HighlightsModel.durationLabel(HighlightsModel.playbackRange(clipRow.clipData).duration); color: "white"; font.pixelSize: 10 }
                  }
                }
                ColumnLayout {
                  Layout.fillWidth: true
                  spacing: 5
                  Label { Layout.fillWidth: true; text: clipRow.clipData ? String(clipRow.clipData.title || "Untitled") : "Unavailable moment"; font.pixelSize: 12 }
                  Label { Layout.fillWidth: true; text: clipRow.clipData ? (clipRow.clipData.favorite ? "★  " : "") + HighlightsModel.kindLabel(clipRow.clipData.kind) : "Recording missing"; color: appearance.muted; font.pixelSize: 10 }
                }
              }
              MouseArea { id: rowMouse; anchors.fill: parent; hoverEnabled: true; cursorShape: Qt.PointingHandCursor; onClicked: { clipRow.forceActiveFocus(); if (clipRow.clipData) root.selectedId = String(clipRow.clipData.id) } }
            }
            Label {
              anchors.fill: parent
              anchors.margins: 12
              visible: clipList.count === 0
              wrapMode: Text.WordWrap
              elide: Text.ElideNone
              color: appearance.muted
              text: root.view === "reels" ? "No moments in this session reel yet." : root.query ? "No matching clips. Try another search." : root.view === "favorites" ? "Favorite a clip to keep it here." : "Your best moments belong here. Play a round with automatic highlights on."
            }
          }
          Label { text: "Saved on this computer"; color: appearance.muted; font.pixelSize: 10; Layout.fillWidth: true }
        }
      }
      Flickable {
        id: viewerScroll
        Layout.fillWidth: true
        Layout.fillHeight: true
        contentWidth: width
        contentHeight: Math.max(height, viewer.implicitHeight + 40)
        clip: true
        boundsBehavior: Flickable.StopAtBounds
        Controls.ScrollBar.vertical: Controls.ScrollBar { policy: Controls.ScrollBar.AsNeeded }
        ColumnLayout {
          id: viewer
          x: 24; y: 20
          width: parent.width - 48
          spacing: 16
          RowLayout {
            Layout.fillWidth: true
            ColumnLayout {
              Layout.fillWidth: true
              spacing: 8
              Label { text: root.view === "reels" ? "SESSION REEL" : "SELECTED MOMENT"; color: appearance.muted; font.pixelSize: 10; font.letterSpacing: 0.8 }
              Label { Layout.fillWidth: true; font.pixelSize: root.narrow ? 18 : 22; text: root.selected ? String(root.selected.title || "Untitled") : "Your highlights" }
              Label { Layout.fillWidth: true; color: appearance.muted; font.pixelSize: 11; text: root.selected ? HighlightsModel.kindLabel(root.selected.kind) + " · " + HighlightsModel.dateLabel(root.selected.created_at) : "Choose a clip to watch" }
            }
            Action {
              text: root.narrow ? "" : root.selected && root.selected.favorite ? "Favorited" : "Favorite"
              iconText: root.selected && root.selected.favorite ? "★" : "☆"
              tooltipText: root.selected && root.selected.favorite ? "Remove favorite" : "Favorite clip"
              selected: !!root.selected && !!root.selected.favorite
              enabled: !!root.selected
              onClicked: if (root.desk && root.selected) root.desk.highlightFavorite(root.selected.id, !root.selected.favorite)
            }
          }
          Rectangle {
            id: videoFrame
            readonly property real aspect: videoOut.sourceRect.height > 0 ? videoOut.sourceRect.width / videoOut.sourceRect.height : poster.sourceSize.height > 0 ? poster.sourceSize.width / poster.sourceSize.height : 16 / 9
            readonly property real fittedWidth: Math.min(viewer.width, Math.max(140, Math.min(480, viewerScroll.height - 300)) * aspect)
            Layout.alignment: Qt.AlignHCenter
            Layout.preferredWidth: fittedWidth
            Layout.preferredHeight: fittedWidth / aspect
            radius: 4
            color: "#080a0e"
            border.width: 1
            border.color: appearance.border
            clip: true
            Image {
              id: poster
              anchors.fill: parent; anchors.margins: 1
              visible: player.playbackState === MediaPlayer.StoppedState && !root.playbackError
              source: root.thumbnail(root.selected)
              asynchronous: true
              fillMode: Image.PreserveAspectFit
            }
            VideoOutput { id: videoOut; anchors.fill: parent; anchors.margins: 1; visible: player.playbackState !== MediaPlayer.StoppedState; fillMode: VideoOutput.PreserveAspectFit }
            Image {
              id: editPreview
              objectName: "editPreview"
              anchors.fill: parent; anchors.margins: 1
              visible: root.previewMs >= 0 && !!root.editFrames && status === Image.Ready
              source: root.editFrames && root.previewMs >= 0 ? root.editFrames.url + String(Math.min(root.editFrames.count - 1, Math.max(0, Math.floor(root.previewMs * root.editFrames.fps / 1000)))).padStart(6, "0") + ".jpg" : ""
              // Small local frames load in the same update as the trim bracket.
              asynchronous: false
              cache: false
              fillMode: Image.PreserveAspectFit
            }
            Action {
              anchors.centerIn: parent
              visible: !!root.selected && !root.playbackError && !root.trimming && player.playbackState !== MediaPlayer.PlayingState
              text: root.cutReady ? "Play" : "Preparing cut…"; iconText: "▶"; bordered: true
              enabled: root.cutReady
              background: appearance.background
              onClicked: root.playSelected()
            }
            Label {
              anchors.centerIn: parent
              width: parent.width - 48
              horizontalAlignment: Text.AlignHCenter
              wrapMode: Text.WordWrap
              elide: Text.ElideNone
              visible: !root.selected || !!root.playbackError
              color: "#d6e8f0"
              text: root.playbackError || "Select a clip from your library"
            }
          }
          RowLayout {
            Layout.fillWidth: true
            spacing: 8
            Action { text: root.narrow ? "" : player.playbackState === MediaPlayer.PlayingState ? "Pause" : "Play"; iconText: player.playbackState === MediaPlayer.PlayingState ? "Ⅱ" : "▶"; tooltipText: "Play or pause"; enabled: !!root.selected && (root.trimming || root.cutReady); onClicked: root.playSelected() }
            Label { text: HighlightsModel.durationLabel(root.displayedPosition); font.pixelSize: 11; color: appearance.muted }
            HighlightTimeline {
              id: timeline
              Layout.fillWidth: true
              enabled: !!root.selected && player.seekable && !root.savingTrim
              duration: root.timelineDuration
              position: root.displayedPosition
              trimming: root.trimming
              trimStart: root.trimIn * duration
              trimEnd: root.trimOut * duration
              accent: appearance.accent
              foreground: appearance.text
              trackColor: appearance.border
              onSeekRequested: milliseconds => root.previewPosition(milliseconds + root.timelineStart)
              onBoundaryMoved: (start, milliseconds) => {
                if (start) root.trimIn = milliseconds / duration
                else root.trimOut = milliseconds / duration
                root.previewPosition(milliseconds)
              }
            }
            Label { text: HighlightsModel.durationLabel(root.timelineDuration); font.pixelSize: 11; color: appearance.muted }
            Action { text: ""; iconText: root.muted ? "󰝟" : "󰕾"; tooltipText: root.muted ? "Unmute" : "Mute"; onClicked: root.muted = !root.muted }
          }
          ColumnLayout {
            visible: root.trimming
            Layout.fillWidth: true
            spacing: 8
            Label {
              Layout.fillWidth: true; wrapMode: Text.WordWrap; elide: Text.ElideNone
              text: "Start " + (root.trimIn * root.clipDuration / 1000).toFixed(2) + "s   ·   End " + (root.trimOut * root.clipDuration / 1000).toFixed(2) + "s   ·   Keep " + ((root.trimOut - root.trimIn) * root.clipDuration / 1000).toFixed(2) + "s"
            }
            Label { Layout.fillWidth: true; wrapMode: Text.WordWrap; elide: Text.ElideNone; font.pixelSize: 11; color: appearance.muted; text: root.editFrames ? "Drag the brackets to preview each cut. Play previews the selection." : frameBuilder.running ? "Preparing smooth preview…" : root.previewError }
            RowLayout {
              Layout.fillWidth: true
              Action { text: "Reset"; enabled: !root.savingTrim; onClicked: { root.trimIn = 0; root.trimOut = 1; root.previewPosition(0) } }
              Item { Layout.fillWidth: true }
              Action { text: "Cancel"; enabled: !root.savingTrim; onClicked: root.cancelTrim() }
              Action { text: root.savingTrim ? "Saving…" : "Save trim"; enabled: !root.savingTrim; selected: true; bordered: true; onClicked: root.saveTrim() }
            }
          }
          Rule {}
          RowLayout {
            Layout.fillWidth: true
            Action { text: "Trim clip"; visible: !root.trimming; bordered: true; enabled: !!root.selected && !!root.recordingUrl && root.clipDuration >= 200; onClicked: root.beginTrim() }
            Item { Layout.fillWidth: true }
            Action { text: root.view === "reels" ? "Export reel" : "Export clip"; selected: true; bordered: true; enabled: !root.trimming && !root.exporting && (root.view === "reels" ? root.reelItems.length > 0 && !!root.sessionFilter : !!root.selected); onClicked: root.openEditor(root.view === "reels" ? "export-reel" : "export") }
            Action { id: moreButton; text: "•••"; tooltipText: "More clip actions"; bordered: true; enabled: !!root.selected; onClicked: moreMenu.open() }
          }
          RowLayout {
            visible: root.view === "reels"
            Layout.fillWidth: true
            Label { text: root.sessionFilter ? root.reelItems.length + " moments" : "Choose a session to export its reel"; Layout.fillWidth: true; color: appearance.muted; font.pixelSize: 11 }
            Action { text: "Regenerate"; enabled: !!root.sessionFilter && !root.exporting; onClicked: if (root.desk) root.desk.highlightRegenerateReel(root.sessionFilter) }
          }
        }
      }
    }
    Rule {}
    RowLayout {
      Layout.fillWidth: true
      Layout.leftMargin: 20; Layout.rightMargin: 20
      Layout.topMargin: 10; Layout.bottomMargin: 10
      Label {
        Layout.fillWidth: true
        text: root.normalMediaError || root.statusText || HighlightsModel.jobLabel(root.snapshot.job) || (root.selected && root.selected.hasAudio === false ? "No audio recorded" : "") || HighlightsModel.stateDetail(root.snapshot)
        color: appearance.muted
        font.pixelSize: 11
        Accessible.name: text
      }
      Action { text: "Undo delete"; visible: !!root.desk && !!root.desk.lastHighlightDelete; onClicked: { root.desk.highlightUndo(); root.showStatus("Restoring clip…") } }
      Action { text: "Open folder"; visible: !!root.snapshot.job && root.snapshot.job.status === "done" && !!root.snapshot.job.path; onClicked: Qt.openUrlExternally("file://" + root.snapshot.job.path.slice(0, root.snapshot.job.path.lastIndexOf("/")).split("/").map(encodeURIComponent).join("/")) }
      Action { text: "Cancel export"; visible: root.exporting; onClicked: if (root.desk) root.desk.highlightCancelJob(root.snapshot.job.id) }
    }
  }

  Controls.Popup {
    id: moreMenu
    parent: moreButton
    x: Math.min(0, moreButton.width - width)
    y: -height - 6
    width: 180
    padding: 6
    focus: true
    background: Rectangle { color: appearance.background; border.color: appearance.border; radius: 4 }
    contentItem: ColumnLayout {
      spacing: 2
      Action { Layout.fillWidth: true; text: "Rename"; leftAlign: true; onClicked: { moreMenu.close(); root.openEditor("rename") } }
      Action { Layout.fillWidth: true; text: "Show in folder"; leftAlign: true; onClicked: { moreMenu.close(); if (root.desk && root.selected) root.desk.highlightReveal(root.selected.id) } }
      Rule {}
      Action { Layout.fillWidth: true; text: "Delete clip"; foreground: appearance.urgent; leftAlign: true; onClicked: { moreMenu.close(); if (root.desk && root.selected) { player.stop(); root.desk.highlightDelete(root.selected.id); root.showStatus("Moving clip to trash…") } } }
    }
    onOpened: contentItem.children[0].forceActiveFocus()
  }

  Dialogs.FolderDialog {
    id: folderChooser
    title: "Choose export folder"
    onAccepted: folderField.text = decodeURIComponent(String(selectedFolder).replace(/^file:\/\//, ""))
  }
  Connections {
    target: root.desk
    ignoreUnknownSignals: true
    function onHighlightExportFinished(ok, message) {
      root.exportSubmitting = false
      if (ok) editor.close()
      else root.exportError = message || "Export failed."
    }
  }
  Controls.Popup {
    id: editor
    parent: Controls.Overlay.overlay
    anchors.centerIn: parent
    width: Math.min(580, root.width - 32)
    height: Math.min(implicitHeight, root.height - 32)
    padding: 24
    modal: true
    focus: true
    closePolicy: root.exportSubmitting ? Controls.Popup.NoAutoClose : Controls.Popup.CloseOnEscape
    background: Rectangle { color: appearance.background; border.color: appearance.border; radius: 6 }
    Controls.Overlay.modal: Rectangle { color: "#99000000" }
    onOpened: { if (root.dialog === "rename") renameField.forceActiveFocus(); else if (root.dialog.indexOf("export") === 0) exportField.forceActiveFocus(); else closeEditor.forceActiveFocus() }
    onClosed: root.dialog = ""
    contentItem: Controls.ScrollView {
      clip: true
      contentWidth: availableWidth
      ColumnLayout {
      width: parent.width
      spacing: 12
      Label { Layout.fillWidth: true; font.pixelSize: 20; text: root.dialog === "rename" ? "Rename clip" : root.dialog === "settings" ? "Settings" : root.dialog === "export-reel" ? "Export session reel" : "Export clip" }
      Label { visible: root.dialog.indexOf("export") !== 0; Layout.fillWidth: true; wrapMode: Text.WordWrap; elide: Text.ElideNone; color: appearance.muted; text: root.dialog === "settings" ? HighlightsModel.stateDetail(root.snapshot) : "Give this moment a name you will recognize." }
      Field { id: renameField; Layout.fillWidth: true; visible: root.dialog === "rename"; Accessible.name: "Clip title"; maximumLength: 160 }
      Label { visible: root.dialog.indexOf("export") === 0; text: "Filename" }
      Field { id: exportField; objectName: "exportFilename"; Layout.fillWidth: true; visible: root.dialog.indexOf("export") === 0; placeholderText: "Filename.mp4"; Accessible.name: "Filename"; maximumLength: 220 }
      Label { visible: root.dialog !== "rename"; text: root.dialog === "settings" ? "Export folder" : "Destination folder" }
      RowLayout {
        visible: root.dialog !== "rename"; Layout.fillWidth: true
        Field { id: folderField; objectName: "exportFolder"; Layout.fillWidth: true; Accessible.name: "Export folder" }
        Action {
          objectName: "exportBrowse"
          text: "Browse…"
          onClicked: {
            folderChooser.currentFolder = "file://" + folderField.text.split("/").map(encodeURIComponent).join("/")
            folderChooser.open()
          }
        }
      }
      ColumnLayout {
        visible: root.dialog === "settings"
        Layout.fillWidth: true
        Label { text: "Export"; font.pixelSize: 16 }
        Action { text: (root.exportDraft.dated ? "☑ " : "☐ ") + "Organize exports by date"; onClicked: root.exportDraft = Object.assign({}, root.exportDraft, {dated: !root.exportDraft.dated}) }
        Dropdown {
          Layout.fillWidth: true; label: "Video size"; value: root.exportDraft.size || "original"
          options: [{value:"original",label:"Original"},{value:"1080p",label:"Up to 1080p"},{value:"720p",label:"Up to 720p"}]
          foreground: appearance.text; background: appearance.background; popupBorder: appearance.border; accent: appearance.accent; fontFamily: appearance.bodyFont
          onChanged: value => root.exportDraft = Object.assign({}, root.exportDraft, {size:value})
        }
        Dropdown {
          Layout.fillWidth: true; label: "Quality"; value: root.exportDraft.quality || "standard"
          options: [{value:"standard",label:"Standard"},{value:"high",label:"High"}]
          foreground: appearance.text; background: appearance.background; popupBorder: appearance.border; accent: appearance.accent; fontFamily: appearance.bodyFont
          onChanged: value => root.exportDraft = Object.assign({}, root.exportDraft, {quality:value})
        }
        Action { text: (root.exportDraft.sound ? "☑ " : "☐ ") + "Include recorded sound"; onClicked: root.exportDraft = Object.assign({}, root.exportDraft, {sound: !root.exportDraft.sound}) }
        Rule {}
        Label { visible: !!root.snapshot.audio && root.snapshot.audio.state !== "off"; Layout.fillWidth: true; wrapMode: Text.WordWrap; elide: Text.ElideNone; text: root.snapshot.audio ? (root.snapshot.audio.reason || "Game audio routed") : ""; color: appearance.muted }
        Action { visible: root.snapshot.state === "setup-needed"; text: "Choose game window"; onClicked: { editor.close(); if (root.desk) root.desk.confirmHighlightSetup() } }
        Action { visible: root.snapshot.state === "interrupted"; text: "Resume capture"; onClicked: { editor.close(); if (root.desk) root.desk.resumeHighlights() } }
      }
      Label { visible: !!root.exportError; Layout.fillWidth: true; wrapMode: Text.WordWrap; elide: Text.ElideNone; text: root.exportError; color: appearance.urgent }
      RowLayout {
        Layout.fillWidth: true
        Item { Layout.fillWidth: true }
        Action { id: closeEditor; text: "Cancel"; enabled: !root.exportSubmitting; onClicked: editor.close() }
        Action {
          text: root.dialog === "settings" ? "Done" : root.dialog.indexOf("export") === 0 ? "Export" : "Save"
          selected: true; bordered: true
          enabled: !root.exportSubmitting && (root.dialog === "rename" ? renameField.text.trim().length > 0 : folderField.text.trim().length > 0 && (root.dialog === "settings" || exportField.text.trim().length > 0))
          onClicked: {
            if (root.desk) {
              if (root.dialog === "rename") root.desk.highlightRename(root.dialogClipId, renameField.text.trim())
              else {
                root.exportError = ""
                if (root.dialog === "settings") root.exportSubmitting = root.desk.highlightExportSettings(Object.assign({}, root.exportDraft, {folder: folderField.text.trim()}))
                else if (root.dialog === "export") root.exportSubmitting = root.desk.highlightExportClip(root.dialogClipId, folderField.text.trim(), exportField.text.trim())
                else if (root.dialog === "export-reel") root.exportSubmitting = root.desk.highlightExportReel(root.sessionFilter, folderField.text.trim(), exportField.text.trim())
                if (!root.exportSubmitting) root.exportError = "Another action is finishing. Try again."
                return
              }
            }
            editor.close()
          }
        }
      }
    }
  }

  }

  Shortcut {
    sequence: "Escape"
    enabled: !root.savingTrim && !editor.opened && !moreMenu.opened && !sessionPicker.popupOpen
    onActivated: { if (root.trimming) root.cancelTrim(); else root.close() }
  }
}
