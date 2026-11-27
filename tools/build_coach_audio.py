# /// script
# requires-python = ">=3.10,<3.15"
# dependencies = ["pocket-tts>=4.0", "numpy", "scipy"]
# ///
"""Speak a workout's coach texts with Kyutai Pocket TTS, ahead of time, for the ride to play.

Reads workouts/<name>.coach.json and writes one clip per text to workouts/audio/<name>/, plus a
manifest.json the ride reads to find them. Clips whose text, voice and language have not changed
are kept, so editing one line only re-speaks that line. Clips are AAC (.m4a) when macOS's afconvert
is there (about 15 times smaller than the WAV pocket-tts writes), 16-bit WAV otherwise.

    uv run tools/build_coach_audio.py workouts/sweet-spot-3x10.coach.json
    uv run tools/build_coach_audio.py workouts/*.coach.json --force        # re-speak everything
"""
import argparse, hashlib, json, shutil, subprocess, sys, tempfile, time
from pathlib import Path

import numpy as np
import scipy.io.wavfile


ROOT = Path(__file__).resolve().parent.parent


def resolve_voice(voice: str) -> tuple[str, str]:
    """A built-in voice name, or a voice file relative to the project: a .safetensors made with
    `pocket-tts export-voice` (no gated weights needed to use it), or a .wav/.mp3 to clone (needs them).
    Returns what to hand pocket-tts, and a key that changes when the voice does."""
    if "://" not in voice and voice.lower().endswith((".safetensors", ".wav", ".mp3")):
        p = Path(voice) if Path(voice).is_absolute() else ROOT / voice
        if not p.exists(): sys.exit(f"voice file not found: {p}")
        return str(p), voice + ":" + hashlib.sha1(p.read_bytes()).hexdigest()[:12]   # re-exporting the voice re-speaks the lines
    return voice, voice


def texts(coach: dict) -> dict[str, str]:
    """Every clip the coach file asks for, by id: step cues, the finish line and the feedback pools."""
    out = {}
    def add(c):
        if c["id"] in out: sys.exit(f"duplicate clip id {c['id']!r}")
        out[c["id"]] = c["text"].strip()
    for s in coach.get("steps", []):
        for c in s.get("cues", []): add(c)
    if coach.get("finish"): add(coach["finish"])
    for pool in coach.get("feedback", {}).values():
        for c in pool: add(c)
    chk = coach.get("checkins", {})                               # spoken check-ins: phrases and units around live numbers
    for part in ("heart_rate", "power"):
        for pool in chk.get(part, {}).values():
            for c in pool: add(c)
    for uid, text in chk.get("units", {}).items():
        add({"id": "unit-" + uid, "text": text})
    return out


# Numbers for the check-ins, spoken once per voice and shared by every workout using it:
# every number for heart rate and cadence, and watts in steps of 5 above that.
NUMBERS = list(range(30, 221)) + list(range(225, 601, 5))
_ONES = "zero one two three four five six seven eight nine ten eleven twelve thirteen fourteen fifteen sixteen seventeen eighteen nineteen".split()
_TENS = "_ _ twenty thirty forty fifty sixty seventy eighty ninety".split()


def number_words(n: int) -> str:
    """English words, so the voice never has to guess how to read digits."""
    if n < 20: return _ONES[n]
    if n < 100: return _TENS[n // 10] + ("" if n % 10 == 0 else "-" + _ONES[n % 10])
    h, r = divmod(n, 100)
    return _ONES[h] + " hundred" + ("" if r == 0 else " and " + number_words(r))


def build(path: Path, force: bool, model_cache: dict) -> None:
    coach = json.loads(path.read_text(encoding="utf-8"))
    name = path.name.removesuffix(".coach.json")
    language = coach.get("language", "english")
    from pocket_tts.default_parameters import DEFAULT_VOICE_FOR_LANGUAGE, DEFAULT_VOICE_FALLBACK
    voice = coach.get("voice") or DEFAULT_VOICE_FOR_LANGUAGE.get(language, DEFAULT_VOICE_FALLBACK)   # the language's own voice by default
    voice_src, voice_key = resolve_voice(voice)
    temp = coach.get("temperature")                               # None: the model's own default (0.3)
    if temp is not None: voice_key += f"@t{float(temp)}"         # a new temperature re-speaks the lines
    use_aac = shutil.which("afconvert") is not None
    ext = ".m4a" if use_aac else ".wav"
    print(f"{path.name}: {language}, voice {voice}, temperature {temp if temp is not None else 'default'}")

    def model_and_voice():
        key = (language, voice_src, temp)
        if key not in model_cache:                                # load the model and voice once for all clips
            from pocket_tts import TTSModel
            t0 = time.perf_counter()
            model = TTSModel.load_model(language=language, temp=None if temp is None else float(temp))
            model_cache[key] = (model, model.get_state_for_audio_prompt(voice_src))
            print(f"  model loaded in {time.perf_counter() - t0:.1f}s")
        return model_cache[key]

    def render(out_dir: Path, want: dict[str, str], extra: dict) -> None:
        """Speak what changed into out_dir, drop what is no longer wanted, and write its manifest."""
        out_dir.mkdir(parents=True, exist_ok=True)
        man_path = out_dir / "manifest.json"
        old = json.loads(man_path.read_text()) if man_path.exists() else {"clips": {}}
        clips, todo = {}, []
        for cid, text in want.items():
            h = hashlib.sha1(f"{language}|{voice_key}|{text}".encode()).hexdigest()[:12]
            prev = old["clips"].get(cid)
            if not force and prev and prev.get("hash") == h and (out_dir / prev["file"]).exists():
                clips[cid] = prev
            else:
                todo.append((cid, text, h))
        print(f"  {out_dir.name}: {len(want)} clips, {len(todo)} to speak")
        if todo:
            model, state = model_and_voice()
            with tempfile.TemporaryDirectory() as tmp:
                for cid, text, h in todo:
                    t0 = time.perf_counter()
                    audio = model.generate_audio(state, text).numpy()
                    pcm = (np.clip(audio, -1, 1) * 32767).astype(np.int16)        # 16-bit, not the 32-bit float pocket-tts gives
                    file = f"{cid}-{h}{ext}"                                      # the hash in the name stops browsers reusing an old clip
                    wav = Path(tmp) / f"{cid}.wav"
                    scipy.io.wavfile.write(wav, model.sample_rate, pcm)
                    if use_aac:
                        subprocess.run(["afconvert", "-f", "m4af", "-d", "aac", "-b", "48000", str(wav), str(out_dir / file)], check=True)
                    else:
                        shutil.move(wav, out_dir / file)
                    secs = len(pcm) / model.sample_rate
                    clips[cid] = {"file": file, "hash": h, "seconds": round(secs, 2)}
                    print(f"    {cid}: {secs:.1f}s of audio in {time.perf_counter() - t0:.1f}s")
        keep = {c["file"] for c in clips.values()} | {"manifest.json"}
        for f in out_dir.iterdir():                              # clips for texts that were removed or changed
            if f.name not in keep: f.unlink()
        man_path.write_text(json.dumps({"language": language, "voice": voice, **extra, "clips": clips}, indent=2) + "\n")

    extra = {}
    if coach.get("checkins"):                                     # the shared numbers, in a folder named after the voice
        pack = "_numbers-" + hashlib.sha1(f"{language}|{voice_key}".encode()).hexdigest()[:10]
        say = number_words if language == "english" else str
        render(path.parent / "audio" / pack, {f"n{n}": say(n) for n in NUMBERS}, {"numbers": NUMBERS})
        extra["numbers"] = pack
    render(path.parent / "audio" / name, texts(coach), extra)
    print(f"  wrote {path.parent / 'audio' / name / 'manifest.json'}")


def main() -> None:
    p = argparse.ArgumentParser(description="Speak workout coach texts with pocket-tts")
    p.add_argument("files", nargs="+", type=Path, help="one or more workouts/<name>.coach.json")
    p.add_argument("--force", action="store_true", help="speak every clip again")
    args = p.parse_args()
    cache = {}
    for f in args.files:
        build(f, args.force, cache)


if __name__ == "__main__":
    main()
