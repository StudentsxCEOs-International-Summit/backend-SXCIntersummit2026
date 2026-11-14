/**
 * TEMPORARY, for testing the sign-up and IBCC registration flows (and their mails) on the live site.
 *
 * These addresses can:
 *  - register an account again and again: verifying the OTP reuses the existing account (auth.service);
 *  - register an IBCC team again and again: the IBCC team(s) they lead are deleted first (ibcc.service).
 *
 * Remove the address from this list once testing is done.
 */
export const REPEAT_REGISTRATION_TEST_EMAILS = new Set(['rafkiyuda@gmail.com'])

export const isRepeatRegistrationTestEmail = (email: string) =>
  REPEAT_REGISTRATION_TEST_EMAILS.has(email.trim().toLowerCase())
