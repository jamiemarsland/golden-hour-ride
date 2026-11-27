# pocket-tts PoC

This script reads text aloud using [Kyutai Pocket TTS](https://github.com/kyutai-labs/pocket-tts). The model has about 100M parameters and runs on the CPU only.

Dependencies are declared inline (PEP 723), so `uv run` creates the environment on its own. pocket-tts needs Python 3.10 to 3.14, and uv picks a matching interpreter. The first run downloads the model and voice from Hugging Face into `~/.cache/huggingface`.

```bash
uv run read_text.py "Hello, this is a quick test." --play
uv run read_text.py -f sample.txt --voice marius --play
echo "Hallo, das ist ein Test." | uv run read_text.py --language german --voice juergen --play
uv run read_text.py -f sample.txt --voice ./my_voice.wav   # voice cloning from a wav
```

The script writes `output.wav` (change it with `-o`) and prints the load time, the generation time and the real-time factor.

There are more built-in voices: alba, marius, javert, jean, anna, charles, eve, george, jane, mary, paul, vera, and others. See the upstream README for the full list.
