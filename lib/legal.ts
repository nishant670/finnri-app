/**
 * The public legal pages, which live on the marketing site rather than in the
 * app.
 *
 * Play's user-generated content policy requires that people accept the terms
 * before they can create content others will see, and a shared split group is
 * exactly that. The welcome screen therefore links to both pages, so accepting
 * is an informed act rather than a claim buried in a policy nobody can reach.
 *
 * Hard-coded rather than derived from `EXPO_PUBLIC_API_URL`, because the API
 * host (`api.finnri.app`) and the site host are different origins and a build
 * pointed at a staging API must still show the real, published terms.
 */
export const TERMS_URL = 'https://finnri.app/terms';
export const PRIVACY_URL = 'https://finnri.app/privacy';
