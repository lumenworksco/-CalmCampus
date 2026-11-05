---
license: apache-2.0
base_model: mlx-community/Qwen3-1.7B-4bit
library_name: mlx
pipeline_tag: text-generation
language:
- en
tags:
- mlx
- lora
- cbt
- wellbeing
datasets:
- CalmCampus/calmcampus-reframe-data
---

# CalmCampus Reframe LoRA adapter (v0.1 research preview)

The LoRA adapter (MLX format, 67 MB) behind [CalmCampus/calmcampus-reframe-1.7b-4bit](https://huggingface.co/CalmCampus/calmcampus-reframe-1.7b-4bit). It is the fine-tuning delta on its own, so you can see exactly what was trained on top of Qwen3-1.7B.

The task, prompt contract, evaluation and limitations are on the [4-bit model card](https://huggingface.co/CalmCampus/calmcampus-reframe-1.7b-4bit). They apply to this adapter too: **research preview, not a medical device, not a standalone crisis detector.**

## Training

| | |
|---|---|
| Trained on | [mlx-community/Qwen3-1.7B-4bit](https://huggingface.co/mlx-community/Qwen3-1.7B-4bit) (QLoRA with `mlx-lm`) |
| LoRA | rank 16, scale 20, dropout 0.05, all layers |
| Optimiser | learning rate 1e-4, batch size 2, seed 42, 600 iterations configured |
| Checkpoint | step 500, chosen by scoring checkpoints on behaviour |
| Data | [CalmCampus/calmcampus-reframe-data](https://huggingface.co/datasets/CalmCampus/calmcampus-reframe-data) |

The published 4-bit model is **not** this adapter applied to the 4-bit base: the adapter was fused into the bf16 base and the result quantised to 4-bit. The source repository's `ml/package.sh` does exactly that.

## Use

```python
from huggingface_hub import snapshot_download
from mlx_lm import load
path = snapshot_download("CalmCampus/calmcampus-reframe-1.7b-lora")
model, tok = load("mlx-community/Qwen3-1.7B-4bit", adapter_path=path)
```

## License

Apache-2.0, following the base model. Base model (c) the Qwen team.
