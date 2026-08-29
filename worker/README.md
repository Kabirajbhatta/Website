# Meeting notification Worker

This Cloudflare Worker receives validated meeting requests at `https://bhattakabiraj.com.np/api/meetings` and sends an approved WhatsApp template through Meta's WhatsApp Cloud API. The browser never receives the Meta access token or phone-number ID.

The frontend is ready, but automatic WhatsApp delivery will not work until the Meta WhatsApp Business account, approved template and Cloudflare secrets below are configured. No credentials are included in this repository.

## 1. Configure Meta WhatsApp Business

1. In Meta for Developers, create or select a Business app and add the **WhatsApp** product.
2. Connect a WhatsApp Business sending number and note its **Phone Number ID**.
3. Add `61425192976` as an allowed test recipient while the app is in development. Complete Meta business verification before production if Meta requires it for the account.
4. Create a WhatsApp message template in WhatsApp Manager with:
   - Name: `new_meeting_request`
   - Language: English (US), code `en_US`
   - Category: Utility
   - Body:

```text
New Meeting Request
Name: {{1}}
Email: {{2}}
Phone: {{3}}
Date: {{4}}
Time: {{5}}
Meeting Type: {{6}}
Message: {{7}}

Submitted from bhattakabiraj.com.np
```

Wait for Meta to approve the template. If Meta assigns a different template name or language, update `WHATSAPP_TEMPLATE_NAME` or `WHATSAPP_TEMPLATE_LANGUAGE` in `wrangler.jsonc` to match exactly.

5. Create a Meta system-user access token with the `whatsapp_business_messaging` permission. Use a production token suitable for the account rather than the temporary Getting Started token.
6. Confirm `WHATSAPP_API_VERSION` in `wrangler.jsonc` is a Graph API version supported by the Meta app before deploying.

## 2. Configure Cloudflare

The `bhattakabiraj.com.np` zone must use Cloudflare DNS so the Worker route can intercept `/api/meetings` while GitHub Pages continues serving the rest of the site.

From this `worker` directory:

```sh
npm install
npx wrangler login
npx wrangler secret put WHATSAPP_ACCESS_TOKEN
npx wrangler secret put WHATSAPP_PHONE_NUMBER_ID
npm test
npm run check
npm run deploy
```

Enter the real values only when Wrangler prompts. Never place either value in `wrangler.jsonc`, `.dev.vars.example`, frontend JavaScript, a commit, pull request or GitHub secret scan exception.

After deployment, verify in Cloudflare that the route is exactly:

```text
bhattakabiraj.com.np/api/meetings
```

The committed non-secret settings already specify:

- recipient: `61425192976`
- allowed browser origin: `https://bhattakabiraj.com.np`
- timezone: `Australia/Sydney`
- template name/language: `new_meeting_request` / `en_US`
- rate limit: 3 validated requests per email address per minute per Cloudflare location

## 3. Local development

Copy `.dev.vars.example` to `.dev.vars`, add development-only credentials, and keep that file uncommitted. Run `npm run dev` to start the Worker locally.

The Worker checks the exact origin, streams and caps request bodies, validates every field again server-side, blocks past Sydney dates/times, uses a honeypot, applies Cloudflare's rate-limiting binding, avoids logging personal details and waits for Meta to accept the notification before returning a success confirmation.

The existing Formspree contact form is separate and is not changed by this Worker.
