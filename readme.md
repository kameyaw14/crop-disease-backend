# Crop Guardian Backend, API Testing Guide

This document was written by reading the actual source code in `kameyaw14/crop-disease-backend` (commit `229efe1`, verified 2026-06-21), not from assumptions. Every route, validation rule, and error case below was traced directly from `routes/`, `controllers/`, `services/`, and `schema/`. If the backend changes, this doc needs to be re-verified against the new code.

Give this whole file to your frontend developer. It is written so they can build the API client and Postman collection without needing to read the backend source themselves.

---

## 1. Quick Start

**Base URL (local dev):** `http://localhost:3100`
(Port comes from the `PORT` env var, default `3100` if not set. Confirm with the backend dev which port their `.env` actually uses.)

**Base URL (production):** Ask the backend dev for the deployed `SERVER_URL`.

**Every route below (except health check, register, and login) requires this header:**

```
Authorization: Bearer <token>
```

The token is returned from `POST /api/auth/register` or `POST /api/auth/login`. There is no refresh token endpoint in this codebase, the token is simply valid for 30 days from issue. Store it securely (e.g. `expo-secure-store` on the mobile app) and attach it to every protected request.

**Content-Type:**
- All JSON endpoints: `Content-Type: application/json`
- Only `POST /api/detect` uses `multipart/form-data` (it uploads an image file). Do not send JSON to this one.

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

These are real quirks in the current backend code that will save you debugging time. They are not bugs you need to fix on the frontend, just things to design around.

1. **Detection validation errors return HTTP 500, not 400.** If you POST to `/api/detect` with a missing or invalid `cropType` (anything outside the six allowed enum values), the backend's Zod validation throws, and the controller passes it to the generic error handler, which always replies with a generic `500` message regardless of the real cause. The fix on your side: validate `cropType` against the known enum list client-side before submitting, so the user never actually sends a bad value.

2. **Login does not validate input shape before querying the database.** There is a `loginSchema` defined in the codebase but the login controller does not use it. It just reads `email` and `password` directly from the body. If either is missing, the bcrypt compare will fail and you will get a generic `"Invalid email or password"` 401, not a field-specific validation error. Validate that both fields are present client-side first.

3. **Most validation errors return a generic message, not field-level detail.** For crop endpoints (`addMyCrop`, `updateMyCrop`, etc.), any Zod validation failure is caught and replaced with a generic message like `"Invalid crop data provided."`. The backend deliberately does not leak internal error detail (this is intentional, for security). This means your frontend must do its own client-side validation matching the rules in section 5 below, since the server will not tell you which field was wrong.

4. **`updateMyCrop` and `deleteMyCrop` require the crop to already exist in the user's preferred list.** They do not auto-create. If the crop was never added via `POST /api/crops/my-crops`, both will fail with a generic 400 message.

5. **`cropType` URL params are case-normalized server-side** (`cropType.toUpperCase()`), so `/my-crops/maize/history` and `/my-crops/MAIZE/history` both work. Still, always send uppercase from the frontend to stay consistent with the enum values returned elsewhere.

6. **The detection route is mounted at `/api/detect`, not `/api/detection/detect`.** Check `server.ts`: `app.use("/api", detectionRouter)` plus the router's own `/detect` path. It is easy to assume a nested path here, it is not nested.

7. **`POST /api/notifications/trigger` is explicitly commented `// Dev only` in the source.** It manually fires the daily alert cron job for all users. It is currently behind auth (`protect` middleware) but has no admin-role check, so any logged-in user can trigger it. Do not expose this in the production frontend, and flag this to your backend dev as something to lock down (e.g. restrict to an admin role) before launch.

8. **Weather forecast needs a location, either from query params or from the user's saved profile.** If you don't pass `lat`/`lon` and the user never saved a location during registration, you'll get a `400` with `errorType: "LOCATION_MISSING"`. Always try to capture GPS location at registration time so this fallback exists.

9. **TTS (`/api/tts/generate`) currently only supports Twi (`tw`).** Sending any other `language` value returns a `400`. This is a real backend limitation right now, not a frontend bug.

10. **`preferredCrops` sent during registration is not validated against the crop enum.** Unlike the crop-tracking endpoints, `registerSchema` only checks it's a non-empty array of strings, it does not restrict values to `MAIZE`, `TOMATO`, etc. Still send only the valid enum values from your crop picker UI, since downstream features (like weather risk insights) expect those exact strings.

11. **CORS is restricted to a fixed origin list** (`CLIENT_URL` env var, plus `http://localhost:3000` and `http://localhost:3002`). If you're testing the web frontend from a different local port, ask the backend dev to add your origin, or test with Postman/curl, which are not subject to browser CORS restrictions.

---

## 4. Enum Reference

Use these exact values, they are enforced by the Postgres/Prisma enum types on the backend.

| Enum | Values |
|---|---|
| `UserRole` | `FARMER`, `BEGINNER`, `GARDENER`, `STUDENT`, `OTHER` |
| `CropType` | `MAIZE`, `TOMATO`, `CASSAVA`, `PLANTAIN`, `PEPPER`, `COCOA` |
| `CropStatus` | `HEALTHY`, `MONITORING`, `AT_RISK`, `HARVEST_READY` |
| `Language` (not a DB enum, just accepted values) | `en`, `tw` |
| `NotificationType` (read-only, set by backend) | `DAILY_SUMMARY`, `HIGH_RISK`, `CROP_SPECIFIC`, `FAVORABLE_CONDITION`, `GENERAL_ADVICE` |
| `Priority` (read-only, set by backend) | `LOW`, `MEDIUM`, `HIGH` |

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
| `phoneNumber` | string | Yes | Minimum 10 characters (no format/country-code check beyond length) |
| `role` | string | Yes | One of `UserRole` enum values |
| `preferredCrops` | string[] | Yes | At least 1 item. Not enum-validated server-side, but send valid `CropType` values |
| `location` | object | No | `{ latitude: number, longitude: number, address?: string }`. Strongly recommended, weather forecast depends on this if no lat/lon query is sent later |

**Example request:**

```json
{
  "email": "ama.farmer@example.com",
  "password": "secureP@ss123",
  "fullName": "Ama Boateng",
  "phoneNumber": "0244123456",
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
    "role": "FARMER"
  },
  "token": "eyJhbGciOi..."
}
```

**Error responses:**

| Status | Scenario | Message |
|---|---|---|
| `400` | Email already registered | `"User with this email already exists"` |
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
    "phoneNumber": "0244123456",
    "language": "en",
    "isOnboarded": true,
    "profile": {
      "fullName": "Ama Boateng",
      "location": { "latitude": 6.6885, "longitude": -1.6244, "address": "Kumasi, Ghana" },
      "preferredCrops": ["MAIZE", "CASSAVA"]
    }
  },
  "token": "eyJhbGciOi..."
}
```

Note the password hash is included in the raw `user` object returned by Prisma here, since `login()` does not `omit` it the way `getMe()` does. Do not log this response body or store it verbatim, strip the `password` field before persisting any part of this object on the client.

**Error responses:**

| Status | Scenario | Message |
|---|---|---|
| `401` | Email not found, or password incorrect | `"Invalid email or password"` (intentionally the same message for both cases, a security best practice that avoids leaking which emails are registered) |

**Use case:** Login screen.

---

#### `GET /api/auth/me`

Returns the current authenticated user's profile. Use this to restore session state on app launch after reading the token from secure storage.

- **Auth required:** Yes

**Success response, `200`:**

```json
{
  "success": true,
  "user": {
    "id": "cl9x8...",
    "email": "ama.farmer@example.com",
    "role": "FARMER",
    "phoneNumber": "0244123456",
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
  }
}
```

Password is correctly excluded here via Prisma's `omit`.

**Error responses:**

| Status | Scenario | Message |
|---|---|---|
| `401` | Missing or malformed `Authorization` header | `"Access denied. No token provided."` |
| `401` | Invalid or expired token | `"Invalid or expired token"` |
| `500` | Unexpected lookup failure | `"Failed to fetch user"` |

**Use case:** App launch / splash screen session check, profile screen.

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
| `cropType` | string | Yes | One of `CropType` enum values |
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
| `400` | Validation failure (bad enum, oversized strings, negative farm size) | `"Invalid crop data provided."` |

**Use case:** "Add a crop" form in onboarding or My Crops screen.

---

#### `PATCH /api/crops/my-crops/:cropType`

Updates fields on an existing tracked crop. Requires the crop to already be in the user's list (see Important Behavior Notes, item 4).

- **Auth required:** Yes
- **Content-Type:** `application/json`

**URL param:**

| Param | Type | Notes |
|---|---|---|
| `cropType` | string | One of `CropType` values, case-insensitive (auto-uppercased server-side) |

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

### 5.3 Disease Detection

#### `POST /api/detect`

This is the core feature. It uploads a plant image, runs it through a three-layer pipeline (exact-hash cache, then perceptual-hash similarity cache, then a live Gemini AI call with retries), and returns a structured diagnosis. The response language matches the user's saved `language` preference (`en` or `tw`).

- **Auth required:** Yes
- **Content-Type:** `multipart/form-data` (this is the one endpoint that is NOT JSON)

**Form fields:**

| Field | Type | Required | Validation |
|---|---|---|---|
| `image` | file | Yes | Image file under the configured max size (server default 5MB, controlled by `MAX_IMAGE_SIZE_MB` env var). Must have an `image/*` mimetype (jpg, png, webp, jpeg all work) |
| `cropType` | string | Yes | One of `CropType` enum values. **Validate this client-side before submitting**, see Important Behavior Note 1 |
| `notes` | string | No | Free text, currently stored but not yet used in the diagnosis prompt |

**Optional query param:**

| Param | Type | Notes |
|---|---|---|
| `demo` | `"true"` | Forces demo mode, bypasses all caching and the live AI call, returns a placeholder failure response. Useful for pitch/demo days when you don't want to burn API quota or risk a slow AI response, but it always returns `success: false`, so don't wire this into your normal user flow, only use it for a specific "demo mode" toggle if your supervisor wants to see a fast offline-style fallback |

**Example request (using FormData on React Native / fetch):**

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

**Success response, `200`:**

```json
{
  "success": true,
  "id": "cl9y2...",
  "imageUrl": "https://res.cloudinary.com/.../detections/abc.jpg",
  "isCorrectCrop": true,
  "detectedCrop": "MAIZE",
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

`fromCache: true` and `isFallback: true` may also appear if the result came from the cache layers or from a similar-result fallback after an AI outage, design your UI to optionally show a small "cached result" badge when `fromCache` is true, this is good for setting accurate user expectations.

**Error responses:**

| Status | Scenario | Body |
|---|---|---|
| `400` | No `image` file attached | `{ "success": false, "message": "Image file is required" }` |
| `400` | Image does not match the selected `cropType` (AI determined it's a different plant) | `{ "success": false, "errorType": "CROP_MISMATCH", "message": "The uploaded image does not match the selected crop (MAIZE).", "detectedCrop": "TOMATO", "reason": "Leaf shape matches tomato, not maize." }` |
| `400` | Demo mode was requested | `{ "success": false, "errorType": "DEMO_MODE", "message": "Demo mode is active. Please pre-populate cache with common crops for presentation.", "suggestion": "Use real mode or seed cache for reliable demo." }` |
| `400` | All 3 AI retry attempts failed and no fallback cache exists for this crop/language | `{ "success": false, "errorType": "AI_UNAVAILABLE", "message": "Our AI service is currently experiencing high traffic. Please try again in a few moments.", "suggestion": "Common diseases for this crop are available in the community section." }` |
| `500` | Missing/invalid `cropType`, multer file-size limit exceeded, multer file-type rejection, or any unexpected error | Generic message from the global error handler, see Important Behavior Note 1 |

**Offline behavior note:** This endpoint always requires a live network call (image upload to Cloudinary plus, usually, a Gemini API call), it cannot work fully offline today. If full offline disease detection is a hard requirement for your final-year project scope, that needs an on-device model (e.g. TensorFlow Lite) as a separate feature, this backend endpoint is cloud-only. Flag this with your supervisor/backend dev early since it affects your project's claimed offline capability.

**Use case:** Camera scan screen, the main feature flow: take/select photo, pick crop type, submit, show diagnosis result.

---

### 5.4 Weather

#### `GET /api/weather/forecast`

Returns a 7-day forecast (sourced from Open-Meteo, no API key required on their end) plus a rule-based disease risk assessment per crop the user has marked as preferred.

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

A few field notes worth knowing for the UI: `weather_code` is the raw WMO numeric code (not all codes are mapped, unmapped codes like `95` show as `"Unknown"`, you may want to extend this map or handle `"Unknown"` gracefully in the UI). `riskLevel` is computed from a simple rule (humidity over 80% and rain probability over 50% equals High), it's not a machine-learning model, just a heuristic, present it as "today's risk estimate" rather than a guaranteed forecast.

**Error responses:**

| Status | Scenario | Body |
|---|---|---|
| `400` | No `lat`/`lon` given and the user has no saved profile location | `{ "success": false, "message": "No location found. Please update your farm location in your profile.", "errorType": "LOCATION_MISSING" }` |
| `400` | Open-Meteo API call failed, or any unexpected error in the service | `{ "success": false, "message": "Unable to fetch weather data at the moment. Please try again later.", "errorType": "WEATHER_FETCH_FAILED" }` |

**Use case:** Weather screen, plus a home-screen risk summary widget pulling `overallSummary` and `riskInsights`.

---

### 5.5 Notifications

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

Manually runs the daily alert generation job for all users. See Important Behavior Note 7, this is a dev/testing utility, not a real user-facing feature, do not wire a button to this in the production app.

- **Auth required:** Yes (but no admin-role check currently enforced)

**Success response, `200`:**

```json
{ "success": true, "message": "Manual alert trigger executed. Check server logs." }
```

**Use case:** Only useful while testing the notification system locally, to force-generate alert data without waiting for the cron schedule.

---

### 5.6 Text to Speech (Twi)

#### `POST /api/tts/generate`

Proxies a request to the Ghana NLP translation API to synthesize Twi speech audio from text. Used to read diagnosis results aloud in Twi, useful for low-literacy users.

- **Auth required:** Yes
- **Content-Type:** `application/json`

**Body:**

| Field | Type | Required | Validation |
|---|---|---|---|
| `text` | string | Yes | Non-empty after trimming |
| `language` | string | No | Defaults to `"tw"`. Currently any other value is rejected (see Important Behavior Note 9) |

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
| `500` | Ghana NLP API call failed (rate limit, key issue, network) | `"Failed to generate speech. Please try again."` |

**Use case:** "Listen in Twi" button on the diagnosis result screen, paired with translated diagnosis text.

---

### 5.7 Health Check

#### `GET /`

Not under `/api`, this is the server root.

- **Auth required:** No

**Success response, `200`:**

```json
{
  "success": true,
  "message": "Crop Guardian server running!!",
  "environment": "dev",
  "timestamp": "2026-06-21T12:00:00.000Z"
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
| GET | `/api/crops/my-crops` | Yes | None |
| POST | `/api/crops/my-crops` | Yes | JSON |
| PATCH | `/api/crops/my-crops/:cropType` | Yes | JSON |
| DELETE | `/api/crops/my-crops/:cropType` | Yes | None |
| GET | `/api/crops/my-crops/:cropType/history` | Yes | Query params only |
| POST | `/api/detect` | Yes | multipart/form-data |
| GET | `/api/weather/forecast` | Yes | Query params only |
| GET | `/api/notifications` | Yes | Query params only |
| PATCH | `/api/notifications/:id/read` | Yes | None |
| POST | `/api/notifications/trigger` | Yes (dev only) | None |
| POST | `/api/tts/generate` | Yes | JSON |
| GET | `/` | No | None |

---

## 7. Suggested Postman Setup

1. Create a Postman environment with two variables: `baseUrl` (e.g. `http://localhost:3100`) and `token` (leave blank initially).
2. In the `POST /api/auth/login` request, add a "Tests" script to auto-save the token:
   ```js
   const data = pm.response.json();
   if (data.success) {
     pm.environment.set("token", data.token);
   }
   ```
3. On every protected request, set the Authorization header to `Bearer {{token}}` (Postman's "Bearer Token" auth type works too, just paste `{{token}}` as the value).
4. Suggested test order for a full end-to-end pass: register, login, get me, add a crop, get my crops, run a detection on that crop, get crop history, get weather forecast, get notifications, generate TTS audio.
5. For `POST /api/detect`, use Postman's `form-data` body type (not `raw` or `x-www-form-urlencoded`), set the `image` field type to "File" and pick a real plant photo, and add a text field for `cropType`.

---

## 8. Things to Confirm With the Backend Dev Before You Build Against This

- The exact `PORT` value in their local `.env`, and the deployed `SERVER_URL` once hosted.
- Whether `POST /api/notifications/trigger` will get an admin-role guard before production, or be removed from the router entirely (see Important Behavior Note 7).
- Whether the `500`-on-validation-error behavior for `POST /api/detect` (Important Behavior Note 1) will be fixed to return a proper `400`, since right now your client-side validation is the only thing protecting users from seeing a generic error message there.
- Whether a community/social feature (mentioned in the original project scope) has its own routes yet, none currently exist in this repository, only auth, crops, detection, weather, notifications, and TTS are implemented as of this commit.

---

*Generated from a direct read of the source code in `kameyaw14/crop-disease-backend`, commit `229efe1`, 2026-06-21. Re-verify against the live code if the backend has been updated since.*
