---
license: apache-2.0
language:
- en
- nl
pretty_name: CalmCampus Reframe data
task_categories:
- text-generation
size_categories:
- n<1K
tags:
- wellbeing
- cbt
- synthetic
configs:
- config_name: chat
  data_files:
  - split: train
    path: chat/train.jsonl
  - split: validation
    path: chat/valid.jsonl
- config_name: test_items
  data_files:
  - split: test
    path: test_items/test.jsonl
---

# CalmCampus Reframe data

The data behind the [CalmCampus reframe model](https://huggingface.co/CalmCampus/calmcampus-reframe-1.7b-4bit): a small model that turns a student's negative automatic thought into three balanced alternative thoughts (CBT-style reframing), answers `{"safety": true}` instead of reframing when a message suggests self-harm or danger, and `{"unclear": true}` for off-topic input.

> **Everything here is synthetic.** All examples were written for this project by Claude (an Anthropic model) at the CalmCampus team's direction. **No user data and no third-party datasets were used.** They have **not** been reviewed by clinicians or student counsellors.

## Contents

| Split | File | Rows | Format |
|---|---|---|---|
| train | `chat/train.jsonl` | 398 | chat messages (`system`, `user`, `assistant`), the system prompt included |
| validation | `chat/valid.jsonl` | 44 | same |
| test | `test_items/test.jsonl` | 60 | `{"lang", "text", "expected", "pattern"}` (held out, written first, never trained on) |

Train and validation together are 442 examples: 222 reframing examples (163 English, 59 Dutch), 136 crisis messages (explicit and indirect, including violence from others and crisis phrasing mixed into academic stress), 66 off-topic and prompt-injection messages, and 18 everyday exaggerations ("this exam is killing me") labelled as normal reframes so they do not trigger the crisis response. The test set has 30 thoughts to reframe (20 English, 10 Dutch), 15 crisis messages (10 English, 5 Dutch) and 15 off-topic or injection messages.

## Please read before using

- **Crisis messages are included on purpose**, to train and test safety routing. They are short, hand-written examples and are not a clinical resource.
- **One author wrote the training, validation and test data**, so a model scored on the test set is measured on that author's phrasing, not on real students.
- **The test set is public now.** If you train on it, it stops being a test.
- **Dutch examples are fewer and weaker** than the English ones.
- Not for diagnosis or crisis assessment of real people.

## License

Apache-2.0.
