import type { MapView } from './canvas';
import type { Api } from './data';
import type { PlaceLayer } from './placeLayer';

/** What every mode of the page gets: the data source, the canvas, the URL state and a way to ask for a redraw. */
export interface Context {
  api: Api; view: MapView; places: PlaceLayer;
  /** The page's URL parameters; `save` writes them back so a refresh keeps the view. */
  params: URLSearchParams; save(): void;
  redraw(): void; status(text: string): void;
}
export interface Mode {
  readonly id: string; readonly label: string;
  /** The side panel, built once. */
  readonly panel: HTMLElement;
  /** Called when the mode is shown and every minute while it is; loads what it needs. */
  refresh(): Promise<void>;
  /** Draws the map and returns the legend's HTML. */
  draw(): string;
  /** The hover card (HTML) for a point on the map, in canvas pixels and world units. */
  hover(px: number, py: number, x: number, z: number): string | undefined;
}
