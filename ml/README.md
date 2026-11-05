# CalmCampus reframe model

A small on-device language model, fine-tuned for one job: turning a student's negative automatic thought into three balanced alternative thoughts (CBT-style reframing). It recognises crisis messages and returns `{"safety": true}` instead of reframing them, and returns `{"unclear": true}` for off-topic input.

- **Status:** v0.1 research preview, see `MODEL_CARD.md` for evaluation and limitations. Weights and data are public on Hugging Face under [CalmCampus](https://huggingface.co/CalmCampus): [4-bit model](https://huggingface.co/CalmCampus/calmcampus-reframe-1.7b-4bit) (the one the app is designed to run), [bf16](https://huggingface.co/CalmCampus/calmcampus-reframe-1.7b-bf16), [LoRA adapter](https://huggingface.co/CalmCampus/calmcampus-reframe-1.7b-lora) and the [data](https://huggingface.co/datasets/CalmCampus/calmcampus-reframe-data).
- **Base:** [Qwen/Qwen3-1.7B](https://huggingface.co/Qwen/Qwen3-1.7B) (Apache-2.0). Runs on iPhone through MLX (`mlx-swift-lm` supports `qwen3`).
- **Method:** QLoRA with `mlx-lm` on an M3 MacBook (8 GB): LoRA trained on the 4-bit base, fused into the bf16 base, then quantized to 4-bit.
- **Why not Qwen3.5:** its Gated DeltaNet layers have a fast Metal kernel for inference but train through a per-token loop in mlx-lm (~2 tok/s on an M3), so a run would take ~8 h.
- **Languages:** English and Dutch.

## Layout

```
data/spec.py          System prompt + output contract (the app must send this exact prompt)
data/test_set.py      Held-out test set (written first, never trained on)
data/reframes_*.py    Training examples (hand-written; no user data)
data/safety_unclear.py  Crisis, off-topic and hyperbole examples
data/build.py         → data/out/{train,valid,test_items}.jsonl
configs/              mlx-lm LoRA configs
evaluate.py           Scores a model on the test set
package.sh            Fuse + 4-bit quantize + reload check
publish_hf.py         Publish the models and data to the CalmCampus Hugging Face org (dry run by default)
hf/                   The cards and license published with them (the 4-bit card is MODEL_CARD.md)
results/              Evaluation outputs
```

## Reproduce

```bash
cd ml
python3 -m venv .venv && .venv/bin/pip install mlx-lm
export HF_HOME=$PWD/.cache/hf TMPDIR=$PWD/.cache/tmp/

python3 data/build.py
.venv/bin/python evaluate.py --model mlx-community/Qwen3-1.7B-4bit             # baseline
.venv/bin/python -m mlx_lm lora -c configs/lora-1.7b-v2.yaml                    # train (~1 h)
MIN_STEP=200 ./sweep.sh configs/lora-1.7b-v2.yaml runs/lora-1.7b-v2    # score checkpoints by behaviour
./package.sh Qwen/Qwen3-1.7B runs/lora-1.7b-v2-best runs/calmcampus-reframe-1.7b-4bit
.venv/bin/python evaluate.py --model runs/calmcampus-reframe-1.7b-4bit           # score what ships
```

## Using it in the app

Send `SYSTEM_PROMPT` from `data/spec.py` as the system message and the student's thought as the user message, with the Qwen chat template and **thinking disabled** (the prompt ends in an empty `<think>\n\n</think>\n\n` block). Decode greedily and parse the JSON.

The app must still run its own crisis check **before** calling the model, and must treat `{"safety": true}` by showing support resources. The model is a second line of defence, not the only one.

## Publishing and getting the weights

Everything custom we ship is on Hugging Face, for transparency and so the app does not have to bundle a gigabyte of weights. The text on the Hub is committed here (`MODEL_CARD.md`, `hf/cards/`), so reviewing this repo reviews what is published.

```bash
.venv/bin/python publish_hf.py             # dry run: checks every file, prints the plan
hf auth login                              # token with write access to the CalmCampus org
.venv/bin/python publish_hf.py --execute   # create the public repos, upload, compare hashes
.venv/bin/python publish_hf.py --verify    # download with an empty cache and run the model
```

**Inference stays on the phone.** The app may download these public weights from the Hub (`mlx-swift-lm` can load a model by repo id) and cache them, but it must never send a student's text to the Hub's inference API or any other server; see the privacy rules in `CLAUDE.md`. The app does not load this model yet.
