# Worth It chat GIF and sticker library

## Bundle format

`library.base64.txt` is a Base64-encoded concatenation of the original GIF files. The chat picker decodes the bundle locally and extracts each item by its exact byte offset and length in `chat-ui.js`. It is served by Worth It itself; it does not call GIPHY, KLIPY, or another GIF-search API.

The catalogue currently contains 200 original animations: 100 GIFs and 100 stickers. Artwork uses a crisp 128 × 128 logical canvas rather than the earlier 32 × 32 assets. Most sticker designs use transparent backgrounds.

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

| `worth-it-check-pulse` | Worth It check pulse | GIF | Original Worth It artwork, generated for this project |
| `deal-sealed` | Deal sealed | GIF | Original Worth It artwork, generated for this project |
| `budget-bounce` | Budget bounce | GIF | Original Worth It artwork, generated for this project |
| `price-drop-signal` | Price drop signal | GIF | Original Worth It artwork, generated for this project |
| `profit-bloom` | Profit bloom | GIF | Original Worth It artwork, generated for this project |
| `savings-jar-shake` | Savings jar shake | GIF | Original Worth It artwork, generated for this project |
| `coin-orbit` | Coin orbit | GIF | Original Worth It artwork, generated for this project |
| `golden-reveal` | Golden reveal | GIF | Original Worth It artwork, generated for this project |
| `climbing-numbers` | Climbing numbers | GIF | Original Worth It artwork, generated for this project |
| `rebound-trend` | Rebound trend | GIF | Original Worth It artwork, generated for this project |
| `value-meter` | Value meter | GIF | Original Worth It artwork, generated for this project |
| `target-locked` | Target locked | GIF | Original Worth It artwork, generated for this project |
| `goal-trophy` | Goal trophy | GIF | Original Worth It artwork, generated for this project |
| `checklist-complete` | Checklist complete | GIF | Original Worth It artwork, generated for this project |
| `progress-boost` | Progress boost | GIF | Original Worth It artwork, generated for this project |
| `crown-moment` | Crown moment | GIF | Original Worth It artwork, generated for this project |
| `medal-earned` | Medal earned | GIF | Original Worth It artwork, generated for this project |
| `badge-unlocked` | Badge unlocked | GIF | Original Worth It artwork, generated for this project |
| `idea-ignition` | Idea ignition | GIF | Original Worth It artwork, generated for this project |
| `brainwave-pop` | Brainwave pop | GIF | Original Worth It artwork, generated for this project |
| `puzzle-solved` | Puzzle solved | GIF | Original Worth It artwork, generated for this project |
| `found-it` | Found it | GIF | Original Worth It artwork, generated for this project |
| `plan-unfolding` | Plan unfolding | GIF | Original Worth It artwork, generated for this project |
| `bookmark-flip` | Bookmark flip | GIF | Original Worth It artwork, generated for this project |
| `open-book-moment` | Open book moment | GIF | Original Worth It artwork, generated for this project |
| `note-in-motion` | Note in motion | GIF | Original Worth It artwork, generated for this project |
| `calendar-flip` | Calendar flip | GIF | Original Worth It artwork, generated for this project |
| `clockwork-tick` | Clockwork tick | GIF | Original Worth It artwork, generated for this project |
| `alarm-snooze-dance` | Alarm snooze dance | GIF | Original Worth It artwork, generated for this project |
| `battery-recharge` | Battery recharge | GIF | Original Worth It artwork, generated for this project |
| `power-surge` | Power surge | GIF | Original Worth It artwork, generated for this project |
| `wifi-connected` | Wi-Fi connected | GIF | Original Worth It artwork, generated for this project |
| `full-bars` | Full bars | GIF | Original Worth It artwork, generated for this project |
| `device-sync` | Device sync | GIF | Original Worth It artwork, generated for this project |
| `laptop-startup` | Laptop startup | GIF | Original Worth It artwork, generated for this project |
| `phone-ring` | Phone ring | GIF | Original Worth It artwork, generated for this project |
| `monitor-glow` | Monitor glow | GIF | Original Worth It artwork, generated for this project |
| `headphones-groove` | Headphones groove | GIF | Original Worth It artwork, generated for this project |
| `gamepad-combo` | Gamepad combo | GIF | Original Worth It artwork, generated for this project |
| `camera-snap` | Camera snap | GIF | Original Worth It artwork, generated for this project |
| `speaker-pulse` | Speaker pulse | GIF | Original Worth It artwork, generated for this project |
| `keyboard-tap` | Keyboard tap | GIF | Original Worth It artwork, generated for this project |
| `gear-in-motion` | Gear in motion | GIF | Original Worth It artwork, generated for this project |
| `smartwatch-ping` | Smartwatch ping | GIF | Original Worth It artwork, generated for this project |
| `electric-drive` | Electric drive | GIF | Original Worth It artwork, generated for this project |
| `tire-spin` | Tire spin | GIF | Original Worth It artwork, generated for this project |
| `road-trip-ready` | Road trip ready | GIF | Original Worth It artwork, generated for this project |
| `speed-gauge` | Speed gauge | GIF | Original Worth It artwork, generated for this project |
| `fuel-saver` | Fuel saver | GIF | Original Worth It artwork, generated for this project |
| `home-sweet-home` | Home sweet home | GIF | Original Worth It artwork, generated for this project |
| `key-to-home` | Key to home | GIF | Original Worth It artwork, generated for this project |
| `moving-day` | Moving day | GIF | Original Worth It artwork, generated for this project |
| `bamboo-breeze` | Bamboo breeze | GIF | Original Worth It artwork, generated for this project |
| `bonsai-balance` | Bonsai balance | GIF | Original Worth It artwork, generated for this project |
| `orchid-opening` | Orchid opening | GIF | Original Worth It artwork, generated for this project |
| `sunrise-spark` | Sunrise spark | GIF | Original Worth It artwork, generated for this project |
| `moonlit-drift` | Moonlit drift | GIF | Original Worth It artwork, generated for this project |
| `weatherproof-umbrella` | Weatherproof umbrella | GIF | Original Worth It artwork, generated for this project |
| `rain-meter` | Rain meter | GIF | Original Worth It artwork, generated for this project |
| `snowfall-swirl` | Snowfall swirl | GIF | Original Worth It artwork, generated for this project |
| `wind-tunnel` | Wind tunnel | GIF | Original Worth It artwork, generated for this project |
| `compass-quest` | Compass quest | GIF | Original Worth It artwork, generated for this project |
| `route-mapper` | Route mapper | GIF | Original Worth It artwork, generated for this project |
| `train-departure` | Train departure | GIF | Original Worth It artwork, generated for this project |
| `bicycle-roll` | Bicycle roll | GIF | Original Worth It artwork, generated for this project |
| `airplane-glide` | Airplane glide | GIF | Original Worth It artwork, generated for this project |
| `sailboat-drift` | Sailboat drift | GIF | Original Worth It artwork, generated for this project |
| `satellite-orbit` | Satellite orbit | GIF | Original Worth It artwork, generated for this project |
| `planetary-spin` | Planetary spin | GIF | Original Worth It artwork, generated for this project |
| `meteor-dash` | Meteor dash | GIF | Original Worth It artwork, generated for this project |
| `lighthouse-signal` | Lighthouse signal | GIF | Original Worth It artwork, generated for this project |
| `bridge-builder` | Bridge builder | GIF | Original Worth It artwork, generated for this project |
| `handshake-spark` | Handshake spark | GIF | Original Worth It artwork, generated for this project |
| `teamwork-high-five` | Teamwork high five | GIF | Original Worth It artwork, generated for this project |
| `teamwork-hands` | Teamwork hands | GIF | Original Worth It artwork, generated for this project |
| `finish-line-crossed` | Finish line crossed | GIF | Original Worth It artwork, generated for this project |
| `victory-pennant` | Victory pennant | GIF | Original Worth It artwork, generated for this project |
| `delivery-arrives` | Delivery arrives | GIF | Original Worth It artwork, generated for this project |
| `shopping-win` | Shopping win | GIF | Original Worth It artwork, generated for this project |
| `tag-it-right` | Tag it right | GIF | Original Worth It artwork, generated for this project |
| `package-unbox` | Package unbox | GIF | Original Worth It artwork, generated for this project |
| `gift-wrap-wow` | Gift wrap wow | GIF | Original Worth It artwork, generated for this project |
| `cake-slice-celebration` | Cake slice celebration | GIF | Original Worth It artwork, generated for this project |
| `taco-tuesday` | Taco Tuesday | GIF | Original Worth It artwork, generated for this project |
| `pizza-slice-spin` | Pizza slice spin | GIF | Original Worth It artwork, generated for this project |
| `donut-loop` | Donut loop | GIF | Original Worth It artwork, generated for this project |
| `boba-bubble-pop` | Boba bubble pop | GIF | Original Worth It artwork, generated for this project |
| `smart-purchase-seal` | Smart purchase seal | GIF | Original Worth It artwork, generated for this project |
| `golden-ok` | Golden OK | Sticker | Original Worth It artwork, generated for this project |
| `lucky-ticket` | Lucky ticket | Sticker | Original Worth It artwork, generated for this project |
| `blue-ribbon-buddy` | Blue ribbon buddy | Sticker | Original Worth It artwork, generated for this project |
| `lucky-coin` | Lucky coin | Sticker | Original Worth It artwork, generated for this project |
| `diamond-doodle` | Diamond doodle | Sticker | Original Worth It artwork, generated for this project |
| `tiny-crown` | Tiny crown | Sticker | Original Worth It artwork, generated for this project |
| `shield-buddy` | Shield buddy | Sticker | Original Worth It artwork, generated for this project |
| `compass-pal` | Compass pal | Sticker | Original Worth It artwork, generated for this project |
| `mini-trophy` | Mini trophy | Sticker | Original Worth It artwork, generated for this project |
| `crystal-ball` | Crystal ball | Sticker | Original Worth It artwork, generated for this project |
| `magic-wand` | Magic wand | Sticker | Original Worth It artwork, generated for this project |
| `potion-pop` | Potion pop | Sticker | Original Worth It artwork, generated for this project |
| `robot-buddy` | Robot buddy | Sticker | Original Worth It artwork, generated for this project |
| `panda-pal` | Panda pal | Sticker | Original Worth It artwork, generated for this project |
| `fox-scout` | Fox scout | Sticker | Original Worth It artwork, generated for this project |
| `penguin-puff` | Penguin puff | Sticker | Original Worth It artwork, generated for this project |
| `wise-owl` | Wise owl | Sticker | Original Worth It artwork, generated for this project |
| `frog-champion` | Frog champion | Sticker | Original Worth It artwork, generated for this project |
| `bee-buzz` | Bee buzz | Sticker | Original Worth It artwork, generated for this project |
| `butterfly-bloom` | Butterfly bloom | Sticker | Original Worth It artwork, generated for this project |
| `tiny-turtle` | Tiny turtle | Sticker | Original Worth It artwork, generated for this project |
| `whale-wink` | Whale wink | Sticker | Original Worth It artwork, generated for this project |
| `orbit-octopus` | Orbit octopus | Sticker | Original Worth It artwork, generated for this project |
| `jellyfish-glow` | Jellyfish glow | Sticker | Original Worth It artwork, generated for this project |
| `seahorse-swish` | Seahorse swish | Sticker | Original Worth It artwork, generated for this project |
| `crab-captain` | Crab captain | Sticker | Original Worth It artwork, generated for this project |
| `koi-splash` | Koi splash | Sticker | Original Worth It artwork, generated for this project |
| `happy-axolotl` | Happy axolotl | Sticker | Original Worth It artwork, generated for this project |
| `dino-grin` | Dino grin | Sticker | Original Worth It artwork, generated for this project |
| `hedgehog-hug` | Hedgehog hug | Sticker | Original Worth It artwork, generated for this project |
| `raccoon-bandit` | Raccoon bandit | Sticker | Original Worth It artwork, generated for this project |
| `koala-cuddle` | Koala cuddle | Sticker | Original Worth It artwork, generated for this project |
| `capybara-chill` | Capybara chill | Sticker | Original Worth It artwork, generated for this project |
| `rabbit-hop` | Rabbit hop | Sticker | Original Worth It artwork, generated for this project |
| `batty-buddy` | Batty buddy | Sticker | Original Worth It artwork, generated for this project |
| `moon-moth` | Moon moth | Sticker | Original Worth It artwork, generated for this project |
| `peacock-proud` | Peacock proud | Sticker | Original Worth It artwork, generated for this project |
| `fancy-flamingo` | Fancy flamingo | Sticker | Original Worth It artwork, generated for this project |
| `parrot-pal` | Parrot pal | Sticker | Original Worth It artwork, generated for this project |
| `snail-mail` | Snail mail | Sticker | Original Worth It artwork, generated for this project |
| `lucky-ladybug` | Lucky ladybug | Sticker | Original Worth It artwork, generated for this project |
| `magic-mushroom` | Magic mushroom | Sticker | Original Worth It artwork, generated for this project |
| `clover-charm` | Clover charm | Sticker | Original Worth It artwork, generated for this project |
| `cool-cactus` | Cool cactus | Sticker | Original Worth It artwork, generated for this project |
| `monstera-mate` | Monstera mate | Sticker | Original Worth It artwork, generated for this project |
| `fern-friend` | Fern friend | Sticker | Original Worth It artwork, generated for this project |
| `orchid-aura` | Orchid aura | Sticker | Original Worth It artwork, generated for this project |
| `acorn-pal` | Acorn pal | Sticker | Original Worth It artwork, generated for this project |
| `pinecone-pal` | Pinecone pal | Sticker | Original Worth It artwork, generated for this project |
| `seashell-shine` | Seashell shine | Sticker | Original Worth It artwork, generated for this project |
| `coral-crown` | Coral crown | Sticker | Original Worth It artwork, generated for this project |
| `starfish-smile` | Starfish smile | Sticker | Original Worth It artwork, generated for this project |
| `mini-mountain` | Mini mountain | Sticker | Original Worth It artwork, generated for this project |
| `tiny-volcano` | Tiny volcano | Sticker | Original Worth It artwork, generated for this project |
| `puddle-pal` | Puddle pal | Sticker | Original Worth It artwork, generated for this project |
| `snowflake-sweet` | Snowflake sweet | Sticker | Original Worth It artwork, generated for this project |
| `sunbeam-smile` | Sunbeam smile | Sticker | Original Worth It artwork, generated for this project |
| `moon-mood` | Moon mood | Sticker | Original Worth It artwork, generated for this project |
| `cloud-comet` | Cloud comet | Sticker | Original Worth It artwork, generated for this project |
| `tiny-tornado` | Tiny tornado | Sticker | Original Worth It artwork, generated for this project |
| `firefly-glow` | Firefly glow | Sticker | Original Worth It artwork, generated for this project |
| `lightning-bug` | Lightning bug | Sticker | Original Worth It artwork, generated for this project |
| `snow-globe-dream` | Snow globe dream | Sticker | Original Worth It artwork, generated for this project |
| `hourglass-hurry` | Hourglass hurry | Sticker | Original Worth It artwork, generated for this project |
| `pocket-tv` | Pocket TV | Sticker | Original Worth It artwork, generated for this project |
| `notebook-nudge` | Notebook nudge | Sticker | Original Worth It artwork, generated for this project |
| `paper-plane-pal` | Paper plane pal | Sticker | Original Worth It artwork, generated for this project |
| `camera-heart` | Camera heart | Sticker | Original Worth It artwork, generated for this project |
| `headphone-happy` | Headphone happy | Sticker | Original Worth It artwork, generated for this project |
| `game-controller-grin` | Game controller grin | Sticker | Original Worth It artwork, generated for this project |
| `smartphone-smile` | Smartphone smile | Sticker | Original Worth It artwork, generated for this project |
| `laptop-pal` | Laptop pal | Sticker | Original Worth It artwork, generated for this project |
| `battery-buddy` | Battery buddy | Sticker | Original Worth It artwork, generated for this project |
| `wi-fi-wizard` | Wi-Fi wizard | Sticker | Original Worth It artwork, generated for this project |
| `keychain-star` | Keychain star | Sticker | Original Worth It artwork, generated for this project |
| `backpack-buddy` | Backpack buddy | Sticker | Original Worth It artwork, generated for this project |
| `suitcase-scout` | Suitcase scout | Sticker | Original Worth It artwork, generated for this project |
| `shopping-tote` | Shopping tote | Sticker | Original Worth It artwork, generated for this project |
| `ramen-bowl` | Ramen bowl | Sticker | Original Worth It artwork, generated for this project |
| `sushi-spark` | Sushi spark | Sticker | Original Worth It artwork, generated for this project |
| `dumpling-delight` | Dumpling delight | Sticker | Original Worth It artwork, generated for this project |
| `strawberry-sweet` | Strawberry sweet | Sticker | Original Worth It artwork, generated for this project |
| `avocado-ace` | Avocado ace | Sticker | Original Worth It artwork, generated for this project |
| `pineapple-crown` | Pineapple crown | Sticker | Original Worth It artwork, generated for this project |
| `watermelon-wink` | Watermelon wink | Sticker | Original Worth It artwork, generated for this project |
| `cherry-duo` | Cherry duo | Sticker | Original Worth It artwork, generated for this project |
| `boba-buddy` | Boba buddy | Sticker | Original Worth It artwork, generated for this project |
| `croissant-cozy` | Croissant cozy | Sticker | Original Worth It artwork, generated for this project |

## Licensing notes

The included illustrations were generated specifically for the Worth It project and use no downloaded third-party source artwork. This register does **not** describe them as CC0 or public domain. Before adding future assets from outside the project, record their source, creator credit when required, exact licence, and licence-specific conditions.
