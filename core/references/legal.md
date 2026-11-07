---
name: legal
description: Legal pages and data handling every product ships: imprint, privacy policy, terms, cookie consent, retention, deletion, processors.
read-when: adding a public site, sign-up, checkout, cookie or tracking change, a new vendor that receives personal data, a new data type, or before launch.
skip-when: the change touches no personal data, no public page and no vendor.
---

# Legal and data handling

Every product hosts its own imprint and privacy policy, linked in the footer of every public page. What the policy states is what the code does: retention is enforced by scheduled jobs, vendors match the processor list, consent matches [tracking](tracking.md). This is a blueprint for building, not legal advice. A lawyer reviews all legal texts before launch.

## Rules

### Pages

- **LEG-1: The product hosts its own imprint, privacy policy and terms** as public indexable pages, linked in the footer on every page, in every locale, each with a "last updated" date. Do not link out to another company's legal pages.
- **LEG-2: Imprint content (German DDG section 5).** Full name or company and legal form, a street address (no PO box), email and a second quick way to contact (phone or contact form), authorised representatives, commercial register and number, VAT ID where it exists, supervisory authority and professional title for regulated professions. With editorial content, name a person responsible for it (MStV section 18 paragraph 2). The page is reachable in two clicks or fewer.
- **LEG-3: The privacy policy has fixed sections, in this order:** controller and contact; data protection officer if required; what we process (by data type); what we do not process; purpose and legal basis per purpose (Art. 6 GDPR); recipients and processors with their region; transfers outside the EU and their safeguard; retention per data type; cookies and similar storage; automated decisions (state none, or explain); your rights and how to use them (access, correction, deletion, restriction, portability, objection, withdrawal of consent, complaint to a supervisory authority); how changes are announced.
- **LEG-4: Terms** cover service scope, accounts, acceptable use, payment and cancellation where paid, liability, governing law, contact. Prices show the final amount with the currency code and tax note.
- **LEG-5: No EU online dispute resolution link.** The platform is discontinued. State the consumer arbitration position only if counsel says to.
- **LEG-6: Other makers' products are named by name only,** in plain text, with a "not affiliated with or endorsed by" note. No logos or look-alike branding without permission.
- **LEG-7: Operator placeholders stay visible until filled.** Unknown name, address or register entries render as a clearly marked placeholder, never a plausible fake. A check fails the production build while any placeholder remains.

### Consent and acceptance

- **LEG-8: Cookie consent follows [tracking](tracking.md):** two choices, equal prominence, withdrawal as easy as consent, versioned record. Strictly necessary storage (session, CSRF, consent record) needs no consent but is listed in the policy.
- **LEG-9: Terms are accepted at sign-up and linked at checkout.** Store which version and when. A new version asks again on next sign-in.
- **LEG-10: Open forms that collect personal data link the privacy policy** next to the submit button. Newsletter sign-up uses double opt-in (see [forms](forms.md)). If reCAPTCHA is used, the policy and the form carry Google's required notice.

### Retention and deletion

- **LEG-11: Every data type has a stated retention period** in the policy and in code as a constant. Examples of types: account data, session tokens, magic-link tokens, logs, backups, analytics, support mail, uploaded files.
- **LEG-12: Scheduled sweeps enforce retention.** Each is a named job: owner, schedule, idempotent, bounded runtime, logged count of deleted rows, no personal data in the log (see [observability](observability.md)). A retention period without a sweep is a bug.
- **LEG-13: Leaving means deletion.** A person who never confirmed (email not verified, double opt-in open) is deleted. A confirmed person is anonymised: personal fields removed or replaced, records kept only where law requires (invoices, tax) and then restricted to that purpose with its own retention.
- **LEG-14: Data export and deletion requests are a built feature,** not an email to the owner. A signed-in person can download their data in a machine-readable format and delete the account. Requests by email follow the same path, answered within one month. Deletion also reaches processors and backups on their schedule, stated in the policy.

### Hosting and processors

- **LEG-15: EU hosting by default** for application, database, storage, logs and email. A processor outside the EU is a recorded exception with its legal basis and, where the vendor allows, a pinned EU region.
- **LEG-16: Keep a processor list** in the repo (see [decisions](decisions.md)): vendor, purpose, data types, region, DPA signed (date), sub-processors link. The privacy policy section is generated or checked against this list.
- **LEG-17: A record of processing activities** (Art. 30 GDPR) lives next to the processor list: purpose, data categories, recipients, retention, security measures. Update it in the same change that adds a data type.

## How to apply

1. Create the operator profile (legal name, address, contacts, register, VAT ID, responsible person, DPO if any) as one config source; imprint, policy and emails read from it.
2. Draft imprint, policy and terms in the default locale from the fixed sections, then translate (see [i18n](i18n.md)).
3. Create the processor list and record of processing from the actual vendor clients (see [clients](clients.md)).
4. Add retention constants and sweeps with the data type, not later.
5. Build export and deletion with the first user-owned data.
6. Before launch: placeholders are gone, counsel has reviewed, DPAs are signed, policy matches code.
7. Later changes: a new vendor, data type, purpose or cookie updates the processor list, record, policy text, consent version and (if purposes changed) re-asks consent, in one change.

## Checks

- Build fails in production mode while operator placeholders remain.
- Test that footer legal links exist on every public layout in every locale.
- Test that every retention constant has a matching scheduled sweep and a policy entry.
- Test sweeps with seeded data: expired rows go, others stay, no personal data in logs.
- Test deletion and anonymisation paths and the export content for a seeded user.
- Test that the list of vendor clients equals the processor list.
- Left to review: legal wording, legal bases, transfer safeguards, and the final counsel sign-off.

## Mistakes to avoid

- A policy promised 30-day deletion and no job existed.
- Imprint and policy were linked to another company's pages, and the controller was wrong.
- Placeholders were replaced by invented but plausible data.
- Anonymisation left the email in a log or analytics person profile.
- A new analytics or email vendor shipped without a processor entry and a policy update.
- Deletion removed the account row but left uploads and backups unmentioned.
- Terms were accepted once, then changed silently.
- The old EU dispute-resolution link stayed in footers after the platform closed.
- Third-party product names appeared with logos and no non-affiliation note.
