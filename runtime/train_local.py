#!/usr/bin/env python3
"""Self-adaptive local fine-tuner for OpenBrain.

Probes the machine it runs on (CUDA/GPU/VRAM, training libs) and picks a
base model + method that actually fit there. Trains a LoRA/QLoRA adapter
for the goal in the job spec and writes the result into the job dir.

No device names or VRAM sizes are hardcoded: it reads the live environment
at runtime, so the same script works on a 4GB laptop or an A100 box.

Streams progress to stdout as one JSON object per line:
  {"type":"probe", ...}            system analysis
  {"type":"log", "level","message"} human-readable progress
  {"type":"progress","step","message"} percentage-ish step marker
  {"type":"result", ...}           success payload
  {"type":"error", "message"}      failure

Usage:
  python train_local.py --spec <spec.json> --job-dir <dir> [--max-steps N]
"""

import argparse
import json
import os
import platform
import sys
import time
import traceback


def emit(payload):
    print(json.dumps(payload), flush=True)


def probe_system():
    info = {
        "platform": platform.system(),
        "python": platform.python_version(),
        "cuda": False,
        "gpu": None,
        "vram_mb": 0,
        "torch": None,
        "unsloth": False,
        "peft": False,
        "bitsandbytes": False,
        "transformers": None,
    }
    try:
        import torch

        info["torch"] = torch.__version__
        info["cuda"] = torch.cuda.is_available()
        if info["cuda"]:
            props = torch.cuda.get_device_properties(0)
            info["gpu"] = torch.cuda.get_device_name(0)
            info["vram_mb"] = int(props.total_memory // (1024 * 1024))
    except Exception as exc:  # pragma: no cover - env dependent
        emit({"type": "log", "level": "warning", "message": f"torch probe failed: {exc}"})
    for lib, key in (
        ("transformers", "transformers"),
        ("peft", "peft"),
        ("bitsandbytes", "bitsandbytes"),
        ("unsloth", "unsloth"),
        ("datasets", "datasets"),
    ):
        try:
            module = __import__(lib)
            if hasattr(module, "__version__"):
                info[key] = module.__version__
        except Exception:
            pass
    if info.get("unsloth"):
        info["unsloth"] = True
    return info


# Model tiers keyed by VRAM threshold. QLoRA 4-bit lets a bigger model fit;
# without bitsandbytes we fall back to plain LoRA and pick a smaller tier.
MODEL_TIERS = [
    (0, "Qwen/Qwen2.5-0.5B-Instruct"),
    (6144, "Qwen/Qwen2.5-1.5B-Instruct"),
    (12288, "Qwen/Qwen2.5-3B-Instruct"),
    (24576, "Qwen/Qwen2.5-7B-Instruct"),
]


def pick_base_model(system, spec, want_qlora):
    explicit = str(spec.get("baseModel") or "").strip()
    if explicit:
        return explicit
    if not want_qlora and system["vram_mb"] < 12288:
        # Without 4-bit quant, stay small so LoRA fits comfortably.
        if system["vram_mb"] < 6144:
            return MODEL_TIERS[0][1]
        return MODEL_TIERS[1][1]
    for threshold, model in MODEL_TIERS:
        if system["vram_mb"] >= threshold:
            return model
    return MODEL_TIERS[-1][1]


def synthesize_dataset(goal):
    """Minimal honest instruction set derived from the goal.

    Used only when the requested dataset can't be reached (no HF access or
    load failure). Logged loudly so nobody mistakes it for real data.
    """
    title = (goal or "the target task").strip()
    templates = [
        ("What is the main purpose of this work?", f"This work is about: {title}."),
        ("Summarize the goal.", f"The goal is: {title}."),
        ("What should be optimized here?", f"The focus area is: {title}."),
        ("What is the target task?", f"The target task is: {title}."),
        ("Explain the objective in one sentence.", f"The objective is to address: {title}."),
    ]
    rows = []
    for instruction, output in templates:
        rows.append({"instruction": instruction, "input": "", "output": output})
        rows.append({"instruction": f"Describe: {title}", "input": "", "output": output})
    return rows


def load_dataset_rows(spec, system, max_rows=128):
    goal = str(spec.get("goal") or "")
    dataset_ref = str(spec.get("dataset") or "").strip()
    rows = []
    source = None
    if dataset_ref:
        try:
            import datasets

            ds = datasets.load_dataset(
                dataset_ref, split="train", streaming=True, trust_remote_code=True
            )
            for row in ds:
                record = {
                    "instruction": str(row.get("instruction") or row.get("question") or row.get("prompt") or ""),
                    "input": str(row.get("input") or ""),
                    "output": str(row.get("output") or row.get("answer") or row.get("response") or ""),
                }
                if record["instruction"] and record["output"]:
                    rows.append(record)
                if len(rows) >= max_rows:
                    break
            source = f"HuggingFace dataset {dataset_ref} (first {len(rows)} rows)"
        except Exception as exc:
            emit({"type": "log", "level": "warning", "message": f"Dataset load failed ({dataset_ref}): {exc}"})
            rows = []
    if not rows:
        rows = synthesize_dataset(goal)
        source = "synthetic instruction set derived from the goal (dataset unreachable)"
    return rows, source


def build_text(record, tokenizer):
    instruction = str(record.get("instruction") or "").strip()
    inp = str(record.get("input") or "").strip()
    output = str(record.get("output") or "").strip()
    parts = [f"<|im_start|>user\n{instruction}"]
    if inp:
        parts.append(inp)
    parts.append("<|im_end|>\n<|im_start|>assistant\n")
    parts.append(output)
    parts.append("<|im_end|>")
    return "\n".join(parts)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--spec", required=True, help="Path to spec.json")
    parser.add_argument("--job-dir", required=True, help="Directory to write outputs into")
    parser.add_argument("--max-steps", type=int, default=0, help="Cap training steps (0 = derived from data)")
    args = parser.parse_args()

    try:
        with open(args.spec, "r", encoding="utf-8") as handle:
            spec = json.load(handle)
    except Exception as exc:
        emit({"type": "error", "message": f"Cannot read spec: {exc}"})
        return 1

    os.makedirs(args.job_dir, exist_ok=True)

    emit({"type": "probe", "system": probe_system()})
    system = probe_system()

    want_qlora = str(spec.get("method") or "lora").lower() in ("qlora", "full")
    use_qlora = want_qlora and system["bitsandbytes"]
    base_model = pick_base_model(system, spec, use_qlora)

    emit({"type": "log", "level": "info", "message": f"System probe: CUDA={system['cuda']}, GPU={system['gpu'] or 'none'}, VRAM={system['vram_mb']}MB, torch={system['torch']}"})
    emit({"type": "log", "level": "info", "message": f"Base model: {base_model} ({'QLoRA' if use_qlora else 'LoRA'} via transformers+peft)"})

    try:
        import torch
    except Exception as exc:
        emit({"type": "error", "message": f"torch is required for local training: {exc}"})
        return 1

    device = "cuda" if system["cuda"] else "cpu"
    if device == "cpu":
        emit({"type": "log", "level": "warning", "message": "No CUDA device found — training on CPU with a tiny model. Expect slow progress."})
        base_model = MODEL_TIERS[0][1]

    rows, source = load_dataset_rows(spec, system)
    emit({"type": "log", "level": "info", "message": f"Dataset: {source}"})
    emit({"type": "log", "level": "info", "message": f"Training samples: {len(rows)}"})

    from transformers import AutoModelForCausalLM, AutoTokenizer, TrainingArguments, Trainer, DataCollatorForLanguageModeling
    from datasets import Dataset

    emit({"type": "progress", "step": "download", "message": f"Loading {base_model}…"})
    tokenizer = AutoTokenizer.from_pretrained(base_model, trust_remote_code=True)
    if tokenizer.pad_token is None:
        tokenizer.pad_token = tokenizer.eos_token

    texts = [build_text(record, tokenizer) for record in rows]
    tokenized = tokenizer(
        texts,
        truncation=True,
        max_length=512,
        padding="max_length",
        return_tensors="pt",
    )
    dataset = Dataset.from_dict({key: val.tolist() for key, val in tokenized.items()})

    hyper = spec.get("hyperparameters") or {}
    epochs = min(int(hyper.get("epochs") or 3), 4)
    rank = int(hyper.get("rank") or (8 if use_qlora else 16))
    learning_rate = float(hyper.get("learningRate") or 1e-4)
    batch_size = int(hyper.get("batchSize") or 4)

    from peft import LoraConfig, get_peft_model

    if use_qlora:
        from transformers import BitsAndBytesConfig

        quantization = BitsAndBytesConfig(
            load_in_4bit=True,
            bnb_4bit_compute_dtype=torch.float16,
            bnb_4bit_use_double_quant=True,
            bnb_4bit_quant_type="nf4",
        )
        model = AutoModelForCausalLM.from_pretrained(
            base_model,
            trust_remote_code=True,
            quantization_config=quantization,
            device_map="auto",
        )
    else:
        model = AutoModelForCausalLM.from_pretrained(
            base_model,
            trust_remote_code=True,
            torch_dtype=torch.float16 if system["cuda"] else torch.float32,
        )
    lora_config = LoraConfig(
        r=rank,
        lora_alpha=rank * 2,
        lora_dropout=0.05,
        bias="none",
        task_type="CAUSAL_LM",
        target_modules=["q_proj", "k_proj", "v_proj", "o_proj", "gate_proj", "up_proj", "down_proj"],
    )
    model = get_peft_model(model, lora_config)

    if system["cuda"] and not use_qlora:
        model = model.to("cuda")

    steps = args.max_steps if args.max_steps > 0 else max(1, len(dataset) // batch_size) * epochs
    emit({"type": "log", "level": "info", "message": f"Training: {len(dataset)} samples, rank {rank}, {epochs} epoch(s), lr {learning_rate}, batch {batch_size}, ~{steps} steps"})

    training_args = TrainingArguments(
        output_dir=os.path.join(args.job_dir, "checkpoints"),
        per_device_train_batch_size=batch_size,
        gradient_accumulation_steps=1,
        num_train_epochs=epochs,
        learning_rate=learning_rate,
        fp16=system["cuda"],
        logging_steps=1,
        save_strategy="no",
        report_to=[],
        max_steps=args.max_steps if args.max_steps > 0 else -1,
        dataloader_pin_memory=False,
    )

    data_collator = DataCollatorForLanguageModeling(tokenizer=tokenizer, mlm=False)

    class ProgressTrainer(Trainer):
        def log(self, logs, start_time=None):
            super().log(logs, start_time)
            if "loss" in logs:
                emit({"type": "progress", "step": "train", "loss": float(logs["loss"]), "step_number": int(logs.get("step", 0))})
                emit({"type": "log", "level": "info", "message": f"step {logs.get('step', 0)} · loss {logs['loss']:.4f}"})

    trainer = ProgressTrainer(
        model=model,
        args=training_args,
        train_dataset=dataset,
        data_collator=data_collator,
    )

    emit({"type": "progress", "step": "train", "message": "Training started…"})
    started = time.time()
    trainer.train()
    elapsed = round(time.time() - started, 1)

    adapter_dir = os.path.join(args.job_dir, "adapter")
    os.makedirs(adapter_dir, exist_ok=True)
    trainer.model.save_pretrained(adapter_dir)
    tokenizer.save_pretrained(adapter_dir)

    final_loss = None
    for entry in reversed(getattr(trainer.state, "log_history", []) or []):
        if isinstance(entry, dict) and entry.get("loss") is not None:
            final_loss = float(entry["loss"])
            break

    emit({"type": "log", "level": "success", "message": f"Training complete in {elapsed}s — adapter saved to {adapter_dir}"})
    emit({
        "type": "result",
        "adapter": adapter_dir,
        "baseModel": base_model,
        "method": "qlora" if use_qlora else "lora",
        "trainer": "transformers+peft",
        "samples": len(rows),
        "loss": final_loss,
        "elapsedSeconds": elapsed,
        "system": system,
        "datasetSource": source,
    })
    return 0


if __name__ == "__main__":
    try:
        sys.exit(main())
    except Exception as exc:  # pragma: no cover - top-level guard
        traceback.print_exc()
        emit({"type": "error", "message": f"Local training failed: {exc}"})
        sys.exit(1)
