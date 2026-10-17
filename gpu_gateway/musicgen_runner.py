"""Genuinely noncommercial research runner for CC BY-NC MusicGen weights.

Requires CUDA-capable PyTorch, transformers and soundfile installed on the
separate private GPU host. Never use this checkpoint for commercial music.
"""
from __future__ import annotations
import argparse

def main() -> None:
    parser=argparse.ArgumentParser()
    parser.add_argument("--model",required=True,choices=["facebook/musicgen-large"])
    parser.add_argument("--prompt",required=True)
    parser.add_argument("--duration",type=int,required=True)
    parser.add_argument("--output",required=True)
    args=parser.parse_args()
    if not 10<=args.duration<=30:
        raise SystemExit("The selected MusicGen inference path supports up to 30 seconds.")
    import torch
    import soundfile as sf
    from transformers import AutoProcessor, MusicgenForConditionalGeneration
    if not torch.cuda.is_available():
        raise SystemExit("A CUDA GPU is required for this configured runner.")
    processor=AutoProcessor.from_pretrained(args.model)
    model=MusicgenForConditionalGeneration.from_pretrained(args.model).to("cuda")
    inputs=processor(text=[args.prompt],padding=True,return_tensors="pt").to("cuda")
    # MusicGen nominally produces ~50 audio tokens per second and has a
    # checkpoint-specific sequence limit; verify resulting output length.
    with torch.inference_mode():
        audio=model.generate(**inputs,do_sample=True,guidance_scale=3.0,
                             max_new_tokens=args.duration*50)
    waveform=audio[0].detach().float().cpu().numpy()
    if waveform.ndim==2:
        waveform=waveform.transpose(1,0)
    sf.write(args.output,waveform,model.config.audio_encoder.sampling_rate)
if __name__=="__main__": main()
