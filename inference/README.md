# Local inference configuration

Phase 0 configures inference only. The user asked to configure the model ourselves; no weights were downloaded and no inference process was installed or run. Hardware readiness, output quality and latency remain unverified until Phase 1.

`model.json` pins the chosen checkpoint, upstream revision, parameter count, license, quantization, Ollama artifact digest, local endpoint, context and generation limits. The [publisher metadata](https://huggingface.co/api/models/Qwen/Qwen2.5-Coder-7B-Instruct) reports 7,615,616,512 parameters. The [model card](https://huggingface.co/Qwen/Qwen2.5-Coder-7B-Instruct) declares Apache-2.0. The exact [Ollama artifact manifest](https://registry.ollama.ai/v2/library/qwen2.5-coder/manifests/7b-instruct-q4_K_M) was hashed without downloading its layers.

Ollama's [structured-output interface](https://docs.ollama.com/capabilities/structured-outputs) accepts JSON Schema in the local `format` field. Future clients must validate every returned object independently; schema formatting is not evidence of correct SQL. Keep runtime replaceable and local-only. The API/client and model are not connected in Phase 0.

Before live use, an operator must install an appropriate local runtime, verify the pinned artifact digest, record the exact runtime version, available memory and hardware, verify localhost-only binding, and run structured-output/timeout/cancellation smoke tests with synthetic data. Quantization changes memory requirements, not parameter count. Recheck challenge rules and license suitability before release.

No remote inference or private-data transfer is configured. Do not claim model readiness from the presence of this manifest. Track actual hardware and workload results in the later inference validation report.
