import {caseTime} from '../ui/roundStats';
import {reducedMotion} from '../ui/motion';
import {caption, CASE_KINDS} from './captions';
import type {ReplayClip, ReplayPlayer} from './types';

/** X5: an exhibit saved as a video file. The clip plays fullscreen from the start while `MediaRecorder` takes the game
 * canvas (`captureStream`, no pixel readback) and the replay sound bus. A canvas recording cannot see CSS, so the tape
 * marks (REC dot, timestamp, caption, site mark) are drawn into a 2D canvas the replay shows as a WebGL screen quad. */

const TYPES = [
    {mimeType: 'video/mp4;codecs=avc1,mp4a', ext: 'mp4'},
    {mimeType: 'video/webm;codecs=vp9,opus', ext: 'webm'},
    {mimeType: 'video/webm;codecs=vp8,opus', ext: 'webm'},
] as const;
/** The overlay's widest size: it is stretched over the frame, so a full-resolution texture would only cost uploads. */
const OVERLAY_MAX_W = 1280;

export type SaveRun = {
    /** Settles when the recording ends: true once the file has been handed to the browser's download. */
    done: Promise<boolean>;
    /** Stop now (Esc); nothing is downloaded. */
    cancel(): void;
};

/** MP4 where the browser can make it, else WebM (VP9, then VP8, with Opus); the browser's own default as a last resort. */
export function recordingType(): {mimeType: string; ext: 'mp4' | 'webm'} {
    for (const type of TYPES) if (MediaRecorder.isTypeSupported(type.mimeType)) return type;
    return {mimeType: '', ext: 'webm'};
}

/** `rat-detective-<kind>-<YYYY-MM-DD-HHMM>.<ext>`, in local time. */
export function clipFileName(clip: Pick<ReplayClip, 'kind'>, ext: string, at = new Date()): string {
    const two = (n: number) => String(n).padStart(2, '0');
    return `rat-detective-${clip.kind}-${at.getFullYear()}-${two(at.getMonth() + 1)}-${two(at.getDate())}-${two(at.getHours())}${two(at.getMinutes())}.${ext}`;
}

/** Whether this browser can record the canvas at all. */
export function canSave(player: ReplayPlayer): boolean {
    return typeof MediaRecorder === 'function' && typeof player.canvas().captureStream === 'function';
}

export function saveClip(player: ReplayPlayer, clip: ReplayClip, letter: string, doc: Document = document): SaveRun {
    const view = doc.defaultView ?? window;
    const canvas = player.canvas();
    const video = canvas.captureStream(60).getVideoTracks()[0];
    // A clone, so stopping it never ends the replay bus's own track.
    const audio = player.audioStream().getAudioTracks()[0]?.clone();
    const tracks = [video, audio].filter((track): track is MediaStreamTrack => !!track);
    const type = recordingType();
    let recorder: MediaRecorder;
    try {recorder = new MediaRecorder(new MediaStream(tracks), type.mimeType ? {mimeType: type.mimeType} : undefined);}
    catch (error) {for (const track of tracks) track.stop(); throw error;}
    const chunks: Blob[] = [];
    recorder.addEventListener('dataavailable', event => {if (event.data.size) chunks.push(event.data);});

    const overlay = doc.createElement('canvas');
    const scale = Math.min(1, OVERLAY_MAX_W / Math.max(1, canvas.width));
    overlay.width = Math.max(1, Math.round(canvas.width * scale));
    overlay.height = Math.max(1, Math.round(canvas.height * scale));
    const marks = overlayPainter(overlay, clip, letter);
    let frame = 0, lastKey = '';
    const paint = () => {
        const ms = player.clock().ms, blink = reducedMotion() || Math.floor(performance.now() / 500) % 2 === 0;
        const key = `${Math.floor(ms / 1000)}|${blink}`;
        if (key !== lastKey) {lastKey = key; marks(ms, blink);}
        frame = view.requestAnimationFrame(paint);
    };
    paint();
    player.setRecordingOverlay(overlay);

    let cancelled = false, finished = false;
    let settle!: (saved: boolean) => void;
    const done = new Promise<boolean>(resolve => {settle = resolve;});
    const cleanup = () => {
        view.cancelAnimationFrame(frame);
        player.setRecordingOverlay(null);
        for (const track of tracks) track.stop();
    };
    recorder.addEventListener('stop', () => {
        cleanup();
        if (cancelled || !chunks.length) {settle(false); return;}
        const url = URL.createObjectURL(new Blob(chunks, {type: recorder.mimeType || type.mimeType || 'video/webm'}));
        const link = doc.createElement('a');link.href = url;link.download = clipFileName(clip, type.ext);
        doc.body.appendChild(link);link.click();link.remove();
        view.setTimeout(() => URL.revokeObjectURL(url), 1000);
        settle(true);
    });
    const finish = () => {
        if (finished) return;
        finished = true;
        if (recorder.state === 'inactive') {cleanup(); settle(false);} else recorder.stop();
    };
    try {
        recorder.start(1000);
        player.play(clip, {mode: 'fullscreen', loop: false, onEnd: finish});
    } catch (error) {
        cancelled = true;finish();
        console.warn('[exhibits] recording failed', error);
    }
    return {
        done,
        cancel() {
            if (finished) return;
            cancelled = true;player.stop();finish();
        },
    };
}

/** The tape marks for the saved file: REC dot and timestamp top left, the caption bar along the bottom, the site mark. */
function overlayPainter(overlay: HTMLCanvasElement, clip: ReplayClip, letter: string): (ms: number, dot: boolean) => void {
    const ctx = overlay.getContext('2d');
    const w = overlay.width, h = overlay.height, u = Math.max(10, h / 36);
    const line = caption(clip), exhibit = `EXHIBIT ${letter}`, red = CASE_KINDS[clip.kind] ? '#ff3024' : '#efe6cf';
    return (ms, dot) => {
        if (!ctx) return;
        ctx.clearRect(0, 0, w, h);
        ctx.textBaseline = 'middle';
        // REC dot and the round-style timestamp.
        ctx.fillStyle = '#05070d99';ctx.fillRect(u * .8, u * .8, u * 7.6, u * 1.9);
        if (dot) {ctx.fillStyle = '#e8261c';ctx.beginPath();ctx.arc(u * 1.8, u * 1.75, u * .5, 0, Math.PI * 2);ctx.fill();}
        ctx.fillStyle = '#efe6cf';ctx.font = `${Math.round(u * 1.1)}px 'Special Elite','Courier New',monospace`;
        ctx.textAlign = 'left';ctx.fillText(`REC ${caseTime(ms / 1000)}`, u * 2.7, u * 1.8);
        // Caption bar.
        const barH = u * 2.6, barY = h - barH - u * .8;
        ctx.fillStyle = '#05070dcc';ctx.fillRect(0, barY, w, barH);
        ctx.fillStyle = red;ctx.font = `${Math.round(u * 1.6)}px Bangers,Impact,sans-serif`;
        ctx.fillText(exhibit, u, barY + barH / 2);
        const capX = u * 1.8 + ctx.measureText(exhibit).width;
        ctx.fillStyle = '#becdf0';ctx.font = `${Math.round(u * 1.15)}px 'Special Elite','Courier New',monospace`;
        ctx.fillText(line, capX, barY + barH / 2, Math.max(u, w - capX - u * 11));
        // Site mark.
        ctx.textAlign = 'right';ctx.fillStyle = '#a5b9e1b0';ctx.font = `${Math.round(u * .85)}px 'Special Elite','Courier New',monospace`;
        ctx.fillText('ratdetective.online', w - u, barY + barH / 2);
    };
}
