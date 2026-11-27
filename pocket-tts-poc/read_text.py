# /// script
# requires-python = ">=3.10,<3.15"
# dependencies = ["pocket-tts>=4.0", "scipy"]
# ///
"""Pocket TTS PoC: read a text out loud with Kyutai's pocket-tts (CPU-only, ~100M params).

Examples:
    uv run read_text.py "Hello, this is a quick test."
    uv run read_text.py -f sample.txt --voice marius --play
    echo "Hallo Welt" | uv run read_text.py --language german --voice juergen --play
"""

import argparse
import subprocess
import sys
import time
from pathlib import Path

import scipy.io.wavfile
from pocket_tts import TTSModel


def main() -> None:
    p = argparse.ArgumentParser(description="Read text aloud with pocket-tts")
    p.add_argument("text", nargs="?", help="text to read (else --file or stdin)")
    p.add_argument("-f", "--file", type=Path, help="read text from a file")
    p.add_argument("-v", "--voice", default="alba", help="built-in voice name or path to a .wav for cloning")
    p.add_argument("-l", "--language", default="english", help="english, german, french, italian, spanish, portuguese, dutch")
    p.add_argument("-o", "--out", type=Path, default=Path("output.wav"))
    p.add_argument("-t", "--temperature", type=float, default=None,
                   help="sampling temperature: higher is livelier but less steady (model default 0.3)")
    p.add_argument("--play", action="store_true", help="play the result with afplay (macOS)")
    args = p.parse_args()

    if args.text:
        text = args.text
    elif args.file:
        text = args.file.read_text(encoding="utf-8")
    elif not sys.stdin.isatty():
        text = sys.stdin.read()
    else:
        p.error("give text as argument, --file, or via stdin")
    text = text.strip()

    t0 = time.perf_counter()
    model = TTSModel.load_model(language=args.language, temp=args.temperature)
    voice = model.get_state_for_audio_prompt(args.voice)
    t1 = time.perf_counter()

    audio = model.generate_audio(voice, text)
    t2 = time.perf_counter()

    scipy.io.wavfile.write(args.out, model.sample_rate, audio.numpy())
    duration = audio.shape[-1] / model.sample_rate
    gen = t2 - t1
    print(
        f"load {t1 - t0:.1f}s | generate {gen:.1f}s for {duration:.1f}s audio "
        f"(RTF x{duration / gen:.1f}) -> {args.out}"
    )

    if args.play:
        subprocess.run(["afplay", str(args.out)], check=False)


if __name__ == "__main__":
    main()
