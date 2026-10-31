# Kindle working manuscript

`I_Frankenstein_Kindle_draft.md` is a generated working draft of the gamebook in a form that needs no code:

- Empathy and Alienation are scores the reader keeps.
- Every true/false flag is a keyword placeholder (`KW_<name>`) the reader notes down.
- Trust is not tracked by the reader; sections that depend on it exist in several numbered copies ("Trust threads") and links route the reader to the right copy.
- Every place that needs an author's decision is marked with ⚠ EDIT.

To regenerate (Node 22):

```bash
cd kindle/tools
NOGATE=1 TRACK=victor_empathy,alienation CLASSMAP=classmap_trust.json DETAIL=detail_trust.json node keyword_model4.js ../../story.html > /dev/null
node kindle_build.js ../../story.html classmap_trust.json ../I_Frankenstein_Kindle_draft.md detail_trust.json
```
