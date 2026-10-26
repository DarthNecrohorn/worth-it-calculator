# Worth It chat GIF and sticker library

## Bundle format

`library.base64.txt` is a base64-encoded concatenation of six small, 32×32 GIFs.
The chat picker decodes the bundle locally and extracts each item by its documented byte offset and length in `chat-ui.js`. It is served by the Worth It site itself; it does not call GIPHY, KLIPY, or another GIF search API.

## Asset register

| Catalogue ID | Display name | Type | Source record |
| --- | --- | --- | --- |
| `laughing-smile` | Laughing smile | GIF | Procedurally drawn specifically for the Worth It project; no third-party source asset used |
| `party-confetti` | Party confetti | GIF | Procedurally drawn specifically for the Worth It project; no third-party source asset used |
| `rocket-launch` | Rocket launch | GIF | Procedurally drawn specifically for the Worth It project; no third-party source asset used |
| `sparkle-burst` | Sparkle burst | Sticker | Procedurally drawn specifically for the Worth It project; no third-party source asset used |
| `heart-pulse` | Heart pulse | Sticker | Procedurally drawn specifically for the Worth It project; no third-party source asset used |
| `cat-blink` | Cat blink | Sticker | Procedurally drawn specifically for the Worth It project; no third-party source asset used |

## Licensing notes

These are original, simple geometric illustrations produced for this code change, not downloads from a media provider. This register does **not** label them CC0 or public domain. The project owner should choose and record the licence for distribution. Future catalogue entries should include the source URL, author/creator credit when required, exact licence, and any licence-specific conditions before they are accepted into the library.
