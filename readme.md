# Crop Guardian Backend, API Testing Guide

This document was written by reading the actual source code in `kameyaw14/crop-disease-backend` (commit `b9cc592`, verified 2026-08-07), not from assumptions. Every route, validation rule, and error case below was traced directly from `routes/`, `controllers/`, `services/`, `schema/`, and `prisma/schema.prisma`. This is an update of the previous version of this document (which was based on commit `23c3f8b`). Where the code disagreed with the old doc, the code wins, every change is called out inline below. If the backend changes again, this doc needs to be re-verified against the new code.

Give this whole file to your frontend developer. It is written so they can build the API client and Postman collection without needing to read the backend source themselves.

---

## Table of Contents

- [0. What Changed Since the Last Version of This Doc](#0-what-changed-since-the-last-version-of-this-doc)
- [1. Quick Start](#1-quick-start)
- [2. Standard Response Shape](#2-standard-response-shape)
- [3. Important Behavior Notes (read this before testing)](#3-important-behavior-notes-read-this-before-testing)
- [4. Enum Reference](#4-enum-reference)
- [5. Endpoints](#5-endpoints)
  - [5.1 Auth](#51-auth)
    - [`POST /api/auth/register`](#post-apiauthregister)
    - [`POST /api/auth/login`](#post-apiauthlogin)
    - [`GET /api/auth/me`](#get-apiauthme)
    - [`PUT /api/auth/language`](#put-apiauthlanguage)
    - [`POST /api/auth/forgot-password`](#post-apiauthforgot-password-new)
    - [`POST /api/auth/verify-reset-otp`](#post-apiauthverify-reset-otp-new)
    - [`POST /api/auth/reset-password`](#post-apiauthreset-password-new)
    - [`PUT /api/auth/profile`](#put-apiauthprofile-new)
    - [`PUT /api/auth/avatar`](#put-apiauthavatar-new)
  - [5.2 Crops (My Crops tracking)](#52-crops-my-crops-tracking)
    - [`GET /api/crops/my-crops`](#get-apicropsmy-crops)
    - [`POST /api/crops/my-crops`](#post-apicropsmy-crops)
    - [`PATCH /api/crops/my-crops/:cropType`](#patch-apicropsmy-cropscroptype)
    - [`DELETE /api/crops/my-crops/:cropType`](#delete-apicropsmy-cropscroptype)
    - [`GET /api/crops/my-crops/:cropType/history`](#get-apicropsmy-cropscroptypehistory)
  - [5.3 Community (new)](#53-community-new)
    - [`GET /api/community/tags`](#get-apicommunitytags)
    - [`POST /api/community/posts`](#post-apicommunityposts)
    - [`GET /api/community/posts`](#get-apicommunityposts)
    - [`GET /api/community/posts/:postId`](#get-apicommunitypostspostid)
    - [`GET /api/community/users/me/posts`](#get-apicommunityusersmeposts)
    - [`DELETE /api/community/posts/:postId`](#delete-apicommunitypostspostid)
    - [`POST /api/community/posts/:postId/comments`](#post-apicommunitypostspostidcomments)
    - [`POST /api/community/comments/:commentId/replies`](#post-apicommunitycommentscommentidreplies)
    - [`GET /api/community/posts/:postId/comments`](#get-apicommunitypostspostidcomments)
    - [`DELETE /api/community/comments/:commentId`](#delete-apicommunitycommentscommentid)
    - [`POST /api/community/comments/:commentId/helpful`](#post-apicommunitycommentscommentidhelpful)
    - [`DELETE /api/community/comments/:commentId/helpful`](#delete-apicommunitycommentscommentidhelpful)
    - [`POST /api/community/comments/:commentId/solved`](#post-apicommunitycommentscommentidsolved)
    - [`DELETE /api/community/comments/:commentId/solved`](#delete-apicommunitycommentscommentidsolved)
    - [`POST /api/community/posts/:postId/like`](#post-apicommunitypostspostidlike)
    - [`DELETE /api/community/posts/:postId/like`](#delete-apicommunitypostspostidlike)
    - [`GET /api/community/posts/:postId/likes`](#get-apicommunitypostspostidlikes)
    - [`POST /api/community/posts/:postId/save`](#post-apicommunitypostspostidsave)
    - [`DELETE /api/community/posts/:postId/save`](#delete-apicommunitypostspostidsave)
    - [`GET /api/community/saved`](#get-apicommunitysaved)
  - [5.4 Daily Tips (new)](#54-daily-tips-new)
    - [`GET /api/tips/today`](#get-apitipstoday)
  - [5.5 Disease Detection](#55-disease-detection)
    - [`POST /api/detect`](#post-apidetect)
  - [5.6 Weather](#56-weather)
    - [`GET /api/weather/forecast`](#get-apiweatherforecast)
  - [5.7 Notifications](#57-notifications)
    - [`GET /api/notifications`](#get-apinotifications)
    - [`PATCH /api/notifications/:id/read`](#patch-apinotificationsidread)
    - [`POST /api/notifications/trigger`](#post-apinotificationstrigger)
    - [`PUT /api/notifications/push-token`](#put-apinotificationspush-token)
    - [`DELETE /api/notifications/push-token`](#delete-apinotificationspush-token)
    - [`DELETE /api/notifications/clear-all`](#delete-apinotificationsclear-all-new)
  - [5.8 Text to Speech (Twi)](#58-text-to-speech-twi)
    - [`POST /api/tts/generate`](#post-apittsgenerate)
  - [5.9 Health Check](#59-health-check)
    - [`GET /`](#get-)
- [6. Endpoint Quick Reference](#6-endpoint-quick-reference)
- [7. Suggested Postman Setup](#7-suggested-postman-setup)
- [8. Things to Confirm With the Backend Dev Before You Build Against This](#8-things-to-confirm-with-the-backend-dev-before-you-build-against-this)

---

## 0. What Changed Since the Last Version of This Doc

If you already built against the previous README, read this section first.

1. **Three new auth endpoints for password reset**, all phone-number based (not email based): `POST /api/auth/forgot-password`, `POST /api/auth/verify-reset-otp`, `POST /api/auth/reset-password`. Full 3-step OTP flow, see section 5.1.
2. **Registration now also rejects a duplicate phone number**, not just a duplicate email, since `phoneNumber` is now a unique column on the `User` table.
3. **The register success response now includes `phoneNumber` and `isEmailVerified`** in the returned `user` object, in addition to `id`, `email`, and `role`.
4. **The login response no longer leaks the password hash.** This is a security fix from the previous version of this doc. The `login()` service now strips `password` from the returned user object before sending it back. You can now safely store the full `user` object from a login response.
5. **Disease detection has a new "FREE scan" mode.** Sending `cropType: "FREE"` lets Gemini auto-identify the crop instead of you pre-selecting one. See section 5.3, this is a significant new feature for your "detect first, confirm crop second" UX idea.
6. **Four new crop types were added to the `CropType` enum:** `RICE`, `YAM`, `GROUNDNUT`, `ONION`. Update your crop picker UI and any hardcoded enum lists on the frontend.
7. **A new `detectedCropEnum` field is now present on every successful `/api/detect` response**, not just FREE scans. For normal scans it just echoes back the `cropType` you submitted, for FREE scans it is the crop Gemini identified, mapped to a known enum value (or `"UNKNOWN"`).
8. **A new error type, `NO_PLANT_DETECTED`, exists for FREE scans** where no recognizable plant is in the image at all (distinct from `CROP_MISMATCH`, which is for normal scans where the plant is real but does not match the crop you selected).

**Biggest changes in this version (since the section above was written):**

9. 🆕 **Real push notification delivery now exists.** Two new endpoints, `PUT /api/notifications/push-token` and `DELETE /api/notifications/push-token`, let the app register and unregister a device's Expo push token against the logged-in user. The daily 5:30 AM weather alert cron job now sends an actual push notification (via Expo's push API) to every registered device for a user, in addition to writing the `Notification` row it already created before. See section 5.5.
10. ⚠️ **`GET /api/auth/me` response shape changed.** It now returns a top-level `stats` object alongside `user` (crop count, detection count, total notifications, and unread notification count), and returns a clean `404` if the user record is somehow missing, instead of only ever succeeding or 500ing. See section 5.1, update any code that only destructures `user` from this response.
11. ✅ **The Twi text-to-speech endpoint (`POST /api/tts/generate`) had a real bug fixed.** It was calling a deprecated Ghana NLP endpoint (`/tts/v1/tts`) that could return an HTML/JSON error page instead of audio. It now calls the current `/tts/v1/synthesize` operation, and the controller explicitly checks the response `content-type` before trusting it is audio, returning a clean `502` instead of silently sending back a broken audio blob. The request/response shape your app already built against is unchanged, only the reliability improved.

**Newest changes in this version:**

13. 🆕 **Two new profile-editing endpoints exist: `PUT /api/auth/profile` and `PUT /api/auth/avatar`.** Together these let a user edit their `fullName`/`location` and upload/replace a profile picture after registration, instead of profile fields only ever being set once at sign-up. See section 5.1 for both.
14. 🆕 **`PUT /api/auth/avatar` uploads to Cloudinary, same pattern as `/api/detect`.** It requires `multipart/form-data` with an `image` field (not JSON), automatically crops/resizes to a 400x400 face-focused square, and best-effort deletes the user's previous avatar image from Cloudinary storage (a failed delete never blocks the new upload from succeeding).
15. There is still no community/social feature in this codebase, this remains scoped work only, see section 8. **(No longer true, see item 16 below, this line is kept only for history.)**

**Biggest changes in this newest version (since the section above was written, verified against commit `b9cc592`):**

16. 🆕 **The community/social feature now exists.** This was previously listed as "not implemented yet", it is now a full feature, mounted at `/api/community`: posts (with up to 3 images, tags, optional crop/region/detection linking), threaded comments (one level of replies only), likes, saves, a "helpful/solved" marking system for comments that awards reputation points, and a tag directory. This is a large addition, see the brand-new section 5.3 for all 19 endpoints.
17. 🆕 **A new "Daily Tips" feature exists, mounted at `/api/tips`.** A single endpoint, `GET /api/tips/today`, returns up to 5 personalized farming tips per day, scored against the user's preferred crops, saved region, the current month/season, and their recent detection history, then ranked and lightly rewritten by Gemini (with a rules-only fallback if Gemini is unavailable). Tips are cached per user per Africa/Accra calendar day and will not repeat for 14 days. See the new section 5.4.
18. 🆕 **A new endpoint, `DELETE /api/notifications/clear-all`, deletes every notification for the logged-in user in one call.** Returns how many rows were removed. See section 5.7.
19. ⚠️ **The weather risk model was completely rewritten.** `GET /api/weather/forecast` previously only had real disease-risk rules for `MAIZE`, `CASSAVA`, and `COCOA`, everything else fell back to a generic "conditions look manageable" message. All 10 real crop types (`MAIZE`, `TOMATO`, `CASSAVA`, `PLANTAIN`, `PEPPER`, `COCOA`, `RICE`, `YAM`, `GROUNDNUT`, `ONION`) now have their own disease-risk profile, built from a blended 3-day and 7-day humidity/rain/temperature analysis. The `riskInsights[].message` and `riskInsights[].factors` text is now also returned in Twi automatically when the user's saved `language` is `tw`, previously this was English-only regardless of the user's language setting. The response shape (`riskLevel`, `message`, `factors`) is unchanged, so existing UI code does not need to change, but the risk levels themselves will now be more accurate and, for `tw` users, will actually read in Twi. See the updated section 5.6.

---

## 1. Quick Start

**Base URL (local dev):** `http://localhost:3100`
(Port comes from the `PORT` env var, default `3100` if not set. Confirm with the backend dev which port their `.env` actually uses.)

**Base URL (production):** Ask the backend dev for the deployed `SERVER_URL`.

**Every route below requires this header, except:** health check, register, login, forgot-password, verify-reset-otp, and reset-password.

```
Authorization: Bearer <token>
```

The token is returned from `POST /api/auth/register` or `POST /api/auth/login`. There is no refresh token endpoint in this codebase, the access token is simply valid for 30 days from issue. Store it securely (e.g. `expo-secure-store` on the mobile app) and attach it to every protected request.

Note there is a second, separate token used only during password reset (the `resetToken`), which behaves differently, see section 5.1.4.

**Content-Type:**
- All JSON endpoints: `Content-Type: application/json`
- `POST /api/detect` and `PUT /api/auth/avatar` use `multipart/form-data` (both upload an image file). Do not send JSON to these two.

---

## 2. Standard Response Shape

Almost every endpoint returns:

```json
{
  "success": true,
  "...": "endpoint-specific fields"
}
```

or on failure:

```json
{
  "success": false,
  "message": "Human readable message"
}
```

Always check `success` first, before reading any other field. A few endpoints (detection, weather) return `success: false` with a `200`-style payload but an explicit `400` HTTP status, so check both the HTTP status code and the `success` flag.

---

## 3. Important Behavior Notes (read this before testing)

These are real quirks in the current backend code that will save you debugging time. They are not bugs you need to fix on the frontend, just things to design around. A few are flagged as things you should push the backend dev to fix before launch.

1. **Detection validation errors return HTTP 500, not 400.** If you POST to `/api/detect` with a missing or invalid `cropType` (anything outside the eleven allowed enum values, including `FREE`), the backend's Zod validation throws, and the controller passes it to the generic error handler, which always replies with a generic `500` message regardless of the real cause. The fix on your side: validate `cropType` against the known enum list client-side before submitting, so the user never actually sends a bad value.

2. **Login does not validate input shape before querying the database.** There is a `loginSchema` defined in the codebase but the login controller does not use it. It just reads `email` and `password` directly from the body. If either is missing, the bcrypt compare will fail and you will get a generic `"Invalid email or password"` 401, not a field-specific validation error. Validate that both fields are present client-side first.

3. **Login now correctly strips the password hash from the response.** In the previous version of this backend, the `login()` service returned the raw Prisma user object including the hashed password field. This has been fixed, the returned `user` object no longer contains `password`. You do not need to strip anything client-side anymore, but it is still good practice not to log the full response body.

4. **Registration does not normalize the phone number to a consistent format, but password reset does.** This is the single most important thing to get right on your signup form. `normalizePhoneNumber()` (which converts any of `0244123456`, `233244123456`, or `+233244123456` into the canonical `+233244123456` form) is only called inside the password reset flow, not inside registration. Whatever string the user types into the signup form's phone field is stored exactly as-is. Then, when that same user later requests a password reset, the backend normalizes their input into `+233244123456` format and looks up a user with that exact string. If the user registered with a phone number in local format (e.g. `0244123456`), the reset lookup will not find them, since the stored value does not match the normalized query value. **Fix on your side:** always format the phone number to `+233XXXXXXXXX` on the frontend before sending it in the registration request body, so it matches what password reset will later search for. Flag this to your backend dev too, ideally registration should call the same normalization function.

5. **`phoneNumber` is now a unique column.** Registering with a phone number that is already in use returns a `400` with the message `"This phone number is already registered"`, in addition to the existing duplicate-email check.

6. **Most crop-tracking validation errors return a generic message, not field-level detail.** For crop endpoints (`addMyCrop`, `updateMyCrop`, etc.), any Zod validation failure is caught and replaced with a generic message like `"Invalid crop data provided."`. The backend deliberately does not leak internal error detail (this is intentional, for security). This means your frontend must do its own client-side validation matching the rules in section 5 below, since the server will not tell you which field was wrong.

7. **`updateMyCrop` and `deleteMyCrop` require the crop to already exist in the user's preferred list.** They do not auto-create. If the crop was never added via `POST /api/crops/my-crops`, both will fail with a generic 400 message.

8. **`cropType` URL params are case-normalized server-side** (`cropType.toUpperCase()`), so `/my-crops/maize/history` and `/my-crops/MAIZE/history` both work. Still, always send uppercase from the frontend to stay consistent with the enum values returned elsewhere.

9. **The detection route is mounted at `/api/detect`, not `/api/detection/detect`.** Check `server.ts`: `app.use("/api", detectionRouter)` plus the router's own `/detect` path. It is easy to assume a nested path here, it is not nested.

10. **`FREE` is only a valid `cropType` value for the detection endpoint, not for crop-tracking endpoints.** Do not offer `FREE` as an option in your "Add a crop" form, the crop tracking Zod schemas do not accept it and will reject the request. `FREE` exists purely so the detection endpoint knows to auto-identify the crop instead of expecting a pre-selected one.

11. **`POST /api/notifications/trigger` is explicitly commented `// Dev only` in the source.** It manually fires the daily alert cron job for all users. It is currently behind auth (`protect` middleware) but has no admin-role check, so any logged-in user can trigger it. Do not expose this in the production frontend, and flag this to your backend dev as something to lock down (e.g. restrict to an admin role) before launch.

12. **Weather forecast needs a location, either from query params or from the user's saved profile.** If you don't pass `lat`/`lon` and the user never saved a location during registration, you'll get a `400` with `errorType: "LOCATION_MISSING"`. Always try to capture GPS location at registration time so this fallback exists.

13. **TTS (`/api/tts/generate`) currently only supports Twi (`tw`).** Sending any other `language` value returns a `400`. This is a real backend limitation right now, not a frontend bug.

14. **`preferredCrops` sent during registration is not validated against the crop enum.** Unlike the crop-tracking endpoints, `registerSchema` only checks it's a non-empty array of strings, it does not restrict values to `MAIZE`, `TOMATO`, etc. Still send only the valid enum values from your crop picker UI, since downstream features (like weather risk insights) expect those exact strings.

15. **CORS is restricted to a fixed origin list** (`CLIENT_URL` env var, plus `http://localhost:3000` and `http://localhost:3002`). If you're testing the web frontend from a different local port, ask the backend dev to add your origin, or test with Postman/curl, which are not subject to browser CORS restrictions.

16. **Password reset OTPs are only logged to the server console right now, no real SMS is sent.** The code has a `TODO: replace this with an Arkesel SMS API call` comment. During testing, you (or the backend dev) will need to check the backend server logs to read the OTP code, it will not arrive on an actual phone yet. Flag this as a pre-launch blocker if SMS delivery is required for your final demo.

17. **`forgotPassword` and `verifyResetOtp` intentionally return the same generic response whether or not the phone number is registered.** This is a deliberate security measure (the same pattern used by login's generic "Invalid email or password" message) so the endpoint cannot be used to check which phone numbers have accounts. Do not rely on the response to tell the user "this number is not registered", design your UI copy around a generic "if this number is registered, an OTP has been sent" message.

18. **The `isEmailVerified` field is misleadingly named, it actually tracks phone/OTP verification, not email verification.** It flips to `true` the moment a user successfully completes step 2 of the password reset flow (`verify-reset-otp`), which proves ownership of their phone number, not their email. There is currently no separate email verification step anywhere in this codebase (registration only simulates one with a `console.log`). Do not build UI copy that says "your email is verified" based on this flag, it is really "your phone number has been verified at least once."

19. **A code comment in `jwtUtils.ts` is inaccurate and can mislead you.** The `generateToken` function has a comment saying "15 minutes, security best practice" right next to `expiresIn: "30d"`. The actual behavior is unchanged from before, access tokens still last 30 days, only the comment is wrong. This is separate from the real 15-minute expiry used by the password reset token (see section 5.1.4), do not confuse the two.

20. 🆕 **Registering a push token twice on two different accounts silently reassigns it, it does not error.** `PUT /api/notifications/push-token` upserts on the token string itself. If a physical device previously registered its Expo push token while logged in as User A, then a different user (User B) logs in on that same device and registers again, the token row is simply updated to point at User B. This is correct behavior for a shared/reset device, but means you should always call the register endpoint again right after every successful login (and call the remove endpoint on logout, if you want that device to stop receiving alerts for the account that just logged out).

21. 🆕 **There is no server-side format validation on the push token string.** `registerPushToken` only checks that `token` is a non-empty string, it does not verify it looks like a real Expo push token (`ExponentPushToken[...]`). Validate the token client-side (it comes directly from `expo-notifications`' `getExpoPushTokenAsync()`, so this should rarely be an issue) rather than relying on the backend to catch a malformed value.

22. 🆕 **A dead push token is cleaned up automatically, but only the next time an alert is sent.** If a user uninstalls the app or revokes notification permissions, Expo's push receipt will report `DeviceNotRegistered` the next time the daily cron tries to notify that device, at which point the backend deletes the stale `PushToken` row. There is no immediate cleanup when permissions are revoked, so do not be surprised if a token still exists in the database for up to a day after the user turned notifications off.

23. 🆕 **`PUT /api/auth/profile` and `PUT /api/auth/avatar` both require the user's `Profile` row to already exist**, and will fail with a `400` (`"Profile not found. Please complete registration first."`) if it does not. In practice every user gets a `Profile` row created during `POST /api/auth/register`, so this should only ever happen for corrupted/manually-edited data, but do not assume it can never fire, still handle the error message in your UI.

24. 🆕 **`updateProfile` silently ignores unknown fields and requires at least one real field.** The body is validated with `.partial()` (every field optional) then a `.refine()` that rejects an empty object. Sending `{}` returns a `400` with `"At least one field (fullName or location) must be provided"`. You cannot update `email`, `phoneNumber`, `role`, or `preferredCrops` through this endpoint, only `fullName` and `location`, there is no endpoint for changing the other fields yet.

25. 🆕 **Avatar deletion from Cloudinary is best-effort and never blocks the new upload.** When you upload a new avatar, the backend tries to delete the old one from Cloudinary storage by parsing its public ID out of the stored URL. If that parsing or delete call fails for any reason, the failure is only logged server-side (`⚠️ Failed to delete old avatar`), the new avatar still saves and the request still returns `200`. This means orphaned images can build up in Cloudinary's free tier storage over time, not something the frontend needs to handle, just flagging it so nobody is surprised by unused images sitting in the Cloudinary dashboard.

26. 🆕 **`tagIds` on `POST /api/community/posts` must be a JSON-stringified array inside a multipart form field, not a normal repeated field or a real JSON body.** Because the endpoint is `multipart/form-data` (to support image uploads), every field arrives as a string. The backend explicitly `JSON.parse()`s the `tagIds` field before validating it as an array of `cuid`s. On the frontend, build the array normally (`["id1", "id2"]`), then call `JSON.stringify()` on it before appending it to your `FormData`, do not append each tag ID as a separate `tagIds` form field, that will not parse correctly.

27. 🆕 **There is no endpoint to set `Profile.communityRegion`.** Community posts can be filtered/tagged by `region`, and the Daily Tips scoring uses `communityRegion` to match region-specific tips, but neither `PUT /api/auth/profile` nor any other current endpoint lets a user actually set this field, it can only be `null` for every user right now unless it's set directly in the database. Flag this to your backend dev, either `communityRegion` needs its own settings field (e.g. a region picker in onboarding or settings), or `updateProfile` needs to accept it.

28. 🆕 **Replies are exactly one level deep, enforced server-side.** `POST /api/community/comments/:commentId/replies` checks whether the comment you're replying to already has a `parentId` itself, if it does, the request is rejected with `"Replies can only be added to a top-level comment, not to another reply."` Hide or disable the "Reply" action in your UI on any comment that is itself a reply (i.e. where `parentId !== null`), so users don't hit this error in the first place.

29. 🆕 **Only the post's author can mark a comment Helpful or Solved, and never on their own comment.** Both `POST /api/community/comments/:commentId/helpful` and `.../solved` check `comment.post.userId === actingUserId` (must be true) and `comment.userId !== actingUserId` (must also be true). Show these mark buttons in your UI only when both conditions hold, otherwise you'll be showing a button that always 403s.

30. 🆕 **Marking or unmarking a comment silently adjusts the comment author's reputation, this is not visible anywhere except `Profile.reputationScore`.** Helpful is worth 1 point, Solved is worth 2. Unmarking subtracts the same amount back, floored at 0 (it will never go negative). There is currently no activity feed or history of reputation changes, `reputationScore` is just a running total, if you want to show "why" a user's reputation changed, that has to be inferred from their marked comments, there is no dedicated audit endpoint for it.

31. 🆕 **Commenting or replying on a post does not notify the post's author.** Only `POST_LIKED` and `COMMENT_MARKED` notifications are actually wired up right now (see the `NotificationType` note in section 4). If a "someone replied to your post" push notification is part of your final demo scope, flag this as outstanding backend work, the enum values (`POST_COMMENTED`, `COMMENT_REPLIED`) already exist in the schema but nothing creates them yet.

32. 🆕 **Deleting a top-level comment also deletes all of its replies (via database cascade), and the post's `commentsCount` is decremented by the comment plus every reply it had**, all in one request. There is no way to delete a single reply while leaving its parent comment's other replies untouched from a different request, that already works fine independently, this note is just about the parent-comment-delete case cascading downward.

33. 🆕 **`GET /api/community/posts` (the main feed) and `GET /api/community/users/me/posts` (my posts) use different max `limit` values.** The main feed caps `limit` at 20 (values above are rejected by Zod, not clamped), "my posts" caps at 50. Use the correct max for whichever screen you're paginating, sending `limit=30` to the main feed will fail validation even though it would succeed against "my posts".

34. 🆕 **`GET /api/tips/today` is stable per Africa/Accra calendar day, not per 24-hour rolling window from first call.** If a user opens the app just before midnight Accra time, sees today's tips, then opens it again just after midnight, they will get a freshly computed, different set of tips, even though less than a minute of real time has passed. This is expected, the date the backend cares about is the Accra wall-clock calendar date, not elapsed time since the last fetch.

35. 🆕 **Two concurrent first-of-the-day calls to `GET /api/tips/today` from the same user (e.g. a double-tap or a race between a background refresh and a foreground load) are now handled safely.** The backend re-checks for an existing cache row inside a transaction right before writing, so if two requests both compute a tip set at the same moment, only the first one's result is persisted and returned to both callers, they will never see two different tip sets for the same day.

---

## 4. Enum Reference

Use these exact values, they are enforced by the Postgres/Prisma enum types on the backend.

| Enum | Values | Notes |
|---|---|---|
| `UserRole` | `FARMER`, `BEGINNER`, `GARDENER`, `STUDENT`, `OTHER` | |
| `CropType` | `MAIZE`, `TOMATO`, `CASSAVA`, `PLANTAIN`, `PEPPER`, `COCOA`, `RICE`, `YAM`, `GROUNDNUT`, `ONION`, `FREE` | `RICE`, `YAM`, `GROUNDNUT`, `ONION` are new. `FREE` is detection-only, see Important Behavior Note 10, never send it to a crop-tracking endpoint |
| `CropStatus` | `HEALTHY`, `MONITORING`, `AT_RISK`, `HARVEST_READY` | |
| `Language` (not a DB enum, just accepted values) | `en`, `tw` | |
| `NotificationType` (read-only, set by backend) | `DAILY_SUMMARY`, `HIGH_RISK`, `CROP_SPECIFIC`, `FAVORABLE_CONDITION`, `GENERAL_ADVICE`, `POST_LIKED`, `POST_COMMENTED`, `COMMENT_REPLIED`, `USER_FOLLOWED`, `FOLLOWED_USER_POSTED`, `COMMENT_MARKED` | 🆕 The last six values were added for the community feature. As of this commit, only `POST_LIKED` (when someone likes your post) and `COMMENT_MARKED` (when someone marks your comment helpful/solved) are actually created anywhere in the code. `POST_COMMENTED`, `COMMENT_REPLIED`, `USER_FOLLOWED`, and `FOLLOWED_USER_POSTED` exist on the enum but nothing in the current codebase creates them yet, do not build UI that assumes you will receive a notification when someone comments/replies on your post, you will not, see section 8 |
| `Priority` (read-only, set by backend) | `LOW`, `MEDIUM`, `HIGH` | |
| `detectedCropEnum` values returned by `/api/detect` | Same ten real crop values as `CropType` minus `FREE`, plus `"UNKNOWN"` | `"UNKNOWN"` only appears for FREE scans where the identified plant does not map to a known crop |
| 🆕 `CommentMarkType` (used internally by the mark/unmark endpoints, not sent in any request body, it's baked into the URL path instead) | `HELPFUL`, `SOLVED` | Drives which counter (`helpfulCount` / `solvedCount`) increments on a comment, and how much reputation the comment's author earns, 1 point for helpful, 2 for solved |
| 🆕 `GHANA_REGIONS` (not a DB enum, a fixed string union used to validate the `region` field on posts) | `Ahafo`, `Ashanti`, `Bono`, `Bono East`, `Central`, `Eastern`, `Greater Accra`, `North East`, `Northern`, `Oti`, `Savannah`, `Upper East`, `Upper West`, `Volta`, `Western`, `Western North` | All 16 official regions of Ghana. Values are case-sensitive and must match exactly, including the space in multi-word regions (`"Western North"`, not `"western north"` or `"Western-North"`) |
| 🆕 `riskLevel` values returned by `/api/weather/forecast` | `Low`, `Medium`, `High` | Title case, not uppercase, this is intentionally different casing from `Priority` above, copy it exactly when matching against it in the UI |

---

## 5. Endpoints

### 5.1 Auth

#### `POST /api/auth/register`

Creates a user account, a profile, and links preferred crops, all in one call. Returns a usable token immediately, there is no separate email verification step required to log in (email verification is simulated with a console log only, it does not block account use).

- **Auth required:** No
- **Content-Type:** `application/json`

**Body:**

| Field | Type | Required | Validation |
|---|---|---|---|
| `email` | string | Yes | Must be a valid email format |
| `password` | string | Yes | Minimum 8 characters |
| `fullName` | string | Yes | Minimum 2 characters |
| `phoneNumber` | string | Yes | Minimum 10 characters (no format/country-code check beyond length). See Important Behavior Note 4, format this as `+233XXXXXXXXX` before sending, since registration does not normalize it for you |
| `role` | string | Yes | One of `UserRole` enum values |
| `preferredCrops` | string[] | Yes | At least 1 item. Not enum-validated server-side, but send valid `CropType` values (not `FREE`) |
| `location` | object | No | `{ latitude: number, longitude: number, address?: string }`. Strongly recommended, weather forecast depends on this if no lat/lon query is sent later |

**Example request:**

```json
{
  "email": "ama.farmer@example.com",
  "password": "secureP@ss123",
  "fullName": "Ama Boateng",
  "phoneNumber": "+233244123456",
  "role": "FARMER",
  "preferredCrops": ["MAIZE", "CASSAVA"],
  "location": {
    "latitude": 6.6885,
    "longitude": -1.6244,
    "address": "Kumasi, Ghana"
  }
}
```

**Success response, `201`:**

```json
{
  "success": true,
  "message": "Account created successfully",
  "user": {
    "id": "cl9x8...",
    "email": "ama.farmer@example.com",
    "role": "FARMER",
    "phoneNumber": "+233244123456",
    "isEmailVerified": false
  },
  "token": "eyJhbGciOi..."
}
```

Note `phoneNumber` and `isEmailVerified` are new additions to this response since the previous version of this doc.

**Error responses:**

| Status | Scenario | Message |
|---|---|---|
| `400` | Email already registered | `"User with this email already exists"` |
| `400` | Phone number already registered (new check, since `phoneNumber` is now unique) | `"This phone number is already registered"` |
| `400` | Any Zod validation failure (bad email, short password, missing fields, etc.) | The raw Zod error message is returned here, since the catch block uses `error.message`. This can look messy (a stringified Zod issue array), don't render it raw to end users, show a friendly generic message instead and rely on your own client-side validation to prevent this case |

**Use case:** Onboarding screen, final submit step after collecting all profile fields and crop preferences.

---

#### `POST /api/auth/login`

- **Auth required:** No
- **Content-Type:** `application/json`

**Body:**

| Field | Type | Required | Validation |
|---|---|---|---|
| `email` | string | Yes | None enforced server-side at this endpoint, validate format client-side |
| `password` | string | Yes | None enforced server-side at this endpoint |

**Example request:**

```json
{
  "email": "ama.farmer@example.com",
  "password": "secureP@ss123"
}
```

**Success response, `200`:**

```json
{
  "success": true,
  "message": "Login successful",
  "user": {
    "id": "cl9x8...",
    "email": "ama.farmer@example.com",
    "role": "FARMER",
    "phoneNumber": "+233244123456",
    "language": "en",
    "isOnboarded": true,
    "isEmailVerified": false,
    "profile": {
      "fullName": "Ama Boateng",
      "location": { "latitude": 6.6885, "longitude": -1.6244, "address": "Kumasi, Ghana" },
      "preferredCrops": ["MAIZE", "CASSAVA"]
    }
  },
  "token": "eyJhbGciOi..."
}
```

The password hash is no longer present in this response, see Important Behavior Note 3. It is now safe to store this full `user` object on the client.

**Error responses:**

| Status | Scenario | Message |
|---|---|---|
| `401` | Email not found, or password incorrect | `"Invalid email or password"` (intentionally the same message for both cases, a security best practice that avoids leaking which emails are registered) |

**Use case:** Login screen.

---

#### `GET /api/auth/me`

Returns the current authenticated user's profile. Use this to restore session state on app launch after reading the token from secure storage.

- **Auth required:** Yes

**⚠️ Changed - the response now also includes a top-level `stats` object.** `authService.getMe` runs the user lookup and an unread-notifications count concurrently (`Promise.all`), then returns `{ user, stats }` instead of just the raw user record. `user.profile` is unchanged in shape. If your app currently does `const { user } = await api.getMe()` you do not need to change anything, but you are now leaving useful data (`stats`) on the table.

**Success response, `200`:**

```json
{
  "success": true,
  "user": {
    "id": "cl9x8...",
    "email": "ama.farmer@example.com",
    "role": "FARMER",
    "phoneNumber": "+233244123456",
    "language": "en",
    "isOnboarded": true,
    "isEmailVerified": false,
    "createdAt": "2026-06-01T10:00:00.000Z",
    "updatedAt": "2026-06-01T10:00:00.000Z",
    "profile": {
      "fullName": "Ama Boateng",
      "avatarUrl": null,
      "location": { "latitude": 6.6885, "longitude": -1.6244, "address": "Kumasi, Ghana" },
      "preferredCrops": ["MAIZE", "CASSAVA"]
    }
  },
  "stats": {
    "cropsCount": 2,
    "detectionsCount": 14,
    "notificationsCount": 6,
    "unreadNotificationsCount": 3
  }
}
```

Password is correctly excluded here via Prisma's `omit`.

**🆕 `stats` field reference:**

| Field | Meaning |
|---|---|
| `cropsCount` | Number of crops in the user's tracked "My Crops" list (`UserPreferredCrop` rows) |
| `detectionsCount` | Total lifetime disease detections the user has run |
| `notificationsCount` | Total notifications ever sent to this user (read and unread combined) |
| `unreadNotificationsCount` | Notifications with `isRead: false`. Use this to badge a bell icon without a separate call to `GET /api/notifications?unreadOnly=true` |

**Error responses:**

| Status | Scenario | Message |
|---|---|---|
| `401` | Missing or malformed `Authorization` header | `"Access denied. No token provided."` |
| `401` | Invalid or expired token | `"Invalid or expired token"` |
| `404` | 🆕 Token is valid but the user record no longer exists (e.g. deleted) | `"User not found"` |
| `500` | Unexpected lookup failure | `"Failed to fetch user"` |

**Use case:** App launch / splash screen session check, profile screen, and now also a lightweight way to populate a home-screen "X crops tracked, Y scans done" summary card plus an unread-notifications badge, without extra round trips.

---

#### `PUT /api/auth/language`

Updates the user's preferred language, used to drive Twi translation and TTS features.

- **Auth required:** Yes
- **Content-Type:** `application/json`

**Body:**

| Field | Type | Required | Validation |
|---|---|---|---|
| `language` | string | Yes | Must be `"en"` or `"tw"` |

**Example request:**

```json
{ "language": "tw" }
```

**Success response, `200`:**

```json
{
  "success": true,
  "message": "Language updated successfully to Twi",
  "language": "tw"
}
```

**Error responses:**

| Status | Scenario | Message |
|---|---|---|
| `400` | Value is not `en` or `tw` | `"Language must be either 'en' (English) or 'tw' (Twi)"` |
| `401` | Missing/invalid token | Same as above |

**Use case:** Settings screen language toggle. This setting also affects which language the detection AI responds in (see section 5.3).

---

#### `POST /api/auth/forgot-password` (new)

Step 1 of the password reset flow. The user submits their registered phone number, and if it matches an account, a 6-digit OTP is generated and (for now) logged to the server console, since real SMS sending is not wired up yet (see Important Behavior Note 16). Calling this endpoint again for the same user invalidates any previous unused OTP and issues a fresh one, so it also works as a "resend code" action.

- **Auth required:** No
- **Content-Type:** `application/json`

**Body:**

| Field | Type | Required | Validation |
|---|---|---|---|
| `phoneNumber` | string | Yes | Non-empty. Accepts `0244123456`, `233244123456`, or `+233244123456`, the backend normalizes it internally before looking up the user |

**Example request:**

```json
{ "phoneNumber": "0244123456" }
```

**Success response, `200`:**

```json
{
  "success": true,
  "message": "If this number is registered, an OTP has been sent."
}
```

This exact same response is returned whether or not the phone number belongs to a real account, see Important Behavior Note 17. Never tell the user "number not found" based on this response.

**Error responses:**

| Status | Scenario | Message |
|---|---|---|
| `400` | Phone number does not match any recognized Ghana format at all (empty, too short, garbage input) | `"Please enter a valid Ghana phone number (e.g. 0244123456 or +233244123456)"` |

**Use case:** "Forgot password" screen, first step, also reused as the "resend OTP" button on the next screen.

---

#### `POST /api/auth/verify-reset-otp` (new)

Step 2 of the password reset flow. The user submits their phone number plus the 6-digit OTP they received. On success, this marks the account's phone as verified and returns a short-lived `resetToken` needed for step 3.

- **Auth required:** No
- **Content-Type:** `application/json`

**Body:**

| Field | Type | Required | Validation |
|---|---|---|---|
| `phoneNumber` | string | Yes | Same format tolerance as `forgot-password` |
| `otp` | string | Yes | Exactly 6 digits |

**Example request:**

```json
{ "phoneNumber": "0244123456", "otp": "048213" }
```

**Success response, `200`:**

```json
{
  "success": true,
  "message": "OTP verified successfully",
  "resetToken": "eyJhbGciOi..."
}
```

`resetToken` is a separate, short-lived JWT, valid for only 15 minutes and only usable at the `reset-password` endpoint, not as a normal `Authorization` bearer token. Store it in memory only (e.g. React state), do not persist it to secure storage the way you do the main login token.

**Error responses:**

| Status | Scenario | Message |
|---|---|---|
| `400` | Phone number format invalid | `"Invalid phone number format"` |
| `400` | Phone number not found, OTP expired (older than 10 minutes), OTP already used, or OTP does not match | `"Invalid or expired OTP"` (same message for all four cases, intentionally generic, see Important Behavior Note 17) |

**Use case:** "Enter the code we sent you" screen.

---

#### `POST /api/auth/reset-password` (new)

Step 3 of the password reset flow. The user submits the `resetToken` from step 2 plus their new password.

- **Auth required:** No (uses the `resetToken` from the body instead of the usual `Authorization` header)
- **Content-Type:** `application/json`

**Body:**

| Field | Type | Required | Validation |
|---|---|---|---|
| `resetToken` | string | Yes | Must be the token returned from `verify-reset-otp`, not expired (15 minute window) |
| `newPassword` | string | Yes | Minimum 8 characters |

**Example request:**

```json
{ "resetToken": "eyJhbGciOi...", "newPassword": "newSecureP@ss456" }
```

**Success response, `200`:**

```json
{
  "success": true,
  "message": "Password reset successfully. You can now log in."
}
```

**Error responses:**

| Status | Scenario | Message |
|---|---|---|
| `400` | `resetToken` expired, tampered with, or not actually a reset-type token | `"Reset session expired. Please request a new OTP."` |
| `400` | `newPassword` shorter than 8 characters, or `resetToken` missing | Raw Zod error message, same caveat as registration, do not render it raw, rely on your own client-side validation |

**Use case:** "Set a new password" screen, final step. After success, route the user back to the login screen, this endpoint does not return a new session token.

---

#### `PUT /api/auth/profile` (new)

Updates the logged-in user's `fullName` and/or `location`. Both fields are optional, but at least one must be present. Cannot change `email`, `phoneNumber`, `role`, or `preferredCrops`, there is no endpoint for those yet.

- **Auth required:** Yes
- **Content-Type:** `application/json`

**Body:**

| Field | Type | Required | Validation |
|---|---|---|---|
| `fullName` | string | No (but at least one field required) | Minimum 2 characters if provided |
| `location` | object | No (but at least one field required) | `{ latitude: number, longitude: number, address?: string }` if provided |

**Example request:**

```json
{
  "fullName": "Ama K. Boateng",
  "location": { "latitude": 6.6885, "longitude": -1.6244, "address": "Kumasi, Ghana" }
}
```

**Success response, `200`:**

```json
{
  "success": true,
  "message": "Profile updated successfully",
  "profile": {
    "id": "cl9x8...",
    "fullName": "Ama K. Boateng",
    "avatarUrl": null,
    "location": { "latitude": 6.6885, "longitude": -1.6244, "address": "Kumasi, Ghana" },
    "preferredCrops": ["MAIZE", "CASSAVA"]
  }
}
```

**Error responses:**

| Status | Scenario | Message |
|---|---|---|
| `400` | Body is empty, or has no recognized field set | `"At least one field (fullName or location) must be provided"` |
| `400` | `fullName` provided but shorter than 2 characters | Raw Zod error message, same caveat as registration, do your own client-side validation and show a friendly message instead |
| `400` | The user's `Profile` row does not exist (see Important Behavior Note 23) | `"Profile not found. Please complete registration first."` |
| `401` | Missing/invalid token | Same as other protected routes |

**Use case:** "Edit Profile" screen, saving a changed name or updated farm location (e.g. after moving, or correcting a GPS location captured inaccurately at signup).

---

#### `PUT /api/auth/avatar` (new)

Uploads or replaces the logged-in user's profile picture. Stores the image on Cloudinary, auto-crops to a 400x400 square focused on the detected face, and best-effort deletes the previous avatar image (see Important Behavior Note 25).

- **Auth required:** Yes
- **Content-Type:** `multipart/form-data` (not JSON, same pattern as `/api/detect`)

**Body (form-data):**

| Field | Type | Required | Validation |
|---|---|---|---|
| `image` | file | Yes | Must be an image mimetype (`image/*`). Same file size limit as detection uploads (`MAX_IMAGE_SIZE_MB` env var, 5MB default) |

**Success response, `200`:**

```json
{
  "success": true,
  "message": "Avatar updated successfully",
  "avatarUrl": "https://res.cloudinary.com/xxx/image/upload/v123/crop-diagnose/avatars/abc123.jpg",
  "profile": {
    "id": "cl9x8...",
    "fullName": "Ama Boateng",
    "avatarUrl": "https://res.cloudinary.com/xxx/image/upload/v123/crop-diagnose/avatars/abc123.jpg",
    "location": { "latitude": 6.6885, "longitude": -1.6244, "address": "Kumasi, Ghana" },
    "preferredCrops": ["MAIZE", "CASSAVA"]
  }
}
```

**Error responses:**

| Status | Scenario | Message |
|---|---|---|
| `400` | No `image` file attached to the request | `"Image file is required"` |
| `400` | Attached file is not an image mimetype | Raw multer error message, validate the file type client-side (e.g. restrict the image picker to photos) before upload |
| `400` | The user's `Profile` row does not exist (see Important Behavior Note 23) | `"Profile not found. Please complete registration first."` |
| `401` | Missing/invalid token | Same as other protected routes |

**Use case:** "Change profile photo" tap target on the profile screen, typically paired with an image picker (camera or gallery) same as the detection flow's photo capture.

---

### 5.2 Crops (My Crops tracking)

All routes here are mounted at `/api/crops`.

#### `GET /api/crops/my-crops`

Returns the user's tracked crops with a computed risk level based on their most recent detection for each crop.

- **Auth required:** Yes

**Success response, `200`:**

```json
{
  "success": true,
  "crops": [
    {
      "cropType": "MAIZE",
      "customName": "Backyard Maize",
      "status": "MONITORING",
      "farmSize": 2.5,
      "farmSizeUnit": "acres",
      "plantingDate": "2026-03-01T00:00:00.000Z",
      "expectedHarvestDate": "2026-07-01T00:00:00.000Z",
      "notes": "Near the river",
      "lastActivityDate": "2026-06-10T08:30:00.000Z",
      "lastDetection": {
        "diseaseName": "Northern Leaf Blight",
        "date": "2026-06-10T08:30:00.000Z",
        "confidence": 0.82
      },
      "riskLevel": "HIGH"
    }
  ],
  "total": 1,
  "message": "Your crops retrieved successfully. Keep growing strong!"
}
```

`riskLevel` logic: `"HIGH"` if the last detection's confidence is above `0.7`, `"MEDIUM"` if there's any detection at all below that, `"LOW"` if there's no detection yet for that crop.

`lastDetection` is `null` if the crop has never been scanned via `/api/detect`.

If the user has no preferred crops yet, `crops` is `[]` and the message becomes: `"You have not added any preferred crops yet. Add some to start tracking."`

**Error responses:**

| Status | Scenario | Message |
|---|---|---|
| `500` | Unexpected DB error | `"Failed to fetch your crops"` |

**Use case:** "My Crops" dashboard / home screen list.

---

#### `POST /api/crops/my-crops`

Adds a crop to the user's tracked list.

- **Auth required:** Yes
- **Content-Type:** `application/json`

**Body:**

| Field | Type | Required | Validation |
|---|---|---|---|
| `cropType` | string | Yes | One of `CropType` enum values, **excluding `FREE`**: `MAIZE`, `TOMATO`, `CASSAVA`, `PLANTAIN`, `PEPPER`, `COCOA`, `RICE`, `YAM`, `GROUNDNUT`, `ONION` |
| `customName` | string | No | Max 100 characters |
| `plantingDate` | string | No | ISO 8601 datetime string |
| `expectedHarvestDate` | string | No | ISO 8601 datetime string |
| `farmSize` | number | No | Must be positive |
| `notes` | string | No | Max 500 characters |

**Example request:**

```json
{
  "cropType": "MAIZE",
  "customName": "Backyard Maize",
  "plantingDate": "2026-03-01T00:00:00.000Z",
  "farmSize": 2.5,
  "notes": "Near the river"
}
```

**Success response, `201`:**

```json
{
  "success": true,
  "data": {
    "userId": "cl9x8...",
    "cropType": "MAIZE",
    "customName": "Backyard Maize",
    "plantingDate": "2026-03-01T00:00:00.000Z",
    "expectedHarvestDate": null,
    "farmSize": 2.5,
    "farmSizeUnit": "acres",
    "notes": "Near the river",
    "status": "HEALTHY",
    "lastActivityDate": "2026-06-21T12:00:00.000Z"
  },
  "message": "MAIZE added to your crops successfully. Great choice!"
}
```

**Error responses:**

| Status | Scenario | Message |
|---|---|---|
| `400` | Crop already exists in the user's list | `{ "success": false, "message": "This crop is already in your list." }` (the controller checks `result.success` to pick the status code, so this returns a normal `400`, not a thrown exception) |
| `400` | Validation failure (bad enum, oversized strings, negative farm size, or sending `FREE` here) | `"Invalid crop data provided."` |

**Use case:** "Add a crop" form in onboarding or My Crops screen.

---

#### `PATCH /api/crops/my-crops/:cropType`

Updates fields on an existing tracked crop. Requires the crop to already be in the user's list (see Important Behavior Notes, item 7).

- **Auth required:** Yes
- **Content-Type:** `application/json`

**URL param:**

| Param | Type | Notes |
|---|---|---|
| `cropType` | string | One of `CropType` values (excluding `FREE`), case-insensitive (auto-uppercased server-side) |

**Body (all optional, send only fields you want to change):**

| Field | Type | Validation |
|---|---|---|
| `customName` | string | Max 100 characters |
| `plantingDate` | string | ISO 8601 datetime |
| `expectedHarvestDate` | string | ISO 8601 datetime |
| `farmSize` | number | Must be positive |
| `notes` | string | Max 500 characters |
| `status` | string | One of `CropStatus` enum values |

**Example request:** `PATCH /api/crops/my-crops/MAIZE`

```json
{
  "status": "AT_RISK",
  "notes": "Showing leaf spots after the heavy rain"
}
```

**Success response, `200`:**

```json
{
  "success": true,
  "data": {
    "userId": "cl9x8...",
    "cropType": "MAIZE",
    "status": "AT_RISK",
    "notes": "Showing leaf spots after the heavy rain",
    "lastActivityDate": "2026-06-21T12:05:00.000Z"
  },
  "message": "Crop details updated successfully."
}
```

**Error responses:**

| Status | Scenario | Message |
|---|---|---|
| `400` | Crop not found in user's list, or validation failure | `"Failed to update crop details."` |

**Use case:** Editing crop details, manually updating crop status from the My Crops screen.

---

#### `DELETE /api/crops/my-crops/:cropType`

Removes a crop from the user's tracked list. Does not delete past detection history for that crop.

- **Auth required:** Yes

**URL param:**

| Param | Type | Notes |
|---|---|---|
| `cropType` | string | One of `CropType` values, case-insensitive |

**Example request:** `DELETE /api/crops/my-crops/MAIZE`

**Success response, `200`:**

```json
{
  "success": true,
  "message": "Crop removed from your list."
}
```

**Error responses:**

| Status | Scenario | Message |
|---|---|---|
| `400` | Crop not found in user's list | `"Failed to remove crop."` |

**Use case:** "Remove crop" action, usually behind a confirm dialog since this can't be undone from the UI.

---

#### `GET /api/crops/my-crops/:cropType/history`

Returns paginated detection history for one specific tracked crop, plus simple aggregates (average confidence, most common disease detected).

- **Auth required:** Yes

**URL param:**

| Param | Type | Notes |
|---|---|---|
| `cropType` | string | One of `CropType` values, case-insensitive |

**Query params (all optional):**

| Param | Type | Default | Validation |
|---|---|---|---|
| `page` | string (numeric) | `1` | Integer, min 1 |
| `limit` | string (numeric) | `10` | Integer, 1 to 50 (values above 50 are rejected, not clamped) |
| `startDate` | string | none | ISO 8601 datetime |
| `endDate` | string | none | ISO 8601 datetime |
| `minConfidence` | string (numeric) | none | Number between 0 and 1 |

**Example request:** `GET /api/crops/my-crops/MAIZE/history?page=1&limit=10&minConfidence=0.5`

**Success response, `200`:**

```json
{
  "success": true,
  "history": [
    {
      "id": "cl9y2...",
      "imageUrl": "https://res.cloudinary.com/.../detections/abc.jpg",
      "diseaseName": "Northern Leaf Blight",
      "confidence": 0.82,
      "symptoms": "Long, elliptical gray-green lesions on leaves.",
      "createdAt": "2026-06-10T08:30:00.000Z",
      "localNotes": "Common during the rainy season in the Ashanti region.",
      "aiProvider": "gemini"
    }
  ],
  "aggregates": {
    "totalDetections": 1,
    "avgConfidence": 0.82,
    "mostCommonDisease": "Northern Leaf Blight"
  },
  "pagination": {
    "page": 1,
    "limit": 10,
    "total": 1,
    "totalPages": 1
  },
  "message": "Crop history loaded successfully. Learn from your past diagnoses!"
}
```

If there's no history yet, `history` is `[]` and the message becomes: `"No diagnoses yet for this crop. Take a photo to start building your history."`

**Error responses:**

| Status | Scenario | Message |
|---|---|---|
| `400` | Crop is not in the user's preferred list | `"This crop is not in your preferred list. Please add it first."` (returned as a normal `success: false` body, not a thrown error) |
| `400` | Invalid query params (e.g. `limit=100`, malformed date) | Throws a Zod error, caught and replaced with `"Failed to fetch crop history. Please try again later."` |
| `500` | Unexpected DB error | Same generic message as above |

**Use case:** Crop detail screen, "history" tab showing a timeline of past scans for that specific crop.

---

### 5.3 Community (new)

All routes here are mounted at `/api/community`. This is the Twitter-like feature: farmers post text (plus up to 3 photos), tag posts with topics, optionally link a post to a region, a crop, or a past detection, then the community comments, replies (one level deep only), likes, and saves posts. Comments can be marked "Helpful" or "Solved" by the post's author, which awards the commenter reputation points.

Reading posts (`GET /api/community/posts`, `GET /api/community/posts/:postId`, `GET /api/community/posts/:postId/comments`) works for guests too, using `optionalAuth` instead of `protect`. Everything else (creating, deleting, liking, saving, commenting) requires a logged-in user.

#### `GET /api/community/tags`

Returns the fixed list of tags available to attach to a post (e.g. "Pest Alert", "Success Story", whatever was seeded into the `Tag` table). There is no endpoint to create a tag from the app, tags are backend-seeded only.

- **Auth required:** No

**Success response, `200`:**

```json
{
  "success": true,
  "message": "Tags retrieved successfully",
  "data": [
    { "id": "cltag1...", "name": "Pest Alert", "slug": "pest-alert" }
  ],
  "total": 1
}
```

**Use case:** Populate the tag picker checkboxes/chips on the "New Post" screen before the user can submit, since `tagIds` is a required field on post creation.

---

#### `POST /api/community/posts`

Creates a new community post. At least one tag is required. Images are optional but capped at 3.

- **Auth required:** Yes
- **Content-Type:** `multipart/form-data` (not JSON, because of the optional image uploads)

**Body (form-data):**

| Field | Type | Required | Validation |
|---|---|---|---|
| `content` | string | Yes | 1 to 2000 characters |
| `tagIds` | string | Yes | Must be a **JSON-stringified array** of tag IDs, e.g. `'["cltag1...","cltag2..."]'`, not a normal repeated form field. At least 1 tag ID, every ID must be a valid `cuid` and must exist in the `Tag` table |
| `region` | string | No | Must be one of the 16 `GHANA_REGIONS` values, see section 4 |
| `cropType` | string | No | One of the 10 real `CropType` values (not `FREE`) |
| `detectionId` | string | No | A valid `cuid` belonging to a detection that this logged-in user actually ran, used to attach "I scanned this and here's what happened" context to a post |
| `images` | file(s) | No | Up to 3 image files, same mimetype/size rules as other uploads (`MAX_IMAGE_SIZE_MB`, default 5MB, per file) |

**Example request (as multipart form fields, not JSON):**

```
content: "My maize leaves have these gray-green streaks, anyone seen this before?"
tagIds: ["cltag1abc", "cltag2xyz"]
region: "Ashanti"
cropType: "MAIZE"
images: [photo1.jpg, photo2.jpg]
```

**Success response, `201`:**

```json
{
  "success": true,
  "message": "Post created successfully",
  "data": {
    "id": "clpost1...",
    "content": "My maize leaves have these gray-green streaks, anyone seen this before?",
    "imageUrls": ["https://res.cloudinary.com/xxx/image/upload/v123/crop-diagnose/community/abc.jpg"],
    "region": "Ashanti",
    "cropType": "MAIZE",
    "detectionId": null,
    "likesCount": 0,
    "commentsCount": 0,
    "savesCount": 0,
    "createdAt": "2026-08-01T09:00:00.000Z",
    "author": { "id": "cluser1...", "fullName": "Ama Boateng", "avatarUrl": null, "reputationScore": 0 },
    "tags": [{ "id": "cltag1abc", "name": "Pest Alert", "slug": "pest-alert" }]
  }
}
```

**Error responses:**

| Status | Scenario | Message |
|---|---|---|
| `400` | `content` missing, empty, or over 2000 characters | Raw Zod message, do your own client-side character-count validation and show a friendly message |
| `400` | More than 3 image files attached | `"You can only upload up to 3 images"` |
| `400` | `tagIds` is not valid JSON, is not an array, or is empty | Raw Zod message, validate this shape client-side before submitting since it's an easy field to get wrong |
| `400` | One or more `tagIds` do not exist in the `Tag` table | `"One or more selected tags are invalid"` |
| `400` | `detectionId` provided but does not belong to the logged-in user (or doesn't exist) | `"This detection does not belong to you"` |
| `400` | `region` not one of the 16 valid Ghana regions | `"Please select a valid Ghana region"` |
| `401` | Missing/invalid token | Same as other protected routes |

**Use case:** "New Post" / "Ask the Community" screen, likely reached from a "share this diagnosis" button on the detection result screen (via `detectionId`) as well as a standalone compose button.

---

#### `GET /api/community/posts`

The main community feed. Public read, supports filtering and search, and returns `isLiked`/`isSaved` flags per post when the request is authenticated.

- **Auth required:** No (send the `Authorization` header anyway if the user is logged in, so you get `isLiked`/`isSaved` back)

**Query params (all optional):**

| Param | Type | Default | Validation |
|---|---|---|---|
| `page` | string (numeric) | `1` | Integer, min 1 |
| `limit` | string (numeric) | `10` | Integer, 1 to 20 (values above 20 are rejected, not clamped) |
| `tag` | string | none | A tag `slug` (not an ID), e.g. `pest-alert` |
| `region` | string | none | One of the 16 `GHANA_REGIONS` values |
| `cropType` | string | none | One of the 10 real `CropType` values |
| `q` | string | none | Free-text search, matched against `content` with a case-insensitive `contains` (not full-text search, so it will not stem or rank by relevance, just a plain substring match) |

**Example request:** `GET /api/community/posts?cropType=MAIZE&region=Ashanti&page=1&limit=10`

**Success response, `200`:**

```json
{
  "success": true,
  "message": "Posts retrieved successfully",
  "data": [
    {
      "id": "clpost1...",
      "content": "My maize leaves have these gray-green streaks...",
      "imageUrls": [],
      "region": "Ashanti",
      "cropType": "MAIZE",
      "likesCount": 3,
      "commentsCount": 1,
      "savesCount": 0,
      "createdAt": "2026-08-01T09:00:00.000Z",
      "updatedAt": "2026-08-01T09:00:00.000Z",
      "author": { "id": "cluser1...", "fullName": "Ama Boateng", "avatarUrl": null, "reputationScore": 2 },
      "tags": [{ "id": "cltag1abc", "name": "Pest Alert", "slug": "pest-alert" }],
      "isLiked": false,
      "isSaved": true
    }
  ],
  "pagination": { "page": 1, "limit": 10, "total": 1, "totalPages": 1 }
}
```

Note `detectionId` is **not** included in this list response (it is included in `GET /api/community/posts/:postId` and `GET /api/community/users/me/posts`), and `isLiked`/`isSaved` are only present at all when the request was authenticated, so check for their existence before reading them if you support a logged-out feed view.

If no posts match, `data` is `[]` and the message becomes `"No posts found. Be the first to share your experience!"`.

**Error responses:**

| Status | Scenario | Message |
|---|---|---|
| `400` | Invalid query params (e.g. `limit=50`, unrecognized `region`) | Raw Zod message, validate filters client-side, especially `region` since it must match one of the 16 values exactly |

**Use case:** Main community/feed tab, plus the same endpoint reused with different query params for a "filter by my crop" or "filter by my region" view.

---

#### `GET /api/community/posts/:postId`

Full detail for a single post, including `updatedAt` and `detectionId` (both omitted from the list endpoint above).

- **Auth required:** No (same `isLiked`/`isSaved` behavior as the list endpoint, only present when authenticated)

**Success response, `200`:** Same shape as one item in the `GET /api/community/posts` array, plus `updatedAt` and `detectionId`.

**Error responses:**

| Status | Scenario | Message |
|---|---|---|
| `404` | Post does not exist (wrong ID, or already deleted) | `"Post not found"` |

**Use case:** Post detail screen, reached by tapping a post in the feed. Pair this with `GET /api/community/posts/:postId/comments` to render the full thread below it.

---

#### `GET /api/community/users/me/posts`

Returns the logged-in user's own posts (their "My Posts" tab on their own profile).

- **Auth required:** Yes

**Query params (all optional):** `page` (default `1`), `limit` (default `10`, max `50`, note this max is different from the main feed's max of 20).

**Success response, `200`:** Same post shape as the main feed, plus `detectionId`, `isLiked`, and `isSaved` are always present (no author block, since it's always the current user).

If the user has never posted, `data` is `[]` and the message becomes `"You have not created any posts yet"`.

**Use case:** "My Posts" tab on the current user's own profile screen.

---

#### `DELETE /api/community/posts/:postId`

Deletes a post the user owns. Cascades to its comments, likes, saves, and tag links at the database level. Also best-effort deletes any attached images from Cloudinary (a failed image delete never blocks the post deletion, same pattern as avatar replacement).

- **Auth required:** Yes

**Success response, `200`:**

```json
{ "success": true, "message": "Post deleted successfully" }
```

**Error responses:**

| Status | Scenario | Message |
|---|---|---|
| `404` | Post does not exist | `"Post not found"` |
| `403` | Post exists but belongs to someone else | `"You can only delete your own posts"` |

**Use case:** "Delete post" option on a post the current user authored, typically behind a confirmation dialog since this is irreversible.

---

#### `POST /api/community/posts/:postId/comments`

Adds a top-level comment to a post.

- **Auth required:** Yes
- **Content-Type:** `application/json`

**Body:** `{ "content": string }`, 1 to 1000 characters.

**Success response, `201`:**

```json
{
  "success": true,
  "message": "Comment posted successfully",
  "data": {
    "id": "clcomment1...",
    "postId": "clpost1...",
    "parentId": null,
    "content": "This looks like Northern Leaf Blight, I had the same last season.",
    "helpfulCount": 0,
    "solvedCount": 0,
    "createdAt": "2026-08-01T09:10:00.000Z",
    "author": { "id": "cluser2...", "fullName": "Kofi Mensah", "avatarUrl": null, "reputationScore": 5 },
    "replies": []
  }
}
```

**Error responses:**

| Status | Scenario | Message |
|---|---|---|
| `404` | Post does not exist | `"Post not found"` |
| `400` | `content` missing, empty, or over 1000 characters | Raw Zod message |

**⚠️ Important:** commenting on someone else's post does **not** currently send that person a notification. Only likes and helpful/solved marks generate notifications right now (see the `NotificationType` note in section 4). If your UI implies "the post author will be notified" anywhere near the comment box, that is not accurate yet, flag it to the backend dev if this is needed for the demo.

**Use case:** Comment box at the bottom of the post detail screen.

---

#### `POST /api/community/comments/:commentId/replies`

Adds a reply to a top-level comment. Replies are exactly one level deep, you cannot reply to a reply.

- **Auth required:** Yes
- **Content-Type:** `application/json`

**Body:** `{ "content": string }`, same 1 to 1000 character validation as a comment.

**Success response, `201`:** Same shape as a comment response above, except `parentId` is the ID of the comment being replied to, and there is no `replies` field (replies cannot themselves have replies).

**Error responses:**

| Status | Scenario | Message |
|---|---|---|
| `404` | The comment being replied to does not exist | `"Comment not found"` |
| `400` | The comment being replied to is itself a reply (already has a `parentId`) | `"Replies can only be added to a top-level comment, not to another reply"` |
| `400` | `content` missing, empty, or over 1000 characters | Raw Zod message |

**Use case:** "Reply" tap target under a comment. In your UI, only show the reply option on top-level comments, hide it on replies themselves, since the backend will reject a reply-to-a-reply.

---

#### `GET /api/community/posts/:postId/comments`

Returns paginated top-level comments for a post, each with its replies nested inline (replies are **not** paginated separately, all replies for a fetched top-level comment come back at once).

- **Auth required:** No

**Query params (all optional):** `page` (default `1`), `limit` (default `10`, max `20`).

**Success response, `200`:**

```json
{
  "success": true,
  "message": "Comments retrieved successfully",
  "data": [
    {
      "id": "clcomment1...",
      "postId": "clpost1...",
      "parentId": null,
      "content": "This looks like Northern Leaf Blight, I had the same last season.",
      "helpfulCount": 1,
      "solvedCount": 0,
      "createdAt": "2026-08-01T09:10:00.000Z",
      "author": { "id": "cluser2...", "fullName": "Kofi Mensah", "avatarUrl": null, "reputationScore": 5 },
      "replies": [
        {
          "id": "clreply1...",
          "postId": "clpost1...",
          "parentId": "clcomment1...",
          "content": "Same here, neem spray helped a lot.",
          "helpfulCount": 0,
          "solvedCount": 0,
          "createdAt": "2026-08-01T09:15:00.000Z",
          "author": { "id": "cluser3...", "fullName": "Yaw Owusu", "avatarUrl": null, "reputationScore": 1 }
        }
      ]
    }
  ],
  "pagination": { "page": 1, "limit": 10, "total": 1, "totalPages": 1 }
}
```

Comments are ordered oldest-first (`createdAt: "asc"`) so a thread reads top to bottom naturally, this is the opposite order from the main post feed, which is newest-first.

If there are no comments yet, `data` is `[]` and the message becomes `"No comments yet. Be the first to respond!"`.

**Error responses:**

| Status | Scenario | Message |
|---|---|---|
| `404` | Post does not exist | `"Post not found"` |

**Use case:** Comment thread on the post detail screen.

---

#### `DELETE /api/community/comments/:commentId`

Deletes a comment the user owns. If the comment has replies, those are counted and the post's `commentsCount` is decremented by the comment plus all its replies together (replies themselves are deleted via the database cascade, this endpoint does not let you delete a single reply independently while keeping the parent).

- **Auth required:** Yes

**Success response, `200`:**

```json
{ "success": true, "message": "Comment deleted successfully" }
```

**Error responses:**

| Status | Scenario | Message |
|---|---|---|
| `404` | Comment does not exist | `"Comment not found"` |
| `403` | Comment exists but belongs to someone else | `"You can only delete your own comments"` |

**Use case:** "Delete" option on a comment or reply bubble the current user authored.

---

#### `POST /api/community/comments/:commentId/helpful`

Marks another user's comment as "Helpful". **Only the post's author can do this**, and only on comments left by other people, not their own. Awards the comment's author 1 reputation point.

- **Auth required:** Yes

**Success response, `200`:**

```json
{
  "success": true,
  "message": "Comment marked as helpful successfully",
  "data": { "commentId": "clcomment1...", "helpfulCount": 1, "solvedCount": 0 }
}
```

**Error responses:**

| Status | Scenario | Message |
|---|---|---|
| `404` | Comment does not exist | `"Comment not found"` |
| `403` | The logged-in user is not the author of the post this comment is on | `"Only the post author can mark comments as helpful or solved"` |
| `403` | The logged-in user is trying to mark their own comment | `"You cannot mark your own comment"` |
| `409` | This exact mark already exists for this comment | `"You have already marked this comment as helpful"` |

**Use case:** "Mark as Helpful" button, shown only when `currentUserId === post.author.id` and the comment is not the post author's own comment, both checks worth doing client-side too so the button isn't shown where it will just 403.

---

#### `DELETE /api/community/comments/:commentId/helpful`

Removes a previously-added "Helpful" mark, reversing the reputation point.

- **Auth required:** Yes

**Success response, `200`:**

```json
{ "success": true, "message": "Helpful mark removed successfully" }
```

**Error responses:**

| Status | Scenario | Message |
|---|---|---|
| `404` | No existing "Helpful" mark from this user on this comment | `"You have not marked this comment, so there is nothing to remove"` |
| `404` | Comment no longer exists | `"Comment not found"` |

**Use case:** Toggling the "Helpful" button off after it was tapped on.

---

#### `POST /api/community/comments/:commentId/solved`

Same rules as the Helpful endpoint above, marks a comment as the one that solved the post author's problem. Awards 2 reputation points (versus 1 for Helpful).

- **Auth required:** Yes

**Success/error responses:** Identical structure to `POST /api/community/comments/:commentId/helpful`, just with `"solved"` in place of `"helpful"` in every message, and `solvedCount` in the response data instead of `helpfulCount`.

**Use case:** "Mark as Solution" button, same visibility rule as Helpful (post-author-only, not on their own comment).

---

#### `DELETE /api/community/comments/:commentId/solved`

Removes a previously-added "Solved" mark, reversing the 2 reputation points.

- **Auth required:** Yes

**Success/error responses:** Same structure as `DELETE /api/community/comments/:commentId/helpful`, with `"Solved mark removed successfully"`.

---

#### `POST /api/community/posts/:postId/like`

Likes a post. Liking your own post is allowed and does not error, it just never generates a notification to yourself (see the `POST_LIKED` notification, only sent when someone else likes your post).

- **Auth required:** Yes

**Success response, `200`:**

```json
{ "success": true, "message": "Post liked successfully" }
```

**Error responses:**

| Status | Scenario | Message |
|---|---|---|
| `404` | Post does not exist | `"Post not found"` |
| `409` | This user already liked this post | `"You have already liked this post"` |

**Use case:** Heart/like icon on a post, in the feed or on the detail screen.

---

#### `DELETE /api/community/posts/:postId/like`

Unlikes a previously-liked post.

- **Auth required:** Yes

**Error responses:**

| Status | Scenario | Message |
|---|---|---|
| `404` | This user has not liked this post | `"You have not liked this post"` |
| `404` | Post does not exist | `"Post not found"` |

**Use case:** Toggling the like icon off.

---

#### `GET /api/community/posts/:postId/likes`

Returns the list of users who liked a post, most recent first.

- **Auth required:** No

**Query params (all optional):** `page` (default `1`), `limit` (default `20`, max `50`).

**Success response, `200`:**

```json
{
  "success": true,
  "message": "Likes retrieved successfully",
  "data": [
    { "id": "cluser2...", "fullName": "Kofi Mensah", "avatarUrl": null, "reputationScore": 5 }
  ],
  "pagination": { "page": 1, "limit": 20, "total": 1, "totalPages": 1 }
}
```

**Use case:** "Liked by" list, shown when tapping the like count on a post.

---

#### `POST /api/community/posts/:postId/save`

Bookmarks a post to the logged-in user's private saved list. Saving is private, other users cannot see who saved a post (unlike likes, which have a public `GET /likes` endpoint).

- **Auth required:** Yes

**Error responses:** Same pattern as like (`404` post not found, `409` already saved: `"You have already saved this post"`).

---

#### `DELETE /api/community/posts/:postId/save`

Removes a post from the saved list.

- **Auth required:** Yes

**Error responses:** Same pattern as unlike (`404` post not found, `404` not saved: `"You have not saved this post"`).

---

#### `GET /api/community/saved`

Returns the logged-in user's saved posts, most recently saved first.

- **Auth required:** Yes

**Query params (all optional):** `page` (default `1`), `limit` (default `10`, max `20`).

**Success response, `200`:** Same post shape as the main feed, plus a `savedAt` timestamp on each entry showing when it was bookmarked (separate from the post's own `createdAt`). `isLiked`/`isSaved` are **not** included here (every post in this list is implicitly saved, and like status is not checked).

If nothing is saved yet, `data` is `[]` and the message becomes `"You have not saved any posts yet"`.

**Use case:** "Saved Posts" tab, typically on the user's own profile or a bookmarks icon in the main navigation.

---

### 5.4 Daily Tips (new)

Mounted at `/api/tips`. A single endpoint that returns up to 5 short, personalized farming tips for "today" (using the Africa/Accra calendar day, not the server's local day or UTC). Tips are scored against the user's preferred crops, their saved community region, the current month/season, and any diseases they've recently been diagnosed with, then Gemini re-ranks and lightly rewrites the top candidates for relevance. If Gemini is unavailable, the backend falls back to its own rules-based ranking, so this endpoint should not go fully empty just because the AI call failed.

#### `GET /api/tips/today`

- **Auth required:** Yes

**Success response, `200`:**

```json
{
  "success": true,
  "date": "2026-08-01",
  "tips": [
    {
      "id": "cltip1...",
      "title": "Watch for Northern Leaf Blight this week",
      "body": "Humidity is high across the Ashanti region right now. Check the underside of maize leaves for long gray-green lesions and improve airflow between plants if you spot any.",
      "order": 1,
      "themes": ["fungal", "prevention"],
      "cropTypes": ["MAIZE"],
      "personalized": true
    }
  ],
  "fromCache": false,
  "message": "Today's tips ready."
}
```

**Field notes:**

| Field | Meaning |
|---|---|
| `date` | `YYYY-MM-DD`, always in the `Africa/Accra` timezone, this is the cache key, calling this endpoint again on the same Accra calendar day always returns the same tips |
| `fromCache` | `true` if this exact response was already generated earlier today and is being replayed from the cache, `false` if it was just computed. Both cases return the same response shape, this is informational only, you do not need to branch your UI on it |
| `personalized` | `true` if Gemini actually rewrote this tip's title/body specifically for this user, `false` if it's the original tip text served as-is (either because Gemini left it unchanged, or because the rules-only fallback was used) |
| `themes` / `cropTypes` | Optional metadata you can use for a small badge or icon on the tip card, not guaranteed to be non-empty |

**Behavior notes:**

- Calling this endpoint multiple times on the same Accra day always returns the identical tip set (and the identical order), it is not re-randomized per request. A new set is only generated the first time it's called after the Accra date rolls over.
- The backend tracks which tip IDs a user has already been served and avoids repeating the same tip for 14 days, so tips genuinely rotate over time rather than always showing the same 5.
- `tips` can contain fewer than 5 items only if the seeded tip pool itself is smaller than 5 for that user's context, this should be rare after the pool is properly seeded.

**Error responses:**

| Status | Scenario | Message |
|---|---|---|
| `404` | The seeded tip pool is completely empty (nothing to serve at all) | `"No tips available yet. Please seed the daily tips pool and try again."` |
| `400` | User record not found for the token's `userId` (should not normally happen for a valid token) | `"User not found"` |

**Use case:** A "Today's Tips" card on the home screen, ideally shown alongside or just below the weather risk summary, since both features already pull from the same preferred-crops and region context.

---

### 5.5 Disease Detection

#### `POST /api/detect`

This is the core feature. It uploads a plant image, runs it through a three-layer pipeline (exact-hash cache, then perceptual-hash similarity cache, then a live Gemini AI call with retries), and returns a structured diagnosis. The response language matches the user's saved `language` preference (`en` or `tw`).

As of this version, this endpoint supports two modes:

- **Normal scan:** you pre-select a `cropType` (e.g. `"MAIZE"`), and the AI verifies the image actually matches that crop before diagnosing.
- **FREE scan (new):** you send `cropType: "FREE"`, and the AI identifies what crop is in the image itself, with no pre-selection needed. This is the backend piece for a "just take a photo" flow where the user does not need to know or choose their crop type first.

- **Auth required:** Yes
- **Content-Type:** `multipart/form-data` (this is the one endpoint that is NOT JSON)

**Form fields:**

| Field | Type | Required | Validation |
|---|---|---|---|
| `image` | file | Yes | Image file under the configured max size (server default 5MB, controlled by `MAX_IMAGE_SIZE_MB` env var). Must have an `image/*` mimetype (jpg, png, webp, jpeg all work) |
| `cropType` | string | Yes | One of the eleven `CropType` enum values, including `FREE` for auto-detect mode. **Validate this client-side before submitting**, see Important Behavior Note 1 |
| `notes` | string | No | Free text, currently stored but not yet used in the diagnosis prompt |

**Optional query param:**

| Param | Type | Notes |
|---|---|---|
| `demo` | `"true"` | Forces demo mode, bypasses all caching and the live AI call, returns a placeholder failure response. Useful for pitch/demo days when you don't want to burn API quota or risk a slow AI response, but it always returns `success: false`, so don't wire this into your normal user flow, only use it for a specific "demo mode" toggle if your supervisor wants to see a fast offline-style fallback |

**Example request, normal scan (using FormData on React Native / fetch):**

```js
const formData = new FormData();
formData.append("image", {
  uri: imageUri,
  name: "photo.jpg",
  type: "image/jpeg",
});
formData.append("cropType", "MAIZE");

fetch("http://localhost:3100/api/detect", {
  method: "POST",
  headers: {
    Authorization: `Bearer ${token}`,
    // do NOT manually set Content-Type for multipart, let fetch set the boundary
  },
  body: formData,
});
```

**Example request, FREE scan:** identical to above except `formData.append("cropType", "FREE")`, no other field changes needed.

**Success response, `200`, normal scan:**

```json
{
  "success": true,
  "id": "cl9y2...",
  "imageUrl": "https://res.cloudinary.com/.../detections/abc.jpg",
  "isCorrectCrop": true,
  "detectedCrop": "MAIZE",
  "detectedCropEnum": "MAIZE",
  "cropVerificationReason": "Leaf shape and venation match maize.",
  "diseaseName": "Northern Leaf Blight",
  "confidence": 0.82,
  "possibleDiseases": [
    { "name": "Northern Leaf Blight", "confidence": 0.82 },
    { "name": "Gray Leaf Spot", "confidence": 0.11 }
  ],
  "symptoms": "Long, elliptical gray-green lesions on leaves.",
  "causes": "Caused by the fungus Exserohilum turcicum, favored by humid conditions.",
  "organicTreatments": "Remove and destroy infected leaves, rotate crops next season.",
  "chemicalOptions": "Apply a fungicide containing azoxystrobin if severe.",
  "prevention": "Plant resistant maize varieties, avoid overhead irrigation.",
  "localNotes": "Common during the rainy season in the Ashanti region.",
  "timestamp": "2026-06-21T12:10:00.000Z",
  "suggestAddToMyCrops": {
    "suggested": false,
    "cropType": "MAIZE",
    "message": "This crop is already in your My Crops. Great job tracking your farm!"
  },
  "fromCache": false
}
```

`detectedCropEnum` is a new field present on every successful response now, for a normal scan it always echoes back the `cropType` you submitted.

**Success response, `200`, FREE scan:** same shape as above, with these differences:

- `detectedCrop` is whatever plant name Gemini identified (e.g. `"Cassava"`), not necessarily matching anything you sent, since you didn't send a real crop.
- `detectedCropEnum` is the identified crop mapped to a known enum value (e.g. `"CASSAVA"`), or the literal string `"UNKNOWN"` if Gemini identified a plant that isn't one of the ten supported crop types.
- `suggestAddToMyCrops` will be **absent from the response entirely** (not `null`, just not present as a key) if `detectedCropEnum` came back `"UNKNOWN"`, since there's no valid crop to suggest adding. Check for the key's existence before reading it, don't assume it's always there for FREE scans.

`fromCache: true` and `isFallback: true` may also appear if the result came from the cache layers or from a similar-result fallback after an AI outage, design your UI to optionally show a small "cached result" badge when `fromCache` is true, this is good for setting accurate user expectations.

**Error responses:**

| Status | Scenario | Body |
|---|---|---|
| `400` | No `image` file attached | `{ "success": false, "message": "Image file is required" }` |
| `400` | Image does not match the selected `cropType`, normal scan only (AI determined it's a different plant) | `{ "success": false, "errorType": "CROP_MISMATCH", "message": "The uploaded image does not match the selected crop (MAIZE).", "detectedCrop": "TOMATO", "reason": "Leaf shape matches tomato, not maize." }` |
| `400` | No recognizable plant in the image at all, FREE scan only (new error type) | `{ "success": false, "errorType": "NO_PLANT_DETECTED", "message": "No recognizable plant or crop was detected in the image. Please take a clear photo of a plant.", "detectedCrop": "...", "reason": "..." }` |
| `400` | Demo mode was requested | `{ "success": false, "errorType": "DEMO_MODE", "message": "Demo mode is active. Please pre-populate cache with common crops for presentation.", "suggestion": "Use real mode or seed cache for reliable demo." }` |
| `400` | All 3 AI retry attempts failed and no fallback cache exists for this crop/language | `{ "success": false, "errorType": "AI_UNAVAILABLE", "message": "Our AI service is currently experiencing high traffic. Please try again in a few moments.", "suggestion": "Common diseases for this crop are available in the community section." }` |
| `500` | Missing/invalid `cropType`, multer file-size limit exceeded, multer file-type rejection, or any unexpected error | Generic message from the global error handler, see Important Behavior Note 1 |

**Offline behavior note:** This endpoint always requires a live network call (image upload to Cloudinary plus, usually, a Gemini API call), it cannot work fully offline today. If full offline disease detection is a hard requirement for your final-year project scope, that needs an on-device model (e.g. TensorFlow Lite) as a separate feature, this backend endpoint is cloud-only. Flag this with your supervisor/backend dev early since it affects your project's claimed offline capability.

**Use case:** Camera scan screen, the main feature flow. With FREE scan now available, you can design the flow either way: ask the user to pick a crop first (normal scan), or let them just take a photo and confirm the crop afterward (FREE scan, then use `suggestAddToMyCrops` to offer adding it).

---

### 5.6 Weather

#### `GET /api/weather/forecast`

Returns a 7-day forecast (sourced from Open-Meteo, no API key required on their end) plus a rule-based disease risk assessment per crop the user has marked as preferred.

**⚠️ The risk model behind this endpoint was rewritten since the last version of this doc, response shape is unchanged, but the content is significantly better. If you already built the weather screen, you do not need to change any code, just be aware the risk messages are now crop-specific and language-aware.**

- **Auth required:** Yes

**Query params (both optional):**

| Param | Type | Notes |
|---|---|---|
| `lat` | string (numeric) | Latitude, overrides the user's saved profile location for this request |
| `lon` | string (numeric) | Longitude, overrides the user's saved profile location for this request |

If neither is provided, the backend falls back to `profile.location` saved at registration. If that's also missing, see the `LOCATION_MISSING` error below.

**Example request:** `GET /api/weather/forecast?lat=6.6885&lon=-1.6244`

**Success response, `200`:**

```json
{
  "success": true,
  "data": {
    "location": { "latitude": 6.6885, "longitude": -1.6244 },
    "current": {
      "time": "2026-06-21T16:00",
      "interval": 900,
      "temperature_2m": 25.6,
      "relative_humidity_2m": 89,
      "apparent_temperature": 29.7,
      "precipitation": 0.3,
      "weather_code": 55,
      "weatherDescription": "Dense Drizzle"
    },
    "daily": {
      "time": ["2026-06-21", "2026-06-22", "..."],
      "temperature_2m_max": [32.5, 31.0],
      "temperature_2m_min": [24.2, 23.8],
      "precipitation_sum": [12.0, 20.5],
      "precipitation_probability_max": [100, 90],
      "relative_humidity_2m_max": [98, 96],
      "weather_code": [95, 81],
      "weatherDescriptions": ["Unknown", "Slight Rain Showers"]
    },
    "riskInsights": [
      {
        "crop": "MAIZE",
        "riskLevel": "High",
        "message": "High risk of fungal diseases (e.g. leaf blight). Consider preventive spray.",
        "factors": ["High humidity", "High rain probability"]
      }
    ],
    "overallSummary": "Current temperature is around 26°C with 89% humidity. The coming days will be quite wet. High disease risk for MAIZE. Take preventive actions."
  }
}
```

A few field notes worth knowing for the UI: `weather_code` is the raw WMO numeric code (not all codes are mapped, unmapped codes like `95` show as `"Unknown"`, you may want to extend this map or handle `"Unknown"` gracefully in the UI).

**🆕 `riskLevel` is now computed by a dedicated risk profile for every one of the 10 real crop types**, not just `MAIZE`, `CASSAVA`, and `COCOA` as before. Each crop (`MAIZE`, `TOMATO`, `CASSAVA`, `PLANTAIN`, `PEPPER`, `COCOA`, `RICE`, `YAM`, `GROUNDNUT`, `ONION`) has its own thresholds for 3-day max humidity, number of "wet" days (rain probability 50%+) in the next 3 days, 3-day max rain probability, and for some crops an ideal temperature band, all tuned per crop against its own primary disease(s), e.g. Black Pod for cocoa, Black Sigatoka for plantain, blast/bacterial leaf blight for rice. It is still a rules-based heuristic, not a machine-learning model, present it as "today's risk estimate" rather than a guaranteed forecast, but it is meaningfully more accurate per crop than the old single-threshold version. `High` requires multiple factors to line up at once (deliberately conservative, so farmers trust the alert), `Medium` fires on a weaker single or partial signal, everything else is `Low`. `factors` is a short array of plain-language reasons contributing to the score (e.g. `"High humidity"`, `"Multiple wet days ahead"`), useful for showing "why" under the risk badge in the UI.

**🆕 Risk messages and `factors` are now returned in the user's saved language automatically.** If the logged-in user's `language` field (see `PUT /api/auth/language`, section 5.1) is `"tw"`, every string inside `riskInsights[].message`, `riskInsights[].factors`, and the top-level `overallSummary` comes back in Twi instead of English, with no extra query param needed, the backend reads the user's saved preference server-side. Previously this entire endpoint was English-only regardless of the user's language setting.

**Error responses:**

| Status | Scenario | Body |
|---|---|---|
| `400` | No `lat`/`lon` given and the user has no saved profile location | `{ "success": false, "message": "No location found. Please update your farm location in your profile.", "errorType": "LOCATION_MISSING" }` |
| `400` | Open-Meteo API call failed, or any unexpected error in the service | `{ "success": false, "message": "Unable to fetch weather data at the moment. Please try again later.", "errorType": "WEATHER_FETCH_FAILED" }` |

**Use case:** Weather screen, plus a home-screen risk summary widget pulling `overallSummary` and `riskInsights`.

---

### 5.7 Notifications

All routes mounted at `/api/notifications`.

#### `GET /api/notifications`

- **Auth required:** Yes

**Query params (both optional):**

| Param | Type | Default | Notes |
|---|---|---|---|
| `limit` | string (numeric) | `20` | No upper bound enforced server-side, keep this reasonable on the frontend (e.g. cap requests at 50) |
| `unreadOnly` | string | `"false"` | Must be the literal string `"true"` to filter, any other value is treated as false |

**Example request:** `GET /api/notifications?limit=10&unreadOnly=true`

**Success response, `200`:**

```json
{
  "success": true,
  "data": [
    {
      "id": "cl9z1...",
      "userId": "cl9x8...",
      "type": "HIGH_RISK",
      "title": "High Disease Risk Alert",
      "message": "Conditions are favorable for fungal disease in your maize crop.",
      "priority": "HIGH",
      "isRead": false,
      "expiresAt": null,
      "actionLink": "/weather",
      "metadata": null,
      "sentAt": "2026-06-21T06:00:00.000Z"
    }
  ],
  "count": 1
}
```

**Error responses:**

| Status | Scenario | Message |
|---|---|---|
| `500` | Unexpected error, passed through the global handler | Generic message, see section 2 |

**Use case:** Notifications/inbox screen, plus an unread-count badge using `unreadOnly=true` combined with `count`.

---

#### `PATCH /api/notifications/:id/read`

Marks a single notification as read.

- **Auth required:** Yes

**URL param:**

| Param | Type | Notes |
|---|---|---|
| `id` | string | The notification's `id` |

**Example request:** `PATCH /api/notifications/cl9z1.../read`

**Success response, `200`:**

```json
{ "success": true, "message": "Notification marked as read" }
```

**Error responses:**

| Status | Scenario | Message |
|---|---|---|
| `500` | Notification ID doesn't belong to this user, or doesn't exist, Prisma throws a "record not found" error which is not caught explicitly and falls through to the generic handler | Generic message, see section 2. Flag to your backend dev that this case ideally should return a clean `404`, currently it will look like a server error to the user |

**Use case:** Tapping a notification to dismiss its unread state.

---

#### `POST /api/notifications/trigger`

Manually runs the daily alert generation job for all users. See Important Behavior Note 11, this is a dev/testing utility, not a real user-facing feature, do not wire a button to this in the production app. For context, the real cron job runs automatically every day at 5:30 AM Ghana time (`Africa/Accra`), this endpoint just lets you force it to run immediately for testing.

**⚠️ Changed - this now also sends a real push notification, not just a database row.** For every alert generated, `processDailyAlerts` (in `utils/cron.ts`) writes the `Notification` row as before, then calls `pushService.sendToUser()`, which looks up every `PushToken` on file for that user and sends an Expo push notification carrying the same title, message, and `actionLink`/`type` as `data`. If the user has no registered push token, this step is silently skipped, no error is thrown. Registering a token via the endpoints below is what makes this actually reach a device.

- **Auth required:** Yes (but no admin-role check currently enforced)

**Success response, `200`:**

```json
{ "success": true, "message": "Manual alert trigger executed. Check server logs." }
```

**Use case:** Only useful while testing the notification system locally, to force-generate alert data without waiting for the cron schedule, and now also to confirm push delivery is working end to end during development.

---

#### `PUT /api/notifications/push-token`

🆕 **New endpoint.** Registers (or re-registers) the current device's Expo push token against the logged-in user, so they receive push notifications for future alerts.

- **Auth required:** Yes
- **Content-Type:** `application/json`

**Body:**

| Field | Type | Required | Validation |
|---|---|---|---|
| `token` | string | Yes | Non-empty string. Should be the value returned by `expo-notifications`' `getExpoPushTokenAsync()` on the device |

**Example request:**

```json
{ "token": "ExponentPushToken[xxxxxxxxxxxxxxxxxxxxxx]" }
```

**Success response, `200`:**

```json
{ "success": true, "message": "Push token registered." }
```

Internally this is an upsert keyed on the token itself (`token` is a unique column), so calling this again with the same token just updates which user it belongs to, see Important Behavior Note 20 for what that means if the same device is shared between accounts.

**Error responses:**

| Status | Scenario | Message |
|---|---|---|
| `400` | `token` missing or not a string | `"A valid push token is required."` |
| `401` | Missing/invalid token | Same as other protected routes |

**Use case:** Call this once, right after the user grants notification permission (and again after every successful login, per Important Behavior Note 20), so the Expo push token on the device is always tied to whichever account is currently logged in.

---

#### `DELETE /api/notifications/push-token`

🆕 **New endpoint.** Removes a push token from the database entirely, so that device stops receiving push notifications.

- **Auth required:** Yes
- **Content-Type:** `application/json`

**Body:**

| Field | Type | Required | Validation |
|---|---|---|---|
| `token` | string | Yes | Non-empty string, the same token that was registered |

**Example request:**

```json
{ "token": "ExponentPushToken[xxxxxxxxxxxxxxxxxxxxxx]" }
```

**Success response, `200`:**

```json
{ "success": true, "message": "Push token removed." }
```

Note this deletes by token value only, not scoped to the logged-in user, any authenticated request with a matching token will remove it. This is fine for the current single-purpose use case (a user logging out on their own device).

**Error responses:**

| Status | Scenario | Message |
|---|---|---|
| `400` | `token` missing or not a string | `"A valid push token is required."` |
| `401` | Missing/invalid token | Same as other protected routes |

**Use case:** Call this on logout, and optionally when the user turns off notifications in the app's own settings screen (as a faster alternative to waiting for the automatic `DeviceNotRegistered` cleanup described in Important Behavior Note 22).

---

#### `DELETE /api/notifications/clear-all` (new)

🆕 **New endpoint.** Deletes every notification row belonging to the logged-in user, both read and unread. This is a hard delete, there is no "archive" or undo.

- **Auth required:** Yes

**Success response, `200`:**

```json
{ "success": true, "message": "All alerts cleared.", "count": 6 }
```

`count` tells you exactly how many notifications were removed, useful for a quick "6 notifications cleared" toast.

**Error responses:**

| Status | Scenario | Message |
|---|---|---|
| `401` | Missing/invalid token | Same as other protected routes |
| `500` | Unexpected DB error | Passed through to the generic error handler |

**Use case:** "Clear all" button on the notifications screen, typically behind a confirmation dialog since this cannot be undone. After a successful call, immediately clear the local notifications list and reset any unread badge count to 0 rather than waiting for a fresh `GET /api/notifications` round trip.

---

### 5.8 Text to Speech (Twi)

#### `POST /api/tts/generate`

Proxies a request to the Ghana NLP translation API to synthesize Twi speech audio from text. Used to read diagnosis results aloud in Twi, useful for low-literacy users.

**✅ Fixed - the backend now calls the current, non-deprecated Ghana NLP (Khaya AI) operation.** It previously called `/tts/v1/tts`, which is deprecated on their portal and could intermittently return an HTML or JSON error page instead of audio bytes. It now calls `/tts/v1/synthesize`, and explicitly checks the response `content-type` before trusting it, returning a clean `502` if the upstream service did not actually return audio. The request body and success response shape you already built against are unchanged, this is a reliability fix, not a contract change.

- **Auth required:** Yes
- **Content-Type:** `application/json`

**Body:**

| Field | Type | Required | Validation |
|---|---|---|---|
| `text` | string | Yes | Non-empty after trimming |
| `language` | string | No | Defaults to `"tw"`. Currently any other value is rejected (see Important Behavior Note 13) |

**Example request:**

```json
{ "text": "Wo abɛ no yare Northern Leaf Blight.", "language": "tw" }
```

**Success response, `200`:**

```json
{
  "success": true,
  "audioBase64": "UklGRiQA...",
  "format": "wav",
  "message": "TTS generated successfully"
}
```

`audioBase64` is a base64-encoded WAV file. On React Native, write it to a temp file (e.g. with `expo-file-system`) or feed it to an audio player that accepts base64 data URIs, then play it with `expo-av` or `expo-audio`.

**Error responses:**

| Status | Scenario | Message |
|---|---|---|
| `400` | Empty or missing `text` | `"Text is required for TTS"` |
| `400` | `language` is anything other than `"tw"` | `"Only Twi (tw) supported currently"` |
| `502` | 🆕 Upstream Ghana NLP call responded, but with something other than audio (error page, rate-limit message, etc.) | `"Speech service is temporarily unavailable. Please try again later."` |
| `500` | Ghana NLP API call failed outright (network error, key issue, thrown exception) | `"Failed to generate speech. Please try again."` |

**Use case:** "Listen in Twi" button on the diagnosis result screen, paired with translated diagnosis text.

---

### 5.9 Health Check

#### `GET /`

Not under `/api`, this is the server root.

- **Auth required:** No

**Success response, `200`:**

```json
{
  "success": true,
  "message": "Crop Guardian server running!!",
  "environment": "dev",
  "timestamp": "2026-07-12T12:00:00.000Z"
}
```

**Use case:** Uptime checks, confirming the backend is reachable before showing a "can't connect" error in the app, or in a CI/CD smoke test.

---

## 6. Endpoint Quick Reference

| Method | Path | Auth | Body Type |
|---|---|---|---|
| POST | `/api/auth/register` | No | JSON |
| POST | `/api/auth/login` | No | JSON |
| GET | `/api/auth/me` | Yes | None |
| PUT | `/api/auth/language` | Yes | JSON |
| POST | `/api/auth/forgot-password` | No | JSON |
| POST | `/api/auth/verify-reset-otp` | No | JSON |
| POST | `/api/auth/reset-password` | No | JSON |
| PUT | `/api/auth/profile` | Yes | JSON |
| PUT | `/api/auth/avatar` | Yes | multipart/form-data |
| GET | `/api/crops/my-crops` | Yes | None |
| POST | `/api/crops/my-crops` | Yes | JSON |
| PATCH | `/api/crops/my-crops/:cropType` | Yes | JSON |
| DELETE | `/api/crops/my-crops/:cropType` | Yes | None |
| GET | `/api/crops/my-crops/:cropType/history` | Yes | Query params only |
| GET | `/api/community/tags` | No | None |
| POST | `/api/community/posts` | Yes | multipart/form-data |
| GET | `/api/community/posts` | No (isLiked/isSaved need auth) | Query params only |
| GET | `/api/community/posts/:postId` | No (isLiked/isSaved need auth) | None |
| GET | `/api/community/users/me/posts` | Yes | Query params only |
| DELETE | `/api/community/posts/:postId` | Yes | None |
| POST | `/api/community/posts/:postId/comments` | Yes | JSON |
| POST | `/api/community/comments/:commentId/replies` | Yes | JSON |
| GET | `/api/community/posts/:postId/comments` | No | Query params only |
| DELETE | `/api/community/comments/:commentId` | Yes | None |
| POST | `/api/community/comments/:commentId/helpful` | Yes | None |
| DELETE | `/api/community/comments/:commentId/helpful` | Yes | None |
| POST | `/api/community/comments/:commentId/solved` | Yes | None |
| DELETE | `/api/community/comments/:commentId/solved` | Yes | None |
| POST | `/api/community/posts/:postId/like` | Yes | None |
| DELETE | `/api/community/posts/:postId/like` | Yes | None |
| GET | `/api/community/posts/:postId/likes` | No | Query params only |
| POST | `/api/community/posts/:postId/save` | Yes | None |
| DELETE | `/api/community/posts/:postId/save` | Yes | None |
| GET | `/api/community/saved` | Yes | Query params only |
| GET | `/api/tips/today` | Yes | None |
| POST | `/api/detect` | Yes | multipart/form-data |
| GET | `/api/weather/forecast` | Yes | Query params only |
| GET | `/api/notifications` | Yes | Query params only |
| PATCH | `/api/notifications/:id/read` | Yes | None |
| POST | `/api/notifications/trigger` | Yes (dev only) | None |
| PUT | `/api/notifications/push-token` | Yes | JSON |
| DELETE | `/api/notifications/push-token` | Yes | JSON |
| DELETE | `/api/notifications/clear-all` | Yes | None |
| POST | `/api/tts/generate` | Yes | JSON |
| GET | `/` | No | None |

Rows for `forgot-password`, `verify-reset-otp`, and `reset-password` were added three versions ago. The two `push-token` rows and the `profile`/`avatar` rows were added two versions ago. **All 19 `/api/community/*` rows, the `/api/tips/today` row, and the `clear-all` row are new in this version.**

---

## 7. Suggested Postman Setup

1. Create a Postman environment with three variables: `baseUrl` (e.g. `http://localhost:3100`), `token` (leave blank initially), and `resetToken` (leave blank initially, used only during the password reset flow).
2. In the `POST /api/auth/login` request, add a "Tests" script to auto-save the token:
   ```js
   const data = pm.response.json();
   if (data.success) {
     pm.environment.set("token", data.token);
   }
   ```
3. In the `POST /api/auth/verify-reset-otp` request, add a similar script to auto-save `resetToken`:
   ```js
   const data = pm.response.json();
   if (data.success) {
     pm.environment.set("resetToken", data.resetToken);
   }
   ```
4. On every protected request, set the Authorization header to `Bearer {{token}}` (Postman's "Bearer Token" auth type works too, just paste `{{token}}` as the value).
5. Suggested test order for a full end-to-end pass: register, login, get me, update profile, upload avatar, add a crop, get my crops, run a normal detection on that crop, run a FREE scan detection, get crop history, get weather forecast, get notifications, generate TTS audio, then separately walk through forgot-password, verify-reset-otp, and reset-password with a test account.
6. For `POST /api/detect`, use Postman's `form-data` body type (not `raw` or `x-www-form-urlencoded`), set the `image` field type to "File" and pick a real plant photo, and add a text field for `cropType` (try both a real crop like `MAIZE` and the value `FREE` to test both modes).
7. For the password reset flow, since OTPs are only logged to the server console right now (Important Behavior Note 16), you will need terminal access to the running backend to read the OTP code during testing, it will not be delivered anywhere else yet.

---

## 8. Things to Confirm With the Backend Dev Before You Build Against This

- The exact `PORT` value in their local `.env`, and the deployed `SERVER_URL` once hosted.
- Whether `POST /api/notifications/trigger` will get an admin-role guard before production, or be removed from the router entirely (see Important Behavior Note 11).
- Whether the `500`-on-validation-error behavior for `POST /api/detect` (Important Behavior Note 1) will be fixed to return a proper `400`, since right now your client-side validation is the only thing protecting users from seeing a generic error message there.
- Whether registration will be updated to normalize the phone number the same way password reset does (Important Behavior Note 4), this is worth prioritizing since it can silently lock users out of password reset.
- Whether real SMS delivery (e.g. via Arkesel) will be wired up before your final demo, or whether the console-log OTP approach is acceptable to show your supervisor.
- 🆕 Whether the app-side Firebase (FCM V1) credentials and `expo-notifications` permission priming flow are ready. The backend's half of push delivery (token storage plus the Expo push send call in `pushService.ts`) is done, but it only works end to end once the app registers a real token, which requires Firebase set up in the EAS project on the frontend.
- 🆕 Whether `PushToken` rows should ever be scoped to a specific installation vs. account, right now one physical device can only ever be linked to one user at a time (Important Behavior Note 20), confirm this matches the intended multi-user-per-device behavior (e.g. a shared family phone) before launch.
- 🆕 **Whether a `communityRegion` setting field will be added anywhere in the app.** No current endpoint lets a user set `Profile.communityRegion` (Important Behavior Note 27), which means the region-based filtering on `GET /api/community/posts?region=...` and the region-based scoring in Daily Tips can never actually match for any real user unless this gets fixed. This is worth prioritizing since it silently weakens two features at once.
- 🆕 **Whether comment/reply notifications (`POST_COMMENTED`, `COMMENT_REPLIED`) will be implemented before launch.** The enum values exist in `schema.prisma` but nothing in `communityService.ts` creates them yet (Important Behavior Note 31), only likes and helpful/solved marks currently notify anyone.
- 🆕 **Whether there will be any content moderation on community posts or comments.** As of this commit there is no profanity filter, image moderation, or report/flag mechanism anywhere in `communityService.ts`, any logged-in user can post any text (up to 2000 characters) and up to 3 images. Confirm whether this is acceptable for a public-facing final-year demo, or whether at minimum a "Report post" endpoint and a basic word-filter are expected before other people outside your supervisor can see it.
- 🆕 **Whether the Daily Tips pool (`DailyTip` table) has actually been seeded yet**, and with how many tips. `GET /api/tips/today` returns a `404` with `"No tips available yet. Please seed the daily tips pool and try again."` if the table is empty, this is a data/seeding task, not a code task, confirm someone owns writing and inserting the initial tip content (title, body, applicable crops, regions, months, themes) before you build the "Today's Tips" screen against it.
- 🆕 Whether `POST /api/community/posts` should have any rate limiting. Right now a user can create posts back to back with no cooldown, worth flagging if spam is a concern for the demo, even a simple per-user per-minute limit would help.

---

*Generated from a direct read of the source code in `kameyaw14/crop-disease-backend`, commit `b9cc592`, 2026-08-07. Re-verify against the live code if the backend has been updated since.*