---
license: apache-2.0
base_model: Qwen/Qwen3-1.7B
library_name: mlx
pipeline_tag: text-generation
language:
- en
tags:
- mlx
- cbt
- wellbeing
- bf16
datasets:
- CalmCampus/calmcampus-reframe-data
---

# CalmCampus Reframe 1.7B, bf16 (v0.1 research preview)

The unquantised (bfloat16) weights of the CalmCampus reframe model: [Qwen3-1.7B](https://huggingface.co/Qwen/Qwen3-1.7B) with the CalmCampus LoRA adapter fused in, **before** the 4-bit quantisation step. It is published so others can convert it to other formats, quantise it differently or inspect it.

**The 4-bit model, [CalmCampus/calmcampus-reframe-1.7b-4bit](https://huggingface.co/CalmCampus/calmcampus-reframe-1.7b-4bit), is the one the app is designed to run and the one that was evaluated.** Its model card holds the task description, prompt contract, training data, evaluation results and limitations, and **all of it applies here too**, including:

> **Research preview. Not a medical device and not a standalone crisis detector.** It misses some crisis messages, and its Dutch output is unreliable. Any app using it must run its own crisis check before calling the model and must always offer human support resources.

The evaluation numbers on the 4-bit card were measured on the 4-bit file, not on this one.

## Details

| | |
|---|---|
| Base model | [Qwen/Qwen3-1.7B](https://huggingface.co/Qwen/Qwen3-1.7B) (Apache-2.0) |
| Precision | bfloat16 |
| Size | about 3.4 GB |
| Architecture | `Qwen3ForCausalLM` |
| Prompt | `system_prompt.txt` in this repo. Use it exactly, with the Qwen chat template and thinking disabled |

```python
from mlx_lm import load, generate
model, tok = load("CalmCampus/calmcampus-reframe-1.7b-bf16")
```

It has been loaded and run with `mlx-lm` only. It has not been tested with other runtimes.

## License

Apache-2.0, following the base model. Base model (c) the Qwen team.
