import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { readFileSync } from "node:fs";
const video = readFileSync("tests/fixtures/local-video.webm");
const vtt = Buffer.from(
  "WEBVTT\n\n00:00.000 --> 00:01.000\nLocal spoken words\n",
);
function wav() {
  const value = Buffer.alloc(16044);
  value.write("RIFF");
  value.writeUInt32LE(16036, 4);
  value.write("WAVEfmt ", 8);
  value.writeUInt32LE(16, 16);
  value.writeUInt16LE(1, 20);
  value.writeUInt16LE(1, 22);
  value.writeUInt32LE(8000, 24);
  value.writeUInt32LE(16000, 28);
  value.writeUInt16LE(2, 32);
  value.writeUInt16LE(16, 34);
  value.write("data", 36);
  value.writeUInt32LE(16000, 40);
  return value;
}
test("imported video and audio play locally with captions, measured metadata, speed and original downloads", async ({
  page,
  context,
}) => {
  await page.goto("./");
  await expect(
    page.getByRole("heading", { name: "Configuration Guide", exact: true }),
  ).toBeVisible();
  await page
    .locator("input[type=file]")
    .first()
    .setInputFiles([
      {
        name: "Media.md",
        mimeType: "text/markdown",
        buffer: Buffer.from(
          '# Local media\n\n<video title="Local video" src="clip.webm" autoplay onplay="window.__mediaExecuted=true"><track src="words.vtt" kind="captions" label="English" srclang="en" default></video>\n\n<audio title="Local audio" src="sound.wav"><track src="words.vtt" kind="captions" label="English" srclang="en" default></audio>',
        ),
      },
      { name: "clip.webm", mimeType: "video/webm", buffer: video },
      { name: "sound.wav", mimeType: "audio/wav", buffer: wav() },
      { name: "words.vtt", mimeType: "text/vtt", buffer: vtt },
    ]);
  const section = page.getByRole("region", {
    name: "Video playback",
    exact: true,
  });
  const player = section.locator("video");
  await expect(section).toContainText("64 × 48 pixels");
  await expect(section).toContainText("1 seconds");
  expect(
    await player.evaluate((v: HTMLVideoElement) => ({
      paused: v.paused,
      autoplay: v.autoplay,
      src: v.currentSrc.startsWith("blob:"),
    })),
  ).toEqual({ paused: true, autoplay: false, src: true });
  await section
    .getByRole("combobox", { name: "Playback speed" })
    .selectOption("1.5");
  expect(await player.evaluate((v: HTMLVideoElement) => v.playbackRate)).toBe(
    1.5,
  );
  await player.evaluate((v: HTMLVideoElement) => v.play());
  await expect
    .poll(() => player.evaluate((v: HTMLVideoElement) => v.currentTime))
    .toBeGreaterThan(0);
  await player.evaluate((v: HTMLVideoElement) => v.pause());
  await expect
    .poll(() =>
      player.evaluate((v: HTMLVideoElement) => v.textTracks[0]?.cues?.length),
    )
    .toBe(1);
  expect(
    await player.evaluate((v: HTMLVideoElement) => v.textTracks[0].mode),
  ).toBe("showing");
  await section
    .getByRole("combobox", { name: "Captions", exact: true })
    .selectOption("");
  expect(
    await player.evaluate((v: HTMLVideoElement) => v.textTracks[0].mode),
  ).toBe("disabled");
  const fullscreen = section.getByRole("button", {
    name: "Fullscreen video",
    exact: true,
  });
  if (await fullscreen.count()) {
    await fullscreen.click();
    await expect
      .poll(() => page.evaluate(() => document.fullscreenElement?.tagName))
      .toBe("VIDEO");
    await page.evaluate(() => document.exitFullscreen());
  }
  const audioSection = page.getByRole("region", {
    name: "Audio playback",
    exact: true,
  });
  await expect(audioSection).toContainText("1 seconds");
  await audioSection
    .locator("audio")
    .evaluate((a: HTMLAudioElement) => a.play());
  await expect(audioSection.locator(".audio-captions")).toHaveText(
    "Local spoken words",
  );
  await audioSection
    .locator("audio")
    .evaluate((a: HTMLAudioElement) => a.pause());
  expect(await page.evaluate(() => "__mediaExecuted" in window)).toBe(false);
  const pendingDownload = page.waitForEvent("download");
  await section
    .getByRole("button", { name: "Download imported media" })
    .click();
  const download = await pendingDownload;
  const chunks: Buffer[] = [];
  for await (const chunk of (await download.createReadStream())!)
    chunks.push(Buffer.from(chunk));
  expect(Buffer.concat(chunks)).toEqual(video);
  expect(download.suggestedFilename()).toBe("clip.webm");
  const violations = (
    await new AxeBuilder({ page }).analyze()
  ).violations.filter((v) => ["serious", "critical"].includes(v.impact || ""));
  expect(violations).toEqual([]);
  await page.setViewportSize({ width: 390, height: 844 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
  });
  await expect
    .poll(() => page.evaluate(() => !!navigator.serviceWorker.controller))
    .toBe(true);
  await context.setOffline(true);
  await page.reload();
  await expect(
    page.getByRole("region", { name: "Video playback", exact: true }),
  ).toContainText("64 × 48 pixels");
  await page.locator("video").evaluate((v: HTMLVideoElement) => v.play());
  await expect
    .poll(() =>
      page.locator("video").evaluate((v: HTMLVideoElement) => v.currentTime),
    )
    .toBeGreaterThan(0);
});

test("remote video, poster and captions require separate consent; caption bytes are validated", async ({
  page,
}) => {
  const requests: string[] = [];
  await page.route("https://media.example.test/**", async (route) => {
    const path = new URL(route.request().url()).pathname;
    requests.push(path);
    await route.fulfill({
      status: 200,
      headers: { "access-control-allow-origin": "*" },
      contentType: path.endsWith("webm")
        ? "video/webm"
        : path.endsWith("vtt")
          ? "text/vtt"
          : "image/svg+xml",
      body: path.endsWith("webm")
        ? video
        : path === "/bad.vtt"
          ? "invalid"
          : path.endsWith("vtt")
            ? vtt
            : '<svg xmlns="http://www.w3.org/2000/svg" width="1" height="1"/>',
    });
  });
  await page.goto("./");
  await expect(
    page.getByRole("heading", { name: "Configuration Guide", exact: true }),
  ).toBeVisible();
  await page
    .locator("input[type=file]")
    .first()
    .setInputFiles({
      name: "Remote.md",
      mimeType: "text/markdown",
      buffer: Buffer.from(
        '# Remote media\n\n<video src="https://media.example.test/clip.webm" poster="https://media.example.test/poster.svg" autoplay><source src="https://media.example.test/other.webm"><track src="https://media.example.test/words.vtt" label="English" kind="captions"><track src="https://media.example.test/bad.vtt" label="Invalid" kind="captions"></video>',
      ),
    });
  const section = page.getByRole("region", { name: "Video playback" });
  await expect(
    section.getByText("Video blocked · media.example.test", { exact: true }),
  ).toBeVisible();
  expect(requests).toEqual([]);
  await section
    .getByRole("button", { name: "Load video", exact: true })
    .click();
  await expect(section).toContainText("64 × 48 pixels");
  expect(requests.every((path) => path === "/clip.webm")).toBe(true);
  expect(
    await section.locator("video").evaluate((v: HTMLVideoElement) => v.paused),
  ).toBe(true);
  await section
    .getByRole("button", { name: "Load captions: english", exact: true })
    .click();
  await expect(section).toContainText(
    "Captions loaded for this document session.",
  );
  await expect(section.locator("track")).toHaveAttribute("src", /^blob:/);
  await expect
    .poll(() =>
      section
        .locator("video")
        .evaluate((v: HTMLVideoElement) => v.textTracks[0]?.cues?.length),
    )
    .toBe(1);
  expect(requests).toContain("/words.vtt");
  expect(requests).not.toContain("/poster.svg");
  expect(requests).not.toContain("/other.webm");
  await section
    .getByRole("button", { name: "Load captions: invalid", exact: true })
    .click();
  await expect(section).toContainText("This caption file is not WebVTT.");
  await section
    .getByRole("button", { name: "Load poster", exact: true })
    .click();
  await expect.poll(() => requests.includes("/poster.svg")).toBe(true);
  await section
    .getByRole("combobox", { name: "Media source" })
    .selectOption("https://media.example.test/other.webm");
  await expect(
    section.getByRole("button", { name: "Load video", exact: true }),
  ).toBeVisible();
  expect(requests).not.toContain("/other.webm");
  await section
    .getByRole("button", { name: "Load video", exact: true })
    .click();
  await expect.poll(() => requests.includes("/other.webm")).toBe(true);
});

test("missing and undecodable local media expose honest fallbacks", async ({
  page,
}) => {
  await page.goto("./");
  await expect(
    page.getByRole("heading", { name: "Configuration Guide", exact: true }),
  ).toBeVisible();
  await page
    .locator("input[type=file]")
    .first()
    .setInputFiles([
      {
        name: "Broken.md",
        mimeType: "text/markdown",
        buffer: Buffer.from(
          '# Broken media\n\n<video src="missing.mp4"></video>\n\n<audio src="broken.mp3"></audio>',
        ),
      },
      {
        name: "broken.mp3",
        mimeType: "audio/mpeg",
        buffer: Buffer.from("not audio"),
      },
    ]);
  await expect(
    page.getByText("Video not imported: missing.mp4", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("region", { name: "Audio playback" }).getByRole("alert"),
  ).toContainText("This file could not be played.");
  await expect(
    page.getByRole("button", { name: "Download imported media" }),
  ).toBeVisible();
});
