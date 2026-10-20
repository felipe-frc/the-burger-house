import { test, expect } from "@playwright/test";

const heroSelector = ".transition-hero-a";
async function open(page) {
  await page.route("**/api/**", route => route.fulfill({ json: [] }));
  await page.goto("/");
  await expect(page.locator(".bh-pretty-nav")).toBeVisible();
  await expect(page.locator(heroSelector)).toHaveAttribute("data-transition-ready", "true");
}
async function point(page) {
  const box = await page.locator(".transition-hero-circle").boundingBox();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
}

test("wheel: first gesture stays pinned, inertia is consumed, new gesture releases", async ({ page, isMobile }) => {
  test.skip(isMobile, "Wheel is tested on desktop; mobile uses touch input.");
  await open(page); await point(page);
  const hero = page.locator(heroSelector);
  await expect(hero).toHaveAttribute("data-transition-state", "INITIAL");
  await expect(hero).not.toHaveClass(/transition-photo-single/);
  const before = await page.locator(".transition-hero-circle").boundingBox();
  await page.screenshot({ path: test.info().outputPath("initial.png") });
  await page.mouse.wheel(0, 60);
  await expect(hero).toHaveAttribute("data-transition-state", "EXPANDING");
  expect(await page.evaluate(() => scrollY)).toBe(0);
  // A continuous trackpad-like tail extends beyond the animation duration.
  for (let i = 0; i < 18; i++) {
    await page.mouse.wheel(0, 4);
    await page.waitForTimeout(40);
    expect(await page.evaluate(() => scrollY)).toBe(0);
    await expect(hero.locator("img")).toHaveCount(1);
  }
  await expect(hero).toHaveAttribute("data-transition-state", "EXPANDED");
  const end = await page.locator(".transition-hero-circle").boundingBox();
  expect(end.width).toBeGreaterThan(before.width);
  await expect(hero.locator(".transition-diagonals")).toHaveCSS("opacity", "0");
  await page.screenshot({ path: test.info().outputPath("expanded.png") });
  await page.waitForTimeout(220);
  await page.mouse.wheel(0, 300);
  await expect(hero).toHaveAttribute("data-transition-state", "RELEASED");
  await expect.poll(() => page.evaluate(() => scrollY)).toBeGreaterThan(0);
  await page.evaluate(() => window.scrollTo({ top: 0, behavior: "instant" }));
  await expect(hero).toHaveAttribute("data-transition-state", "INITIAL");
});

test("keyboard: repeat is consumed, Tab and fresh PageDown remain usable", async ({ page }) => {
  await open(page);
  const hero = page.locator(heroSelector);
  await page.keyboard.press("PageDown");
  await expect(hero).toHaveAttribute("data-transition-state", "EXPANDED");
  expect(await page.evaluate(() => scrollY)).toBe(0);
  await page.keyboard.press("Tab");
  expect(await page.evaluate(() => document.activeElement.tagName)).not.toBe("BODY");
  await page.locator("body").click({ position: { x: 5, y: 200 } });
  await page.keyboard.press("End");
  await expect.poll(() => page.evaluate(() => scrollY)).toBeGreaterThan(0);
});

test("touch: one swipe expands; next swipe scrolls without a permanent lock", async ({ page, isMobile, context }) => {
  test.skip(!isMobile, "Real touch input belongs to the mobile project.");
  await open(page);
  const cdp = await context.newCDPSession(page);
  const swipe = async () => {
    await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x: 190, y: 550 }] });
    for (const y of [510, 470, 430, 390, 350]) {
      await cdp.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ x: 190, y }] });
      await page.waitForTimeout(35);
    }
    await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
  };
  await swipe();
  await expect(page.locator(heroSelector)).toHaveAttribute("data-transition-state", "EXPANDED");
  expect(await page.evaluate(() => scrollY)).toBe(0);
  await swipe();
  await expect.poll(() => page.evaluate(() => scrollY)).toBeGreaterThan(0);
  await cdp.detach();
});

test("reduced motion navigates immediately without cinematic expansion", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await open(page);
  await expect(page.locator(heroSelector)).toHaveAttribute("data-transition-state", "RELEASED");
  await expect(page.locator(heroSelector)).not.toHaveClass(/transition-photo-single/);
  await page.locator(".transition-scroll-cue").click();
  await expect.poll(() => page.evaluate(() => scrollY)).toBeGreaterThan(0);
});

test("navbar language and cart controls remain operational", async ({ page }) => {
  await open(page);
  await page.locator('[data-lang="en-US"]').click();
  await expect(page.locator("#language-select")).toHaveValue("en-US");
  await expect(page.locator(heroSelector)).toHaveAttribute("data-transition-state", "INITIAL");
  await page.locator("[data-pretty-cart]").click();
  await expect(page.locator("#cart-modal")).toBeVisible();
});

for (const width of [360, 390, 768, 1024, 1440]) {
  test(`single image and no overflow before/after expansion at ${width}`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await open(page);
    await expect(page.locator(`${heroSelector} img`)).toHaveCount(1);
    await expect(page.locator(".transition-divider, .transition-hero-b")).toHaveCount(0);
    await page.keyboard.press("PageDown");
    await expect(page.locator(heroSelector)).toHaveAttribute("data-transition-state", "EXPANDED");
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    expect(await page.evaluate(() => scrollY)).toBe(0);
    const rect = await page.locator(".transition-hero-circle").boundingBox();
    const nav = await page.locator(".bh-pretty-nav").boundingBox();
    expect(rect.width).toBeCloseTo(width, 0);
    expect(rect.height).toBeCloseTo(900 - nav.height, 0);
    await expect(page.locator(`${heroSelector} img`)).toHaveCount(1);
    await page.screenshot({ path: test.info().outputPath(`expanded-${width}.png`) });
  });
}

test("resize during expansion and restored page never retain a partial mask", async ({ page }) => {
  await open(page);
  await page.keyboard.press("PageDown");
  await page.setViewportSize({ width: 768, height: 900 });
  await expect(page.locator(heroSelector)).toHaveAttribute("data-transition-state", "EXPANDED");
  await page.evaluate(() => window.dispatchEvent(new PageTransitionEvent("pageshow", { persisted: true })));
  await expect(page.locator(heroSelector)).toHaveAttribute("data-transition-state", "INITIAL");
});

test("first animated frame reproduces the original cover crop", async ({ page }) => {
  await open(page);
  await page.clock.install();
  await page.clock.pauseAt(new Date());
  const result = await page.evaluate(() => {
    const hero = document.querySelector(".transition-hero-a");
    const circle = hero.querySelector(".transition-hero-circle");
    const image = circle.querySelector("img");
    const crop = circle.getBoundingClientRect();
    const scale = Math.max(crop.width / image.naturalWidth, crop.height / image.naturalHeight);
    const expected = { width: image.naturalWidth * scale, height: image.naturalHeight * scale,
      x: crop.x + crop.width / 2, y: crop.y + crop.height / 2 };
    hero.dispatchEvent(new WheelEvent("wheel", { bubbles: true, cancelable: true, deltaY: 10 }));
    const actual = image.getBoundingClientRect();
    return { expected, actual: { width: actual.width, height: actual.height,
      x: actual.x + actual.width / 2, y: actual.y + actual.height / 2 }, scroll: scrollY };
  });
  for (const key of ["width", "height", "x", "y"]) {
    // Allow one Chromium layout subpixel (1/64 CSS px), not a visual jump.
    expect(Math.abs(result.actual[key] - result.expected[key])).toBeLessThanOrEqual(1 / 64);
  }
  expect(result.scroll).toBe(0);
  await page.clock.runFor(275);
  const coverage = await page.evaluate(() => {
    const hero = document.querySelector(".transition-hero-a");
    const circle = hero.querySelector(".transition-hero-circle");
    const image = hero.querySelector("img").getBoundingClientRect();
    const stage = hero.getBoundingClientRect();
    const [radius, x, y] = getComputedStyle(circle).clipPath.match(/[\d.]+/g).map(Number);
    return {
      left: image.left <= Math.max(stage.left, stage.left + x - radius) + 0.02,
      right: image.right >= Math.min(stage.right, stage.left + x + radius) - 0.02,
      top: image.top <= Math.max(stage.top, stage.top + y - radius) + 0.02,
      bottom: image.bottom >= Math.min(stage.bottom, stage.top + y + radius) - 0.02,
    };
  });
  expect(Object.values(coverage).every(Boolean)).toBe(true);
  await page.screenshot({ path: test.info().outputPath("midpoint.png") });
  await expect(page.locator(`${heroSelector} img`)).toHaveCount(1);
  await page.clock.runFor(300);
  await expect(page.locator(heroSelector)).toHaveAttribute("data-transition-state", "EXPANDED");
});

test("keyboard does not consume editable controls or Tab and Escape always exits", async ({ page }) => {
  await open(page);
  const prevented = await page.evaluate(() => {
    const input = document.querySelector("input");
    const key = new KeyboardEvent("keydown", { key: "ArrowDown", bubbles: true, cancelable: true });
    input.dispatchEvent(key);
    const tab = new KeyboardEvent("keydown", { key: "Tab", bubbles: true, cancelable: true });
    document.dispatchEvent(tab);
    return key.defaultPrevented || tab.defaultPrevented;
  });
  expect(prevented).toBe(false);
  await expect(page.locator(heroSelector)).toHaveAttribute("data-transition-state", "INITIAL");
  await page.keyboard.down("ArrowDown");
  await expect(page.locator(heroSelector)).toHaveAttribute("data-transition-state", "EXPANDED");
  await page.keyboard.down("ArrowDown");
  expect(await page.evaluate(() => scrollY)).toBe(0);
  await page.keyboard.up("ArrowDown");
  await page.keyboard.press("Escape");
  await expect(page.locator(heroSelector)).toHaveAttribute("data-transition-state", "RELEASED");
  await page.keyboard.press("PageDown");
  await expect.poll(() => page.evaluate(() => scrollY)).toBeGreaterThan(0);
});
