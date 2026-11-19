# Messages for the owner to send

Drafted 2026-11-19 for the open decisions in `docs/SHIP_READINESS.md`. Each is the owner's
to send from his own address; nothing here has been sent. Replace the bracketed parts.
When an answer comes back, tell the agent and it updates the app and the docs.

## 1. ThroughLine (Find A Helpline): permission to name the directory (decision 8)

To: the contact on findahelpline.com/terms. Why: their terms need written permission for
commercial use, and the Coach is a paid feature.

> Subject: Permission to link to Find A Helpline from an iPhone app
>
> Hello,
>
> I'm the developer of Fairly Sure, an iPhone app for tracking personal predictions. One
> paid feature gives feedback on a person's numbers. Before it runs, the app checks the
> person's own notes on the phone for signs of distress, and if it finds any it shows a
> short support message instead of the feedback.
>
> In the US that message names the 988 Lifeline. For people elsewhere I'd like it to say
> "Find a crisis line in your country at findahelpline.com" with a link. Nothing else: no
> embedding, no use of your data or API, no logo.
>
> Your terms ask for written permission for commercial use. May I have it for this? If you
> need different wording or attribution, tell me and I'll use it.
>
> Thank you,
> [name], [support email]

## 2. National Domestic Violence Hotline: US territories (decision 13)

To: the hotline's general or media contact (thehotline.org).

> Subject: Does 1-800-799-7233 serve the US territories?
>
> Hello,
>
> I'm the developer of an iPhone app that shows your hotline's number in a support message
> when someone's own notes suggest they may be unsafe. Before showing it to people in
> Puerto Rico, Guam, the US Virgin Islands, American Samoa and the Northern Mariana Islands,
> I want to be sure it works for them.
>
> Could you confirm, for each of the five, whether the phone line connects from there and
> whether your advocates serve callers there? If chat or text is the better route from a
> territory, I'd show that instead.
>
> Thank you,
> [name], [support email]

## 3. National Alliance for Eating Disorders: US territories (decision 13)

To: the Alliance's contact (allianceforeatingdisorders.com).

> Subject: Does your helpline (1-866-662-1235) serve the US territories?
>
> Hello,
>
> I'm the developer of an iPhone app that shows your helpline's number in a support
> message. Before showing it to people in Puerto Rico, Guam, the US Virgin Islands, American
> Samoa and the Northern Mariana Islands, I want to be sure it works for them.
>
> Could you confirm whether the number connects from those territories, whether you serve
> callers there, and the hours someone answers? I'd also like to describe the hours
> correctly for people in the states.
>
> Thank you,
> [name], [support email]

## 4. RevenueCat support: sandbox access and App Review

To: RevenueCat support, from the dashboard. Why: `supabase/README.md` (2026-11-19 section)
says not to restrict Sandbox Testing Access until RevenueCat confirms this in writing.

> Subject: Does "Allowed App User IDs only" affect App Review's purchases?
>
> Hello,
>
> Under Project settings → Sandbox Testing Access, I'd like to switch from "Anybody" to
> "Allowed App User IDs only" once my app is live, so sandbox purchases can't grant
> entitlements to ordinary accounts.
>
> Two questions before I do:
> 1. Apple's App Review buys in the sandbox, signed in to accounts I can't know in
>    advance. With "Allowed App User IDs only", would their purchases still grant the
>    entitlement in the SDK and in webhooks, or would review see a purchase that unlocks
>    nothing?
> 2. Does the setting change what the REST API v2 returns for active entitlements, and what
>    webhooks send, for sandbox purchases by IDs that aren't on the list?
>
> Thank you,
> [name]

## 5. OpenAI: the Data Processing Addendum

Not a message: a form. Sign in to the OpenAI platform account that holds the Coach's API key
and execute the DPA (openai.com/policies/data-processing-addendum; older versions were
signed through a form linked there). Keep the signed copy. Then tell the agent, and the
privacy policy's sentence about companies that process data "on our behalf" gains OpenAI
(the OWNER comment in `docs/PRIVACY_POLICY.md` §4).
