# Worth It chat GIF and sticker library

## Bundle format

`library.base64.txt` is a Base64-encoded concatenation of the original GIF files. The chat picker decodes the bundle locally and extracts each item by its exact byte offset and length in `chat-ui.js`. It is served by Worth It itself; it does not call GIPHY, KLIPY, or another GIF-search API.

The catalogue currently contains 24 original animations: 12 GIFs and 12 stickers. Artwork uses a crisp 128 × 128 logical canvas rather than the earlier 32 × 32 assets. Most sticker designs use transparent backgrounds.

## Quality requirements for future assets

- Create artwork at a logical canvas size of at least 128 × 128 pixels. Never upscale the old 32 × 32 previews.
- Use clear shapes, balanced spacing, good contrast, and an intentional limited palette so artwork remains crisp at chat-picker size.
- Stickers should have transparent backgrounds wherever possible. Avoid opaque rectangular backgrounds unless the design itself requires one.
- Keep animations smooth and purposeful. Use consistent frame timing; avoid rapid flashes, excessive motion, and distracting effects.
- Optimize palettes and frame deltas to keep files small without visibly degrading edges or colour clarity. Every asset must remain below the app's 20 MB media limit.
- Use original artwork or content explicitly cleared for reuse. Do not add scraped, watermarked, or copyrighted third-party GIFs.
- Validate each file before publishing: GIF87a/GIF89a signature, nonzero dimensions, expected frame behaviour, and a successful preview in both dark and light chat themes.
- Update the catalogue manifest and the concatenated Base64 bundle together. Offsets must be contiguous, lengths exact, and the manifest must cover the bundle without gaps or overlaps.
- Update `tests/chat-gif-picker.test.mjs` when intentionally changing the catalogue size or quality policy. The tests validate catalogue offsets, GIF signatures, 128 × 128 canvas dimensions, and the expected item count.

## Asset register

| Catalogue ID | Display name | Type | Notes |
| --- | --- | --- | --- |
| `laughing-smile` | Laughing smile | GIF | Original Worth It artwork |
| `party-confetti` | Party confetti | GIF | Original Worth It artwork |
| `rocket-launch` | Rocket launch | GIF | Original Worth It artwork |
| `happy-dance` | Happy dance | GIF | Original Worth It artwork |
| `thinking-face` | Thinking face | GIF | Original Worth It artwork |
| `thumbs-up` | Thumbs up | GIF | Original Worth It artwork |
| `wow-burst` | Wow burst | GIF | Original Worth It artwork |
| `sleepy-cloud` | Sleepy cloud | GIF | Original Worth It artwork |
| `rainbow-wave` | Rainbow wave | GIF | Original Worth It artwork |
| `fireworks-show` | Fireworks show | GIF | Original Worth It artwork |
| `coffee-break` | Coffee break | GIF | Original Worth It artwork |
| `celebration-stars` | Celebration stars | GIF | Original Worth It artwork |
| `sparkle-burst` | Sparkle burst | Sticker | Original Worth It artwork |
| `heart-pulse` | Heart pulse | Sticker | Original Worth It artwork |
| `cat-blink` | Cat blink | Sticker | Original Worth It artwork |
| `cute-dog` | Cute dog | Sticker | Original Worth It artwork |
| `plant-sprout` | Plant sprout | Sticker | Original Worth It artwork |
| `sunflower` | Sunflower | Sticker | Original Worth It artwork |
| `coffee-cup` | Coffee cup | Sticker | Original Worth It artwork |
| `star-eyes` | Star eyes | Sticker | Original Worth It artwork |
| `hug-heart` | Hug heart | Sticker | Original Worth It artwork |
| `party-hat` | Party hat | Sticker | Original Worth It artwork |
| `little-ghost` | Little ghost | Sticker | Original Worth It artwork |
| `rainbow-heart` | Rainbow heart | Sticker | Original Worth It artwork |

## Licensing notes

The included illustrations were generated specifically for the Worth It project and use no downloaded third-party source artwork. This register does **not** describe them as CC0 or public domain. Before adding future assets from outside the project, record their source, creator credit when required, exact licence, and licence-specific conditions.
