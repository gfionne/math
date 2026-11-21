# Firestore Security Specification

## 1. Data Invariants
1. **Default-Deny Catch-All**: All paths not explicitly matched deny both read and write.
2. **Email Verification & Institutional Domain Gate**: Both `isAdmin()` and `isSchoolMember()` strictly require `request.auth != null && request.auth.token.email_verified == true`. `isSchoolMember()` strictly validates `^[^@]+@hmes\.tp\.edu\.tw$`.
3. **Isolated Teacher Meetings (`/meetings/{meetingId}`) & Parent Sessions (`/parentMeetings/{meetingId}`)**:
   - Teacher sessions live in `/meetings`: Readable (`get`, `list`) ONLY by `isAdmin() || isSchoolMember()`. Unauthenticated visitors and non-`@hmes.tp.edu.tw` accounts cannot read teacher meetings.
   - School Day parent sessions live in `/parentMeetings` with mandatory `audience == 'parent'`: Readable (`get`, `list`) for login-free parent check-in (`resource.data.audience == 'parent'`), never mixed into teacher meeting lists.
   - Both collections are writable (`create`, `update`, `delete`) ONLY by `isAdmin()`.
   - Immutable fields after creation: `createdAt`, `createdByUid`. `updatedAt` must equal `request.time`.
4. **Teacher Meeting Check-Ins (`/meetingCheckins/{checkinId}`)**:
   - Deterministic ID invariant: `checkinId == incoming().meetingId + '_' + request.auth.uid`.
   - Master Gate invariant: Parent `/meetings/{meetingId}` must exist (and not be a `parent` session); non-admin writes require `isOpen == true` AND `request.time` to fall within `[checkinStartAt, checkinEndAt]`. Deleting a meeting cascades to delete all associated check-in records.
   - Identity & Anti-Spoofing invariant: `incoming().userUid == request.auth.uid` and `incoming().userEmail.lower() == request.auth.token.email.lower()`.
   - PII Isolation invariant: Check-in documents contain `userEmail`, so `get` and `list` are strictly restricted to `isAdmin()` or the owning teacher (`resource.data.userUid == request.auth.uid`).
   - Temporal Integrity invariant: `checkedInAt == request.time` on create; `checkedInAt`, `meetingId`, `userUid`, and `userEmail` are immutable on update.
   - Handwritten Signature Integrity invariant: `signatureDataUrl` is mandatory on create and must strictly match `^data:image/(png|webp|jpeg);base64,[A-Za-z0-9+/=]+$` within `[22, 200000]` bytes (no SVG/HTML/JS URLs).
5. **School Day Parent Check-Ins (`/parentCheckins/{checkinId}`)**:
   - Login-free Create + Strict Master Gate: Unauthenticated parents may `create` ONLY when static validation passes (`isValidId`, `isValidParentCheckin`), `checkedInAt == request.time`, `updatedAt == request.time`, target `/parentMeetings/{meetingId}` (or legacy `/meetings/{meetingId}` with `audience == 'parent'`) exists, `audience == 'parent'`, AND `isMeetingWithinWindow(...)` holds (`isOpen == true` and within `[checkinStartAt, checkinEndAt]`).
   - Zero Public / Non-Admin Read, Scrape, or Overwrite Invariant: `get`, `list`, `update`, and `delete` on `/parentCheckins` are strictly restricted to `isAdmin()`. Neither other parents nor non-admin teachers can inspect student/parent names or signatures.
6. **Site Configuration (`/siteConfig/main`) & Gallery (`/ximenGalleryItems/{itemId}`)**:
   - Strict `keys().hasAll(...) && keys().hasOnly(...)` + type & `.size()` bounds on every string and array (`lockedCategories <= 20`, `lockedNavOptions <= 10`, `hiddenOfficialAssetIds <= 50`).

## 2. Dirty Dozen Adversarial Payloads (Must All Return PERMISSION_DENIED)
1. **Unauthenticated read of teacher meeting (`/meetings/mtg_teacher`)**: Missing auth & `audience != 'parent'` -> denied.
2. **Personal Gmail (`user@gmail.com`) list of all `/meetings` without `where('audience', '==', 'parent')`**: Includes non-parent docs -> denied.
3. **Unverified email spoof (`email: "someone@hmes.tp.edu.tw", email_verified: false`)**: Fails `isVerifiedUser()` -> denied.
4. **Non-admin attempting to create/close a meeting (`/meetings/mtg_2`)**: Fails `isAdmin()` -> denied.
5. **Parent check-in targeting a `teacher` meeting or closed `parent` meeting**: Fails Master Gate `audience == 'parent' && isMeetingWithinWindow(...)` -> denied.
6. **Unauthenticated read or list of `/parentCheckins`**: Fails `isAdmin()` -> denied (zero student/parent PII leakage).
7. **Unauthenticated overwrite/update or delete on `/parentCheckins/{id}`**: Fails `isAdmin()` -> denied.
8. **Teacher check-in impersonating another teacher (`userUid: "other_uid"` or forged ID)**: Fails identity integrity -> denied.
9. **School member reading another teacher's check-in (`get /meetingCheckins/mtg_1_otherUid`)**: Fails PII isolation -> denied.
10. **Shadow update on `/parentCheckins/{id}` or `/meetingCheckins/{id}` adding ghost field `isVerified: true`**: Fails `hasOnly(...)` schema check -> denied.
11. **Timestamp spoofing (`checkedInAt` backdated client timestamp)**: Fails `incoming().checkedInAt == request.time` -> denied.
12. **Resource exhaustion / SVG XSS / ID poisoning (`studentClassAndSeat` > 80 chars, `parentName` > 80 chars, or `signatureDataUrl: "data:image/svg+xml;base64,..."` / > 200KB)**: Fails `isValidId()` / `.size()` / regex guards -> denied.
