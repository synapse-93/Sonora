# Sonora — Phase 2 Manual Test Checklist

This checklist provides a structured guide to validate Phase 2 functionality: **Real Local Media Playback & File Handling**.

---

## 1. Local File Ingestion & File Picker

| Test Case | Steps | Expected Result | Pass / Fail |
| :--- | :--- | :--- | :---: |
| **Single Audio File Import** | 1. Click **Import** button in header.<br>2. Select a local `.mp3` or `.flac` file. | File appears in library catalog with custom poster, format badge, and auto-selected in hero preview. | [ ] |
| **Multiple Media Files Import** | 1. Click **Import**.<br>2. Select multiple files (e.g. 2 audio tracks, 1 video track). | All files added to library catalog; library badge count updates; first file begins playing. | [ ] |
| **Local Video File Import** | 1. Click **Import**.<br>2. Select a local `.mp4` or `.webm` file. | Video card appears with `VIDEO` badge; hero canvas switches to video mode with video element visible. | [ ] |
| **Unsupported File Rejection** | 1. Click **Import**.<br>2. Select an unsupported file (e.g. `.txt`, `.pdf`, `.zip`). | Error toast appears with unsupported format notice; library remains uncorrupted. | [ ] |

---

## 2. Drag-and-Drop Ingestion

| Test Case | Steps | Expected Result | Pass / Fail |
| :--- | :--- | :--- | :---: |
| **Drag Over Visual State** | 1. Drag a media file from file explorer over the browser window. | Fullscreen cinematic drag overlay appears with glowing violet border and prompt. | [ ] |
| **Drag Leave / Cancel** | 1. Drag file outside window or cancel drag. | Drag overlay cleanly disappears without flickering. | [ ] |
| **Drop Single File** | 1. Drop a valid media file onto the window. | Browser does not navigate away; file is ingested into library catalog. | [ ] |
| **Drop Multiple Files** | 1. Drag & drop a folder selection of 3+ files. | All valid media files are ingested; toast displays `Imported X media files!`. | [ ] |

---

## 3. Real Media Playback & Controls

| Test Case | Steps | Expected Result | Pass / Fail |
| :--- | :--- | :--- | :---: |
| **Play / Pause Toggle** | 1. Click **Play** button on hero canvas or bottom player bar. | Real media starts playing; play icon switches to pause icon; elapsed time advances. | [ ] |
| **Pause State** | 1. Click **Pause** button while media is playing. | Playback halts immediately; pause icon reverts to play icon; time stays frozen. | [ ] |
| **Resume Playback** | 1. Click **Play** while paused. | Playback resumes seamlessly from the current offset without resetting. | [ ] |
| **Card Play Overlay** | 1. Hover over a media card and click the play button overlay. | Card's track is loaded and begins playing immediately; card is highlighted with violet ring. | [ ] |
| **Sample Item Guidance** | 1. Click Play on a Phase 1 sample fixture (not imported). | Helpful toast notification explains sample items are fixtures and prompts importing local files. | [ ] |

---

## 4. Seeking & Scrubber Timeline

| Test Case | Steps | Expected Result | Pass / Fail |
| :--- | :--- | :--- | :---: |
| **Live Scrubber Dragging** | 1. Click and drag scrubber thumb to the middle of the timeline. | Elapsed time updates live during drag; scrubber does not jump or snap backwards. | [ ] |
| **Seek Commit** | 1. Release scrubber thumb. | Media playback immediately jumps to the selected timestamp and continues. | [ ] |
| **Replay 10s** | 1. Click **Replay 10s** button (`↺ 10`). | Playback position rewinds by exactly 10 seconds (clamped at 0:00). | [ ] |
| **Skip 10s** | 1. Click **Skip 10s** button (`↻ 10`). | Playback position advances by 10 seconds (clamped at track duration). | [ ] |

---

## 5. Audio Management (Volume, Mute, Speed)

| Test Case | Steps | Expected Result | Pass / Fail |
| :--- | :--- | :--- | :---: |
| **Volume Slider** | 1. Drag volume slider between 0% and 100%. | Audio output level adjusts smoothly; dynamic volume icon changes (high, mid, low). | [ ] |
| **Mute Toggle** | 1. Click speaker icon button. | Audio mutes instantly; icon changes to muted glyph; slider reflects zero. | [ ] |
| **Unmute Recovery** | 1. Click speaker icon again or drag volume slider. | Previous volume level is restored. | [ ] |
| **Playback Speed Cycle** | 1. Click speed badge (`1.0x`) in player bar. | Cycles `1.0x` -> `1.25x` -> `1.5x` -> `2.0x` -> `0.5x` -> `0.75x` with pitch preservation. | [ ] |

---

## 6. Queue Navigation & Auto-Advance

| Test Case | Steps | Expected Result | Pass / Fail |
| :--- | :--- | :--- | :---: |
| **Next Track Navigation** | 1. Click **Next** button (`⏭`). | Next track in queue is loaded and starts playing; active highlight updates in queue drawer. | [ ] |
| **Previous Track Navigation** | 1. Within 3 seconds of track start, click **Prev** (`⏮`). | Previous track in queue begins playing. | [ ] |
| **Track Restart on Prev** | 1. After 5+ seconds of playback, click **Prev** (`⏮`). | Current track restarts from 0:00. | [ ] |
| **Natural Track Auto-Advance** | 1. Allow track to play to completion (or seek to 2s before end). | When track ends, player automatically transitions to the next queue track seamlessly. | [ ] |

---

## 7. Keyboard Shortcuts System

| Shortcut | Action | Input Focus Guard Verification | Pass / Fail |
| :--- | :--- | :--- | :---: |
| **Space** / **K** | Toggle Play / Pause | Verify spacebar inside search input types a space, not toggling playback. | [ ] |
| **ArrowLeft** / **J** | Seek backward 5s / 10s | Ignored when search input focused. | [ ] |
| **ArrowRight** / **L** | Seek forward 5s / 10s | Ignored when search input focused. | [ ] |
| **ArrowUp** / **ArrowDown** | Volume +5% / -5% | Ignored when search input focused. | [ ] |
| **M** | Toggle Mute | Ignored when typing 'm' into search input. | [ ] |
| **N** / **P** | Next / Previous track | Ignored when typing into search input. | [ ] |
| **0 – 9** | Seek to 0% – 90% of duration | Ignored when typing numbers into search input. | [ ] |

---

## 8. Resource Management & Memory Safety

| Test Case | Expected Result | Pass / Fail |
| :--- | :--- | :---: |
| **Object URL Registry Revocation** | When tracks are removed or replaced, `URL.revokeObjectURL()` is called to prevent memory leaks. | [ ] |
| **Unload Teardown** | On page refresh or closing, `window.beforeunload` triggers `revokeAllUrls()`. | [ ] |
| **Single Playback Source** | When switching from video to audio (or vice versa), previous element pauses and unloads cleanly. | [ ] |
