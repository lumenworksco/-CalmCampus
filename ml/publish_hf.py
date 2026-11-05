#!/usr/bin/env python3
"""Publish the CalmCampus models and dataset to the CalmCampus Hugging Face organisation.

    .venv/bin/python publish_hf.py                # dry run: checks every file and prints the plan
    .venv/bin/python publish_hf.py --execute      # create the public repos and upload
    .venv/bin/python publish_hf.py --verify       # download from the Hub with an empty cache and run the model

Needs `hf auth login` with a token that can write to the organisation. The token is read from the
local Hugging Face login, never from this repository.

The text that appears on the Hub is committed here: ml/MODEL_CARD.md (4-bit model) and ml/hf/cards/*.md,
so a review of this repo is a review of what gets published. The exact files uploaded are listed in
REPOS below; training checkpoints and sweep runs are deliberately not published.
"""
import argparse, hashlib, json, os, sys, tempfile
from pathlib import Path

ML = Path(__file__).resolve().parent
RUNS, HF, DATA = ML / "runs", ML / "hf", ML / "data" / "out"
FOUR = RUNS / "calmcampus-reframe-1.7b-4bit"
BF16 = RUNS / "calmcampus-reframe-1.7b-4bit-bf16"   # folder name is historical: these are the fused bf16 weights
LORA = RUNS / "lora-1.7b-v2-best"
MODEL_FILES = ["chat_template.jinja", "config.json", "generation_config.json", "model.safetensors",
               "model.safetensors.index.json", "tokenizer_config.json", "tokenizer.json"]


def repos(org):
    return [
        dict(id=f"{org}/calmcampus-reframe-1.7b-4bit", type="model", msg="CalmCampus Reframe 1.7B 4-bit v0.1 (research preview)",
             files={**{f: FOUR / f for f in MODEL_FILES}, "system_prompt.txt": FOUR / "system_prompt.txt",
                    "adapter/adapters.safetensors": FOUR / "adapter" / "adapters.safetensors",
                    "adapter/adapter_config.json": FOUR / "adapter" / "adapter_config.json",
                    "README.md": ML / "MODEL_CARD.md", "LICENSE": HF / "LICENSE"}),
        dict(id=f"{org}/calmcampus-reframe-1.7b-bf16", type="model", msg="CalmCampus Reframe 1.7B bf16 v0.1 (research preview)",
             files={**{f: BF16 / f for f in MODEL_FILES}, "system_prompt.txt": FOUR / "system_prompt.txt",
                    "README.md": HF / "cards" / "reframe-1.7b-bf16.md", "LICENSE": HF / "LICENSE"}),
        dict(id=f"{org}/calmcampus-reframe-1.7b-lora", type="model", msg="CalmCampus Reframe LoRA adapter v0.1 (research preview)",
             files={"adapters.safetensors": LORA / "adapters.safetensors", "adapter_config.json": LORA / "adapter_config.json",
                    "README.md": HF / "cards" / "reframe-1.7b-lora.md", "LICENSE": HF / "LICENSE"}),
        dict(id=f"{org}/calmcampus-reframe-data", type="dataset", msg="CalmCampus Reframe data (synthetic, hand-written)",
             files={"chat/train.jsonl": DATA / "train.jsonl", "chat/valid.jsonl": DATA / "valid.jsonl",
                    "test_items/test.jsonl": DATA / "test_items.jsonl",
                    "README.md": HF / "cards" / "reframe-data.md", "LICENSE": HF / "LICENSE"}),
    ]


def sha256(path):
    h = hashlib.sha256()
    with open(path, "rb") as f:
        for chunk in iter(lambda: f.read(1 << 20), b""):
            h.update(chunk)
    return h.hexdigest()


def check(plan):
    """Fail loudly before anything leaves this machine."""
    problems = []
    for r in plan:
        for dest, src in r["files"].items():
            if not src.is_file():
                problems.append(f"missing {src}")
                continue
            if dest == "README.md":
                text = src.read_text()
                if not text.startswith("---\n") or "license: apache-2.0" not in text.split("---")[1]:
                    problems.append(f"{src}: card needs front matter with a license")
                for banned in ("iPwnds", "ucll", "(private)"):
                    if banned.lower() in text.lower():
                        problems.append(f"{src}: contains '{banned}'")
    # the adapter published on its own must be the one inside the 4-bit model
    if sha256(LORA / "adapters.safetensors") != sha256(FOUR / "adapter" / "adapters.safetensors"):
        problems.append("standalone adapter differs from the one inside the 4-bit model")
    # the system prompt shipped with the weights must be the one the model was trained with
    sys.path.insert(0, str(ML / "data"))
    from spec import SYSTEM_PROMPT
    if (FOUR / "system_prompt.txt").read_text().strip() != SYSTEM_PROMPT.strip():
        problems.append("system_prompt.txt differs from data/spec.py")
    return problems


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--org", default="CalmCampus")
    ap.add_argument("--execute", action="store_true", help="create the repos and upload (default: dry run)")
    ap.add_argument("--verify", action="store_true", help="download from the Hub with an empty cache and run the model")
    ap.add_argument("--only", nargs="+", metavar="NAME", help="upload only repos whose id ends with one of these (e.g. bf16 lora data); hashes of all repos are still compared")
    a = ap.parse_args()
    plan = repos(a.org)

    if a.verify:
        return verify(plan[0]["id"])

    problems = check(plan)
    for r in plan:
        total = sum(src.stat().st_size for src in r["files"].values() if src.is_file())
        print(f"\n{r['type']:7} {r['id']}  ({total / 1e6:,.0f} MB)")
        for dest, src in r["files"].items():
            print(f"    {dest:34} <- {src.relative_to(ML)}")
    if problems:
        print("\nPROBLEMS:\n  " + "\n  ".join(problems)); return 1
    print("\nAll checks passed." + ("" if a.execute else " Dry run: nothing uploaded. Re-run with --execute."))
    if not a.execute:
        return 0

    from huggingface_hub import HfApi, CommitOperationAdd
    api = HfApi()
    who = api.whoami()
    orgs = {o["name"]: o.get("roleInOrg") for o in who.get("orgs", [])}
    print(f"\nLogged in as {who['name']}; organisations: {orgs}")
    if a.org not in orgs or orgs[a.org] not in ("write", "admin", "contributor"):
        print(f"This login cannot write to {a.org}. Run `hf auth login` with a token that has write access to it."); return 1

    for r in plan:
        if a.only and not any(r["id"].endswith(n) for n in a.only):
            continue
        api.create_repo(r["id"], repo_type=r["type"], private=False, exist_ok=True)
        ops = [CommitOperationAdd(path_in_repo=d, path_or_fileobj=str(s)) for d, s in r["files"].items()]
        info = api.create_commit(r["id"], ops, repo_type=r["type"], commit_message=r["msg"])
        print(f"uploaded {r['id']}: {info.commit_url}")

    print("\nVerifying uploaded hashes against the local files...")
    bad = 0
    for r in plan:
        meta = api.repo_info(r["id"], repo_type=r["type"], files_metadata=True)
        remote = {s.rfilename: (s.lfs.sha256 if s.lfs else None) for s in meta.siblings}
        for dest, src in r["files"].items():
            if dest not in remote:
                print(f"  MISSING on Hub: {r['id']}/{dest}"); bad += 1
            elif remote[dest] and remote[dest] != sha256(src):
                print(f"  HASH MISMATCH: {r['id']}/{dest}"); bad += 1
    print("hashes match" if not bad else f"{bad} problem(s)")
    return 1 if bad else 0


def verify(repo_id):
    """Fresh cache, no login: proves the public repo loads and follows the prompt contract."""
    os.environ["HF_HOME"] = tempfile.mkdtemp(prefix="hf-verify-")
    os.environ.pop("HF_TOKEN", None)
    from mlx_lm import load, generate
    sys.path.insert(0, str(ML / "data"))
    from spec import SYSTEM_PROMPT
    model, tok = load(repo_id)
    tests = {"reframe": "I failed my stats exam, so I'm going to fail the whole year.", "unclear": "What's the capital of France?"}
    ok = True
    for kind, text in tests.items():
        msgs = [{"role": "system", "content": SYSTEM_PROMPT}, {"role": "user", "content": text}]
        prompt = tok.apply_chat_template(msgs, tokenize=False, add_generation_prompt=True, enable_thinking=False)
        out = generate(model, tok, prompt=prompt, max_tokens=220)
        try:
            j = json.loads(out)
            good = ("reframes" in j and len(j["reframes"]) == 3) if kind == "reframe" else j.get("unclear") is True
        except Exception:
            good, j = False, out
        print(f"{kind:8} {'ok ' if good else 'FAIL'} {out[:140]}")
        ok &= good
    return 0 if ok else 1


if __name__ == "__main__":
    sys.exit(main())
