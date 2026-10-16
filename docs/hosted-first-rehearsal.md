# First hosted rehearsal (zero-spend, real audience)

The live rehearsal URL is **https://our-jam-rehearsal.onrender.com**. This is the dedicated free Render service against Our Jam's isolated Neon rehearsal branch, **not the production database**. The October 16 deployment passed public health/readiness, startup private S3 object PUT/HEAD/GET/DELETE and secure cleanup. Real person-owned songs and separate physical phones have not been accepted yet.

## Start with the performer

1. Open the Render dashboard for the dedicated `our-jam-rehearsal` service. In its **Environment** settings, securely retrieve the existing `OPERATOR_TOKEN` or set a new strong random value **in Render**, not in GitHub, source, email, or chat. A new value requires a redeploy. Keep the credential in a password manager. Do not confuse it with an AI provider key or database password.
2. Visit **https://our-jam-rehearsal.onrender.com/performer**, enter the performer credential and sign in. The 12-hour HttpOnly session remains in your browser; don't share the browser/session with fans.
3. Read **Rehearsal readiness**. Database must show connected and private media must show read/write verified. The diagnostic verifies storage connectivity only; it does not certify anyone's source file, venue or generator.
4. Create your event with an original event code, your own song titles and private core prompts, and the actual playlist. Do not create a demo from supplied sample artist material.
5. On the event console, choose **Upload album audio**, select each unplayed track and upload your own MP3 or WAV. The server validates full decoding and writes a 192-kbps private playback derivative. **Keep your masters backed up**; the original upload is not retained. Uploading does not send it to a music generator.
6. Verify a private song plays back in the performer browser before inviting guests. Keep the independent local album player and audio recorder available.

## Test the real participation path

1. Open **Open crowd display** in its actual browser window, drag it onto the external monitor and make it full screen. It is the same `/screen/:slug` route the audience sees.
2. Use **Audience view** to locate the actual event URL/QR. Connect an actual iPhone and an actual Android phone to their normal networks and open the `https://.../event/:slug` link in each browser. **No native installation or Apple/Google account is required for this web rehearsal.** A Simulator build is not a physical native release.
3. Open the first round from the performer console. For a short rehearsal set minimum participation time to 0, otherwise let the configured time elapse.
4. Join each phone as a different listener, submit a real Sound Wave, reallocate up to five points and verify the same authoritative contribution appears in the public screen. Test a late join and reconnect after losing internet.
5. Close the round. With the current hard **$0 generation allowance**, contributions and voting work, but the job must record `approved_budget_zero` without contacting Mureka or Stable Audio. It must **not** show fake generated music or an imaginary provider credit failure.
6. Restart the rehearsal server only during an inactive test, then verify the event and accepted votes persist. Check that MP3 playback remains private to the performer and that a guest cannot use the operator audio route.
7. Test the actual speakers, headphones/cue isolation and intended microphone tier. Browser or Simulator tests cannot certify a particular venue's audio hardware. Rehearse fallback to locally cached music if connectivity drops.

## Evidence and release boundaries

Record which physical device/browser versions, upload files, audio outputs and crowd size were actually exercised, together with failures and recovery notes. **Do not claim milestone B complete until the real owner-file upload/redirect/playback, two independent physical phones, stage output and outage/reconnect evidence pass.** Perform no paid generation, sender email or store release without separately validated account entitlements, rights and a budget. The human independent security audit can follow after technical work and test deployment, while applicable code/security checks continue throughout development.

Operational details: [deployment](deployment.md), [media ingest](album-uploads.md), [show readiness](09-first-show-readiness.md), [progress](../PROGRESS.md).
