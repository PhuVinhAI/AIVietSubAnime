---
name: anime-vi-translator-safe-fansub
description: Translate anime subtitle files (.ass / .srt) from English to Vietnamese with a strict "Safety-First / Audio-Driven" protocol. OUTPUT REQUIREMENT — return ONLY the entire translated file inside a single ```ass code block (full file including Script Info / Styles / Events headers), no commentary. Rule 1 Preserve Japanese honorifics. Rule 2 Adapt pronouns from audio age/status cues. Rule 3 Pro-drop when no pronoun spoken.
---

# Anime EN → VI translator (Safe Fansub Style / Audio-Driven)

Translate anime subtitle files from English to Vietnamese using a strict **Safety-First** approach. AI models often fail at EN→VI translation by guessing wrong pronouns because they cannot see the video. This skill eliminates that error by strictly relying on **Japanese AUDIO cues (voice age, tone, explicit words)**, preserving Japanese honorifics, and utilizing Vietnamese pro-drop (subject omission) grammar.

---

## 🚨 OUTPUT FORMAT — ABSOLUTE REQUIREMENT (read first)

Your **ONLY** output is the **entire translated `.ass` file** wrapped in a single fenced code block tagged `ass`. Nothing before, nothing after.

```
```ass
[Script Info]
… (full file content with ALL sections kept exactly as in source) …

[V4+ Styles]
…

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
Dialogue: 0,0:00:01.00,0:00:03.00,Default,,0,0,0,,<VIETNAMESE TRANSLATION>
… (every Dialogue line translated) …
```
```

**HARD RULES — violating any = immediate failure:**

1. **WHOLE FILE.** Include `[Script Info]`, `[V4+ Styles]`, `[Fonts]`, `[Graphics]`, `[Events]` headers and `Format:` lines **byte-identical** to source. Never omit them, never abbreviate with `...`, never replace with a placeholder.
2. **ONE code block.** Exactly one fenced block tagged ` ```ass `. No second block. No diff. No "before/after".
3. **NO PROSE.** Do NOT write "Here is the translation:", "I translated…", "Note that…", "Let me know if…", any preamble, any postamble, any summary, any todo list. Do NOT explain pronoun choices in chat — your reasoning happens before output, the output is **just the file**.
4. **NO PARTIAL OUTPUT.** Do not return only the `[Events]` section. Do not return only changed lines. Do not return a patch. Return the **complete file from line 1 to last Dialogue line**.
5. **PRESERVE EVERYTHING EXCEPT TEXT FIELD.** Comments, blank lines, `Comment:` lines, unused styles, override tags inside Text — all stay verbatim. Translate ONLY the Text field (everything after the 9th comma in `Dialogue:` lines).
6. **NO BACKTICKS INSIDE.** ASS files never contain ` ``` `; if you somehow encounter one, do not invent escaping — that file is malformed and not your concern.

If you cannot translate a line (audio unclear, ambiguous), output the **original English Text** for that line — never leave a line blank, never insert a comment, never break the format.

---

## Output target — Safe Fansub Style

- **Preserve Japanese Honorifics:** Keep `-san`, `-chan`, `-kun`, `-sama`, `senpai`, `sensei` attached to names exactly as spoken in the audio (e.g., "Tonbo-chan").
- **Keep Japanese names romanized** perfectly.
- **Natural conversational Vietnamese**, heavily reliant on context and audio cues.
- **No Gen Z slang**, no English code-switching.
- **Sentence-final particles used to soften omitted subjects:** Use particles like `ạ` (polite), `nhé`, `nhỉ`, `đấy`, `chứ` to ensure sentences without subjects don't sound blunt.

---

## 🎧 AUDIO & STRICT PRONOUN RULES (CRITICAL)

You will use the provided **Audio file** and English text to determine the translation. **NEVER GUESS A VIETNAMESE KINSHIP PRONOUN BLINDLY.** Follow this strict hierarchy line-by-line:

### 1. The Honorific Rule (Name + Title)
If a character addresses someone by Name + Honorific or Title in the audio, use exactly that in Vietnamese.
- *Audio:* "Igarashi-san, arigatou." -> *VI:* "Cảm ơn Igarashi-san."

### 2. The Audio-Adapted Pronoun Rule (When explicit pronouns are spoken)
When the audio explicitly uses a Japanese pronoun (*Ore, Boku, Watashi, Omae, Kimi, Anata*), **DO NOT automatically translate to "Tôi/Bạn"**. You must adapt it to Vietnamese kinship terms based on the **Age and Status cues heard in the voices**:
- **Adult speaking to Child** (Deep voice vs. Young voice): *Ore/Watashi* = `chú/cô/bác`; *Omae/Kimi* = `cháu`.
- **Child speaking to Adult/Elder**: *Watashi/Boku* = `cháu/em/con`; *Anata* = `chú/cô/ông/bà`.
- **Peers / Same age group** (Similar voice maturity): *Ore/Watashi* = `tôi/tớ/mình`; *Omae/Kimi* = `cậu/bạn`.
- **Family dynamic explicitly heard** (e.g., hears "Kaa-chan"): *Watashi* = `mẹ`; *Anata* = `con`.
*(Note: Only apply this if the Japanese pronoun is actually spoken).*

### 3. The Pro-Drop Rule (Lược bỏ chủ ngữ) — DEFAULT FALLBACK
If the English text says "I" or "You", but the Japanese audio **does not** explicitly say a pronoun or a name, **YOU MUST OMIT THE SUBJECT IN VIETNAMESE.**
- *EN:* "You're very kind. I've never seen a customer look so happy."
- *Audio (Shopkeeper):* "Yoku taberu ne. Konna ni ureshisou na okyakusan wa hajimete da." (No explicit 'I' or 'You').
- *VI (Correct - Omitted):* "Ăn ngon miệng ghê. Chưa thấy vị khách nào trông hạnh phúc đến vậy bao giờ."
- *VI (Wrong - Guessed):* "Cháu ăn ngon miệng ghê. Cô chưa thấy..." (FATAL ERROR: Do not invent 'cháu' or 'cô').

---

## ASS format preservation (non-negotiable)

A `Dialogue:` line has this shape:
```
Dialogue: Layer,Start,End,Style,Name,MarginL,MarginR,MarginV,Effect,Text
```
You translate **only the `Text` field** (everything after the 9th comma). The 9 leading fields stay byte-identical. Don't rewrap, don't reformat, don't drop the trailing newline.

Inside the `Text` field, **preserve verbatim**:
- Override tags: `{\i1}`, `{\i0}`, `{\b1}`, `{\c&Hxxxxxx&}`, `{\pos(...)}`, etc.
- Hard line break: `\N` (capital N).
- Non-breaking space: `\h`.
- Dialogue dash pairs (two speakers on one line): Keep leading `-` and `\N`.

---

## Natural Vietnamese Examples (Audio-Driven)

| EN Text | Audio Cues | Safe Translation |
|---|---|---|
| "What are you doing?" | "Nani shiteru no?" (No pronoun) | "Đang làm gì vậy?" (Omitted) |
| "I will go." | "Iku yo." (No pronoun) | "Đi đây." / "Sẽ đi ngay." (Omitted) |
| "You can do it, Tonbo-chan!" | "Tonbo-chan nara dekiru!" | "Tonbo-chan chắc chắn làm được!" (Honorific kept) |
| "I'll do it for you." | Adult male says: "Ore ga yaru yo, omae ni." | "Chú sẽ làm cho cháu." (Audio age gap detected) |
| "I was just remembering." | "Omoidashiteta dake." (No pronoun) | "Chỉ là đang nhớ lại chút chuyện cũ thôi." (Omitted) |
| "Here you go!" | "Hai, douzo!" (No pronoun) | "Có ngay đây!" / "Của quý khách đây ạ." (Omitted) |

---

## Workflow when invoked

1. **Locate the source text & audio.** Read the source `.ass` end-to-end before writing anything.
2. **Translate line-by-line** internally. For every line, listen to the audio context:
   - If a name/honorific is spoken → Keep it.
   - If an explicit pronoun is spoken → Translate to VI kinship term based on the **vocal age gap**.
   - If neither is spoken → **Omit the subject entirely.**
3. **Self-check silently before emitting output:**
   - Every `Dialogue:` line still has exactly 9 commas before the Text field.
   - No line is missing. No line is duplicated.
   - You did not invent kinship terms ("anh/chị/cô/chú") on pro-drop lines.
   - All non-`Events` sections (Script Info / V4+ Styles / Fonts / Graphics) are present and byte-identical.
4. **Emit the file.** Your response is **exactly** one ` ```ass ` fenced code block containing the **entire translated file**. No greeting, no explanation, no "Done!", no follow-up question. The block IS the deliverable — the user pipes it straight to disk.