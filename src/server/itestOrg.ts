// The org the integration tests file their staff and leads under: LWS Pune,
// where the real leads live and the tests always wrote. A lead written with
// the service key must name its org, and a login without one sees nothing
// (migration 0030). orgs.itest.ts makes throwaway orgs of its own instead.
export const ITEST_ORG = 'b31b8575-91c2-434a-b025-a7d12d3c0988'

// A second real org, for a test that needs an outsider: LWS Delhi. Only
// throwaway logins and rows go in it, and each test file deletes its own.
export const ITEST_OTHER_ORG = '787f94d7-8d1b-4c45-a11d-b85916b7ccff'
