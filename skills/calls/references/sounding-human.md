# Sounding human on a call

Read this before you write a `task`, a `first_sentence`, or a `personality_prompt`, and before you dispatch any call.

A call that sounds like a robot reading a press release is a bad experience for the person who picks up, and they blame the business, not the model. Two things decide how a call sounds: the **settings you dispatch with** and the **way the prompt is written**. Both are below. Neither is optional.

## 1. Dispatch settings

`create_call` takes only `phoneNumber`, `task`, `pathwayId`, `voice`, `from`, and `firstSentence`, and rejects every other field. So every setting in this table needs `call_bland_api` with `POST /v1/calls` instead. **If the call needs any of them, do not use `create_call`.**

| Setting | Send | Why |
|---|---|---|
| `noise_cancellation` | `true` | Filters background noise out of the caller's audio. **Send it explicitly.** `POST /v1/calls` applies `true` when the field is omitted, but the API reference documented `false` for a long time, so send the field rather than trusting a default that has already drifted once. |
| `background_track` | `office` for a room-tone feel | Ambience under the agent. The default (`null`) is quiet phone static and `none` minimizes background noise, while `office`, `cafe`, and `restaurant` put a room behind the voice, which softens the jump between silence and speech. Pick one deliberately instead of letting it default. |
| `keywords` | every proper noun the call depends on | The transcriber garbles names it has not heard, and the agent then confidently repeats the wrong one back. Business, product, and person names go here. |
| `voicemail` | decide before dialing | The default is to hang up silently, and on cold outbound that can be most of your calls. |
| `record` | `true` when the user will want to review it | A call has a recording only if it was dispatched with this. It cannot be added afterward. |

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

Paste this into the `task` or `personality_prompt` and then write the rest of the prompt's own lines the same way. Do not water it down into "be conversational", which is the instruction every robotic call was already given:

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

## 4. Performance tags: BTTS v3 voices only

Bracketed tags shift delivery. A tag colors the words from its position until the next tag or the end of the line: `I know, I know. [say angrily] But this is the THIRD time!`

**Only BTTS v3 voices support them.** Check the selected voice’s public `service`; being recommended by `list_voices` does not itself guarantee support for these tags. The PlayHT and ElevenLabs paths strip bracketed text before it reaches the model, so a tag written for those voices is silently lost. Check the voice before you use a tag.

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

1. Dispatching through `POST /v1/calls` if the call needs anything beyond the six `create_call` fields.
2. `noise_cancellation: true` sent explicitly.
3. `background_track` chosen deliberately.
4. Every proper noun in `keywords`.
5. The prompt reads like a transcript, not like copy, and carries the tone rules above.
