> **Raw research, 2026-10-12.** Two questions an agent could answer with no phone:
> which prompts at the moment of prediction actually reduce overconfidence, and how
> the web build reads to assistive tech. Decisions drawn from it live in
> [`../UI_ROADMAP.md`](../UI_ROADMAP.md) (D32) and
> [`../BUILT_LOG.md`](../BUILT_LOG.md) (step 134); where they differ, those files win.

# What helps at the moment of prediction, and an accessibility pass (October 2026)

Tags as in [`market.md`](market.md): **[primary]** the paper itself or its abstract;
**[secondary]** a citing paper, review or summary; **[unverified]** found only in
secondary places.

---

## 1. Prompts that might lower overconfidence

Calibrate already does two things at the moment of prediction: the track record under
the slider ("Your 60–80% calls in finance: 7 of 12 happened", step 19) and the coverage
nudge (D23). The literature names several more. Here is what each one is worth.

| Technique | What was found | Fit for Calibrate |
|---|---|---|
| **Connect past experiences to this prediction** | Buehler, Griffin & Ross 1994, Study 4: the optimistic bias in completion-time predictions *disappeared* when people were told to link relevant past experiences to the prediction. Without that instruction they focused on future scenarios and explained past misses as one-off causes. [primary, abstract] | **Strong.** The step-19 line uses the confidence band as the reference class. The closer one is *this same prediction*, which people log again and again ("Gym twice this week", "Standup under 15 minutes"). **D32**, decided and built 2026-10-12 as step 135. |
| **List a reason you might be wrong** | Koriat, Lichtenstein & Fischhoff 1980: listing *contradicting* reasons improved calibration; supporting reasons did nothing. [primary] Later attempts often failed to replicate (Fischhoff & MacGregor 1982; Yates, Lee & Shinotsuka 1992, as cited by Sieck et al. 2007). [secondary] | **Weak.** It's a typed field in a form with a 15-second target, the effect is shaky, and the next row says it fails for your own plans. |
| **Imagine how it goes wrong (pessimistic scenario)** | Newby-Clark et al. 2000: writing pessimistic scenarios changed neither the predictions nor their accuracy for one's *own* tasks. People rated those scenarios as less plausible and discounted them. They did use them when predicting for someone else. [primary, abstract] | **Don't build.** Calibrate's predictions are almost all about the user's own life. |
| **Premortem ("it failed, why?")** | The often-quoted "30% better" (Klein, HBR) comes from Mitchell, Russo & Pennington 1989. That paper measured about 30% *more reasons*, not better ones. [secondary] Veinott et al. 2010 found a premortem lowered confidence in a plan more than pros/cons did, but measured confidence, not accuracy. [secondary] | **Don't build.** Lower confidence isn't better calibration, and a 60% user is often underconfident already. |
| **Unpack the task into steps** | Kruger & Evans 2004: listing the steps lengthened time estimates and reduced the planning fallacy. [primary, title and citing papers] It works less well for tasks with few or easy steps, or far in the future, and it can swing people into overestimating instead of making them accurate. [secondary] | **Not now.** Few of Calibrate's predictions are multi-step tasks, and it would add a field. Worth knowing if a "project" kind of prediction ever exists. |
| **Calibration feedback, not only outcome feedback** | Benson & Önkal 1992: feedback on calibration improved calibration and over-forecasting, in one step between sessions. Plain outcome feedback did little, and calibration feedback also made people use a coarser scale. [primary, abstract] Du, Shelton & Whittington 2012, with auditors, found outcome feedback alone worked and extra performance feedback added nothing. [secondary] | **Already built**: the chart, the bands, the step-19 line. The coarser-scale finding backs the 5-point steps (D13). |
| **Keep the original number** | Hindsight bias (Fischhoff 1975): once the outcome is known, people misremember what they predicted. | **Already built**, and it's the reason D25 never lets anyone edit the confidence. Resolve opens with "On Oct 2 you said 90%" for the same reason. |

**What this means:** only one new thing is worth building, D32, and it costs no new
field. The common advice (premortems, "think of reasons you're wrong") has the
weakest evidence for predictions about your own life, which is all Calibrate holds.
Recording that here keeps it from being re-proposed.

### 1.1 The reflection prompt

Buehler et al. also found that people explain away their past misses as one-off
causes. A reflection prompt that only appears after a No, or asks "what went wrong?",
would invite exactly that. Resolve's "What surprised you?" is the same after Yes and
No (DESIGN_SYSTEM non-negotiable 4), so it holds. **Keep it**, and never make it
conditional on the outcome.

---

## 2. Accessibility pass on the web build

Method: at 375 × 667, every interactive element on Today, Insights, You, Log, the
paywall and How scoring works, read from the DOM that react-native-web renders
(role, name, size, `aria-*` state), plus each screen's headings. Web is a stand-in:
VoiceOver on iOS reads the native props, which react-native-web partly drops (the
step-96 lesson), so a gap here is either a web-only bug or a real one. Each finding
below says which.

| # | Where | Finding | Real on iOS? | Became |
|---|---|---|---|---|
| A1 | Insights | One heading on the screen ("Insights"). The chart's takeaway, "Category badges", Coach, Trends and the Plus card were plain text, so VoiceOver's heading rotor couldn't jump between sections of the longest screen. How scoring works and Today already mark theirs. | Yes | Step 134 |
| A2 | Paywall, sign-in, delete account, details sheet | No heading at all ("Calibrate Plus", "Sign in", "Delete your account?", "This prediction isn't open"). | Yes | Step 134 |
| A3 | Log, Warmup, practice | The confidence control is one `slider`, as intended, but on web it had **no value**: react-native-web drops `accessibilityValue`, as it dropped `accessibilityState` before step 96. A screen reader heard "Confidence, slider" and no number. | Web only, but A8 (the web Warmup) would put it in front of strangers | Step 134: `aria-valuenow/min/max/text` as well |
| A4 | Log, Edit | The four due-date chips were radios with no group, so a screen reader didn't hear "1 of 4". The category chips had a group with no name. | Yes | Step 134: both groups named, "Category" and "Due date" |
| A5 | Today, Insights, Log | Several targets measure under 44pt (the "+" at 32, text buttons at 28, the backup card's "Not now" at 36). Each has a `hitSlop` that takes it to 44 or more on iOS; web ignores `hitSlop`. | No | Nothing to do |
| A6 | You | Each switch row carries one `switch` with the label, and the inner Switch is hidden, as step 41 intended. | — | Holds |

Not checked, and only a device can: Dynamic Type at the largest sizes (react-native-web
doesn't scale text with the system setting), the VoiceOver order inside sheets, and
the rotor actually listing the new headings. They're added to
`docs/HUMAN_VERIFICATION.md` C2.

---

## Sources

- Buehler, Griffin & Ross 1994, *JPSP* 67(3): [PDF](https://bear.warrington.ufl.edu/brenner/mar7588/Papers/buehler-et-al-1994.pdf)
- Koriat, Lichtenstein & Fischhoff 1980, *JEP: HLM* 6(2): [PDF](https://newiipdm.haifa.ac.il/wp-content/uploads/2015/05/1980-Koriat-Lichtenstein-Fischhoff-JEPHLM.pdf)
- Sieck, Merkle & Van Zandt 2007, *OBHDP* (on the failed replications): [PDF](https://www.globalcognition.org/articles/sieck-obhdp07-fixation-cognitive-overconfidence.pdf)
- Newby-Clark, Ross, Buehler, Koehler & Griffin 2000, *JEP: Applied*: [record](https://zenodo.org/record/889619) · [Buehler's publications](https://specialprojects.wlu.ca/rbuehler/publications/)
- Mitchell, Russo & Pennington 1989, *JBDM* 2(1): [record](https://colab.ws/articles/10.1002%2Fbdm.3960020103) · on the "30%": [Jason Collins, *The premortem*](https://corporate.jasoncollins.blog/premortem)
- Kruger & Evans 2004, *JESP* 40: cited in [Tempering optimistic bias… the unpacking effect (Waterloo thesis)](https://uwspace.uwaterloo.ca/handle/10012/6863) and [Wiese et al., *Backward planning*, JDM](https://dlab.sauder.ubc.ca/sjdm/journal/16/16101/jdm16101.html)
- Fischhoff 1975, *JEP: HPP* 1(3), hindsight bias: [FLoRA replication atlas entry](https://forrt.org/flora-replication-atlas/doi/10.1037/0096-1523.1.3.288/)
- Benson & Önkal 1992, *IJF* 8(4): [record](https://repository.bilkent.edu.tr/items/40d5ee75-c46f-43c9-9047-c3cd7d927721)
- Du, Shelton & Whittington 2012: [IDEAS](https://ideas.repec.org/a/jfr/ijfr11/v3y2012i4p19-32.html)
- Bolger & Önkal-Atay 2004, *IJF* 20(1): [IDEAS](https://ideas.repec.org/a/eee/intfor/v20y2004i1p29-39.html)
