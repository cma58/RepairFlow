'use strict';
// Public identifiers of the ONE reviewed, non-default Neon branch and its Vercel
// preview (draft PR #28). Used by the preview-only owner test login and by the
// provider tests. Nothing here is a secret. Change only after a new isolation review.
//
// The owner-confirmed test identity is pinned by its Neon Auth user ID on the
// ISOLATED auth branch plus the SHA-256 of its normalised e-mail address. The
// repository is public, so the address itself is not stored in readable form; the
// owner types it on the test page and CI receives it as an environment secret.
module.exports=Object.freeze({
 GIT_BRANCH:'test/p0-webauthn-browser-e2e-recovery',
 AUTH:'https://ep-broad-breeze-bajrzvnc.neonauth.c-8.eu-central-1.aws.neon.tech/neondb/auth',
 ORIGIN:'https://repair-flow-git-test-p0-weba-6c78f5-aminechtaiti-3069s-projects.vercel.app',
 EMAIL_SHA256:'7a2f8dce73615680482d5409be470dab1cd9e05118f2ce36bc875fa41d74e2d9',
 USER_ID:'f91abfab-2bdb-4e7b-ac67-cca276b472b6',
 EXPECTED_ROLE:'manager',
 ORGANIZATION_ID:'11111111-1111-4111-8111-111111111111',
 ORGANIZATION_NAME:'PHIXAR isolation test',
 BRANCH_ID:'22222222-2222-4222-8222-222222222222',
 DATABASE_NAME:'neondb',
 DATABASE_HOSTS:Object.freeze([
  'ep-broad-breeze-bajrzvnc.c-8.eu-central-1.aws.neon.tech',
  'ep-broad-breeze-bajrzvnc-pooler.c-8.eu-central-1.aws.neon.tech'
 ])
});
