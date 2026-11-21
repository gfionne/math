# Firestore Security Specification

## 1. Data Invariants
1. **Default-Deny Catch-All**: All paths not explicitly matched deny both read and write.
2. **Email Verification & Institutional Domain Gate**: Both `isAdmin()` and `isSchoolMember()` strictly require `request.auth != null && request.auth.token.email_verified == true`. `isSchoolMember()` strictly validates `^[^@]+@hmes\.tp\.edu\.tw$`.
3. **Private Community Meetings (`/meetings/{meetingId}`)**:
   - Readable (`get`, `list`) ONLY by `isAdmin() || isSchoolMember()`. Unauthenticated visitors and non-`@hmes.tp.edu.tw` accounts receive `PERMISSION_DENIED`.
   - Writable (`create`, `update`, `delete`) ONLY by `isAdmin()`.
   - Immutable fields after creation: `createdAt`, `createdByUid`. `updatedAt` must equal `request.time`.
4. **Meeting Check-Ins (`/meetingCheckins/{checkinId}`)**:
   - Deterministic ID invariant: `checkinId == incoming().meetingId + '_' + request.auth.uid`.
   - Master Gate invariant: A check-in cannot be created, updated (by non-admin), deleted (by non-admin), or fetched via `get` (by non-admin) unless the parent `/meetings/{meetingId}` exists; furthermore, non-admin writes require `isOpen == true` AND `request.time` to fall within optional `[checkinStartAt, checkinEndAt]`. Deleting a meeting cascades to delete all associated check-in records.
   - Identity & Anti-Spoofing invariant: `incoming().userUid == request.auth.uid` and `incoming().userEmail.lower() == request.auth.token.email.lower()`.
   - PII Isolation invariant: Check-in documents contain `userEmail`, so `get` and `list` are strictly restricted to `isAdmin()` or the owning teacher (`resource.data.userUid == request.auth.uid`).
   - Temporal Integrity invariant: `checkedInAt == request.time` on create; `checkedInAt`, `meetingId`, `userUid`, and `userEmail` are immutable on update.
   - Handwritten Signature Integrity invariant: `signatureDataUrl` is mandatory on create and must strictly match `^data:image/(png|webp|jpeg);base64,[A-Za-z0-9+/=]+$` within `[22, 200000]` bytes (no SVG/HTML/JS URLs).
5. **Site Configuration (`/siteConfig/main`) & Gallery (`/ximenGalleryItems/{itemId}`)**:
   - Strict `keys().hasAll(...) && keys().hasOnly(...)` + type & `.size()` bounds on every string and array (`lockedCategories <= 20`, `lockedNavOptions <= 10`, `hiddenOfficialAssetIds <= 50`).

## 2. Dirty Dozen Adversarial Payloads (Must All Return PERMISSION_DENIED)
1. **Unauthenticated read of `/meetings/mtg_1`**: Missing auth -> denied.
2. **Personal Gmail (`user@gmail.com`) read/list of `/meetings`**: Non-`hmes.tp.edu.tw` domain and non-admin -> denied.
3. **Unverified email spoof (`email: "someone@hmes.tp.edu.tw", email_verified: false`)**: Fails `isVerifiedUser()` -> denied.
4. **Non-admin `@hmes.tp.edu.tw` attempting to create/close a meeting (`/meetings/mtg_2`)**: Fails `isAdmin()` -> denied.
5. **Admin update on `/meetings/mtg_1` modifying `createdByUid` or `createdAt`**: Fails immutability & `affectedKeys().hasOnly(...)` -> denied.
6. **Check-in with random/forged ID (`meetingCheckins/random123`)**: Fails `checkinId == incoming().meetingId + '_' + request.auth.uid` -> denied.
7. **Check-in impersonating another teacher (`userUid: "other_uid"` or `userEmail: "other@hmes.tp.edu.tw"`)**: Fails identity integrity -> denied.
8. **Check-in on non-existent or closed (`isOpen: false`) meeting**: Fails Master Gate `exists(...) && get(...).data.isOpen == true` -> denied.
9. **School member reading another teacher's check-in (`get /meetingCheckins/mtg_1_otherUid`) or blanket `list /meetingCheckins` without `where('userUid', '==', uid)`**: Fails PII isolation -> denied.
10. **Shadow update on `/meetingCheckins/{id}` adding ghost field `isAdminApproved: true`**: Fails `hasOnly(...)` schema check -> denied.
11. **Timestamp spoofing on check-in (`checkedInAt` backdated client timestamp)**: Fails `incoming().checkedInAt == request.time` -> denied.
12. **Resource exhaustion / SVG XSS / ID poisoning (`meetingId` > 128 chars, `agendaSummary` > 1000 chars, `meetUrl: "javascript:alert(1)"`, or `signatureDataUrl: "data:image/svg+xml;base64,..."` / > 200KB)**: Fails `isValidId()` / `.size()` / regex guards -> denied.
