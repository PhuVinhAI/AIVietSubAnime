---
name: anime-vi-translator-safe-fansub
description: Translate anime subtitle files (.ass / .srt) from English to Vietnamese under a strict "Safety-First / Audio-Driven" fansub protocol. OUTPUT — return ONLY the entire translated file inside ONE ```ass code block (full file with Script Info / V4+ Styles / Events headers byte-identical), zero commentary. Rules — (1) preserve Japanese honorifics, (2) adapt pronouns from audio age/status cues, (3) pro-drop the subject when no pronoun is spoken (prevents AI from inventing gender/relationship).
---

# Anime EN → VI Translator — Safe Fansub Style

A strict protocol for translating anime subtitles from English to natural Vietnamese **without inventing details the AI cannot actually see or hear**. The single biggest failure mode of EN→VI translation by language models is **inventing kinship pronouns** (`anh`, `chị`, `cô`, `chú`, `cháu`, …) when the English uses bare `I` / `you` and the AI guesses the wrong relationship. This skill eliminates that class of error by deferring to **audio cues** and **Vietnamese pro-drop grammar**.

---

## 🚨 OUTPUT FORMAT — Absolute Requirement

Your **only** output is the **entire translated file** inside a single fenced code block tagged `ass`. Nothing else.

````
```ass
[Script Info]
…unchanged headers…

[V4+ Styles]
…unchanged styles…

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
Dialogue: 0,0:00:01.00,0:00:03.00,Default,,0,0,0,,<Vietnamese translation>
…every dialogue line translated…
```
````

**Hard rules — violating any = failed task:**

1. **Whole file.** Include every section (`[Script Info]`, `[V4+ Styles]`, `[Fonts]`, `[Graphics]`, `[Aegisub Project Garbage]`, `[Events]`, …) byte-for-byte from source. Never abbreviate with `…`, never drop headers, never collapse `Format:` lines.
2. **Exactly one fenced block** tagged ` ```ass `. No second block. No "before / after". No diff. No patch.
3. **No prose.** Do not write "Here is the translation:", "I translated…", "Note that…", "Let me know if you need adjustments". Do not explain pronoun choices in chat — the reasoning happens internally; the output is the file alone.
4. **No partial output.** Do not return only `[Events]`. Do not return only the changed lines. Return the file from line 1 to the final `Dialogue:` line.
5. **Translate the Text field only.** In each `Dialogue:` line, the first 9 comma-separated fields (`Layer,Start,End,Style,Name,MarginL,MarginR,MarginV,Effect`) stay **byte-identical**. Translate everything **after** the 9th comma.
6. **Preserve in-text markup verbatim** inside the Text field: override tags (`{\i1}`, `{\b1}`, `{\c&Hxxxxxx&}`, `{\pos(...)}`, `{\fad(...)}`, …), hard line break `\N`, non-breaking space `\h`, and the leading `-` + `\N` pattern for two-speaker dialogue.
7. **Comments stay comments.** Lines starting with `Comment:` are not displayed in the player — leave them untranslated (they are often translator notes or timing markers).
8. **If a line is genuinely impossible to translate** (audio inaudible, English itself is a placeholder, line is a signboard `{\an8}` overlay with no audio), keep the source English Text field unchanged. Never leave a Text field empty.

---

## Why "Safe Fansub"?

EN → VI is structurally lossy at two specific points:

| Lossy point | English shape | Vietnamese needs |
|---|---|---|
| Personal pronouns | Generic `I`, `you` | Specific kinship: `tôi/tớ/mình/anh/chị/em/cô/chú/bác/cháu/con/…` |
| Honorifics | Dropped or domesticated | Preserved with Japanese morphology (`-san`, `-chan`) or socially marked nouns |

Models that translate text-only **must guess** the social relationship to pick a Vietnamese pronoun. They guess wrong by default — most often turning peers into elders, addressing children as `anh/chị`, or feminising male speakers. A wrong pronoun is not a stylistic flaw; it changes who the characters are.

The "Safe Fansub" answer is:

- **Never invent a pronoun** the English text does not explicitly carry.
- When the Japanese audio explicitly speaks a pronoun, adapt it to a Vietnamese kinship term using **voice cues you can verify** (vocal maturity, register, addressee response).
- When no pronoun is spoken, **drop the subject entirely** and lean on Vietnamese sentence-final particles to keep the line natural.

---

## 🎯 THE CARDINAL RULE — Pro-Drop is the Default

> **If the Japanese audio does NOT explicitly say a pronoun or a name, the Vietnamese line MUST NOT contain a kinship pronoun. Drop the subject. This is the single most violated rule. Every kinship pronoun you write is a CLAIM about who is speaking to whom — you cannot make that claim from English alone.**

The English `I` and `you` are **pronoun placeholders**, not actual pronouns. They tell you nothing about age, gender, formality, or relationship. The Japanese audio is the only source of truth:

- **Audio has a pronoun** (`ore`, `watashi`, `omae`, `kimi`, …) → apply Rule 3 (Audio-Adapted) and pick a VI kinship term that matches the voice cues.
- **Audio has a name + honorific** (`Yamada-san`, `Sensei`, `Onii-chan`) → apply Rule 2 (Honorific) and keep it.
- **Audio has neither** → **pro-drop**. Write the line with no subject. **No exceptions.** Not even if it "sounds weird without one" — Vietnamese is grammatically pro-drop and sentence-final particles will carry the social register for you.

**Speaker-name field is NOT permission.** The `Name` field after the 4th comma in a `Dialogue:` line (e.g. `Dialogue: 0,...,Default,YAMADA,...`) is metadata for editors. It does NOT mean the speaker said their own name. It does NOT license you to write `Yamada nói...` or `Tôi là Yamada...`. Only what is **actually heard in the take** counts.

---

## Three Core Rules

### Rule 1 — Honorific Preservation

If the audio carries a name + honorific or a title-as-name, keep it verbatim in Vietnamese.

| Japanese ending | Keep as | Notes |
|---|---|---|
| `-san` | `-san` | Generic polite |
| `-chan` | `-chan` | Affectionate (kids, close peers, younger girls) |
| `-kun` | `-kun` | Boys, juniors at work |
| `-sama` | `-sama` | Highly formal, lord/master/customer |
| `-senpai` | `-senpai` | Senior at school/work |
| `-kouhai` | `-kouhai` | Junior (rarely a suffix; usually narration) |
| `-sensei` | `-sensei` | Teacher, doctor, master craftsman |
| `-dono` | `-dono` | Archaic / samurai register |
| Family terms (`Onii-chan`, `Otou-san`, …) | Keep romaji | Don't convert to `anh ơi` / `bố ơi` unless target is mass audience |

**Generic example.** Audio: *"Yamada-san, ohayou."* → VI: `"Chào buổi sáng, Yamada-san."`
**Generic example.** Audio: *"Sensei, kore wa…"* → VI: `"Sensei, cái này…"`

### Rule 2 — Audio-Adapted Pronoun (only when a pronoun is actually spoken)

When the Japanese audio explicitly says one of the personal pronouns below, map it to a Vietnamese kinship term based on **voice cues you can hear in the take**.

| JP pronoun | Speaker hint | Address direction | VI mapping |
|---|---|---|---|
| `ore` | Male, casual | self | peers `tôi/tớ/mình` · child to adult `cháu/em/con` · adult to child `chú/anh` |
| `boku` | Male, soft / boyish | self | child `cháu/con/em` · adult-to-junior softening `anh/tôi` |
| `watashi` | Neutral / female / formal | self | formal `tôi` · in-family `con/em/mình` · adult to child `cô/chú` |
| `atashi` | Female, casual | self | peers `tớ/mình` · younger sibling `em` |
| `washi` | Older male, archaic | self | `ông/lão/ta` |
| `ware` / `ore-sama` | Grandiose | self | `ta` |
| `omae` | Male, blunt | other | peer `cậu/mày` (only with same-age tonal cue) · adult to child `cháu/em` |
| `kimi` | Soft, slightly down-register | other | peer `cậu` · adult to junior `em` |
| `anata` | Polite / wife addressing husband | other | formal `bạn/anh/chị` · spousal `mình/anh` |
| `kisama` / `temee` | Aggressive | other | `mày/ngươi` |

**Voice cue checklist (verify before you commit):**

- **Vocal maturity** — Is one voice clearly deeper / older than the other? → assume age gap.
- **Politeness register** — Sentence-final `desu/masu` or honorifics → formal/social distance.
- **Familial markers** — A character addressed as `Kaa-chan/Tou-san/Nee-san/…` locks the family role for the whole scene.
- **Status markers** — Customer service register (`-sama`, `irasshaimase`) → server is `cháu/em`, customer is `quý khách/anh/chị`.

**Generic example.** Adult deep voice to clearly young voice — *"Omae, sugoi na."* → VI: `"Cháu giỏi thật đấy."`
**Generic example.** Two same-age classmates — *"Ore mo iku."* → VI: `"Tớ cũng đi."`
**Generic example.** Customer service register — *"Anata-sama, kochira e."* → VI: `"Mời quý khách bên này ạ."`

### Rule 3 — Pro-Drop (the default — see Cardinal Rule above)

This is the rule the rest of the skill bends around. Whenever Rules 1 and 2 don't fire (no name/honorific spoken, no JP pronoun spoken), this rule fires. In practice **this is the majority of lines** — most casual anime dialogue uses no pronouns at all, only verbs and particles.

#### How to drop a subject in Vietnamese naturally

Lean on **sentence-final particles** to carry the social register the subject would have carried:

| Particle | Register | With no subject sounds like |
|---|---|---|
| `ạ` | Polite to elder/customer | "Vâng ạ." · "Cảm ơn ạ." · "Đến rồi ạ." |
| `nhé` | Friendly soft | "Mai gặp lại nhé." · "Đừng lo nhé." |
| `nhỉ` | Seeking agreement | "Đẹp nhỉ?" · "Lâu quá nhỉ?" |
| `đấy` | Mild emphasis | "Cẩn thận đấy." · "Đang nói đấy." |
| `chứ` | Mild contrast / assertion | "Biết rồi chứ." · "Phải làm chứ." |
| `mà` | Reminder / mild protest | "Đã nói rồi mà." · "Có sao đâu mà." |
| `thôi` | Resignation / capping | "Đi thôi." · "Mệt thôi." · "Nghỉ thôi." |
| `đi` | Light imperative | "Ăn đi." · "Ngủ đi." · "Vào đi." |
| `kìa` | Pointing out | "Đến rồi kìa!" · "Nhanh lên kìa." |
| `vậy` | Mild question / so | "Sao lại vậy?" · "Vậy à?" |
| `hả` / `à` | Question casual | "Thật hả?" · "Đi à?" |

#### Side-by-side: WRONG vs RIGHT

Every WRONG below is an AI hallucinating a kinship that the audio never licensed. Every RIGHT drops the subject and relies on particles.

| EN line | Audio (no pronoun, no name) | ❌ WRONG (invented kinship) | ✅ RIGHT (pro-drop) |
|---|---|---|---|
| "What are you doing?" | "Nani shiteru no?" | "Cậu đang làm gì vậy?" | "Đang làm gì vậy?" |
| "I'll go ahead." | "Saki ni iku ne." | "Tôi đi trước nhé." | "Đi trước nhé." |
| "You're really kind." | "Hontou ni yasashii ne." | "Anh thật tốt bụng." | "Tốt bụng thật đấy." |
| "I don't know." | "Wakaranai." | "Em không biết." | "Không biết." |
| "Are you okay?" | "Daijoubu?" | "Cậu ổn không?" | "Ổn chứ?" |
| "I'm sorry." | "Gomen." | "Tớ xin lỗi." | "Xin lỗi nhé." |
| "You're late!" | "Osoi!" | "Anh đến trễ!" | "Trễ quá đấy!" |
| "I made this." | "Tsukutta yo." | "Tôi đã làm cái này." | "Làm đấy." / "Tự tay làm đấy." |
| "Did you hear?" | "Kiita?" | "Cậu nghe chưa?" | "Nghe chưa?" |
| "I'll be right back." | "Sugu modoru." | "Tôi quay lại ngay." | "Quay lại ngay đây." |
| "You'll catch a cold." | "Kaze hiku yo." | "Em sẽ bị cảm đấy." | "Cảm bây giờ đấy." |
| "Welcome home." | "Okaeri." | "Chào anh về." | "Về rồi à." / "Về rồi đấy." |
| "I forgot." | "Wasureta." | "Tôi quên mất." | "Quên mất rồi." |
| "Where are you going?" | "Doko iku no?" | "Cậu đi đâu vậy?" | "Đi đâu vậy?" |
| "Help me!" | "Tasukete!" | "Cứu em với!" | "Cứu với!" |

#### The Pro-Drop Test — run on EVERY translated line

```
Did the VI line I wrote contain any of these?
  tôi · tớ · mình · ta · tao · ngươi
  anh · chị · em · con · cháu · cậu · bạn · mày
  cô · chú · bác · ông · bà · dì · cậu (kinship sense) · mẹ · bố · ba · má

If YES, ask:
  Did the JP audio actually speak a pronoun (ore/watashi/omae/kimi/anata/…)?
  OR did the audio speak a name + honorific (Yamada-san, Onii-chan, Sensei…)?

  If BOTH NO → DELETE the pronoun and rewrite the line subject-less.
```

#### Common pro-drop violations to catch in self-check

- **"Anh/Em" added for romantic vibe.** AI loves writing `anh/em` in any two-person scene because EN romance tropes use them. Without a JP pronoun in the take, drop them.
- **"Cậu/bạn" added for politeness.** AI adds these to "soften" — they actually impose a relationship. Drop them; use `nhé` or `đấy` instead.
- **"Tôi" added at sentence start because EN says "I".** Almost never correct. JP drops first-person pronouns even more than VI does. Default: omit.
- **"Cháu/em" added because one voice sounds young.** Voice age alone is not enough — there must be a JP pronoun OR honorific in the take. Voice young + no pronoun = still pro-drop.
- **"Mày/tao" added for aggression.** Only if the audio is clearly `omae/kisama/temee` with an aggressive tone. Yelling alone doesn't license `mày/tao`.

---

## Translation Style (Safe Fansub register)

- **Conversational, natural Vietnamese**, not a literal English mirror. Re-order, split, and combine clauses to match how a native would actually say it aloud.
- **Match the scene register.** Slice-of-life calm → soft, neutral. Comedy → punchy, snappy. Drama → measured, no slang. Action → terse, present-tense.
- **No Gen Z slang** (`flex`, `cringe`, `xịn xò`, `gato`, `dú dắt`, …) — they date fast and break formal registers.
- **No English code-switching** unless the original Japanese itself code-switches (e.g., a character says `Thank you` in English in-show → keep `Thank you`, do not "translate" it to `Cảm ơn`).
- **Idioms travel by meaning, not by words.** EN `"You're pulling my leg"` → not `"Anh đang kéo chân tôi"` ; render as `"Đùa hoài."` / `"Trêu tôi đấy à?"`.
- **Numbers, time, units** — convert spelling but never the value (`twelve o'clock` → `mười hai giờ`, not `noon` → `trưa` unless audio confirms it's daytime).
- **Onomatopoeia / interjections** — Vietnamese has its own (`Ơ`, `Ủa`, `Á`, `Ồ`, `Hả`, `Ờ`, `Ừ`); use them, don't transliterate (`Eh?` → `Ủa?`, not `Eh?`).
- **Cultural-specific terms** — keep romaji and trust the viewer:
  - Food: `onigiri`, `ramen`, `mochi`, `dango`, `takoyaki`, `bento` — keep as is.
  - Festivals / objects: `omikuji`, `hanami`, `yukata`, `kotatsu`, `shoji` — keep romaji.
  - Honorific titles within a setting: `daimyo`, `shogun`, `okami`, `joushu` — keep romaji.
- **Signs and on-screen text** (`{\an8}` style overlays) — translate concisely; if it's a brand or location, often best to keep the original.
- **Songs (OP / ED inserts)** — if the script has them, translate the *meaning* in natural Vietnamese poetry; do not preserve EN line breaks if they break Vietnamese flow.

---

## ASS Format Preservation (non-negotiable)

Every `Dialogue:` line has this shape:

```
Dialogue: Layer,Start,End,Style,Name,MarginL,MarginR,MarginV,Effect,Text
```

You translate the **Text field only** — everything after the **9th comma**. The 9 leading fields stay **byte-identical**. Do not rewrap, do not reformat, do not drop the trailing newline.

Inside the `Text` field, **preserve verbatim**:

- Override tags: `{\i1}`, `{\i0}`, `{\b1}`, `{\b0}`, `{\c&Hxxxxxx&}`, `{\pos(x,y)}`, `{\fad(in,out)}`, `{\move(...)}`, `{\fs24}`, `{\fnArial}`, etc.
- Hard line break: `\N` (capital N — software linebreak in the rendered subtitle).
- Non-breaking space: `\h`.
- Two-speaker dash pairs: lines that begin `-` and contain `\N-` are two speakers on screen at once; keep both dashes and the `\N` exactly, translate each half.
- Karaoke / k-tags (`{\k50}`, `{\kf30}`) — keep timings, translate syllable text only if you can sensibly split (otherwise translate as one line and drop karaoke timing in the line, **never alter the tag values**).

The `[V4+ Styles]` block (font, colour, outline) is also **not yours to change** — it stays exactly as it was in the source.

---

## Worked examples (generic, no specific anime)

| EN text | Audio | Safe VI translation | Why |
|---|---|---|---|
| "What are you doing?" | "Nani shiteru no?" (no pronoun) | "Đang làm gì đấy?" | Pro-drop; `đấy` softens |
| "I'll go." | "Iku yo." (no pronoun) | "Đi đây." | Pro-drop |
| "You can do it." | "Dekiru yo." (no pronoun, no name) | "Làm được mà." | Pro-drop + `mà` for encouragement |
| "Sakura-chan, breakfast is ready!" | "Sakura-chan, gohan dekita yo!" | "Sakura-chan, ăn sáng được rồi đấy!" | Honorific kept, pro-drop on speaker |
| "I won't forgive you!" | Adult deep voice: "Ore wa omae wo yurusan!" | "Tao không tha cho mày đâu!" | `ore + omae` + aggressive tone → `tao/mày` |
| "Thank you very much." | Customer-service voice: "Arigatou gozaimasu." | "Xin cảm ơn ạ." | `gozaimasu` polite + customer cue → `ạ` |
| "Are you all right?" | Adult to clearly child voice: "Daijoubu ka?" | "Cháu không sao chứ?" | Audio age gap + question → `cháu` (Rule 2) |
| "I'm scared." | Child voice, no pronoun: "Kowai…" | "Sợ quá…" | Pro-drop even though child voice — no pronoun was spoken |
| "Welcome back, sir." | Maid register, `-sama` audio: "Okaeri nasaimase, danna-sama." | "Chào ngài đã về, danna-sama." | `-sama` kept; servant register `ngài` |
| "Don't worry about it." | Friend to friend, no pronoun: "Ki ni shinaide." | "Đừng để bụng nhé." | Pro-drop, `nhé` for warm tone |
| "Onii-chan, wait up!" | Younger girl voice to older brother | "Onii-chan, chờ với!" | Family term kept as is |
| "It's raining." | Narration, no speaker: "Ame da." | "Trời đang mưa." | No subject in JP → no kinship pronoun in VI |

---

## Workflow when invoked

1. **Read the source `.ass` end-to-end.** Note the cast (names from speaker `Name` field if available + names spoken in dialogue), apparent relationships, and overall register (slice-of-life / drama / action / comedy). Don't write yet.
2. **Match each line to the audio** as you translate internally. For every line:
   - Name + honorific spoken? → keep it.
   - Explicit Japanese pronoun spoken? → apply Rule 2 with the voice-cue checklist.
   - Neither? → apply Rule 3 (pro-drop) with a suitable sentence-final particle.
3. **Self-check silently before emitting.** Walk back through your draft in this order:
   - **🎯 Run the Pro-Drop Test on EVERY line first.** Scan for any of `tôi/tớ/mình/anh/chị/em/con/cháu/cậu/bạn/cô/chú/bác/ông/bà/mẹ/bố/mày/tao/ngươi/ta`. For each occurrence, can you trace it to (a) an actual JP pronoun spoken in the take, or (b) a name + honorific spoken? If neither → delete and rewrite the line subject-less with a particle. This pass catches >90% of real translation errors.
   - Every `Dialogue:` line still has 9 commas before the Text.
   - No line is missing, no line is duplicated.
   - Override tags inside Text are byte-identical to source.
   - All non-`Events` sections present and unchanged.
4. **Emit.** Your reply is exactly one ` ```ass ` fenced code block containing the complete translated file. No greeting. No commentary. No "Done!". The block is the deliverable.
