# Sounding human on a call

Read this before you write a v2 agent's `settings.systemPrompt`, hub or step prompts, and before you place a call with the agent.

A call that sounds like a robot reading a press release is a bad experience for the person who picks up, and they blame the business, not the model. Two things decide how a call sounds: the **settings on the agent version** and the **way the prompts are written**. Both are below. Neither is optional.

## 1. Agent settings

A v2 agent version owns these settings. Set them in the snapshot ([field dictionary](../../../v2/skills/v2-snapshot/references/knobs.md)), not on each call. A value sent on `POST /v1/calls` overrides the version for that call only.

| Setting | Set | Why |
|---|---|---|
| `settings.voiceCall.noiseCancellation` | `true` (the default) | Filters background noise out of the caller's audio. Leave it on unless the user has a reason. |
| `settings.backgroundNoise` | `office` for a room-tone feel | Ambience under the agent: `off`, `office`, `coffee-shop` or `restaurant`. A room behind the voice softens the jump between silence and speech. Pick one deliberately. |
| `settings.voiceCall.keywords` | every proper noun the agent depends on | The transcriber garbles names it has not heard, and the agent then confidently repeats the wrong one back. Business, product, and person names go here (at most 20). |
| `settings.voiceCall.voicemailAction` | decide before dialing | The default is to hang up silently, and on cold outbound that can be most of your calls. |
| `settings.voiceCall.record` | `true` when the user will want to review calls | A call has a recording only if recording was on. It cannot be added afterward. |

## 2. Bland tone: how the agent should talk

This is Bland's own rubric for what a good call sounds like. The goal is to sound midwestern and use phone tone. Everything the agent says is spoken out loud to a real person.

- **Fewest words that still land.** On every line: what is the most accurate reply, then reduce it to the fewest words without sounding rude.
- **No recontextualizing.** Cut "just to confirm", "as you mentioned", "so what I'm hearing is". Assume the person remembers what they just said.
- **Voice, not chat.** "gotcha", not "got it".
- **Back-channel while they talk.** "mhmm", "uh huh", "right". Lead with one, or drop one in when the person pauses mid-thought.
- **Empathy in stride.** If someone says something heavy, react before continuing. Never "Gotcha, and your first name?" right after "my dog is on fire".
- **Ultra-concise when collecting information.** "Yup and last?" beats "Thank you, could I please have your last name as well?"
- **Topic transitions can be slightly more formal.** "awesome, thanks. And how can I help you today?"
- **Personality sparingly.** A light joke is fine when it does not interrupt the flow.

## 3. Write the words like a transcript, not like copy

The voice model was trained on recordings of people actually talking. Text that reads like a transcript performs dramatically better than text that reads like writing. Put these rules in the prompt, and write the prompt's own example lines this way.

**Say it plainly in the prompt: ums, uhs, and false starts are wanted.** They are not sloppiness and not something to apologize for. They are what makes a voice sound like a person thinking instead of a machine reading copy, and a call with none of them is the one people hang up on. Write them in deliberately. In practice the failure is always too few, never too many, because a model left to its own judgment defaults to clean written prose and quietly drops every one of them.

- **Contractions, always.** "I'm", "don't", "it's".
- **Fillers where they genuinely land.** "um", "uh", "you know", "I mean". Sparingly, at a rate a real person would actually use.
- **False starts and self-corrections.** "I just- I don't even know what to say." "the thing with the 25th is... well, actually, depends which one you're going to."
- **Trailing off.** "and I just... yeah."
- **Emphasis the way transcripts capture it.** CAPS on the punched word ("that is NOT what happened"), a repeated word for real emphasis ("no, no, no, listen"), a stretched beat used rarely ("wait... what?").
- **Spoken rhythm.** Short clauses. Fragments. Real interruptions. Not long literary sentences.
- **Cut the written-English tells.** No semicolons, no nested subclauses, and no words nobody says out loud ("moreover", "utilize", "delve", "additionally").

Read every line aloud in your head. If it sounds like an essay, rewrite it until it sounds like a person.

### Drop this into the prompt

Paste this into the agent's `settings.systemPrompt` and then write the rest of the prompt's own lines the same way. Do not water it down into "be conversational", which is the instruction every robotic call was already given:

```
Talk like a person on a phone, not like written copy. Use contractions.
You are allowed to sound slightly imperfect, and you should: the occasional
"um" or "uh", a false start you correct mid-sentence, a thought that trails
off. That is what makes you sound human, so do not clean it up. Keep replies
to a clause or two, the way people actually talk. Back-channel while the
other person is speaking ("mhmm", "right", "gotcha"). Never use a word
nobody says out loud.
```

Texture taken from production global prompts:

- "so the assessment... it's about an hour, and there's no obligation with it"
- "oh, okay, so she's still at the rehab facility right now"
- "ah okay, gotcha... so it's been pretty recent then"
- "oh, I'm sorry, that's a lot to carry"

The default is still calm efficiency. Reach for a human moment when something genuinely warrants one, then move on.

## 4. Performance tags: V3 voices only

Bracketed tags shift delivery. A tag colors the words from its position until the next tag or the end of the line: `I know, I know. [say angrily] But this is the THIRD time!`

**Only V3 voices support them**, which is the set `list_voices` returns. Older voices strip bracketed text before speaking, so a tag written for one of them is silently lost. Check the voice before you use a tag.

Use the canonical strings verbatim. These were acoustically verified in training. Invented variants like `[say sarcastically]` or `[sound amused]` were stripped from the training data, and the model ignores or garbles them. Convey sarcasm through wording instead.

**Emotion:** `[say angrily]` `[say angrily with force]` `[say warmly]` `[say excitedly]` `[say quietly]` `[say in a whisper]` `[say nervously]` `[say sadly]` `[say wearily]` `[say playfully]` `[say confidently]` `[say loudly]`

**Intensity:** `[very loud]` `[very fast]` `[voice lowered]`

**Vocalizations:** `[laughs]` `[chuckles]` `[sighs]` `[clears throat]` `[gasps]` `[coughs]` `[sniffles]` `[scoffs]` `[exhales]` `[inhales deeply]` `[groans]` `[stammers]` `[yawns]` `[humming]` `[clicks tongue]`

Rules:

- **0 to 2 per line at most.** Tags are seasoning. A prompt stuffed with them sounds theatrical, which is its own bad call.
- **Tags amplify what the words already license.** `[say angrily] You went behind my back?!` lands. An angry tag on flat words barely moves. To change a line's emotion, change the wording and the tag together.
- **Never invent tag syntax, and never nest tags.**
- On a live call the agent's replies are generated turn by turn, so tags belong in the prompt as instructions and examples of how to speak, not as a script you expect back verbatim.

## 5. Before you dial

1. The call runs a v2 agent: `POST /v1/calls` with `agent_id` (`create_call` cannot carry it).
2. `noiseCancellation` and `backgroundNoise` chosen deliberately on the version that will run.
3. Every proper noun in `settings.voiceCall.keywords`.
4. The prompts read like a transcript, not like copy, and carry the tone rules above.
