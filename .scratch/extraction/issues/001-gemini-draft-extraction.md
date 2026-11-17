# 001: Extract transaction drafts from one image

Status: implemented and locally verified.

- [x] Add authenticated, origin-checked, CSRF-protected API extraction route with an 8 MB image limit and in-memory image handling.
- [x] Call Gemini server-side and return editable draft fields without creating records.
- [x] Connect signed-in scan flow to extraction, consent, uncertainty review, and explicit confirmation.
- [x] Keep the unsigned browser demo separate.
- [x] Verify model responses and upload edge cases against a configured Gemini key.
- [x] Complete targeted browser review at desktop and mobile sizes.

Troubleshooting: the original default `gemini-2.5-flash` returned 404 for this new-user key. `gemini-3.8-flash` returned 503 under high demand. A direct request to `gemini-3.5-flash-lite` with the synthetic sample receipt returned valid JSON containing one draft. The API now defaults to this model.

Verification: the running API received `GEMINI_API_KEY` (presence checked without displaying its value). An authenticated local request with a synthetic receipt returned one expense draft for IDR 45,000 dated 2026-11-17. Unsupported media and multiple images returned 400; an image over 8 MB returned 413. Temporary synthetic accounts were deleted after verification. The upload and editable draft screens were reviewed in Chrome at 1440×1000 and 390×844; neither viewport had horizontal overflow. The API extraction request used an authenticated session. The separate responsive UI review used the unsigned demo state; a single signed-in browser upload was not exercised.
