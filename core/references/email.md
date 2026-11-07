---
name: email
description: How the product sends and receives email: one wrapper, one provider, one shell, templates, tests and mailboxes.
read-when: sending any mail (sign-in, receipt, notification, newsletter), adding a template, or setting up mailboxes.
skip-when: the change never sends or receives mail.
---

# Email

All outgoing mail goes through one wrapper and one provider, using Resend and react-email behind the clients factory. Rendering is separate from delivery. Dev and test use a provider that never reaches a real inbox.

## Rules

### Sending
- **MAIL-1: One wrapper, one provider.**
  The wrapper is the only code that sends. It is an interface with a factory ([clients](clients.md)): Resend for real, a fake provider (console mode for local work, memory mode for tests) and a noop provider. Latest stable at build time.
- **MAIL-2: From and reply-to come from env.**
  Never hard-code an address in a template or a caller. Use a no-reply style from address only for mail nobody should answer; use a monitored reply-to otherwise. Config in [env-and-secrets](env-and-secrets.md).
- **MAIL-3: Send plain text with every mail.**
  Every message has a text part generated from the same content as the HTML. It helps deliverability and accessibility.
- **MAIL-4: One recipient per message, with a stable idempotency key.**
  A retry must not send twice. Log provider id, template and recipient hash in structured logs, never the body.
- **MAIL-5: Dev default is the fake provider in console mode; production requires working config.**
  The app refuses to boot deployed with the fake provider ([clients](clients.md)).

### Templates
- **MAIL-6: One shell and one theme for all mail.**
  A single layout component holds header, footer, legal links and colors from [design](design.md) tokens. Templates only supply content.
- **MAIL-7: One file per template.**
  Each template exports its props type, subject, HTML and text. Subjects and body copy follow [copy](copy.md) and [i18n](i18n.md); the recipient's locale picks the language.
- **MAIL-8: Provide a preview.**
  A dev route or script renders every template with sample data in every configured locale, light and dark. Review a template in the preview before it ships.
- **MAIL-9: No open tracking.**
  Link tracking is off unless a product decision says otherwise, and then it is documented in [legal](legal.md) and [tracking](tracking.md).

### Lists and consent
- **MAIL-10: Add List-Unsubscribe and a one-click leave for bulk or recurring mail.**
  Send the `List-Unsubscribe` and `List-Unsubscribe-Post` headers. The leave link shows a confirm page; a GET never changes state, because mail scanners prefetch links. Transactional mail (sign-in, receipts) does not need it.
- **MAIL-11: Newsletters and lists use double opt-in.**
  See [forms](forms.md).

### Receiving
- **MAIL-12: Set up inbound mailboxes for the legal and support addresses.**
  At minimum `hello@` and `privacy@` on the product domain, and any other address named in the imprint or privacy policy ([legal](legal.md)). Someone must read them. Add SPF, DKIM and DMARC for the sending domain.

## How to apply

1. Verify the sending domain with the provider, add the DNS records, and put the API key in Secret Manager ([env-and-secrets](env-and-secrets.md)).
2. Write the wrapper interface, then the three providers (real, fake, noop). Select by env in the factory.
3. Build the shell once, then the first template (usually the magic link). Add the preview route.
4. Add the test harness: the fake provider in memory mode stores sent mail, and an e2e helper reads the last mail to a given address and extracts the link.
5. Create the mailboxes and aliases before the first public deploy.
6. When adding a template, add its preview sample, its text part and a test that it renders in every locale.

## Checks

- Automated: every template renders with sample props in each locale and has a non-empty text part; the wrapper rejects a send with no from address; deployed boot fails with the fake provider.
- Automated: e2e tests complete sign-in through captured mail, with no real send.
- Review: no direct provider SDK import outside the wrapper; no address hard-coded; unsubscribe GET is read-only.

## Mistakes to avoid

- Sending HTML only.
- Building each template with its own header and footer so mails drift apart.
- Letting a link scanner unsubscribe people through a GET link.
- Sending from a domain with no SPF, DKIM or DMARC and wondering about spam folders.
- Publishing an imprint that names a mailbox nobody created.
- Sending real mail from tests or from a developer's laptop.
