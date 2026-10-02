# Store enrollment research — India planning baseline

Checked 2026-10-03. Publishing as an individual versus an organization is still undecided. This is an initial operational checklist, not legal/tax advice or confirmation that an account exists. Enrollment and signing credentials never belong in Git.

## Fees and verification status

| Item | Planning amount / status | Source and limitation |
|---|---|---|
| Apple Developer Program | USD 99 per membership year; local pricing/taxes may differ | [Apple enrollment](https://developer.apple.com/programs/enroll/), accessed. Confirm the checkout amount in India. |
| Google Play registration | Earlier planning used USD 25 once; **current official fee page could not be re-fetched in this pass** | [Official account setup page](https://support.google.com/googleplay/android-developer/answer/6112435). Treat the amount as a pending-verification budget baseline, not a newly confirmed quote. |
| Business formation, notarization, domain email and compliance | Not included or approved | May introduce costs beyond store fees. Do not register a business automatically. |
| D-U-N-S | Apple describes the identifier as available free | [Membership comparison](https://developer.apple.com/support/compare-memberships/). Do not buy an unnecessary expedited service without authorization. |

No INR conversion is asserted. Store enrollment does not include advertising income verification, tax setup or a guarantee of store approval.

## Apple: individual and organization

Individuals/sole proprietors use their personal legal seller name. Organizations need an eligible legal entity, an authorized account holder, D-U-N-S where applicable, domain-associated work email and a functional organization website. A studio nickname or domain alone does not establish eligibility. The Apple Account needs two-factor authentication. [Enrollment requirements](https://developer.apple.com/programs/enroll/).

Apple's account help states that enrollment in India uses the Apple Developer app. Prepare identity/contact information and any requested organizational proof; follow the app's current verification steps. [Enrollment help](https://developer.apple.com/help/account/membership/program-enrollment/). This step requires the account holder, not an agent pretending to be the owner.

## Google: Indian verification preparation

Google's India document page lists government-issued photo ID and address evidence for individuals. Examples include passport/driving licence/PAN for identity and appropriate address-bearing ID, utility bill or bank statement for address. Names and addresses must match the profile. Organizations need accepted registration evidence plus an authorized representative's ID; legal details must match the payments/D-U-N-S information. Follow the accepted-document list rather than assume any uploaded document qualifies. [India document requirements](https://support.google.com/googleplay/android-developer/answer/15633622?co=GENIE.CountryCode%3DIN&hl=en).

Google acceptance of an Indian registration document does not automatically prove Apple organization eligibility. Keep business identity, public contact details and private personal evidence distinct.

## Testing-access requirement: pending current confirmation

Google's official December 2024 announcement reduced the personal-account test requirement to 12 testers and a minimum two-week test before applying for production access. [Official announcement](https://support.google.com/googleplay/android-developer/thread/312771181/reduced-testing-requirements-for-personal-developer-accounts?hl=en).

The current detailed [testing requirements page](https://support.google.com/googleplay/android-developer/answer/14151465) returned access/rate-limit errors during this research pass. Earlier planning used 12 testers continuously opted in for 14 days for relevant new personal accounts. **Reconfirm current applicability and conditions in Play Console before scheduling.** Do not claim the announcement proves every 2026 detail, or that finishing a test guarantees production approval. The owner can recruit testers; no completed test has been recorded.

## Enrollment and release order

1. Choose individual versus eligible organization, considering public seller identity and recurring obligations. Owner completes enrollment, agreements and payments.
2. Verify account details; store recovery methods securely. Create least-privilege build/upload access separately from owner approval access.
3. Confirm unique app identifiers, signing and private backups. Test Android/iOS distribution paths before building many titles.
4. For each game, prepare audience/rating answers, actual privacy/data collection disclosures, ad declarations, support/privacy URLs, screenshots and review notes. Recheck current store/SDK rules; do not copy another game's disclosures.
5. Complete required testing and independent device QA. Submit only the owner-approved exact candidate; observe each store's review outcome.

## Originality, ads and compliance gate

Apple's review guidelines address copycats, spam, app completeness, accurate metadata and children's advertising/privacy constraints. The 100-game ambition is not permission to submit minimally changed reskins. Do not assume a generally child-friendly art style alone satisfies Kids Category requirements. [App Review Guidelines](https://developer.apple.com/app-store/review/guidelines/), especially sections 1.3, 2.1, 2.3, 4.1 and 4.3.

A full jurisdiction-specific legal, tax, child-safety and ad-consent review is still open. Check the actual SDKs and intended countries before any live ads or data collection. The registration pages above do not settle those questions.
