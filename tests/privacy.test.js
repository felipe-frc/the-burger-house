import { readFileSync } from "node:fs";
import { JSDOM } from "jsdom";
import { expect, it } from "vitest";
import { translate } from "../scripts/i18n.js";

it("provides checkout transparency without mandatory consent and a real policy page", () => {
  const shop = new JSDOM(readFileSync(new URL("../index.html", import.meta.url), "utf8")).window
    .document;
  const notice = shop.querySelector("#address-modal #privacy-notice");
  expect(notice.textContent).toContain("PagBank");
  expect(notice.querySelector("a").getAttribute("href")).toBe("/privacy.html");
  expect(shop.querySelectorAll('input[type="checkbox"][required]')).toHaveLength(0);
  expect(shop.querySelectorAll('a[href="/privacy.html"]')).toHaveLength(2);
  for (const lang of ["pt-BR", "en-US"]) {
    expect(translate("privacy.notice", lang)).toContain("PagBank");
    expect(translate("privacy.link", lang)).not.toBe("privacy.link");
  }
  const policy = new JSDOM(readFileSync(new URL("../privacy.html", import.meta.url), "utf8")).window
    .document;
  expect(policy.documentElement.lang).toBe("pt-BR");
  for (const text of [
    "Dados coletados",
    "finalidades",
    "CPF",
    "telefone",
    "e-mail",
    "PagBank",
    "Retenção",
    "Direitos do titular",
    "eliminação",
    "Contato",
  ]) {
    expect(policy.body.textContent).toContain(text);
  }
});
