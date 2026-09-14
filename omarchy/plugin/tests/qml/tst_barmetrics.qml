import QtQuick
import QtTest
import "../../components" as Dispatch

TestCase {
  name: "DispatchBarMetrics"
  Dispatch.DispatchBarMetrics { id: metrics }

  function test_orientationThicknessAndScale() {
    for (var orientation of [false, true]) {
      for (var thickness of [16, 22, 26, 32, 48, 64]) {
        for (var scale of [1, 1.25, 1.5, 2, 3]) {
          metrics.vertical = orientation
          metrics.thickness = thickness
          metrics.requestedIconSize = 20
          metrics.countWidth = 28 // long population/stale label
          metrics.countHeight = 14
          metrics.devicePixelRatio = scale
          verify(metrics.iconSize <= metrics.innerThickness)
          compare(metrics.rasterSize, Math.ceil(metrics.iconSize * scale))
          if (orientation) {
            compare(metrics.slotWidth, thickness)
            verify(metrics.contentWidth <= thickness)
            verify(metrics.slotHeight >= metrics.iconSize + metrics.countHeight + metrics.gap)
          } else {
            compare(metrics.slotHeight, thickness)
            verify(metrics.contentHeight <= thickness)
            verify(metrics.slotWidth >= metrics.iconSize + metrics.countWidth + metrics.gap)
          }
        }
      }
    }
  }

  function test_liveHostReconfiguration() {
    metrics.vertical = false
    metrics.thickness = 24
    metrics.requestedIconSize = 18
    metrics.devicePixelRatio = 1
    var horizontalWidth = metrics.slotWidth
    metrics.vertical = true
    compare(metrics.slotWidth, 24)
    verify(metrics.slotHeight > 24)
    metrics.thickness = 48
    metrics.devicePixelRatio = 2
    compare(metrics.slotWidth, 48)
    compare(metrics.rasterSize, 36)
    metrics.vertical = false
    compare(metrics.slotWidth, horizontalWidth)
    compare(metrics.slotHeight, 48)
  }
}
