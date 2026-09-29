import { describe, expect, it } from 'vitest';
import { cityPlaces } from '../../src/shared/city/places';
import { districtAt } from '../../src/shared/city/frame';

// Ways the place graph could mislead every measure built on it, written before the code:
// 1. A walkable spot belongs to no place (its facts vanish) or to two (counted twice).
// 2. The compass is inverted, so "the dead north" points at the wrong part of the city.
// 3. Landmark floors, roofs and the ground below them blur together.
// 4. A junction is filed under one of its streets, hiding that it is a crossroads.
// 5. The sewer, launch flights and positions outside the city are misfiled as streets.
// 6. IDs change between builds, so stored facts stop matching their places.
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
    const north = places.at(70, 0.3, -150), south = places.at(70, 0.3, 100);
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
});
