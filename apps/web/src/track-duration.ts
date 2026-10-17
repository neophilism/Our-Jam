/** Read metadata without playback. Never substitute an estimated duration on failure. */
export function measureTrackDuration(
  url: string,
  minimum = 1,
): Promise<number> {
  return new Promise((resolve, reject) => {
    const audio = new Audio();
    let done = false;
    const finish = (error?: string) => {
      if (done) return;
      done = true;
      const seconds = audio.duration;
      clearTimeout(timer);
      audio.onloadedmetadata = null;
      audio.onerror = null;
      audio.removeAttribute("src");
      audio.load();
      if (error) reject(new Error(error));
      else resolve(Math.ceil(seconds));
    };
    const timer = setTimeout(
      () =>
        finish(
          "Could not measure track duration within 10 seconds. Check the audio link or upload the file instead.",
        ),
      10000,
    );
    audio.preload = "metadata";
    audio.onerror = () =>
      finish(
        "Could not read track duration. Check the audio link or upload the file instead.",
      );
    audio.onloadedmetadata = () =>
      finish(
        !Number.isFinite(audio.duration) ||
          audio.duration < minimum ||
          audio.duration > 1200
          ? `Choose fixed-length audio between ${minimum} and 1200 seconds.`
          : undefined,
      );
    audio.src = url;
  });
}
