# Configure TURN for Worth It voice and video calls

The current WebRTC implementation uses peer-to-peer signaling. STUN can discover a direct route, but a TURN server relays media when direct connectivity is blocked by a NAT or firewall.

## Create a Cloudflare TURN key

1. Open the [Cloudflare Realtime TURN dashboard](https://dash.cloudflare.com/?to=/:account/calls) for the account running Worth It.
2. Create a TURN key named **Worth It Chat Calls**.
3. Add the key's **UID** to Cloudflare Pages as `CLOUDFLARE_TURN_KEY_ID`.
4. Add the key's secret **key/token** as the secret variable `CLOUDFLARE_TURN_KEY_API_TOKEN`.
5. Set both variables in the **Production** environment and any **Preview** environment where you test calls, then redeploy Pages.

Do not put the long-lived TURN token in `index.html`, JavaScript or Git. The authenticated `/api/chat-call-ice` endpoint verifies the current Supabase session and confirms the requested conversation is a current, friends-only direct chat before it requests temporary TURN credentials with a 24-hour TTL. It filters blocked port-53 URLs and returns only those short-lived credentials to the browser.

If these two TURN variables are absent or the credentials service is unavailable, the site falls back to STUN-only direct connections. Calls can still fail on restrictive networks until TURN is configured.

## Cost

Cloudflare's Realtime TURN documentation currently lists standalone TURN at **$0.05 per real-time GB outbound**; the separate free-of-charge note applies when TURN is used together with the Realtime SFU. Check current terms and usage before enabling it. See the [official TURN credentials guide](https://developers.cloudflare.com/realtime/turn/generate-credentials/) and [TURN service pricing/details](https://developers.cloudflare.com/realtime/turn/).
