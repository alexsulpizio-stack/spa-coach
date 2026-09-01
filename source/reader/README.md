# Strip Reader

Strip Reader is a camera-only product for AquaChek Silver 7-in-1 strips. It scans, confirms, and stores pad readings. It does not recommend chemicals, track inventory, or schedule spa maintenance.

Open it at `/reader/` in the same web server as Spa Coach.

## Shared scanner, two products

Spa Coach stays the water-care coach. Strip Reader is the stripped-down scan app.

Both load the same files:

- `lib/scanner.js` — pad geometry, white balance, CIEDE2000 matching, wet prototypes, learned colors
- `lib/scan-session.js` — photo downscale, auto-detect, full-resolution sampling, pad crops

Future scanner work in those files is inherited by both products. Do not copy scanner code into `reader/app.js`.

Local data is isolated:

- Spa Coach uses `spaCoachState` and `SpaCoachPhotoDB`
- Strip Reader uses `spaStripReaderState` and `SpaStripReaderPhotoDB`

## Feasibility of marketing this to AquaChek

This is a feasible **technical** and **pitch** plan. It is not a guaranteed commercial deal.

### Why the product split works

AquaChek Connect exists, but it is tied to special Select Connect strips. TruTest is a hardware meter with its own strips. The mass-market Silver 7-in-1 bottle Spa Coach already reads has no official phone reader. A camera app that only reads those six pads is the product AquaChek can evaluate without inheriting Spa Coach’s dosing, inventory, or Intex-specific coaching.

Keeping scanner logic in one module is the only way “all strip-reading changes now and in the future” stay in sync. Forking the reader would freeze AquaChek on today’s accuracy.

### What to pitch

- Phone camera reader for the Silver 7-in-1 pads people already buy
- Local-only photos, auto-detect with manual fallback, bottle-chart review, learned lighting calibration
- White-label path: they can rebrand the shell; the engine stays one codebase
- Spa Coach remains a separate coach product

### What not to do

- Do not ship this as “the AquaChek app” without a license. AquaChek® is their trademark.
- Do not claim laboratory accuracy or certification. The scanner is experimental, same as Spa Coach.
- Do not expect Hach to replace Connect or TruTest on the first meeting. The realistic ask is a trial, OEM license, or funded validation against their chart and wet strips.
- Do not mix Spa Coach chemical advice into the AquaChek demo. That is a different product and a different liability.

### Remaining gaps before a serious demo

- Side-by-side accuracy vs bottle chart and vs Connect/TruTest on real wet strips
- Lighting and phone-camera variation beyond the current synthetic fixtures
- Android/iOS packaging if they want store apps rather than a PWA
- Legal: trademark, chart copyright, and “not a medical/certified instrument” language
