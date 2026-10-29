/* Worth It Chat enhancements: searchable history, voice notes, mobile reply gestures and friend-only WebRTC calls. */
(function () {
"use strict";
const $ = id => document.getElementById(id);
const GLOBAL_CHAT_ID = "00000000-0000-4000-8000-000000000001";
const RTC_CONFIG = { iceServers: [
    { urls: "stun:stun.l.google.com:19302" },
    { urls: "stun:stun1.l.google.com:19302" },
    { urls: "stun:stun2.l.google.com:19302" }
] };
const CALL_TICK_MS = 1200;
const INCOMING_TICK_MS = 2000;
const $client = () => window.supabaseClient || null;
let currentContext = null;
let searchSequence = 0;
let searchTimer = null;
let searchResults = [];
let incomingPollBusy = false;
let incomingCall = null;
let activeCall = null;
let callPollTimer = null;
let incomingPollTimer = null;
let callOverlayCloseTimer = null;
let connectionRecoveryTimer = null;
let callEverConnected = false;
let callPeer = null;
let localStream = null;
let remoteStream = null;
let lastRemoteSignalId = 0;
let remoteCandidatesPending = [];
let queuedCandidates = [];
let answerApplied = false;
let audioMuted = false;
let cameraDisabled = false;
let remoteAudioContext = null;
let remoteAudioSource = null;
let remoteAudioGain = null;
let remoteAudioSourceTrackKey = "";
let speakerBoostEnabled = false;
let audioRecorder = null;
let audioRecorderStream = null;
let audioRecordingContext = null;
let audioChunks = [];
let audioRecordingStartedAt = 0;
let audioLimitTimer = null;
let audioRecordStatusTimer = null;

const CHAT_WALLPAPER_MOTIFS = ["<path d=\"M18 58 68 16 118 58V118H18Z M48 118V80H78V118 M11 59 68 10 125 59\"/>","<path d=\"M23 54Q17 27 39 22L59 34 78 22Q101 27 95 54L89 86Q84 106 59 108Q34 106 29 86Z M43 61H44M74 61H75M44 82Q59 93 74 82\"/>","<circle cx=\"70\" cy=\"70\" r=\"25\"/><path d=\"M70 10V27M70 113V130M10 70H27M113 70H130M28 28 40 40M100 100 112 112M112 28 100 40M40 100 28 112M60 68H61M79 68H80M60 81Q70 90 80 81\"/>","<path d=\"M70 76Q40 69 37 41Q61 37 70 67Q72 39 101 30Q111 56 77 76M70 76V99M45 99H95L88 122H52Z M40 122H100\"/>","<path d=\"M70 12 84 49 124 52 94 78 103 118 70 97 37 118 46 78 16 52 56 49Z\"/>","<path d=\"M23 46H93V96Q93 110 79 110H37Q23 110 23 96Z M93 58H106Q125 58 120 79Q117 94 93 92 M31 119H91\"/>","<path d=\"M23 49Q17 30 37 28Q41 12 60 19Q72 2 87 22Q109 20 112 40Q129 48 116 64H30Q14 62 23 49Z M37 81 31 98M63 81 57 103M89 81 83 98\"/>","<path d=\"M23 20Q23 14 30 14H68V120H30Q23 120 23 113Z M68 14H110Q117 14 117 21V113Q117 120 110 120H68 M36 34H55M36 48H55M81 34H101M81 48H101\"/>","<circle cx=\"69\" cy=\"67\" r=\"23\"/><ellipse cx=\"69\" cy=\"67\" rx=\"53\" ry=\"19\" transform=\"rotate(-25 69 67)\"/><circle cx=\"112\" cy=\"34\" r=\"7\"/>","<path d=\"M70 41C58 19 34 27 35 45C36 61 70 72 70 72S104 61 105 45C106 27 82 19 70 41Z M70 72V118 M70 91 47 78M70 103 95 86 M42 119H98\"/>","<path d=\"M54 21V78Q54 92 39 92Q25 92 25 80Q25 68 42 66L63 61V30L105 21V69Q105 83 90 83Q76 83 76 71Q76 59 93 57L114 52V12Z\"/>","<path d=\"M20 52 121 15 83 118 64 75Z M64 75 121 15 M64 75 43 89\"/>","<path d=\"M70 12 103 46 91 98 70 121 49 98 37 46Z M70 12V121 M49 98 20 111 37 75 M91 98 120 111 103 75 M57 45Q70 31 83 45Q91 54 83 63H57Q49 54 57 45Z M57 75H83\"/>","<path d=\"M70 42C56 20 24 24 22 49C20 73 48 96 70 116C92 96 120 73 118 49C116 24 84 20 70 42Z\"/>","<path d=\"M55 81Q40 75 43 58Q45 45 57 41Q57 22 70 22Q83 22 83 41Q95 45 97 58Q100 75 85 81L82 91H58Z M58 99H82M61 107H79 M70 9V15M27 36 37 42M113 36 103 42M25 67H35M115 67H105\"/>","<path d=\"M23 70V59Q23 15 69 15Q115 15 115 59V89Q115 105 100 105H94V80H108V59Q108 22 69 22Q30 22 30 59V80H44V105H38Q23 105 23 89Z\"/>","<path d=\"M70 15Q104 26 108 57Q111 84 70 119Q29 84 32 57Q36 26 70 15Z M43 60Q69 66 92 38 M70 119V91\"/>","<path d=\"M20 47H43L55 34H89L101 47H120V103H20Z M58 34 64 23H83L89 34 M70 54A20 20 0 1 0 70 94A20 20 0 1 0 70 54Z M104 58H111\"/>","<path d=\"M30 44Q30 28 49 25Q57 12 72 24Q89 12 98 30Q117 34 112 51L86 75H56L31 59Z M70 69 56 96H74L61 122 93 84H75L86 69Z\"/>","<path d=\"M22 68Q18 31 70 22Q122 31 118 68Q104 78 70 78Q36 78 22 68Z M42 78V105Q42 119 56 119H84Q98 119 98 105V78 M57 92H83\"/>","<circle cx=\"30\" cy=\"99\" r=\"20\"/><circle cx=\"110\" cy=\"99\" r=\"20\"/><path d=\"M30 99 54 51 78 99H30L57 70 91 57 110 99 M54 51H79M91 57 98 45M78 99 64 119\"/>","<path d=\"M70 13Q44 17 39 48Q39 68 59 78V91H81V78Q101 68 101 48Q96 17 70 13Z M59 91H81V101H59Z M63 109H77 M56 33Q70 21 84 33\"/>","<path d=\"M17 68Q17 31 52 29Q61 14 77 30Q111 26 119 54Q135 65 118 81H22Q9 78 17 68Z M52 89 43 105M78 89 69 109M101 89 92 105\"/>","<path d=\"M70 15Q96 14 104 38Q111 58 90 74L80 120H60L50 74Q29 58 36 38Q44 14 70 15Z M52 57H88M61 37H79\"/>","<path d=\"M26 47Q12 33 26 20Q40 7 54 20L70 38 86 20Q100 7 114 20Q128 33 114 47L70 93Z M70 93V119\"/>","<path d=\"M20 44 70 15 120 44 105 118H35Z M40 52H100M48 72H92M57 92H83\"/>","<path d=\"M25 40H115V93H79L58 114V93H25Z M43 58H97M43 74H82\"/>","<path d=\"M70 15 82 39 109 43 89 62 94 89 70 76 46 89 51 62 31 43 58 39Z M60 102H80M56 113H84\"/>","<path d=\"M32 30 70 15 108 30 112 79 70 120 28 79Z M48 57H92M47 71H93M53 85H87 M60 99H80\"/>","<path d=\"M35 28Q70 9 105 28V78Q105 103 70 119Q35 103 35 78Z M52 52H53M87 52H88M51 74Q70 89 89 74\"/>","<path d=\"M18 57Q18 22 50 22Q70 4 90 22Q122 22 122 57Q122 88 90 88H75L57 110V88H50Q18 88 18 57Z M43 55H44M68 55H69M93 55H94\"/>","<path d=\"M25 36 70 18 115 36 105 104 70 121 35 104Z M51 49 70 38 89 49 89 75 70 87 51 75Z M59 101H81\"/>","<path d=\"M70 18Q92 18 104 38Q116 58 94 81L78 118H62L46 81Q24 58 36 38Q48 18 70 18Z M52 54H88M60 72H80\"/>","<path d=\"M35 39Q35 21 53 21Q70 21 70 39Q70 21 87 21Q105 21 105 39Q105 57 70 81Q35 57 35 39Z M70 81V119\"/>","<path d=\"M25 29H115V111H25Z M25 51H115M25 88H115M51 29V111M89 29V111 M35 40H41M62 40H78M98 40H105\"/>","<path d=\"M70 18Q100 18 105 48L95 96H45L35 48Q40 18 70 18Z M48 53Q70 67 92 53M56 77Q70 88 84 77\"/>","<path d=\"M22 45Q22 22 45 22L70 36 95 22Q118 22 118 45Q118 63 70 100Q22 63 22 45Z M70 100V120\"/>"];
const CHAT_WALLPAPER_EXTRA_MOTIFS = [
    '<path d="M24 54 27 29 45 43 70 21 95 43 113 29 116 54Q116 101 70 116Q24 101 24 54Z M48 66H49M91 66H92M52 86Q70 99 88 86 M24 54 9 45M116 54 131 45"/>',
    '<path d="M23 45Q23 23 45 25Q52 10 68 25Q88 11 95 29Q117 28 117 50Q117 69 100 74L92 105 78 82H44L32 105 37 73Q23 65 23 45Z M48 51H49M91 51H92M53 64Q70 72 87 64"/>',
    '<rect x="27" y="18" width="86" height="104" rx="9"/><rect x="38" y="29" width="64" height="24" rx="3"/><path d="M41 68H52M64 68H75M87 68H98M41 84H52M64 84H75M87 84H98M41 100H52M64 100H75M87 100H98"/>',
    '<path d="M70 34Q57 17 39 24Q23 31 29 51L39 75 50 104 70 121 90 104 101 75 111 51Q117 31 101 24Q83 17 70 34Z M70 34V58M70 58 85 48"/>',
    '<path d="M70 18 91 44 111 48 99 73 104 91 70 82 36 91 41 73 29 48 49 44Z M70 82V118M70 98 51 110M70 102 91 114"/>',
    '<path d="M70 18 105 39 105 79 70 100 35 79 35 39Z M70 18V58M35 39 70 58 105 39M70 58V100"/>',
    '<path d="M21 46 70 21 119 46V91H21Z M42 91V61H62V91M78 61H98V74H78Z M78 80H98"/>',
    '<path d="M22 63Q22 27 48 27Q70 27 70 52Q70 27 92 27Q118 27 118 63Q118 94 70 119Q22 94 22 63Z M44 64H45M95 64H96"/>',
    '<path d="M31 32H109V111H31Z M47 47H93V58H47Z M47 69H59V81H47Z M66 69H78V81H66Z M85 69H97V81H85Z M47 89H59V101H47Z M66 89H78V101H66Z M85 89H97V101H85Z"/>',
    '<path d="M25 59Q25 23 59 23Q79 23 79 43Q79 63 59 63H49L35 78V63Q25 63 25 59Z M75 75Q75 56 94 56Q115 56 115 75Q115 89 101 89V105L87 89H84"/>',
    '<path d="M36 33H104V104H36Z M48 45H92V57H48Z M48 69H61M70 69H83M48 82H61M70 82H83M48 95H61M70 95H83"/>',
    '<path d="M25 49Q25 24 50 24Q70 5 90 24Q115 24 115 49Q115 73 90 73H50Q25 73 25 49Z M42 90 53 76M70 90 70 76M98 90 87 76"/>',
    '<circle cx="70" cy="70" r="39"/><path d="M31 70H109M70 31Q47 50 47 70Q47 90 70 109M70 31Q93 50 93 70Q93 90 70 109M38 49H102M38 91H102"/>',
    '<path d="M24 44Q24 27 41 27H79Q96 27 96 44V63Q96 80 79 80H54L36 98V80H41Q24 80 24 63Z M72 80H93Q111 80 111 97V104L97 91H72"/>',
    '<path d="M70 20 82 47 112 50 90 70 96 101 70 85 44 101 50 70 28 50 58 47Z M70 85V118"/>',
    '<path d="M25 75Q25 37 63 37Q74 19 91 32Q112 37 112 59Q112 78 93 78H25Z M48 89V103M70 89V103M92 89V103"/>',
    '<path d="M23 24H117V117H23Z M23 46H117M23 69H117M23 92H117M46 24V117M70 24V117M94 24V117"/>',
    '<path d="M32 22H108V118H32Z M44 36H96M44 49H90M44 63H96M44 77H84M44 91H96M44 105H77"/>',
    '<path d="M35 23H105V58Q105 78 85 78H65L46 96V78Q35 78 35 58Z M55 42H56M70 42H71M85 42H86"/>',
    '<path d="M70 20 111 49 97 104 70 120 43 104 29 49Z M45 54H95M49 71H91M55 88H85"/>',
    '<path d="M20 58Q20 25 52 25Q70 8 88 25Q120 25 120 58Q120 86 92 86H78L65 109 52 86H48Q20 86 20 58Z M47 54H48M69 54H70M91 54H92"/>',
    '<path d="M30 36 70 17 110 36 102 93 70 116 38 93Z M45 48 70 36 95 48 95 76 70 89 45 76Z M54 100H86"/>',
    '<path d="M70 18Q95 18 106 40Q117 61 92 80L80 117H60L48 80Q23 61 34 40Q45 18 70 18Z M52 54H88M57 70H83"/>',
    '<path d="M35 40Q35 21 53 21Q70 21 70 40Q70 21 87 21Q105 21 105 40Q105 58 70 82Q35 58 35 40Z M70 82V119"/>',
    '<path d="M25 29H115V111H25Z M25 51H115M25 88H115M51 29V111M89 29V111 M35 40H41M62 40H78M98 40H105"/>',
    '<path d="M29 51Q29 24 52 24Q70 7 88 24Q111 24 111 51V83Q111 111 70 120Q29 111 29 83Z M48 62H49M91 62H92M53 80Q70 92 87 80"/>',
    '<path d="M28 46Q28 24 50 24L70 38 90 24Q112 24 112 46Q112 66 70 98Q28 66 28 46Z M70 98V119"/>',
    '<path d="M23 43 37 27 53 43 53 66 37 80 23 66Z M87 43 103 27 117 43 117 66 103 80 87 66Z M37 80V106H103V80M53 66H87"/>',
    '<path d="M25 43Q25 24 44 24H96Q115 24 115 43V92Q115 111 96 111H44Q25 111 25 92Z M43 44H77V73H43Z M86 45H98M86 58H98M86 71H98M43 86H98M43 98H98"/>',
    '<path d="M31 48H109V101H31Z M45 48V27H95V48M45 101V116M95 101V116M52 67H88M52 81H88"/>',
    '<path d="M26 68Q26 24 70 24Q114 24 114 68Q114 112 70 112Q26 112 26 68Z M70 39V68L91 80M70 14V21M70 115V123M14 68H21M119 68H126"/>',
    '<path d="M70 18V43M70 43 94 29M70 43 48 29M70 43V73M70 73 48 88M70 73 93 89M70 73V110M56 110H84"/>',
    '<path d="M25 38 70 17 115 38 102 104 70 121 38 104Z M42 48 70 35 98 48 98 78 70 94 42 78Z M54 104H86"/>',
    '<path d="M35 25H105V115H35Z M35 47H105M35 69H105M35 91H105M55 25V115M85 25V115"/>',
    '<path d="M70 19 105 39V79L70 101 35 79V39Z M70 19V58M35 39 70 58 105 39M70 58V101"/>',
    '<path d="M27 43H113V99H27Z M42 43V25H98V43M42 99V115M98 99V115M43 61H97M43 79H84"/>',
    '<path d="M25 45H115V105H25Z M45 45V28H95V45M45 105V117M95 105V117M43 60H97M43 78H97M43 94H72"/>',
    '<path d="M70 22 91 43 70 64 49 43Z M70 64V116M49 86H91M50 102H90"/>',
    '<path d="M24 49Q24 24 49 24H91Q116 24 116 49V76Q116 101 91 101H49Q24 101 24 76Z M40 49H80M40 63H99M40 77H72"/>',
    '<path d="M34 37H106V110H34Z M45 49H95V61H45Z M45 73H58M66 73H79M87 73H95M45 86H58M66 86H79M87 86H95M45 99H58M66 99H79M87 99H95"/>',
    '<path d="M31 37H109V111H31Z M45 51H95M45 65H95M45 79H95M45 93H78"/>',
    '<path d="M26 40Q26 24 42 24H78Q94 24 94 40V75Q94 91 78 91H55L39 108V91H42Q26 91 26 75Z M76 40H77M84 40H85"/>',
    '<path d="M25 70 46 49 70 28 94 49 115 70M39 61V108H101V61M60 108V78H80V108"/>',
    '<path d="M70 20Q93 20 104 42Q115 64 92 82L79 119H61L48 82Q25 64 36 42Q47 20 70 20Z M48 52H92M55 70H85"/>',
    '<path d="M30 43 70 21 110 43V98L70 120 30 98Z M45 52 70 39 95 52 95 89 70 103 45 89Z"/>',
    '<path d="M30 31H110V100H30Z M44 45H96V57H44Z M44 69H61M69 69H96M44 83H96"/>',
    '<path d="M24 45Q24 24 45 24H75Q96 24 96 45V74Q96 95 75 95H58L39 112V95H45Q24 95 24 74Z M107 40V76M89 58H125"/>',
    '<path d="M70 20 84 45 112 49 91 69 96 99 70 84 44 99 49 69 28 49 56 45Z M55 109H85"/>',
    '<path d="M28 46H112V99H28Z M41 60H99M41 73H90M41 86H99 M41 99V114M99 99V114"/>',
    '<path d="M35 40Q35 22 53 22H87Q105 22 105 40V93Q105 111 87 111H53Q35 111 35 93Z M51 47H89M51 61H89M51 75H89M51 89H78"/>',
    '<path d="M70 18 112 41 112 87 70 111 28 87 28 41Z M70 18V64M28 41 70 64 112 41M70 64V111"/>',
    '<path d="M26 42Q26 24 44 24H96Q114 24 114 42V83Q114 101 96 101H76L60 117V101H44Q26 101 26 83Z M46 52H47M70 52H71M94 52H95"/>',
    '<path d="M70 23Q103 23 110 54Q116 83 70 118Q24 83 30 54Q37 23 70 23Z M50 61 64 75 91 46"/>',
    '<path d="M29 40 70 19 111 40 111 96 70 118 29 96Z M44 53H96M44 69H96M44 85H96"/>',
    '<path d="M35 26H105V114H35Z M48 42H92M48 56H92M48 70H82M48 84H92M48 98H76"/>',
    '<path d="M70 23 92 45 92 81 70 103 48 81 48 45Z M70 23V103M48 45 92 81M92 45 48 81"/>',
    '<path d="M25 54Q25 29 50 29H90Q115 29 115 54V76Q115 101 90 101H50Q25 101 25 76Z M45 58H46M64 58H65M83 58H84M53 78H87"/>',
    '<path d="M25 40 70 19 115 40 105 103 70 120 35 103Z M48 50 70 40 92 50 92 75 70 87 48 75Z M53 101H87"/>',
    '<path d="M26 45Q26 24 47 24Q70 24 70 47Q70 24 93 24Q114 24 114 45Q114 69 70 102Q26 69 26 45Z M70 102V119"/>',
    '<path d="M31 34H109V109H31Z M47 49H93V61H47Z M47 72H61M70 72H93M47 86H93M47 99H77"/>',
    '<path d="M28 46H112V99H28Z M42 46V26H98V46M42 99V117M98 99V117M42 63H98M42 81H83"/>',
    '<path d="M70 20 88 48 112 55 88 64 70 94 52 64 28 55 52 48Z M70 94V119"/>',
    '<path d="M24 46Q24 24 46 24H94Q116 24 116 46V87Q116 109 94 109H46Q24 109 24 87Z M44 43H76M44 58H93M44 73H85M44 88H76"/>',
    '<path d="M29 38H111V105H29Z M44 52H96M44 66H84M44 80H96M44 94H74"/>',
    '<path d="M70 18 108 39V80L70 103 32 80V39Z M70 18V59M32 39 70 59 108 39M70 59V103"/>',
    '<path d="M25 45Q25 22 48 22H92Q115 22 115 45V81Q115 104 92 104H75L60 120V104H48Q25 104 25 81Z M44 51H45M69 51H70M94 51H95"/>',
    '<path d="M34 30H106V110H34Z M48 45H92M48 60H92M48 75H92M48 90H78"/>',
    '<path d="M70 21 85 47 114 51 93 72 98 102 70 87 42 102 47 72 26 51 55 47Z M56 113H84"/>',
    '<path d="M24 43Q24 25 42 25H78Q96 25 96 43V73Q96 91 78 91H58L41 109V91H42Q24 91 24 73Z M105 36 123 54 105 72"/>',
    '<path d="M32 33H108V108H32Z M44 47H96M44 61H96M44 75H84M44 89H96"/>'
];
const CHAT_WALLPAPER_ALL_MOTIFS = CHAT_WALLPAPER_MOTIFS.concat(CHAT_WALLPAPER_EXTRA_MOTIFS);

const CHAT_WALLPAPER_DARK_PALETTE = ["#a5b4fc","#67e8f9","#c4b5fd","#93c5fd","#f0abfc","#fde68a","#6ee7b7","#7dd3fc","#fca5a5","#d9f99d","#fdba74","#f9a8d4","#86efac","#a7f3d0","#c7d2fe","#fda4af","#fcd34d","#bef264","#bae6fd","#e9d5ff"];
const CHAT_WALLPAPER_LIGHT_PALETTE = ["#475569","#0f766e","#6d28d9","#1d4ed8","#9d174d","#92400e","#047857","#334155","#b91c1c","#6b21a8","#0369a1","#a16207","#166534","#9f1239","#4338ca","#0e7490","#4d7c0f","#be123c","#7e22ce","#2563eb"];
function wallpaperSeed(value) {
    let hash = 2166136261;
    for (const char of String(value || "worth-it")) { hash ^= char.charCodeAt(0); hash = Math.imul(hash, 16777619); }
    return hash >>> 0 || 0x6d2b79f5;
}
function wallpaperRandom(seed) {
    let state = seed >>> 0;
    return function () {
        state += 0x6D2B79F5;
        let t = state;
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}
const CHAT_WALLPAPER_GEOMETRIES = [
    '<circle cx="0" cy="0" r="3.2"/>',
    '<rect x="-3.2" y="-3.2" width="6.4" height="6.4" rx="1"/>',
    '<path d="M0 -4L3.5 0L0 4L-3.5 0Z"/>',
    '<path d="M0 -4L3.5 3H-3.5Z"/>',
    '<path d="M-3.5 0H3.5M0 -3.5V3.5"/>',
    '<rect x="-4.5" y="-2.5" width="9" height="5" rx="1"/>',
    '<path d="M-4 -2.5 0 -4.5 4 -2.5V2.5L0 4.5-4 2.5Z M0 -4.5V4.5"/>',
    '<path d="M-4 -2.5H4V2.5H-4Z M-1.5 -2.5V2.5M1.5 -2.5V2.5"/>',
    '<path d="M-4 -3H4L2.5 3H-2.5Z"/>',
    '<path d="M-4 -1.5 0 -4 4 -1.5 0 4Z"/>',
    '<circle cx="0" cy="0" r="4"/><circle cx="0" cy="0" r="1.5"/>',
    '<path d="M-4 -3H4V3H-4Z M-4 0H4M0 -3V3"/>',
    '<path d="M-3.5 -3.5H3.5V3.5H-3.5Z M-3.5 -3.5 3.5 3.5M3.5 -3.5-3.5 3.5"/>',
    '<path d="M0 -4.5 4 3.5H-4Z M0 -1.5V1M0 2.5V2.6"/>',
    '<path d="M-4 -2H4M-4 0H4M-4 2H4"/>',
    '<path d="M-3 -3H3V3H-3Z M-5 0H5M0 -5V5"/>',
    '<path d="M-4 0Q-2 -4 0 0T4 0"/>',
    '<path d="M-4 -2 0 -4 4 -2 4 2 0 4-4 2Z"/>'
];
function pickWallpaperIndex(length, excludedIndices, random) {
    const excluded = new Set(excludedIndices || []);
    const choices = [];
    for (let i = 0; i < length; i++) if (!excluded.has(i)) choices.push(i);
    if (!choices.length) return 0;
    const next = typeof random === "function" ? random() : Math.random();
    return choices[Math.floor(next * choices.length)];
}
function makeConversationWallpaper(contextValue, theme) {
    const key = String(contextValue?.conversationType || "chat") + ":" + String(contextValue?.conversationId || GLOBAL_CHAT_ID);
    const random = wallpaperRandom(wallpaperSeed(key));
    const palette = theme === "light" ? CHAT_WALLPAPER_LIGHT_PALETTE : CHAT_WALLPAPER_DARK_PALETTE;
    const opacity = theme === "light" ? ".32" : ".28";
    const geometryOpacity = theme === "light" ? ".38" : ".35";
    const cells = [];
    const motifGrid = [];
    const colorGrid = [];
    const geometryGrid = [];
    const geometryColorGrid = [];
    const columns = 10, rows = 15, cellSize = 84;

    // Use a large library and avoid reusing the same motif within a 5 × 3
    // neighbourhood. That makes repeated artwork much harder to notice even
    // in a tall, continuously repeating wallpaper tile.
    for (let i = 0; i < columns * rows; i++) {
        const row = Math.floor(i / columns), col = i % columns;
        const forbiddenMotifs = new Set();
        const forbiddenColors = new Set();
        for (let rowOffset = 0; rowOffset <= 2; rowOffset++) {
            for (let colOffset = -2; colOffset <= 2; colOffset++) {
                const nearRow = row - rowOffset;
                const nearCol = col + colOffset;
                if (nearRow < 0 || nearCol < 0 || nearCol >= columns) continue;
                if (rowOffset === 0 && nearCol >= col) continue;
                const nearIndex = nearRow * columns + nearCol;
                if (motifGrid[nearIndex] !== undefined) forbiddenMotifs.add(motifGrid[nearIndex]);
                if (rowOffset <= 1 && Math.abs(colOffset) <= 1 && colorGrid[nearIndex]) forbiddenColors.add(colorGrid[nearIndex]);
            }
        }
        const motifCandidates = CHAT_WALLPAPER_ALL_MOTIFS
            .map((_, index) => index)
            .filter(index => !forbiddenMotifs.has(index));
        const motifIndex = motifCandidates[Math.floor(random() * motifCandidates.length)];
        motifGrid.push(motifIndex);

        let colorCandidates = palette.map((_, index) => index).filter(index => !forbiddenColors.has(palette[index]));
        if (!colorCandidates.length) colorCandidates = palette.map((_, index) => index);
        const color = palette[colorCandidates[Math.floor(random() * colorCandidates.length)]];
        colorGrid.push(color);

        const angle = Math.floor(random() * 360);
        const scaleX = random() < .5 ? -.38 : .38;
        const scaleY = random() < .5 ? -.38 : .38;
        const x = col * cellSize + cellSize / 2;
        const y = row * cellSize + cellSize / 2;
        cells.push(
            '<g transform="translate(' + x + ' ' + y + ')" stroke="' + color + '" stroke-opacity="' + opacity + '">' +
            '<g transform="rotate(' + angle + ') scale(' + scaleX + ' ' + scaleY + ') translate(-70 -70)">' +
            CHAT_WALLPAPER_ALL_MOTIFS[motifIndex] + '</g></g>'
        );

        // Eight small geometric marks occupy the ring around each large doodle.
        // The tighter 84px grid keeps them between motifs with clear gaps.
        const geometryOffsets = [[0, -32], [32, 0], [0, 32], [-32, 0], [-28, -28], [28, -28], [-28, 28], [28, 28]];
        const localGeometryIndices = [];
        const localGeometryColors = [];
        for (let marker = 0; marker < geometryOffsets.length; marker++) {
            const forbiddenGeometry = new Set(localGeometryIndices);
            const forbiddenGeometryColors = new Set([color, ...localGeometryColors.slice(-3)]);
            if (col > 0) {
                const adjacent = geometryGrid[i - 1]?.[marker];
                if (Number.isInteger(adjacent)) forbiddenGeometry.add(adjacent);
                const adjacentColor = geometryColorGrid[i - 1]?.[marker];
                if (adjacentColor) forbiddenGeometryColors.add(adjacentColor);
            }
            if (row > 0) {
                const above = geometryGrid[i - columns]?.[marker];
                if (Number.isInteger(above)) forbiddenGeometry.add(above);
                const aboveColor = geometryColorGrid[i - columns]?.[marker];
                if (aboveColor) forbiddenGeometryColors.add(aboveColor);
            }
            const geometryIndex = pickWallpaperIndex(CHAT_WALLPAPER_GEOMETRIES.length, forbiddenGeometry, random);
            localGeometryIndices.push(geometryIndex);
            let geometryColorCandidates = palette.filter(value => !forbiddenGeometryColors.has(value));
            if (!geometryColorCandidates.length) geometryColorCandidates = palette.filter(value => value !== color);
            if (!geometryColorCandidates.length) geometryColorCandidates = palette;
            const geometryColor = geometryColorCandidates[Math.floor(random() * geometryColorCandidates.length)];
            localGeometryColors.push(geometryColor);
            const [dx, dy] = geometryOffsets[marker];
            const geometryAngle = Math.floor(random() * 360);
            const geometryScale = .98 + random() * .32;
            cells.push(
                '<g transform="translate(' + (x + dx) + ' ' + (y + dy) + ') rotate(' + geometryAngle + ') scale(' + geometryScale + ')" stroke="' + geometryColor +
                '" stroke-opacity="' + geometryOpacity + '" stroke-width="1.5">' + CHAT_WALLPAPER_GEOMETRIES[geometryIndex] + '</g>'
            );
        }
        geometryGrid.push(localGeometryIndices);
        geometryColorGrid.push(localGeometryColors);
    }
    return '<svg xmlns="http://www.w3.org/2000/svg" width="840" height="1260" viewBox="0 0 840 1260" fill="none" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round">' + cells.join("") + '</svg>';
}
function applyChatWallpaper(contextValue) {
    const surface = $("worthItChatMessages");
    if (!surface) return;
    const type = contextValue?.conversationType;
    if (!contextValue?.userId || !["global", "direct", "group"].includes(type)) {
        surface.style.removeProperty("--worthit-chat-wallpaper-image");
        surface.style.removeProperty("--worthit-chat-wallpaper-position");
        delete surface.dataset.worthitWallpaperKey;
        return;
    }
    const theme = document.documentElement.dataset.theme === "light" ? "light" : "dark";
    const key = type + ":" + String(contextValue.conversationId || GLOBAL_CHAT_ID) + ":" + theme;
    if (surface.dataset.worthitWallpaperKey === key) return;
    const random = wallpaperRandom(wallpaperSeed(type + ":" + String(contextValue.conversationId || GLOBAL_CHAT_ID)));
    const svg = makeConversationWallpaper(contextValue, theme);
    const encoded = 'url("data:image/svg+xml,' + encodeURIComponent(svg) + '")';
    surface.style.setProperty("--worthit-chat-wallpaper-image", encoded);
    surface.style.setProperty("--worthit-chat-wallpaper-position", Math.floor(random() * 140) + "px " + Math.floor(random() * 140) + "px");
    surface.dataset.worthitWallpaperKey = key;
}


function context() {
    return typeof window.getWorthItChatEnhancementContext === "function"
        ? window.getWorthItChatEnhancementContext() : null;
}
function rpc(name, args) {
    const client = $client();
    if (!client || typeof client.rpc !== "function") throw new Error("Sign in to use Worth It Chat.");
    return client.rpc(name, args);
}
function status(message, isError) {
    const node = $("worthItChatStatus");
    if (node) {
        node.textContent = message || "";
        node.classList.toggle("is-error", Boolean(message && isError));
    }
}
window.worthItChatPlayVoiceMessage = playPrivateVoiceMessage;

function updateEnhancementContext(next) {
    currentContext = next || context();
    const direct = Boolean(currentContext?.userId && currentContext?.conversationType === "direct"
        && currentContext?.isFriend && currentContext?.conversationId);
    ["worthItChatAudioCallBtn", "worthItChatVideoCallBtn"].forEach(id => {
        const button = $(id);
        if (button) button.hidden = !direct;
    });
    const searchButton = $("worthItChatMessageSearchBtn");
    if (searchButton) searchButton.hidden = !currentContext?.userId || !currentContext?.conversationType;
    const panel = $("worthItChatSearchPanel");
    if (panel && panel.dataset.conversationKey !== String(currentContext?.conversationId || GLOBAL_CHAT_ID)) {
        panel.dataset.conversationKey = String(currentContext?.conversationId || GLOBAL_CHAT_ID);
        clearSearchResults();
    }
    applyChatWallpaper(currentContext);
}
window.addEventListener("worthitchatcontextchange", event => updateEnhancementContext(event?.detail || context()));
const wallpaperThemeObserver = new MutationObserver(() => applyChatWallpaper(currentContext || context()));
wallpaperThemeObserver.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });

function clearSearchResults() {
    const list = $("worthItChatSearchResults");
    const statusNode = $("worthItChatSearchStatus");
    if (list) { list.replaceChildren(); list.hidden = true; }
    if (statusNode) { statusNode.textContent = ""; statusNode.hidden = true; }
    searchResults = [];
    searchSequence++;
}
function toggleSearch(open) {
    const panel = $("worthItChatSearchPanel");
    const button = $("worthItChatMessageSearchBtn");
    if (!panel) return;
    const show = typeof open === "boolean" ? open : panel.hidden;
    panel.hidden = !show;
    button?.setAttribute("aria-expanded", String(show));
    if (show) {
        const input = $("worthItChatMessageSearchInput");
        if (input) { input.value = ""; input.focus(); }
        clearSearchResults();
    } else clearSearchResults();
}
function renderSearchResults(rows, query) {
    const list = $("worthItChatSearchResults");
    const statusNode = $("worthItChatSearchStatus");
    if (!list || !statusNode) return;
    list.replaceChildren();
    searchResults = rows;
    statusNode.hidden = false;
    list.hidden = !rows.length;
    if (!rows.length) {
        statusNode.textContent = 'No messages begin with "' + query + '".';
        return;
    }
    statusNode.textContent = rows.length + (rows.length === 100 ? "+ matches" : rows.length === 1 ? " match" : " matches") + ' beginning with "' + query + '".';
    for (const message of rows) {
        const button = document.createElement("button");
        button.type = "button";
        button.className = "worth-it-chat-search-result";
        const title = document.createElement("span");
        title.className = "worth-it-chat-search-result-author";
        title.textContent = (message.display_name || message.username || "Worth It member") + " · " + new Date(message.created_at).toLocaleString();
        const body = document.createElement("span");
        body.className = "worth-it-chat-search-result-body";
        body.textContent = message.body || (message.media_type === "audio" ? "🎙 Voice message" : message.media_type ? "Shared " + message.media_type : "Message");
        button.append(title, body);
        button.addEventListener("click", () => {
            const ctx = context();
            if (!ctx || String(ctx.conversationId || GLOBAL_CHAT_ID) !== String(currentContext?.conversationId || GLOBAL_CHAT_ID)) return;
            if (typeof window.worthItChatShowSearchResult === "function") window.worthItChatShowSearchResult(message);
            toggleSearch(false);
        });
        list.appendChild(button);
    }
}
async function runMessageSearch() {
    const input = $("worthItChatMessageSearchInput");
    const statusNode = $("worthItChatSearchStatus");
    const list = $("worthItChatSearchResults");
    const query = String(input?.value || "").trim();
    if (!statusNode || !list) return;
    const request = ++searchSequence;
    const ctx = context();
    if (!ctx?.userId) { statusNode.hidden = false; statusNode.textContent = "Sign in to search messages."; list.hidden = true; return; }
    if (query.length < 2) {
        list.replaceChildren();
        list.hidden = true;
        statusNode.textContent = query ? "Type at least 2 characters to search this conversation." : "";
        statusNode.hidden = !query;
        return;
    }
    statusNode.hidden = false;
    statusNode.textContent = "Searching this conversation…";
    list.replaceChildren();
    list.hidden = true;
    try {
        const result = await rpc("search_worth_it_chat_messages", {
            p_conversation_id: ctx.conversationId || GLOBAL_CHAT_ID,
            p_query: query,
            p_limit: 100
        });
        if (request !== searchSequence) return;
        if (result.error) throw result.error;
        if (result.data && !Array.isArray(result.data) && result.data.success === false) {
            throw new Error(result.data.code || "Message search is unavailable.");
        }
        renderSearchResults(Array.isArray(result.data) ? result.data : [], query);
    } catch (error) {
        if (request !== searchSequence) return;
        list.hidden = true;
        statusNode.hidden = false;
        statusNode.textContent = error?.message || "Could not search this conversation.";
    }
}
function scheduleMessageSearch() {
    if (searchTimer) window.clearTimeout(searchTimer);
    searchTimer = window.setTimeout(() => { void runMessageSearch(); }, 260);
}

function parsePrivateAudioReference(marker) {
    const match = String(marker || "").match(/^worthit-audio:([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}):([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\/[A-Za-z0-9._-]+)$/i);
    return match ? { conversationId: match[1], path: match[2] } : null;
}
async function loadPrivateVoiceUrl(marker) {
    const ref = parsePrivateAudioReference(marker);
    if (!ref) throw new Error("This voice message reference is invalid.");
    const ctx = context();
    if (!ctx?.userId) throw new Error("Sign in again to play this voice message.");
    if (String(ctx.conversationId || GLOBAL_CHAT_ID) !== ref.conversationId) throw new Error("Open the conversation containing this voice message first.");
    const auth = await $client().auth.getSession();
    const token = auth?.data?.session?.access_token;
    if (!token || auth?.data?.session?.user?.id !== ctx.userId) throw new Error("Your session has expired. Sign in again.");
    const params = new URLSearchParams({ conversation_id: ref.conversationId, path: ref.path });
    const response = await fetch("/api/chat-audio?" + params.toString(), {
        headers: { Authorization: "Bearer " + token },
        credentials: "same-origin",
        cache: "no-store"
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok || !payload.url) throw new Error(payload.error || "Could not open this voice message.");
    return payload.url;
}
async function playPrivateVoiceMessage(button, audio, marker) {
    if (button.disabled) return;
    if (audio.src) {
        audio.hidden = false;
        try { await audio.play(); } catch (_) {}
        return;
    }
    button.disabled = true;
    button.textContent = "Loading voice message…";
    try {
        audio.src = await loadPrivateVoiceUrl(marker);
        audio.hidden = false;
        button.hidden = true;
        await audio.play().catch(() => {});
    } catch (error) {
        button.disabled = false;
        button.textContent = "▶ Try voice message again";
        status(error?.message || "Could not play this voice message.", true);
    }
}

async function getAuthToken() {
    const client = $client();
    if (!client) throw new Error("Sign in to use calls.");
    const result = await client.auth.getSession();
    const token = result?.data?.session?.access_token;
    const ctx = context();
    if (result?.error || !token || result?.data?.session?.user?.id !== ctx?.userId) {
        throw new Error("Your session has expired. Sign in again.");
    }
    return token;
}
function showCallOverlay(show) {
    const overlay = $("worthItChatCallOverlay");
    if (overlay) {
        overlay.hidden = !show;
        overlay.setAttribute("aria-hidden", String(!show));
    }
}
function setCallStatus(title, detail) {
    const titleNode = $("worthItChatCallTitle");
    const statusNode = $("worthItChatCallStatus");
    if (titleNode) titleNode.textContent = title || "Worth It Call";
    if (statusNode) statusNode.textContent = detail || "";
}
function setCallMode(type) {
    const overlay = $("worthItChatCallOverlay");
    overlay?.classList.toggle("is-video-call", type === "video");
    const remoteVideo = $("worthItChatRemoteVideo");
    const localVideo = $("worthItChatLocalVideo");
    // Only reveal video surfaces once an actual camera track exists.
    if (remoteVideo) remoteVideo.hidden = true;
    if (localVideo) localVideo.hidden = true;
    const toggleCamera = $("worthItChatCallCameraBtn");
    if (toggleCamera) toggleCamera.hidden = type !== "video";
}
function openCallWindow(title, detail, type) {
    // A new call must never be hidden by a stale close timer from the previous call.
    if (callOverlayCloseTimer) window.clearTimeout(callOverlayCloseTimer);
    callOverlayCloseTimer = null;
    setCallStatus(title, detail);
    setCallMode(type);
    showCallOverlay(true);
}
function showIncomingCall(call) {
    incomingCall = call;
    openCallWindow((call.caller_name || "Worth It friend") + " is calling", call.call_type === "video" ? "Incoming video call" : "Incoming voice call", call.call_type);
    $("worthItChatCallAcceptBtn").hidden = false;
    $("worthItChatCallRejectBtn").hidden = false;
    $("worthItChatCallEndBtn").hidden = true;
    $("worthItChatCallMuteBtn").hidden = true;
    $("worthItChatCallCameraBtn").hidden = true;
    $("worthItChatCallSpeakerBtn").hidden = true;
}
function setLiveCallControls(isIncoming) {
    $("worthItChatCallAcceptBtn").hidden = true;
    $("worthItChatCallRejectBtn").hidden = true;
    $("worthItChatCallEndBtn").hidden = false;
    $("worthItChatCallMuteBtn").hidden = false;
    $("worthItChatCallCameraBtn").hidden = activeCall?.type !== "video";
    $("worthItChatCallSpeakerBtn").hidden = false;
    setSpeakerBoostButtonState();
    if (!isIncoming) $("worthItChatCallMuteBtn").hidden = false;
}
function setSpeakerBoostButtonState() {
    const button = $("worthItChatCallSpeakerBtn");
    const label = $("worthItChatCallSpeakerLabel");
    if (button) {
        button.classList.toggle("is-boosted", speakerBoostEnabled);
        button.setAttribute("aria-pressed", String(speakerBoostEnabled));
        button.title = speakerBoostEnabled ? "Return to normal incoming volume" : "Boost the other person's sound";
    }
    if (label) label.textContent = speakerBoostEnabled ? "Normal volume" : "Boost volume";
}
function ensureRemoteAudioProcessor() {
    const AudioContextConstructor = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextConstructor) return false;
    try {
        if (!remoteAudioContext || remoteAudioContext.state === "closed") {
            remoteAudioContext = new AudioContextConstructor();
            remoteAudioGain = remoteAudioContext.createGain();
            remoteAudioGain.gain.value = speakerBoostEnabled ? 2 : 1;
            remoteAudioGain.connect(remoteAudioContext.destination);
            remoteAudioSource = null;
            remoteAudioSourceTrackKey = "";
        }
        if (remoteAudioContext.state === "suspended") void remoteAudioContext.resume().catch(() => {});
        return Boolean(remoteAudioGain);
    } catch (_) {
        return false;
    }
}
function routeRemoteCallAudio(stream) {
    const audioElement = $("worthItChatRemoteAudio");
    if (audioElement) audioElement.srcObject = stream || null;
    const tracks = (stream?.getAudioTracks?.() || []).filter(track => track.readyState !== "ended");
    if (!tracks.length) {
        if (audioElement) audioElement.muted = false;
        return false;
    }
    try {
        if (!ensureRemoteAudioProcessor()) {
            if (audioElement) audioElement.muted = false;
            return false;
        }
        const trackKey = tracks.map(track => track.id).sort().join("|");
        if (remoteAudioSource && trackKey !== remoteAudioSourceTrackKey) {
            try { remoteAudioSource.disconnect(); } catch (_) {}
            remoteAudioSource = null;
            remoteAudioSourceTrackKey = "";
        }
        if (!remoteAudioSource) {
            remoteAudioSource = remoteAudioContext.createMediaStreamSource(new MediaStream(tracks));
            remoteAudioSource.connect(remoteAudioGain);
            remoteAudioSourceTrackKey = trackKey;
        }
        if (audioElement) {
            audioElement.muted = true;
            audioElement.volume = 1;
            void audioElement.play().catch(() => {});
        }
        if (remoteAudioContext.state === "suspended") void remoteAudioContext.resume().catch(() => {});
        return true;
    } catch (error) {
        try { remoteAudioSource?.disconnect(); } catch (_) {}
        remoteAudioSource = null;
        remoteAudioSourceTrackKey = "";
        if (audioElement) {
            audioElement.muted = false;
            void audioElement.play().catch(() => {});
        }
        console.info("Worth It speaker boost is unavailable; using standard call audio.", error);
        return false;
    }
}
function resetRemoteAudioProcessor() {
    const audioContext = remoteAudioContext;
    try { remoteAudioSource?.disconnect(); } catch (_) {}
    try { remoteAudioGain?.disconnect(); } catch (_) {}
    remoteAudioSource = null;
    remoteAudioGain = null;
    remoteAudioSourceTrackKey = "";
    remoteAudioContext = null;
    speakerBoostEnabled = false;
    setSpeakerBoostButtonState();
    if (audioContext && audioContext.state !== "closed") void audioContext.close().catch(() => {});
}
function toggleSpeakerBoost() {
    if (!activeCall) return;
    if (!ensureRemoteAudioProcessor() || !remoteAudioGain) {
        status("Volume boost is not supported by this browser. Standard call audio will continue.", true);
        return;
    }
    speakerBoostEnabled = !speakerBoostEnabled;
    const ctx = remoteAudioContext;
    const targetGain = speakerBoostEnabled ? 2 : 1;
    try {
        if (typeof remoteAudioGain.gain.setTargetAtTime === "function") {
            remoteAudioGain.gain.setTargetAtTime(targetGain, ctx.currentTime, 0.08);
        } else {
            remoteAudioGain.gain.value = targetGain;
        }
        if (ctx.state === "suspended") void ctx.resume().catch(() => {});
        setSpeakerBoostButtonState();
        status(speakerBoostEnabled
            ? "Incoming call audio boosted. If the sound distorts, switch back to normal volume."
            : "Incoming call audio returned to normal volume.", false);
    } catch (_) {
        speakerBoostEnabled = false;
        setSpeakerBoostButtonState();
        status("Could not change the incoming audio volume.", true);
    }
}
function stopCallMedia() {
    if (callPollTimer) window.clearInterval(callPollTimer);
    callPollTimer = null;
    if (connectionRecoveryTimer) window.clearTimeout(connectionRecoveryTimer);
    connectionRecoveryTimer = null;
    callEverConnected = false;
    if (callPeer) {
        try {
            callPeer.onicecandidate = null;
            callPeer.ontrack = null;
            callPeer.onconnectionstatechange = null;
            callPeer.close();
        } catch (_) {}
    }
    callPeer = null;
    for (const stream of [localStream, remoteStream]) {
        try { stream?.getTracks?.().forEach(track => track.stop()); } catch (_) {}
    }
    localStream = null;
    remoteStream = null;
    queuedCandidates = [];
    remoteCandidatesPending = [];
    answerApplied = false;
    lastRemoteSignalId = 0;
    audioMuted = false;
    cameraDisabled = false;
    resetRemoteAudioProcessor();
    const remoteVideo = $("worthItChatRemoteVideo");
    const localVideo = $("worthItChatLocalVideo");
    const remoteAudio = $("worthItChatRemoteAudio");
    if (remoteVideo) { remoteVideo.srcObject = null; remoteVideo.hidden = true; }
    if (localVideo) { localVideo.srcObject = null; localVideo.hidden = true; }
    if (remoteAudio) { remoteAudio.srcObject = null; remoteAudio.muted = false; remoteAudio.volume = 1; }
    const mute = $("worthItChatCallMuteBtn");
    if (mute) {
        mute.classList.remove("is-muted");
        const label = $("worthItChatCallMuteLabel");
        if (label) label.textContent = "Mute";
        mute.setAttribute("aria-pressed", "false");
    }
    const camera = $("worthItChatCallCameraBtn");
    if (camera) { camera.textContent = "📷 Camera off"; camera.setAttribute("aria-pressed", "false"); }
}
function endLocalCall(message) {
    stopCallMedia();
    activeCall = null;
    incomingCall = null;
    setCallStatus("Call ended", message || "");
    setLiveCallControls(false);
    $("worthItChatCallAcceptBtn").hidden = true;
    $("worthItChatCallRejectBtn").hidden = true;
    $("worthItChatCallEndBtn").hidden = true;
    $("worthItChatCallMuteBtn").hidden = true;
    $("worthItChatCallCameraBtn").hidden = true;
    $("worthItChatCallSpeakerBtn").hidden = true;
    if (callOverlayCloseTimer) window.clearTimeout(callOverlayCloseTimer);
    callOverlayCloseTimer = window.setTimeout(() => {
        callOverlayCloseTimer = null;
        showCallOverlay(false);
    }, 1800);
}
async function closeCallOnServer(action) {
    const callId = activeCall?.id || incomingCall?.id;
    if (!callId) return;
    try { await rpc("respond_worth_it_chat_call", { p_call_id: callId, p_action: action, p_answer: null }); }
    catch (_) {}
}
function bindPeerToStream(stream) {
    localStream = stream;
    const localVideo = $("worthItChatLocalVideo");
    const hasVideo = Boolean(stream?.getVideoTracks?.().some(track => track.readyState !== "ended"));
    if (localVideo && activeCall?.type === "video") {
        localVideo.srcObject = stream;
        localVideo.muted = true;
        localVideo.playsInline = true;
        localVideo.hidden = !hasVideo || cameraDisabled;
        if (hasVideo) void localVideo.play().catch(() => {});
    }
}
function makePeerConnection() {
    callPeer = new RTCPeerConnection(RTC_CONFIG);
    if (localStream) localStream.getTracks().forEach(track => callPeer.addTrack(track, localStream));
    if (activeCall?.type === "video" && !localStream?.getVideoTracks?.().length) {
        // Keep a video media section negotiated so a camera-enabled peer can still send video.
        callPeer.addTransceiver("video", { direction: "sendrecv" });
    }
    callPeer.onicecandidate = event => {
        if (!event.candidate) return;
        const candidate = event.candidate.toJSON ? event.candidate.toJSON() : event.candidate;
        if (!activeCall?.id) queuedCandidates.push(candidate);
        else void sendCallCandidate(candidate);
    };
    callPeer.ontrack = event => {
        remoteStream = event.streams?.[0] || remoteStream || new MediaStream();
        if (!event.streams?.[0] && !remoteStream.getTracks().some(track => track.id === event.track.id)) {
            remoteStream.addTrack(event.track);
        }
        const audioIsRouted = routeRemoteCallAudio(remoteStream);
        const audio = $("worthItChatRemoteAudio");
        if (audio) {
            audio.srcObject = remoteStream;
            audio.muted = audioIsRouted;
            void audio.play().catch(() => {});
        }
        if (activeCall?.type === "video") {
            const video = $("worthItChatRemoteVideo");
            const hasRemoteVideo = remoteStream.getVideoTracks().some(track => track.readyState !== "ended");
            if (video) {
                video.srcObject = remoteStream;
                video.muted = true;
                video.hidden = !hasRemoteVideo;
                video.playsInline = true;
                if (hasRemoteVideo) void video.play().catch(() => {});
            }
        }
        setCallStatus(activeCall?.peerName || "Connected", "Connected securely through your browser. Use End call to finish.");
    };
    callEverConnected = false;
    callPeer.onconnectionstatechange = () => {
        const peer = callPeer;
        if (!peer) return;
        const state = peer.connectionState;
        if (state === "connected") {
            callEverConnected = true;
            if (connectionRecoveryTimer) window.clearTimeout(connectionRecoveryTimer);
            connectionRecoveryTimer = null;
            setCallStatus(activeCall?.peerName || "Connected", activeCall?.type === "video" ? "Video call connected" : "Voice call connected");
            return;
        }
        if (state === "connecting" || state === "new") {
            if (connectionRecoveryTimer) window.clearTimeout(connectionRecoveryTimer);
            connectionRecoveryTimer = null;
            // Initial ICE gathering is not itself evidence of a dropped call.
            return;
        }
        if (state === "disconnected" || state === "failed") {
            if (connectionRecoveryTimer) window.clearTimeout(connectionRecoveryTimer);
            const wasConnected = callEverConnected;
            const failed = state === "failed";
            connectionRecoveryTimer = window.setTimeout(() => {
                connectionRecoveryTimer = null;
                if (callPeer !== peer || peer.connectionState !== state) return;
                if (wasConnected && state === "disconnected") {
                    setCallStatus(activeCall?.peerName || "Worth It Call", "Connection briefly interrupted. Still trying to restore the call…");
                } else if (failed || state === "failed") {
                    setCallStatus(activeCall?.peerName || "Worth It Call", "The direct media connection failed. End and retry the call; some networks require a TURN relay.");
                }
            }, failed ? 1800 : 4200);
        }
    };
}
async function sendCallCandidate(candidate) {
    if (!activeCall?.id) { queuedCandidates.push(candidate); return; }
    const result = await rpc("send_worth_it_chat_call_signal", {
        p_call_id: activeCall.id, p_signal_type: "candidate", p_payload: candidate
    });
    if (result.error || result.data?.success === false) {
        console.warn("Worth It call ICE candidate could not be sent.", result.error || result.data?.code);
    }
}
async function flushQueuedCandidates() {
    const candidates = queuedCandidates.splice(0);
    for (const candidate of candidates) await sendCallCandidate(candidate);
}
async function applyRemoteCandidates(signals) {
    for (const signal of signals || []) {
        const id = Number(signal.id);
        if (Number.isFinite(id)) lastRemoteSignalId = Math.max(lastRemoteSignalId, id);
        if (signal.signal_type !== "candidate" || !signal.payload) continue;
        if (!callPeer?.remoteDescription) remoteCandidatesPending.push(signal.payload);
        else {
            try { await callPeer.addIceCandidate(new RTCIceCandidate(signal.payload)); }
            catch (error) { console.warn("Worth It call candidate was ignored.", error); }
        }
    }
}
async function flushRemoteCandidates() {
    if (!callPeer?.remoteDescription || !remoteCandidatesPending.length) return;
    const candidates = remoteCandidatesPending.splice(0);
    for (const candidate of candidates) {
        try { await callPeer.addIceCandidate(new RTCIceCandidate(candidate)); }
        catch (error) { console.warn("Worth It queued ICE candidate was ignored.", error); }
    }
}
function startCallPolling() {
    if (callPollTimer) window.clearInterval(callPollTimer);
    callPollTimer = window.setInterval(() => { void pollCallState(); }, CALL_TICK_MS);
}
async function pollCallState() {
    if (!activeCall?.id) return;
    const call = activeCall;
    try {
        const result = await rpc("get_worth_it_chat_call_state", {
            p_call_id: call.id, p_after_signal_id: lastRemoteSignalId
        });
        if (result.error) throw result.error;
        const state = result.data;
        if (!state?.success) {
            endLocalCall(state?.code === "FRIENDS_ONLY" ? "Calls are available only while you are friends." : "This call is no longer available.");
            return;
        }
        if (call.role === "caller" && state.status === "accepted" && state.answer && !answerApplied) {
            await callPeer.setRemoteDescription(new RTCSessionDescription(state.answer));
            answerApplied = true;
            await flushRemoteCandidates();
            setCallStatus(call.peerName, "Connecting…");
        }
        await applyRemoteCandidates(state.signals);
        if (["rejected", "ended", "missed", "failed"].includes(state.status)) {
            endLocalCall(state.status === "rejected" ? "The call was declined." : state.status === "missed" ? "No answer." : "The call has ended.");
        }
    } catch (error) {
        console.warn("Worth It call polling failed.", error);
    }
}
async function acquireCallMedia(type) {
    if (type !== "video") {
        return { stream: await navigator.mediaDevices.getUserMedia({ audio: true, video: false }), cameraAvailable: false };
    }
    try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: true });
        return { stream, cameraAvailable: stream.getVideoTracks().length > 0 };
    } catch (cameraError) {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
        return { stream, cameraAvailable: false, cameraError };
    }
}
async function startCall(type) {
    const ctx = context();
    if (!ctx?.userId || ctx.conversationType !== "direct" || !ctx.isFriend || !ctx.conversationId) {
        status("Calls are available only in a private chat with an accepted friend.", true);
        return;
    }
    if (!navigator.mediaDevices?.getUserMedia || typeof RTCPeerConnection === "undefined") {
        status("This browser does not support voice/video calls. Try an up-to-date browser over HTTPS.", true);
        return;
    }
    if (activeCall || incomingCall) return;
    try {
        ensureRemoteAudioProcessor();
        const media = await acquireCallMedia(type);
        localStream = media.stream;
        activeCall = { id: null, role: "caller", type, conversationId: ctx.conversationId, peerName: ctx.title || "Worth It friend", cameraAvailable: media.cameraAvailable };
        bindPeerToStream(localStream);
        makePeerConnection();
        const offer = await callPeer.createOffer();
        await callPeer.setLocalDescription(offer);
        openCallWindow("Calling " + (ctx.title || "your friend") + "…",
            type === "video" ? (media.cameraAvailable ? "Starting video call…" : "Camera unavailable here; starting with audio. The other person can still enable their camera.") : "Starting voice call…",
            type);
        setLiveCallControls(false);
        const result = await rpc("start_worth_it_chat_call", {
            p_conversation_id: ctx.conversationId, p_call_type: type,
            p_offer: callPeer.localDescription.toJSON ? callPeer.localDescription.toJSON() : callPeer.localDescription
        });
        if (result.error) throw result.error;
        if (!result.data?.success || !result.data.call_id) {
            throw new Error(result.data?.code === "CALL_ALREADY_ACTIVE" ? "One of you is already in a call." :
                result.data?.code === "FRIENDS_ONLY" ? "Calls are available only while you are friends." :
                "Could not start this call.");
        }
        activeCall.id = result.data.call_id;
        setCallStatus("Calling " + (ctx.title || "your friend") + "…", "Waiting for them to answer.");
        await flushQueuedCandidates();
        startCallPolling();
    } catch (error) {
        if (activeCall?.id) await closeCallOnServer("end");
        stopCallMedia();
        activeCall = null;
        incomingCall = null;
        showCallOverlay(false);
        status(error?.message || "Could not start the call. Check microphone/camera permissions and try again.", true);
    }
}
async function acceptCall() {
    if (!incomingCall || activeCall) return;
    const call = incomingCall;
    const type = call.call_type;
    if (!navigator.mediaDevices?.getUserMedia || typeof RTCPeerConnection === "undefined") {
        setCallStatus("Calls are not supported", "Use an up-to-date browser with microphone/camera permissions over HTTPS.");
        return;
    }
    try {
        ensureRemoteAudioProcessor();
        const media = await acquireCallMedia(type);
        localStream = media.stream;
        activeCall = {
            id: call.id, role: "callee", type, conversationId: call.conversation_id,
            peerName: call.caller_name || "Worth It friend", cameraAvailable: media.cameraAvailable
        };
        incomingCall = null;
        bindPeerToStream(localStream);
        makePeerConnection();
        await callPeer.setRemoteDescription(new RTCSessionDescription(call.offer));
        await flushRemoteCandidates();
        const answer = await callPeer.createAnswer();
        await callPeer.setLocalDescription(answer);
        const accepted = await rpc("respond_worth_it_chat_call", {
            p_call_id: call.id, p_action: "accept",
            p_answer: callPeer.localDescription.toJSON ? callPeer.localDescription.toJSON() : callPeer.localDescription
        });
        if (accepted.error || !accepted.data?.success) throw accepted.error || new Error(accepted.data?.code || "Could not accept the call.");
        setLiveCallControls(true);
        setCallStatus(activeCall.peerName, type === "video" && !media.cameraAvailable
            ? "Camera unavailable here; the call will continue with audio. The other person can still enable their camera."
            : "Connecting…");
        await flushQueuedCandidates();
        startCallPolling();
    } catch (error) {
        await closeCallOnServer("reject");
        stopCallMedia();
        activeCall = null;
        incomingCall = null;
        setCallStatus("Could not join the call", error?.message || "Check browser permissions and try again.");
        $("worthItChatCallAcceptBtn").hidden = true;
        $("worthItChatCallRejectBtn").hidden = true;
        $("worthItChatCallEndBtn").hidden = false;
        $("worthItChatCallMuteBtn").hidden = true;
        $("worthItChatCallCameraBtn").hidden = true;
    }
}
async function rejectCall() {
    if (incomingCall?.id) {
        try { await rpc("respond_worth_it_chat_call", { p_call_id: incomingCall.id, p_action: "reject", p_answer: null }); }
        catch (_) {}
    }
    endLocalCall("You declined the call.");
}
async function endCall() {
    await closeCallOnServer("end");
    endLocalCall("Call ended.");
}
async function pollIncomingCall() {
    // The call alert stays active while the signed-in user browses any section of the site.
    if (document.hidden || incomingPollBusy || activeCall) return;
    const client = $client();
    if (!client?.auth?.getSession) return;
    incomingPollBusy = true;
    try {
        const sessionResult = await client.auth.getSession();
        const signedInUserId = sessionResult?.data?.session?.user?.id || context()?.userId || null;
        if (!signedInUserId) return;
        const result = await rpc("get_worth_it_incoming_chat_call", {});
        if (result.error || !result.data?.success) return;
        const call = result.data.call;
        if (!call) {
            if (incomingCall && !activeCall) {
                incomingCall = null;
                if (callOverlayCloseTimer) window.clearTimeout(callOverlayCloseTimer);
                callOverlayCloseTimer = null;
                showCallOverlay(false);
            }
            return;
        }
        if (String(call.caller_user_id) === String(signedInUserId)) return;
        if (incomingCall?.id === call.id || activeCall?.id === call.id) return;
        if (callOverlayCloseTimer) window.clearTimeout(callOverlayCloseTimer);
        callOverlayCloseTimer = null;
        showIncomingCall(call);
    } catch (error) {
        if (!window.__worthItCallSetupWarningShown) {
            window.__worthItCallSetupWarningShown = true;
            console.info("Worth It calls are temporarily unavailable.", error);
        }
    } finally {
        incomingPollBusy = false;
    }
}
function toggleMicrophone() {
    if (!localStream) return;
    audioMuted = !audioMuted;
    localStream.getAudioTracks().forEach(track => { track.enabled = !audioMuted; });
    const button = $("worthItChatCallMuteBtn");
    if (button) {
        button.classList.toggle("is-muted", audioMuted);
        const label = $("worthItChatCallMuteLabel");
        if (label) label.textContent = audioMuted ? "Unmute" : "Mute";
        button.setAttribute("aria-pressed", String(audioMuted));
        button.title = audioMuted ? "Unmute microphone" : "Mute microphone";
    }
}
async function toggleCamera() {
    if (!activeCall || activeCall.type !== "video" || !callPeer) return;
    let track = localStream?.getVideoTracks?.().find(item => item.readyState !== "ended") || null;
    if (!track) {
        try {
            const cameraStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
            track = cameraStream.getVideoTracks()[0] || null;
            if (!track) throw new Error("No camera track was returned.");
            if (!localStream) localStream = new MediaStream();
            localStream.addTrack(track);
            const transceiver = callPeer.getTransceivers?.().find(item => item.receiver?.track?.kind === "video" && !item.sender?.track);
            if (transceiver?.sender?.replaceTrack) {
                await transceiver.sender.replaceTrack(track);
                transceiver.direction = "sendrecv";
            } else {
                callPeer.addTrack(track, localStream);
            }
            cameraDisabled = false;
            bindPeerToStream(localStream);
        } catch (_) {
            const unavailable = $("worthItChatCallCameraBtn");
            if (unavailable) {
                unavailable.textContent = "📷 Camera unavailable";
                unavailable.setAttribute("aria-pressed", "false");
            }
            setCallStatus(activeCall.peerName || "Worth It Call", "Camera is unavailable or permission was denied. The call will continue with audio.");
            return;
        }
    } else {
        cameraDisabled = !cameraDisabled;
        track.enabled = !cameraDisabled;
    }
    const localVideo = $("worthItChatLocalVideo");
    if (localVideo) localVideo.hidden = cameraDisabled || !track;
    const button = $("worthItChatCallCameraBtn");
    if (button) {
        button.textContent = cameraDisabled ? "📷 Camera on" : "📷 Camera off";
        button.setAttribute("aria-pressed", String(cameraDisabled));
    }
}
function recordingExtension(mime) {
    const type = String(mime || "").split(";")[0].toLowerCase();
    return type === "audio/ogg" ? "ogg" : type === "audio/mp4" ? "m4a" :
        type === "audio/mpeg" ? "mp3" : type === "audio/wav" || type === "audio/x-wav" ? "wav" : "webm";
}
function setVoiceButtonRecording(recording) {
    const button = $("worthItChatVoiceBtn");
    if (!button) return;
    button.classList.toggle("is-recording", recording);
    button.setAttribute("aria-label", recording ? "Stop voice recording" : "Record a voice message");
    button.setAttribute("aria-pressed", String(recording));
    button.title = recording ? "Stop recording (maximum 2 minutes)" : "Record a voice message";
}
function isCurrentVoiceRecordingContext(recordedFor) {
    const current = context();
    return Boolean(recordedFor?.userId
        && recordedFor.userId === current?.userId
        && String(recordedFor.conversationId || GLOBAL_CHAT_ID) === String(current?.conversationId || GLOBAL_CHAT_ID)
        && recordedFor.conversationType === current?.conversationType);
}
async function startVoiceRecording() {
    const ctx = context();
    if (!ctx?.userId) { status("Sign in to send voice messages.", true); return; }
    if (!ctx?.conversationType) return;
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") {
        status("Voice recording is not supported by this browser.", true); return;
    }
    if (audioRecorder) { stopVoiceRecording(); return; }
    // Capture the target before asking for microphone access. Finishing a recording
    // must never attach it to whichever chat happened to be opened meanwhile.
    audioRecordingContext = {
        userId: ctx.userId,
        conversationId: ctx.conversationId || GLOBAL_CHAT_ID,
        conversationType: ctx.conversationType,
        isFriend: Boolean(ctx.isFriend),
        friendId: ctx.friendId || null,
        title: ctx.title || ""
    };
    try {
        audioRecorderStream = await navigator.mediaDevices.getUserMedia({ audio: true });
        const mime = ["audio/webm;codecs=opus","audio/ogg;codecs=opus","audio/mp4","audio/webm","audio/ogg"]
            .find(type => MediaRecorder.isTypeSupported?.(type));
        audioRecorder = mime ? new MediaRecorder(audioRecorderStream, { mimeType: mime }) : new MediaRecorder(audioRecorderStream);
        audioChunks = [];
        audioRecorder.ondataavailable = event => { if (event.data?.size) audioChunks.push(event.data); };
        audioRecorder.onerror = () => {
            // Cleanup clears audioRecordingContext, so retain it before cleanup
            // and only show the error in the conversation that started recording.
            const failedFor = audioRecordingContext ? { ...audioRecordingContext } : null;
            stopVoiceRecordingResources();
            if (isCurrentVoiceRecordingContext(failedFor)) {
                status("Voice recording stopped because the browser reported an error.", true);
            }
        };
        audioRecorder.onstop = () => {
            const recorder = audioRecorder;
            const recordedFor = audioRecordingContext ? { ...audioRecordingContext } : null;
            const blob = new Blob(audioChunks, { type: recorder?.mimeType || mime || "audio/webm" });
            stopVoiceRecordingResources();
            if (!blob.size) {
                if (isCurrentVoiceRecordingContext(recordedFor)) status("The recording was empty. Please try again.", true);
                return;
            }
            if (blob.size > 10 * 1024 * 1024) {
                if (isCurrentVoiceRecordingContext(recordedFor)) status("Voice messages must be 10 MB or smaller.", true);
                return;
            }
            const file = new File([blob], "voice-message-" + Date.now() + "." + recordingExtension(blob.type), { type: blob.type });
            if (typeof window.worthItChatAttachRecordedAudio === "function") {
                window.worthItChatAttachRecordedAudio(file, recordedFor);
                if (isCurrentVoiceRecordingContext(recordedFor)) {
                    status("Voice message ready. Preview it, then press Send to share it.", false);
                }
            }
        };
        audioRecorder.start(1000);
        audioRecordingStartedAt = Date.now();
        setVoiceButtonRecording(true);
        status("Recording voice message… Tap the microphone again to stop (max 2 minutes).", false);
        audioLimitTimer = window.setTimeout(() => stopVoiceRecording(), 120000);
    } catch (error) {
        const failedFor = audioRecordingContext ? { ...audioRecordingContext } : null;
        stopVoiceRecordingResources();
        if (isCurrentVoiceRecordingContext(failedFor)) {
            status(error?.name === "NotAllowedError" ? "Allow microphone access in your browser to record a voice message." :
                "Could not start recording. Check microphone permissions and try again.", true);
        }
    }
}
function stopVoiceRecording() {
    if (audioLimitTimer) window.clearTimeout(audioLimitTimer);
    audioLimitTimer = null;
    if (audioRecorder && audioRecorder.state !== "inactive") {
        try { audioRecorder.stop(); } catch (_) { stopVoiceRecordingResources(); }
    } else stopVoiceRecordingResources();
}
function stopVoiceRecordingResources() {
    setVoiceButtonRecording(false);
    try { audioRecorderStream?.getTracks?.().forEach(track => track.stop()); } catch (_) {}
    audioRecorderStream = null;
    audioRecorder = null;
    audioRecordingContext = null;
    audioChunks = [];
    audioRecordingStartedAt = 0;
    if (audioLimitTimer) window.clearTimeout(audioLimitTimer);
    audioLimitTimer = null;
    if (audioRecordStatusTimer) window.clearInterval(audioRecordStatusTimer);
    audioRecordStatusTimer = null;
}
function setupSwipeReply() {
    const host = $("worthItChatMessages");
    if (!host) return;
    let start = null;
    host.addEventListener("pointerdown", event => {
        if (event.pointerType === "mouse" || event.button !== 0) { start = null; return; }
        const row = event.target.closest?.(".worth-it-chat-message[data-message-id]");
        if (!row || event.target.closest("button,a,input,textarea,audio,video")) { start = null; return; }
        start = { x: event.clientX, y: event.clientY, id: row.dataset.messageId, row, moved: false };
    }, { passive: true });
    host.addEventListener("pointermove", event => {
        if (!start || event.pointerType === "mouse") return;
        const dx = event.clientX - start.x;
        const dy = event.clientY - start.y;
        if (Math.abs(dx) > 8 && Math.abs(dx) > Math.abs(dy) * 1.25) {
            start.moved = true;
            start.row.style.setProperty("--worth-it-chat-swipe-x", Math.max(-72, Math.min(72, dx)) + "px");
            start.row.classList.add("is-swipe-tracking");
        }
    }, { passive: true });
    const finish = event => {
        if (!start) return;
        const dx = event.clientX - start.x;
        const dy = event.clientY - start.y;
        const message = start.moved && Math.abs(dx) >= 72 && Math.abs(dx) > Math.abs(dy) * 1.35
            ? start.id : "";
        start.row.style.removeProperty("--worth-it-chat-swipe-x");
        start.row.classList.remove("is-swipe-tracking");
        start = null;
        if (message && typeof window.worthItChatQuoteById === "function") {
            window.worthItChatQuoteById(message);
            const input = $("worthItChatInput");
            input?.focus({ preventScroll: true });
        }
    };
    host.addEventListener("pointerup", finish, { passive: true });
    host.addEventListener("pointercancel", event => {
        if (start?.row) {
            start.row.style.removeProperty("--worth-it-chat-swipe-x");
            start.row.classList.remove("is-swipe-tracking");
        }
        start = null;
    }, { passive: true });
}
function setupAudioSearchAndCalls() {
    $("worthItChatMessageSearchBtn")?.addEventListener("click", () => toggleSearch());
    $("worthItChatSearchCloseBtn")?.addEventListener("click", () => toggleSearch(false));
    $("worthItChatMessageSearchInput")?.addEventListener("input", scheduleMessageSearch);
    $("worthItChatMessageSearchForm")?.addEventListener("submit", event => { event.preventDefault(); if (searchTimer) window.clearTimeout(searchTimer); void runMessageSearch(); });
    $("worthItChatAudioCallBtn")?.addEventListener("click", () => void startCall("audio"));
    $("worthItChatVideoCallBtn")?.addEventListener("click", () => void startCall("video"));
    $("worthItChatCallAcceptBtn")?.addEventListener("click", () => void acceptCall());
    $("worthItChatCallRejectBtn")?.addEventListener("click", () => void rejectCall());
    $("worthItChatCallEndBtn")?.addEventListener("click", () => void endCall());
    $("worthItChatCallMuteBtn")?.addEventListener("click", toggleMicrophone);
    $("worthItChatCallCameraBtn")?.addEventListener("click", toggleCamera);
    $("worthItChatCallSpeakerBtn")?.addEventListener("click", toggleSpeakerBoost);
    $("worthItChatVoiceBtn")?.addEventListener("click", () => void startVoiceRecording());
    $("worthItChatVoiceCancelBtn")?.addEventListener("click", () => stopVoiceRecording());
    document.addEventListener("visibilitychange", () => {
        if (!document.hidden) void pollIncomingCall();
    });
    updateEnhancementContext();
    setupSwipeReply();
    if (incomingPollTimer) window.clearInterval(incomingPollTimer);
    void pollIncomingCall();
    incomingPollTimer = window.setInterval(() => { void pollIncomingCall(); }, INCOMING_TICK_MS);
}
if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", setupAudioSearchAndCalls, { once: true });
else setupAudioSearchAndCalls();
})();
