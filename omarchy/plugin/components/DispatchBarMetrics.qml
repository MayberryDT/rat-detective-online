import QtQuick

// Logical dimensions shared by stock and custom Omarchy bar hosts.
QtObject {
  property bool vertical: false
  property real thickness: 26
  property real requestedIconSize: 18
  property real countWidth: 8
  property real countHeight: 12
  property real padding: 3
  property real gap: 3
  property real devicePixelRatio: 1

  readonly property real inset: Math.min(Math.max(0, padding), Math.max(0, thickness / 4))
  readonly property real innerThickness: Math.max(1, thickness - inset * 2)
  readonly property real iconSize: Math.max(1, Math.min(requestedIconSize, innerThickness))
  readonly property real rasterSize: Math.ceil(iconSize * Math.max(.5, devicePixelRatio))
  readonly property real contentWidth: vertical ? innerThickness : iconSize + gap + countWidth
  readonly property real contentHeight: vertical ? iconSize + gap + countHeight : Math.max(iconSize, Math.min(countHeight, innerThickness))
  readonly property real slotWidth: vertical ? thickness : contentWidth + inset * 2
  readonly property real slotHeight: vertical ? contentHeight + inset * 2 : thickness
}
