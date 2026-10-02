import type { HighlightKind } from '../shared/highlights';

/** One kept moment of the round: its marker and the recorded window [startAt, endAt] in server ms. */
export type ReplayClip = { id:string; kind:HighlightKind; score:number; actors:string[]; names:Record<string,string>; involvesLocal:boolean; at:number; startAt:number; endAt:number; p:{x:number;y:number;z:number} };
export type ReplayMode = 'frame'|'fullscreen';
export interface ReplayPlayer {
  /** This round's kept clips, best first. */
  clips(): ReplayClip[];
  /** 'frame' draws into `rect` (CSS pixels) after the live frame; 'fullscreen' draws only the replay. */
  play(clip:ReplayClip, opts:{ mode:ReplayMode; rect?:()=>DOMRect; loop?:boolean; onEnd?:()=>void }): void;
  stop(): void;
  current(): ReplayClip|null;
  /** Playback position within the current clip, for the REC timestamp. */
  clock(): { ms:number; total:number };
  /** The replay bus, for saving. */
  audioStream(): MediaStream;
  /** The game's WebGL canvas. */
  canvas(): HTMLCanvasElement;
  /** A 2D canvas drawn over a fullscreen replay as a WebGL screen quad (texture upload each frame, never a readback). */
  setRecordingOverlay(source:HTMLCanvasElement|null): void;
}
