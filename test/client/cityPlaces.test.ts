import { describe, expect, it } from 'vitest';
import { cityPlaces } from '../../src/shared/city/places';
import { districtAt } from '../../src/shared/city/frame';
import layoutTwo from '../../design/city/layouts/layout-2.json';

// Ways the place graph could mislead every measure built on it, written before the code:
// 1. A walkable spot belongs to no place (its facts vanish) or to two (counted twice).
// 2. The compass is inverted, so "the dead north" points at the wrong part of the city.
// 3. Landmark floors, roofs and the ground below them blur together.
// 4. A junction is filed under one of its streets, hiding that it is a crossroads.
// 5. The sewer, launch flights and positions outside the city are misfiled as streets.
// 6. IDs change between builds, so stored facts stop matching their places.
// 7. A layout change renames old places, so a year of recorded facts stops meeting the new map.
// 8. The new north is one anonymous blob: a death on a pier, in the water and on the quay read the same.
describe('city places', () => {
  const places = cityPlaces();

  it('files every walkable street cell under exactly one place, and the areas add up', () => {
    const { walkable, counted } = places.audit();
    expect(walkable).toBeGreaterThan(3000);
    expect(counted).toBe(walkable);
    const ids = places.list.map(p => p.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const place of places.list) {
      expect(place.area, place.id).toBeGreaterThan(0);
      expect(place.district, place.id).toBeTruthy();
    }
  });

  it('puts north at -z', () => {
    expect(districtAt(-180, -180)).toBe('north-west');
    expect(districtAt(0, -180)).toBe('north');
    expect(districtAt(150, 150)).toBe('south-east');
    expect(places.at(0, 0.3, -180).district).toBe('north');
  });

  it('separates landmark floors, roofs and upstairs pickups', () => {
    expect(places.at(-16, 0.3, -59).id).toBe('floor:records:0');
    expect(places.at(-16, 8.7, -47).id).toBe('floor:records:8');
    expect(places.at(-16, 16.7, -59).id).toBe('floor:records:16');
    expect(places.at(-16, 30, -59).id).toBe('roof:records');
    expect(places.at(116, 8.7, -84).id).toBe('floor:icebox:8');
    expect(places.at(125, 36.7, 130).id).toBe('roof:pump');
    expect(places.at(-137, 29.7, 0).id).toBe('landmark:gate:upper');
  });

  it('names crossroads as junctions of both streets, and street stretches apart', () => {
    const crossing = places.at(70, 0.3, -18);
    expect(crossing.kind).toBe('junction');
    expect(crossing.id).toContain('ns-70');
    expect(crossing.id).toContain('ew-m18');
    const north = places.at(70, 0.3, -128), south = places.at(70, 0.3, 100);
    expect(north.kind).toBe('street');
    expect(north.id.startsWith('street:ns-70:')).toBe(true);
    expect(south.id).not.toBe(north.id);
  });

  it('files the sewer, the air and the outside separately', () => {
    expect(places.at(0, -6.7, 0).id).toBe('sewer:junction');
    expect(places.at(64, -6.3, -37).id).toBe('sewer:maintenance');
    expect(places.at(-60, -6.7, 0).id).toBe('sewer:trunk-ew');
    expect(places.at(0, 80, 0).id).toBe('air:centre');
    expect(places.at(400, 0.3, 0).id).toBe('outside');
    expect(places.at(Number.NaN, 0, 0).id).toBe('outside');
  });

  it('builds the same IDs every time', () => {
    const again = cityPlaces(true);
    expect(again.list.map(p => p.id)).toEqual(places.list.map(p => p.id));
    expect(again.at(-100, 0.3, -45).id).toBe(places.at(-100, 0.3, -45).id);
  });

  it('names the docks, the precinct and the chutes piece by piece', () => {
    const id = (x: number, y: number, z: number) => places.at(x, y, z).id;
    // The quay is split into stretches at the streets that meet it; each pier and the boat stand apart from the water.
    expect(id(0, 0.3, -170)).toBe('quay:0');
    expect(id(102, 0.3, -170)).toBe('quay:1');
    expect(id(-20, 0.3, -185)).toBe('pier:m20');
    expect(id(20, 0.3, -185)).toBe('pier:20');
    expect(id(0, 0.3, -185)).toBe('water:harbour');
    expect(id(0, -3, -185)).toBe('water:harbour');
    expect(id(120, 0.3, -184)).toBe('boat:deck');
    expect(id(0, 0.3, -130)).toBe('yard:containers');
    expect(id(0, 8, -130)).toBe('yard:containers:top');
    expect(id(100, 0.3, -130)).toBe('floor:pier9:0');
    expect(id(100, 6, -130)).toBe('floor:pier9:5');
    expect(id(100, 20, -130)).toBe('roof:pier9');
    // The precinct house and the cellblock by floor, the yard, the tower and its lookout; rooms come from the kit.
    expect(id(-130, 0.3, -127)).toBe('floor:precinct:0');
    expect(id(-130, 8.3, -127)).toBe('floor:precinct:8');
    expect(id(-130, 16.3, -127)).toBe('floor:precinct:16');
    expect(id(-112, 0.3, -118)).toBe('room:precinct-lobby');
    expect(id(-127, 16.3, -118)).toBe('room:precinct-armoury');
    expect(id(-105, 8.3, -133)).toBe('floor:cellblock:8');
    expect(id(-105, 16.3, -133)).toBe('floor:cellblock:16');
    expect(id(-105, 0.3, -150)).toBe('yard:cellblock');
    expect(id(-105, 20, -150)).toBe('lookout:tower');
    expect(id(-137, 0.3, -70)).toMatch(/^street:gate-lane:/);
    expect(id(14, 0.3, -160)).toMatch(/^street:quay-road:/);
    // A rat riding a Needleworks chute is on the chute, not upstairs and not in the alley beneath it.
    expect(id(-106.8, 8.3, 47)).toBe('chute:needleworks:16');
    expect(id(-111.4, 4.3, 52)).toBe('chute:needleworks:8');
    expect(id(-106.8, 0.3, 47)).not.toMatch(/^chute:/);
    for (const p of ['quay:0', 'pier:m20', 'boat:deck', 'water:harbour', 'yard:containers', 'floor:pier9:0', 'floor:precinct:0', 'floor:cellblock:0', 'lookout:tower'])
      expect(places.byId.get(p)?.district, p).toMatch(/^north/);
  });

  it('keeps every layout-2 ID: streets and landmarks as they were, retired lots and rooftops mapped to where they now lie', () => {
    expect(layoutTwo.layoutVersion).toBe(2);
    expect(layoutTwo.places.length).toBeGreaterThan(150);
    for (const old of layoutTwo.places) {
      const now = places.successor(old.id);
      expect(now, old.id).toBeDefined();
      if (!['lot', 'roof'].includes(old.kind)) expect(now!.id, old.id).toBe(old.id);
      else if (now!.id === old.id) expect(now!.kind).toBe(old.kind);
    }
    expect(places.successor('lot:nowhere:9')).toBeUndefined();
  });
});
