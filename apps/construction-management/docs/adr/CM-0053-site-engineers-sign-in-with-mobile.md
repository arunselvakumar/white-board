# CM-0053 — Site Engineers sign in with their mobile number and a password; nobody is invited

- Status: accepted (2026-11-26, the owner's request)
- Date: 2026-11-26
- Amends: [CM-0037](CM-0037-site-engineer-page-sign-in-and-default-roles.md) §1–§2 (a Site Engineer's sign-in was an invitation, a first password, or both)
- Relates to: [CM-0030](CM-0030-users-and-roles.md) §3, §6, §7 (passwords an admin sets, mobile and password sign-in), [CM-0009](CM-0009-email-sign-in-while-sms-is-off.md) (email invitations while SMS is off)

Add Site Engineer asked for an email so the Site Engineer could be invited, or a password. The owner says inviting makes no sense for a Site Engineer: they work on site, often have no email, and should sign in with their **mobile number** and a **password the admin sets** on the form. Mobile and password sign-in already exists (CM-0030 §7); the form and the rules around it did not say so.

## Questions the owner answered

| Question                                                              | Answer                                                                                                                                                 |
| --------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| What does unticking "Use mobile number as login" do?                  | **It cannot be unticked.** Every Site Engineer signs in with their mobile. The box is shown ticked and read-only, so the form says how they sign in.   |
| What happens to Site Engineers invited before, still Joining Pending? | **Set password only.** Resend invite and Share invite link leave the Site Engineer pages. The admin sets a password so they sign in with their mobile. |
| Does the Email field stay?                                            | **Yes, optional, as a contact.** It is not a way to sign in for a new Site Engineer.                                                                   |

## Decision

### 1. The Sign-in card is "Use mobile number as login" and a password

Add Site Engineer, and Edit of an older one without a sign-in, show:

- **Use mobile number as login**, ticked and read-only, with the number typed under Details;
- **Password**, required, at least 8 characters. They sign in as soon as the form is saved and must change it the first time (CM-0030 §8).

The button reads **Add Site Engineer**. The page that follows says they can sign in now with their mobile number, or, when someone already signs in with that number, that they got a Join Request instead (CM-0030 §3). There is no "Add and invite" and no invite link.

### 2. Mobile is required, and the account is made from it alone

- A Site Engineer with their own sign-in must have a mobile: 400 `MOBILE_REQUIRED` on Add, on Edit, and on Set password. A Site Engineer who signs in as Office Staff (linked before CM-0037) is unchanged.
- The API's `signIn` is `{ password }`; a sign-in without a password is 400 `SIGN_IN_REQUIRED`. `invite` is gone from the request, and `invited` and `signIn.invitePath` from the response. `POST …/site-engineers/{id}/resend-invite` is removed.
- `TeamMemberHandlers.giveAccount` makes a Site Engineer's account with the **mobile only** (the User gets the `<digits>@mobile.invalid` placeholder email). Their email stays on the membership as a contact, so it never matches someone else's account and never receives an invitation. When an account already has the mobile, they get a Join Request, but no invitation email.
- `canSetPassword` for a Site Engineer needs a mobile.

### 3. Correcting the mobile moves the sign-in

The mobile is their login, so a change on Edit must change it too, whatever the SMS switch (before this, a joined member's mobile was locked while SMS was on and a contact only while it was off):

- When their User belongs to no other Company, saving a new mobile updates the User's sign-in mobile (`accounts.changeSignInMobile`), stored verified because the admin vouches for it, as CM-0030 §6. A placeholder email follows the number.
- 409 `MOBILE_IN_USE` when another User already signs in with that number; 409 `MOBILE_LOCKED` when their User also works with another Company (only they can change it). The response's `mobileLocked` now means the latter.
- Set password on a Site Engineer who joined by email before this ADR also gives their User the mobile, so the new password works with it.

## Consequences

- No migration: the data is as before. Site Engineers who already sign in by email keep doing so; they can also sign in with their mobile once a password is set or their mobile is saved on Edit.
- Site Engineers invited before this change still show **Joining Pending** and can still accept the email they got; their page offers **Set password** once they have a mobile.
- Office Staff keeps invitations, email sign-in and the SMS-dependent mobile lock (CM-0009, CM-0030 §6). Only Site Engineers change.
- Correcting a mobile on Office Staff still does not move that person's sign-in; that is unchanged here.

## Considered options

- **"Use mobile number as login" unticked means email and password:** rejected by the owner; Site Engineers always use their mobile.
- **Lock a joined Site Engineer's mobile (MOBILE_LOCKED) instead of moving the sign-in:** a typo at Add would lock them out for good, since they become Active at once. Rejected.
- **Keep Resend invite for older pending Site Engineers:** the owner chose Set password only.
