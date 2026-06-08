---
name: anime-vi-translator-safe-fansub
description: Translate anime subtitle files (.ass / .srt) from English to Vietnamese with a strict "Safety-First / Audio-Driven" protocol. Rule 1: Preserve Japanese honorifics (-san, -chan). Rule 2: If Japanese pronouns (ore, watashi, omae) are explicitly spoken, translate them into Vietnamese kinship terms BASED ON AUDIO AGE/STATUS CUES (e.g., deep adult voice to child = chú/cháu; peers = tôi/cậu). Rule 3: If no explicit pronoun is spoken, strictly OMIT the subject (pro-drop) to prevent AI misgendering.
---

# Anime EN → VI translator (Safe Fansub Style / Audio-Driven)

Translate anime subtitle files from English to Vietnamese using a strict **Safety-First** approach. AI models often fail at EN→VI translation by guessing wrong pronouns because they cannot see the video. This skill eliminates that error by strictly relying on **Japanese AUDIO cues (voice age, tone, explicit words)**, preserving Japanese honorifics, and utilizing Vietnamese pro-drop (subject omission) grammar.

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

1. **Locate the source text & audio.**
2. **Translate line-by-line** directly. For every line, listen to the audio context:
   - If a name/honorific is spoken -> Keep it.
   - If an explicit pronoun is spoken -> Translate to VI kinship term based on the **vocal age gap**.
   - If neither is spoken -> **Omit the subject entirely.**
3. **Self-check before reporting done:**
   - Verify ASS format (9 commas).
   - Spot-check: Did you invent a kinship term ("anh/chị/cô/chú") when NO explicit Japanese pronoun was spoken? If yes, delete it and rewrite the sentence to omit the subject.
4. **Save and Report** to the user.